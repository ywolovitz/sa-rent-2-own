import "server-only";

import { canEdit } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

import { parseServiceMessage } from "./service-parse";
import { downloadTwilioMedia } from "./twilio";

/**
 * "Add a service" over WhatsApp: a fixed question-and-answer script, not the
 * model, so what gets written is exactly what the person typed and confirmed.
 * Validation lives in the pure functions below; the DB work is at the bottom.
 */

// Business rules. Env-overridable so they can be tuned without a deploy.
const MIN_NEXT_KM_GAP = Number(process.env.SERVICE_MIN_NEXT_KM_GAP) || 10_000; // next service km must be at least this far past current km
const MIN_NEXT_SERVICE_MONTHS = 12; // next service date must be about this far after the service date...
const NEXT_SERVICE_TOLERANCE_DAYS = 7; // ...give or take
const FLOW_TTL_MINUTES = 15;
const FLOW = "add_service";
const INVOICE_BUCKET = "vehicle-invoices";
const MAX_INVOICE_BYTES = 10 * 1024 * 1024;
const INVOICE_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type Step = "reg" | "current_km" | "next_date" | "next_km" | "place" | "amount" | "work" | "invoice" | "confirm";

interface FlowData {
  vehicleId?: string;
  reg?: string;
  vehicle?: string;
  vehicleKm?: number | null;
  serviceDate?: string;
  place?: string;
  currentKm?: number;
  nextDate?: string;
  nextKm?: number;
  amount?: number;
  workDone?: string | null;
  invoicePath?: string | null;
}

export interface FlowUser {
  id: string;
  fullName: string;
  role: UserRole;
}

const QUESTIONS: Record<Exclude<Step, "confirm">, string> = {
  reg: "What's the registration number of the vehicle?",
  place: "Who did the service? (workshop or dealer name)",
  current_km: "What's the current odometer reading in km?",
  next_date: "What's the next service date?",
  next_km: "What's the next service km?",
  amount: "What was the total cost of the service in rand? (e.g. 2450 or R2 450.50)",
  work: "What exactly was done? (e.g. oil and filter change, brake pads) Or reply SKIP.",
  invoice: 'Do you have a photo or copy of the invoice? Send it now (photo or PDF), or reply SKIP.',
};

const START_RE = /\b(add|log|record|capture|enter|new)\s+(a\s+|the\s+|new\s+)*service\b|^\s*service\s+done\b/i;
/**
 * A statement (not a question) that gives a km figure plus service wording, e.g.
 * "DF49RC GP current 285000km Next 300 000km or 28.10.27". Treated as an
 * add-service message only if the parser then finds real fields in it.
 */
const looksLikeServiceDetails = (t: string) =>
  !t.includes("?") && /\d\s*km\b/i.test(t) && /\b(next|service[ds]?|current|odometer)\b/i.test(t);

const CANCEL_RE = /^\s*(cancel|stop|quit|exit|abort|nevermind|never mind)\s*[.!]*\s*$/i;
const YES_RE = /^\s*(yes|y|yep|yeah|confirm|ok|okay|correct|save)\s*[.!]*\s*$/i;
const SKIP_RE = /^\s*(skip|no|none|n|nope|no invoice)\s*[.!]*\s*$/i;
const NO_RE = /^\s*(no|n|nope)\s*[.!]*\s*$/i;

// ---------- normalising / validating (pure) ----------

export const normaliseReg = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const isoDate = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

/** Accepts 2026-10-27, 27/10/2026, 27-10-26, 27.10.2026, "27 10 2026", "27 Oct 2026". Returns YYYY-MM-DD or null. */
export function parseDate(input: string): string | null {
  const s = input.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
  let m = s.match(/^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/);
  if (m) return isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})$/);
  if (m) return isoDate(year(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[-/. ]?([a-z]{3,9})[-/. ]?(\d{4}|\d{2})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    if (mi >= 0) return isoDate(year(m[3]), mi + 1, Number(m[1]));
  }
  return null;
}

/** "45 000", "45,000", "45000km" -> 45000. Whole, non-negative, plausible odometer value only. */
export function parseKm(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s*km\s*$/, "");
  if (!/^\d[\d ,]*$/.test(s)) return null;
  const n = Number(s.replace(/[ ,]/g, ""));
  return Number.isSafeInteger(n) && n < 2_000_000 ? n : null;
}

/** "2450", "R2 450.50", "R 2,450" -> 2450.5. Positive, at most 2 decimals, under R10 million. */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/^r\s*/, "").replace(/[ ,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n < 10_000_000 ? n : null;
}

const formatRand = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};
const todayZA = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });

export const validateServiceDate = (iso: string, today = todayZA()) =>
  iso > today ? "The service date can't be in the future." : null;

export const validateNextDate = (nextIso: string, serviceIso: string) => {
  const earliest = addDays(addMonths(serviceIso, MIN_NEXT_SERVICE_MONTHS), -NEXT_SERVICE_TOLERANCE_DAYS);
  return nextIso < earliest ? `The next service date must be about 12 months after the service date (${earliest} or later).` : null;
};

export const validateNextKm = (nextKm: number, currentKm: number) => {
  const min = currentKm + MIN_NEXT_KM_GAP;
  return nextKm < min ? `The next service km must be at least ${min.toLocaleString("en-ZA")} (current km + ${MIN_NEXT_KM_GAP.toLocaleString("en-ZA")}).` : null;
};

/**
 * Re-checks every field in `d` against the same rules the step-by-step flow
 * applies, dropping any that fail so they get asked again. Used for values
 * that arrive pre-filled from a free-text message.
 */
function sanitise(d: FlowData): { data: FlowData; dropped: string[] } {
  const data = { ...d };
  const dropped: string[] = [];
  if (data.serviceDate && validateServiceDate(data.serviceDate)) {
    data.serviceDate = todayZA();
    dropped.push("service date (using today)");
  }
  if (data.currentKm != null && data.vehicleKm != null && data.currentKm < data.vehicleKm) {
    delete data.currentKm;
    dropped.push("current km");
  }
  // Dependent fields are only checked once what they depend on is known; they're re-checked as answers arrive.
  if (data.nextDate && data.serviceDate && validateNextDate(data.nextDate, data.serviceDate)) {
    delete data.nextDate;
    dropped.push("next service date");
  }
  if (data.nextKm != null && (data.currentKm != null && validateNextKm(data.nextKm, data.currentKm))) {
    delete data.nextKm;
    dropped.push("next service km");
  }
  return { data, dropped };
}

/**
 * First step that still needs an answer. Required: registration, current km, next service date and km,
 * who did it, cost. Optional (SKIP-able, so always asked unless given): what was done, invoice.
 * The service date is never asked — it defaults to the day the message is sent.
 */
function nextStep(d: FlowData): Step {
  if (!d.vehicleId) return "reg";
  if (d.currentKm == null) return "current_km";
  if (!d.nextDate) return "next_date";
  if (d.nextKm == null) return "next_km";
  if (!d.place) return "place";
  if (d.amount == null) return "amount";
  if (d.workDone === undefined) return "work";
  if (d.invoicePath === undefined) return "invoice";
  return "confirm";
}

/** Turns a free-text message into pre-filled flow data; null if nothing usable was found. */
async function prefillFromMessage(text: string): Promise<{ data: FlowData; notes: string[] } | null> {
  const parsed = await parseServiceMessage(text);
  if (!parsed) return null;
  const data: FlowData = {};
  const notes: string[] = [];

  if (parsed.reg) {
    const reg = normaliseReg(parsed.reg);
    const v = reg.length >= 3 ? await findCurrentVehicle(reg) : ({ status: "none" } as const);
    if (v.status === "ok") Object.assign(data, { vehicleId: v.id, reg, vehicle: v.label, vehicleKm: v.km });
    else notes.push(`I can't find a vehicle with the current registration ${reg}.`);
  }
  const serviceDate = parsed.serviceDate ? parseDate(parsed.serviceDate) : null;
  if (serviceDate) data.serviceDate = serviceDate;
  const nextDate = parsed.nextDate ? parseDate(parsed.nextDate) : null;
  if (nextDate) data.nextDate = nextDate;
  if (parsed.place && parsed.place.length >= 2 && parsed.place.length <= 100) data.place = parsed.place;
  const currentKm = parsed.currentKm != null ? parseKm(String(parsed.currentKm)) : null;
  if (currentKm !== null) data.currentKm = currentKm;
  const nextKm = parsed.nextKm != null ? parseKm(String(parsed.nextKm)) : null;
  if (nextKm !== null) data.nextKm = nextKm;
  const amount = parsed.amount != null ? parseAmount(String(parsed.amount)) : null;
  if (amount !== null) data.amount = amount;
  if (parsed.workDone && parsed.workDone.length <= 300) data.workDone = parsed.workDone;

  const clean = sanitise(data);
  if (clean.dropped.length) notes.push(`I couldn't use the ${clean.dropped.join(", ")} from your message.`);
  return Object.keys(clean.data).length ? { data: clean.data, notes } : notes.length ? { data: {}, notes } : null;
}

const describeFilled = (d: FlowData) =>
  [
    d.reg && `Vehicle: ${d.reg} (${d.vehicle})`,
    d.place && `Done by: ${d.place}`,
    d.currentKm != null && `Current km: ${d.currentKm.toLocaleString("en-ZA")}`,
    d.nextDate && `Next service date: ${d.nextDate}`,
    d.nextKm != null && `Next service km: ${d.nextKm.toLocaleString("en-ZA")}`,
    d.amount != null && `Cost: ${formatRand(d.amount)}`,
    d.workDone && `Work done: ${d.workDone}`,
  ]
    .filter(Boolean)
    .join("\n");

// ---------- flow state ----------

async function loadFlow(phone: string): Promise<{ step: Step; data: FlowData } | null> {
  const db = createAdminClient();
  const { data } = await db.from("whatsapp_flows").select("flow, step, data, updated_at").eq("phone", phone).maybeSingle();
  if (!data || data.flow !== FLOW) return null;
  if (Date.now() - new Date(data.updated_at).getTime() > FLOW_TTL_MINUTES * 60_000) {
    await clearFlow(phone);
    return null;
  }
  return { step: data.step as Step, data: data.data as FlowData };
}

async function saveFlow(phone: string, step: Step, data: FlowData) {
  const db = createAdminClient();
  const { error } = await db
    .from("whatsapp_flows")
    .upsert({ phone, flow: FLOW, step, data: data as never, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function clearFlow(phone: string) {
  const db = createAdminClient();
  await db.from("whatsapp_flows").delete().eq("phone", phone);
}

// ---------- DB ----------

/** Finds the vehicle whose CURRENT plate is exactly this registration (historic plates don't count). */
async function findCurrentVehicle(reg: string) {
  const db = createAdminClient();
  const { data: plate } = await db
    .from("vehicle_registrations")
    .select("vehicle_id")
    .eq("plate_number", reg)
    .is("effective_to", null)
    .maybeSingle();
  if (!plate) return { status: "none" as const };

  const { data: v } = await db
    .from("vehicles")
    .select("id, make, model, year, status, current_mileage")
    .eq("id", plate.vehicle_id)
    .maybeSingle();
  if (!v) return { status: "none" as const };
  return {
    status: "ok" as const,
    id: v.id,
    label: [v.year, v.make, v.model].filter(Boolean).join(" ") || "vehicle",
    vehicleStatus: v.status,
    km: v.current_mileage,
  };
}

async function saveService(user: FlowUser, d: Required<FlowData>): Promise<boolean> {
  const db = createAdminClient();
  // The cost row is the service history entry (same table the web app's cost log uses).
  const { error } = await db.from("vehicle_costs").insert({
    vehicle_id: d.vehicleId,
    cost_type: "service",
    cost_date: d.serviceDate,
    supplier: d.place,
    amount: d.amount,
    invoice_file_path: d.invoicePath,
    mileage_at_time: d.currentKm,
    work_done: d.workDone,
    source: "whatsapp",
    recorded_by: user.id,
  });
  if (error) {
    console.error("whatsapp add-service: cost insert failed", error);
    await discardInvoice(d.invoicePath);
    return false;
  }
  const { error: vErr } = await db
    .from("vehicles")
    .update({ current_mileage: d.currentKm, next_service_km: d.nextKm, next_service_date: d.nextDate })
    .eq("id", d.vehicleId);
  if (vErr) {
    console.error("whatsapp add-service: vehicle update failed", vErr);
    return false;
  }
  return true;
}

async function discardInvoice(path: string | null | undefined) {
  if (path) await createAdminClient().storage.from(INVOICE_BUCKET).remove([path]);
}

/** Downloads the attachment and stores it where the web app's invoices live. Returns the storage path or an error to show. */
async function storeInvoice(vehicleId: string, media: { url: string; contentType: string }) {
  const ext = INVOICE_TYPES[media.contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) return { error: "I can only attach a PDF or a photo (JPEG/PNG)." };
  const buf = await downloadTwilioMedia(media.url, MAX_INVOICE_BYTES);
  if (!buf) return { error: "That file is too big or couldn't be read (10 MB max)." };
  const path = `${vehicleId}/${Date.now()}-whatsapp-invoice.${ext}`;
  const { error } = await createAdminClient()
    .storage.from(INVOICE_BUCKET)
    .upload(path, buf, { contentType: media.contentType.split(";")[0].trim() });
  if (error) throw error;
  return { path };
}

// ---------- the conversation ----------

const summary = (d: Required<FlowData>) =>
  `${d.reg} (${d.vehicle})\nServiced: ${d.serviceDate} by ${d.place}\nCurrent km: ${d.currentKm!.toLocaleString("en-ZA")}\nNext service: ${d.nextDate} or ${d.nextKm.toLocaleString("en-ZA")} km\nCost: ${formatRand(d.amount)}\nWork done: ${d.workDone ?? "not given"}\nInvoice: ${d.invoicePath ? "attached" : "none"}`;

/**
 * Returns the reply if this message belongs to the add-service flow (starting
 * it or continuing it), or null to let the normal Q&A handle the message.
 */
export async function handleServiceFlow(
  phone: string,
  text: string,
  user: FlowUser,
  media: { url: string; contentType: string } | null = null
): Promise<string | null> {
  // Fail soft: if the flow can't run (e.g. whatsapp_flows migration not applied yet),
  // normal Q&A keeps working and only "add a service" reports being unavailable.
  try {
    return await runServiceFlow(phone, text, user, media);
  } catch (err) {
    console.error("whatsapp add-service flow failed", err);
    return START_RE.test(text) ? "Adding a service isn't available right now. Please add it in the web app." : null;
  }
}

async function runServiceFlow(
  phone: string,
  text: string,
  user: FlowUser,
  media: { url: string; contentType: string } | null
): Promise<string | null> {
  const flow = await loadFlow(phone);

  if (!flow) {
    const explicit = START_RE.test(text);
    if (!explicit && !looksLikeServiceDetails(text)) return null;
    if (!canEdit(user.role)) {
      return explicit ? "Only admins can add a service. Ask an admin, or add it in the web app." : null;
    }
    const intro = `Let's add a service. Reply "cancel" at any time to stop.`;
    // A long message may already contain the details: pull them out, then only ask for what's missing.
    const prefill = (explicit ? text.replace(START_RE, "").trim().length >= 8 : true) ? await prefillFromMessage(text) : null;
    // Without the "add a service" wording, only take over if the message really carries several service fields.
    if (!explicit && (!prefill || Object.keys(prefill.data).length < 2)) return null;
    if (!prefill) {
      await saveFlow(phone, "reg", { serviceDate: todayZA() });
      return `${intro}\n\n${QUESTIONS.reg}`;
    }
    // The service date defaults to the day the message is sent unless the message names one.
    const { data: filled, dropped } = sanitise({ serviceDate: todayZA(), ...prefill.data });
    if (dropped.length) prefill.notes.push(`I couldn't use the ${dropped.join(", ")} from your message.`);
    const step = nextStep(filled);
    await saveFlow(phone, step, filled);
    const got = describeFilled(filled);
    return [
      got ? `${intro}\n\nFrom your message:\n${got}` : intro,
      ...prefill.notes,
      `${QUESTIONS[step as Exclude<Step, "confirm">]}`,
    ].join("\n\n");
  }

  // Flow state is only trusted for someone who may still use it.
  if (!canEdit(user.role)) {
    await clearFlow(phone);
    return null;
  }
  if (CANCEL_RE.test(text)) {
    await discardInvoice(flow.data.invoicePath);
    await clearFlow(phone);
    return "Cancelled — nothing was saved.";
  }

  const { step, data } = flow;
  const ask = async (_next: Step, d: FlowData, prefix = "") => {
    // Skips anything already pre-filled from a free-text message, re-checking it against the answer just given.
    const { data: kept, dropped } = sanitise(d);
    const next = nextStep(kept);
    await saveFlow(phone, next, kept);
    const note = dropped.length ? `(I couldn't use the ${dropped.join(", ")} you sent earlier.)\n` : "";
    return `${prefix}${note}${next === "confirm" ? "" : QUESTIONS[next]}`;
  };
  const retry = (error: string) => `${error}\n${step === "confirm" ? "" : QUESTIONS[step]}`.trim();

  switch (step) {
    case "reg": {
      const reg = normaliseReg(text);
      if (reg.length < 3) return retry("That doesn't look like a registration.");
      const v = await findCurrentVehicle(reg);
      if (v.status === "none") {
        return retry(`I can't find a vehicle with the current registration ${reg}. Check the plate and try again.`);
      }
      // Keep anything already pre-filled from a free-text message, re-checked now the vehicle's km is known.
      const { data: kept, dropped } = sanitise({ ...data, vehicleId: v.id, reg, vehicle: v.label, vehicleKm: v.km });
      const note = dropped.length ? `(I couldn't use the ${dropped.join(", ")} you sent.)\n` : "";
      return ask("current_km", kept, `Found ${reg} — ${v.label}.\n${note}`);
    }
    case "place": {
      const place = text.replace(/\s+/g, " ").trim();
      if (place.length < 2 || place.length > 100) return retry("Please send the name of the workshop or dealer.");
      return ask("amount", { ...data, place });
    }
    case "current_km": {
      const km = parseKm(text);
      if (km === null) return retry("I couldn't read that — send the km as a number, e.g. 45200.");
      if (data.vehicleKm != null && km < data.vehicleKm) {
        return retry(`That's lower than the ${data.vehicleKm.toLocaleString("en-ZA")} km already on record for this vehicle.`);
      }
      return ask("next_date", { ...data, currentKm: km });
    }
    case "next_date": {
      const iso = parseDate(text);
      if (!iso) return retry("I couldn't read that date.");
      const err = validateNextDate(iso, data.serviceDate!);
      if (err) return retry(err);
      return ask("next_km", { ...data, nextDate: iso });
    }
    case "next_km": {
      const km = parseKm(text);
      if (km === null) return retry("I couldn't read that — send the km as a number, e.g. 55200.");
      const err = validateNextKm(km, data.currentKm!);
      if (err) return retry(err);
      return ask("amount", { ...data, nextKm: km });
    }
    case "amount": {
      const amount = parseAmount(text);
      if (amount === null) return retry("I couldn't read that — send the cost in rand as a number, e.g. 2450.");
      return ask("invoice", { ...data, amount });
    }
    case "work": {
      const work = text.replace(/\s+/g, " ").trim();
      if (work.length > 300) return retry("That's a bit long — please keep it under 300 characters.");
      return ask("invoice", { ...data, workDone: SKIP_RE.test(work) ? null : work });
    }
    case "invoice": {
      let invoicePath: string | null = null;
      if (media) {
        const stored = await storeInvoice(data.vehicleId!, media);
        if (stored.error) return retry(stored.error);
        invoicePath = stored.path!;
      } else if (!SKIP_RE.test(text)) {
        return retry("Send a photo or PDF of the invoice, or reply SKIP.");
      }
      const full = { ...data, invoicePath };
      await saveFlow(phone, "confirm", full);
      return `Please check:\n${summary(full as Required<FlowData>)}\n\nSave this service? Reply YES to save or NO to cancel.`;
    }
    case "confirm": {
      if (NO_RE.test(text)) {
        await discardInvoice(data.invoicePath);
        await clearFlow(phone);
        return "Cancelled — nothing was saved.";
      }
      if (!YES_RE.test(text)) return "Reply YES to save this service, or NO to cancel.";
      const ok = await saveService(user, data as Required<FlowData>);
      if (!ok) return "Sorry, I couldn't save that. Please check the vehicle in the web app, then try again if needed.";
      await clearFlow(phone);
      return `Saved. Service recorded for ${data.reg} and the vehicle's mileage and next service details are updated.`;
    }
    default:
      // Saved by an older version of the script (a step that no longer exists): drop it and start over.
      await clearFlow(phone);
      return runServiceFlow(phone, text, user, media);
  }
}
