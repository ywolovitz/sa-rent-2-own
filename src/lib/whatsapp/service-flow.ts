import "server-only";

import { canEdit } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";

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

type Step = "reg" | "service_date" | "place" | "current_km" | "next_date" | "next_km" | "invoice" | "confirm";

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
  invoicePath?: string | null;
}

export interface FlowUser {
  id: string;
  fullName: string;
  role: UserRole;
}

const QUESTIONS: Record<Exclude<Step, "confirm">, string> = {
  reg: "What's the registration number of the vehicle?",
  service_date: "What date was the service done? (e.g. 2026-10-27 or 27/10/2026)",
  place: "Where was the service done? (workshop or dealer name)",
  current_km: "What's the current odometer reading in km?",
  next_date: "What's the next service date?",
  next_km: "What's the next service km?",
  invoice: 'Do you have a photo or copy of the invoice? Send it now (photo or PDF), or reply SKIP.',
};

const START_RE = /\b(add|log|record|capture|enter|new)\s+(a\s+|the\s+|new\s+)*service\b|^\s*service\s+done\b/i;
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
  // Amount is mandatory in that table but not asked here, so 0 until someone adds the invoice.
  const { error } = await db.from("vehicle_costs").insert({
    vehicle_id: d.vehicleId,
    cost_type: "service",
    cost_date: d.serviceDate,
    supplier: d.place,
    amount: 0,
    invoice_file_path: d.invoicePath,
    mileage_at_time: d.currentKm,
    notes: `Logged via WhatsApp by ${user.fullName}. Next service ${d.nextDate} / ${d.nextKm} km. Amount not captured.`,
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
  `${d.reg} (${d.vehicle})\nServiced: ${d.serviceDate} at ${d.place}\nCurrent km: ${d.currentKm!.toLocaleString("en-ZA")}\nNext service: ${d.nextDate} or ${d.nextKm.toLocaleString("en-ZA")} km\nInvoice: ${d.invoicePath ? "attached" : "none"}`;

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
    if (!START_RE.test(text)) return null;
    if (!canEdit(user.role)) {
      return "Only admins can add a service. Ask an admin, or add it in the web app.";
    }
    await saveFlow(phone, "reg", {});
    return `Let's add a service. Reply "cancel" at any time to stop.\n\n${QUESTIONS.reg}`;
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
  const ask = async (next: Step, d: FlowData, prefix = "") => {
    await saveFlow(phone, next, d);
    return `${prefix}${next === "confirm" ? "" : QUESTIONS[next]}`;
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
      return ask("service_date", { vehicleId: v.id, reg, vehicle: v.label, vehicleKm: v.km }, `Found ${reg} — ${v.label}.\n`);
    }
    case "service_date": {
      const iso = parseDate(text);
      if (!iso) return retry("I couldn't read that date.");
      const err = validateServiceDate(iso);
      if (err) return retry(err);
      return ask("place", { ...data, serviceDate: iso });
    }
    case "place": {
      const place = text.replace(/\s+/g, " ").trim();
      if (place.length < 2 || place.length > 100) return retry("Please send the name of the workshop or dealer.");
      return ask("current_km", { ...data, place });
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
      return ask("invoice", { ...data, nextKm: km });
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
      return `Saved. Service recorded for ${data.reg} and the vehicle's mileage and next service details are updated.\n(The cost amount wasn't captured — add it in the web app if needed.)`;
    }
  }
}
