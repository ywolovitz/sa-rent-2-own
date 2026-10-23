#!/usr/bin/env node
/**
 * Full fleet-data reload: replaces the September import with the client's
 * updated workbook, matched to deals/clients/payments from the legacy
 * system's exports.
 *
 * Usage (never writes to the database itself — it plans everything and
 * emits files for review):
 *
 *   node --env-file=.env.local scripts/reload-fleet-data.mjs \
 *     --fleet   ~/Downloads/"SAR2O FLEET-YONI APRIL 2026 FINAL.xlsx" \
 *     --accounts accounts.txt \
 *     --ledger  data/mad1_Deal_transaction_abbr_Vehicle_mat_<date>_Company_SAMC.xlsx \
 *     --batch   ~/Downloads/"NEDBANK BATCH UPLOAD FINAL.xlsx" \
 *     [--out .import-reports/reload]
 *
 * Outputs (in --out, gitignored):
 *   - reload-<date>.sql        one transaction: wipe fleet data, insert everything.
 *                              Apply with: psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 \
 *                                          --single-transaction -f reload-<date>.sql
 *   - exceptions-<date>.xlsx   the exception report to review with the client.
 *
 * Policy: never guess. A deal is attached to a vehicle only when exactly
 * one live deal fits (see matchDeal); anything ambiguous or unmatched goes
 * to the exception report instead of being written.
 *
 * Needs BANKING_ENCRYPTION_KEY (banking details are encrypted exactly as
 * src/lib/crypto.ts does) — it is read from the env, never printed.
 */

import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ExcelJS from "exceljs";
import xlsx from "xlsx";

// ---------------------------------------------------------------------------
// Args / constants
// ---------------------------------------------------------------------------

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const PATHS = {
  fleet: arg("fleet"),
  accounts: arg("accounts"),
  ledger: arg("ledger"),
  batch: arg("batch"),
};
const OUT_DIR = arg("out", ".import-reports/reload");
for (const [k, v] of Object.entries(PATHS)) {
  if (!v) {
    console.error(`Missing --${k}. See the usage block at the top of this file.`);
    process.exit(1);
  }
}

const TODAY = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
/** A deal is "live" if the ledger still raised a monthly rental in the last ~75 days. */
const LIVE_SINCE = daysAgo(75);

const readSheet = (path, sheetName) => {
  const wb = xlsx.readFile(path, { cellDates: true });
  const ws = wb.Sheets[sheetName ?? wb.SheetNames[0]];
  if (!ws) throw new Error(`Sheet ${sheetName} not found in ${path}`);
  return xlsx.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
};

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

const clean = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[R,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
/** MAD0006226S / MAD6226S / mad6226s -> MAD6226S. Keeps the whole suffix (T, STR, ST, PU…). */
function dealKey(raw) {
  const m = String(raw ?? "").toUpperCase().replace(/\s+/g, "").match(/^MAD0*(\d+)([A-Z]*)/);
  return m ? `MAD${m[1]}${m[2]}` : null;
}
/** Plate -> comparable key (uppercase letters/digits). */
const plateKey = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** "KL00RRGP (KVH000GP)" -> ["KL00RRGP","KVH000GP"] */
function plateKeys(raw) {
  const t = String(raw ?? "").toUpperCase();
  const paren = [...t.matchAll(/\(([^)]*)\)/g)].map((m) => plateKey(m[1]));
  const primary = plateKey(t.replace(/\([^)]*\)/g, ""));
  return [primary, ...paren].filter(Boolean);
}
const excelDate = (v) => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  return null;
};
/** Local 10-digit SA number (how prod stores clients.cell_number). */
function normCell(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (/^27\d{9}$/.test(d)) return `0${d.slice(2)}`;
  if (/^0\d{9}$/.test(d)) return d;
  if (/^\d{9}$/.test(d)) return `0${d}`;
  return null;
}
/** 13-digit SA ID (re-adding the leading 0 Excel drops from 1900s–2000s births). */
function normSaId(raw) {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12) return `0${d}`;
  return d.length === 13 ? d : null;
}
/** Edit distance, for spelling-tolerant name comparison. */
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
/** True if the fleet sheet's client label plausibly refers to the legacy account holder (same word, or a small spelling difference). */
function sameName(fleetLabel, accountName) {
  const words = (t) => String(t ?? "").toUpperCase().replace(/[^A-Z\s]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const fl = words(fleetLabel);
  const ac = words(accountName);
  return fl.some((f) => ac.some((a) => a.includes(f) || f.includes(a) || editDistance(f, a) <= Math.max(1, Math.floor(Math.min(f.length, a.length) / 4))));
}
const titleish = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const surnameOf = (full) => {
  const parts = titleish(full).replace(/^silver trio\s*-\s*/i, "").split(" ");
  return parts[parts.length - 1]?.toUpperCase() ?? "";
};

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------

// ---- ledger
const ledgerRows = readSheet(PATHS.ledger)
  .slice(1)
  .filter((r) => r[1] && (typeof r[2] === "number" || r[2] instanceof Date))
  .map((r) => ({
    id: Number(r[0]),
    deal: dealKey(r[1]),
    rawDeal: String(r[1]),
    date: excelDate(r[2]),
    type: clean(r[3]) ?? "",
    ref: clean(r[5]),
    amt: Number(r[6]) || 0,
    veh: r[7] ? plateKey(r[7]) : null,
    sub: clean(r[9]),
  }))
  .filter((r) => r.deal);

const ledgerByDeal = new Map();
for (const r of ledgerRows) {
  if (!ledgerByDeal.has(r.deal)) ledgerByDeal.set(r.deal, []);
  ledgerByDeal.get(r.deal).push(r);
}
const ledger = new Map();
for (const [deal, rows] of ledgerByDeal) {
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const vehs = [];
  for (const r of rows) if (r.veh && vehs.at(-1) !== r.veh) vehs.push(r.veh);
  const rents = rows.filter((r) => /^monthly rental/i.test(r.type));
  ledger.set(deal, {
    rows,
    vehs,
    lastVeh: vehs.at(-1) ?? null,
    firstDate: rows[0].date,
    lastRent: rents.at(-1)?.date ?? null,
    balance: rows.filter((r) => r.date <= TODAY).reduce((s, r) => s + r.amt, 0),
    rawForms: [...new Set(rows.map((r) => r.rawDeal))],
  });
}

// ---- accounts.txt
const accounts = new Map();
for (const line of readFileSync(PATHS.accounts, "utf8").trim().split("\n").slice(1)) {
  const [deal, workstate, customer, name, fileNo, vehicle] = line.replace(/\r$/, "").split("|");
  const k = dealKey(deal);
  if (k) accounts.set(k, { workstate: clean(workstate), customerRaw: clean(customer), name: titleish(name), fileNo: clean(fileNo), vehicle: clean(vehicle) });
}
const SIGNED = /signed and vehicle delivered/i;
/** Ledger entry types that are real money in (everything else only moves the balance). */
const PAYMENT_TYPES = new Set(["Debit order", "Receipt", "Receipt Nedbank SAMC", "Receipt physical cash", "Receipt speed point"]);

// ---- Nedbank batch (the active debit-order deals + banking)
const batch = new Map();
for (const r of readSheet(PATHS.batch, "Sheet1").slice(1)) {
  if (!r[2]) continue;
  const [dealPart, ...tagParts] = String(r[2]).trim().split("_");
  const k = dealKey(dealPart);
  if (!k) continue;
  batch.set(k, {
    tag: tagParts.join("_").trim() || null,
    bank: clean(r[5]),
    branch: clean(r[6]) ? String(r[6]).trim() : null,
    account: clean(r[3]) ? String(r[3]).trim() : null,
    holder: clean(r[7]),
    amount: num(r[10]),
  });
}

// ---- fleet workbook
const fleetSheet = readSheet(PATHS.fleet, "CURRENT FLEET");
const EXPECTED_HEADERS = {
  0: "FILE NO", 1: "REG", 2: "MODEL", 3: "STATUS/LOCATION", 4: "INSTALLMENT", 5: "CURRENT MILEAGE",
  6: "NEXT SERVICE KMS", 7: "NEXT SERVICE DATE", 8: "LAST SERVICE BY:", 9: "CURRENT CLIENT", 10: "CELL",
  12: "PAST CLIENTS", 13: "TRACKER RUNNING", 14: "TRACKER SUPPLIER", 15: "NATIS", 16: "SPARE", 17: "FILE",
  18: "PAYMENT METHOD", 19: "POTENTIAL SALE PRICE", 20: "PURCHASE PRICE", 21: "PURCHASE DATE",
  22: "CONTRACT END DATE", 24: "TOTAL COLLECTION", 25: "RV", 26: "PAID", 27: "WARRANTY",
  28: "LISENCE DISC EXPIRY", 29: "COLOUR",
};
for (const [i, want] of Object.entries(EXPECTED_HEADERS)) {
  const got = String(fleetSheet[0][i] ?? "").trim().toUpperCase();
  if (got !== want) {
    console.error(`Fleet workbook column ${i} is "${got}", expected "${want}". The layout changed again — update EXPECTED_HEADERS/COL before running.`);
    process.exit(1);
  }
}
const C = Object.fromEntries(
  Object.entries({
    fileNo: 0, reg: 1, model: 2, status: 3, installment: 4, mileage: 5, nextKm: 6, nextDate: 7, servicedBy: 8,
    client: 9, cell: 10, trackerRunning: 13, trackerSupplier: 14, natis: 15, spare: 16, fileOnFile: 17,
    payMethod: 18, potentialSale: 19, purchasePrice: 20, purchaseDate: 21, endDate: 22, totalCollection: 24,
    rv: 25, paid: 26, warranty: 27, licenseDisc: 28, colour: 29,
  })
);

// ---------------------------------------------------------------------------
// Exceptions collector
// ---------------------------------------------------------------------------

const exceptions = []; // { area, severity, ref, detail, question }
const ex = (area, ref, detail, question = "", severity = "review") =>
  exceptions.push({ area, severity, ref, detail, question });

// ---------------------------------------------------------------------------
// Fleet rows -> vehicles (+ contract intent)
// ---------------------------------------------------------------------------

function parseStatus(raw) {
  const original = clean(raw);
  const u = (original ?? "").toUpperCase().replace(/\s+/g, " ");
  let m;
  if (u === "ON ROAD") return { status: "on_road" };
  if (u === "PARKED") return { status: "parked" };
  if (u === "COURTESY" || u.startsWith("COURTESY ")) return { status: "courtesy" };
  if ((m = u.match(/^FOR SALE(?:[\s-]+(.*))?$/))) return { status: "for_sale", assignedToName: m[1]?.trim() || null };
  if ((m = u.match(/^REP[AI]+R(?:[\s-]+(.*))?$/))) return { status: "in_repair", assignedToName: m[1]?.trim() || null };
  if ((m = u.match(/^RENTAL(?:[\s-]+(.*))?$/))) return { status: "rental", nameHint: m[1]?.trim() || null };
  if ((m = u.match(/^STR(?:[\s-]+(.*))?$/))) return { status: "str", nameHint: m[1]?.trim() || null };
  return { status: "parked", unrecognised: original };
}

const vehicles = [];
let endedStats = { total: 0, loaded: 0, backInFleet: 0, unclear: 0 };
const seenFileNos = new Set();
for (const row of fleetSheet.slice(1)) {
  const fileNo = clean(row[C.fileNo]);
  const regRaw = clean(row[C.reg]);
  const model = clean(row[C.model]);
  if (!regRaw && !model) continue; // placeholder row
  if (!fileNo && !regRaw) continue;

  const keys = plateKeys(regRaw);
  const primaryPlate = regRaw ? regRaw.replace(/\s*\([^)]*\)\s*$/, "").trim() : null;
  const st = parseStatus(row[C.status]);
  const flags = [];
  if (st.unrecognised) flags.push(`Unrecognised status "${st.unrecognised}" — set to Parked`);
  if (!clean(row[C.status])) flags.push("No status in the workbook — set to Parked");
  if (keys.length > 1) flags.push(`Second registration "${regRaw.match(/\(([^)]*)\)/)?.[1]}" listed next to "${primaryPlate}" — only the first is loaded`);

  const my = clean(model)?.match(/^(\d{4})\s+(.*)$/);
  const makeModel = my ? my[2] : model;
  const [make, ...rest] = (makeModel ?? "").split(" ");

  const surname = clean(row[C.client]);
  const noise = !surname || /^STR/i.test(surname) || /^LOAN CAR/i.test(surname);
  const clientSurname = !noise ? surname : st.nameHint && st.nameHint.length > 1 ? st.nameHint : null;
  const installment = num(row[C.installment]);
  const isStr = st.status === "str";
  const wantsContract =
    Boolean(clientSurname) && (isStr || ((st.status === "on_road" || st.status === "parked") && installment && installment > 0));

  if (clientSurname && !wantsContract && st.status !== "rental") {
    flags.push(`Client "${clientSurname}" named but no contract created (status ${st.status}, installment ${installment ?? "blank"})`);
  }

  vehicles.push({
    id: randomUUID(),
    fileNo: fileNo ?? primaryPlate,
    reg: primaryPlate,
    regKeys: keys,
    make: make || null,
    model: rest.join(" ") || makeModel || null,
    year: my ? parseInt(my[1], 10) : null,
    colour: clean(row[C.colour]),
    status: st.status,
    legacyStatusNote: clean(row[C.status]),
    assignedToName: st.assignedToName ?? null,
    mileage: num(row[C.mileage]),
    nextKm: num(row[C.nextKm]),
    nextDate: excelDate(row[C.nextDate]),
    servicedBy: clean(row[C.servicedBy]),
    trackerSupplier: clean(row[C.trackerSupplier]),
    trackerRunning: ({ YES: "yes", NO: "no" })[clean(row[C.trackerRunning])?.toUpperCase()] ?? "no_info",
    natis: clean(row[C.natis])?.toUpperCase() === "YES",
    licenseDisc: excelDate(row[C.licenseDisc]),
    spare: clean(row[C.spare])?.toUpperCase() === "YES",
    warrantyActive: ["ACTIVE", "YES"].includes(clean(row[C.warranty])?.toUpperCase()),
    hasContractFile: clean(row[C.fileOnFile])?.toUpperCase() === "Y",
    cellRaw: clean(row[C.cell]),
    clientSurname,
    wantsContract,
    contractType: isStr ? "short_term_rental" : "rent_to_own",
    payMethod: ({ EFT: "eft", CASH: "cash" })[clean(row[C.payMethod])?.toUpperCase()] ?? "other",
    installment,
    purchasePrice: num(row[C.purchasePrice]),
    purchaseDate: excelDate(row[C.purchaseDate]),
    potentialSale: num(row[C.potentialSale]),
    endDate: excelDate(row[C.endDate]),
    sheetTotalCollected: num(row[C.totalCollection]),
    rv: num(row[C.rv]),
    paidUp: clean(row[C.paid])?.toUpperCase() === "YES",
    flags,
    nameHint: st.nameHint ?? null,
  });
  if (seenFileNos.has(fileNo)) ex("Vehicles", fileNo, "Duplicate file number in the workbook", "Which row is correct?", "error");
  seenFileNos.add(fileNo);
}

// ---------------------------------------------------------------------------
// ENDED CONTRACTS sheet -> vehicles on the "End of Contract" tab
// ---------------------------------------------------------------------------
// That sheet was built up over the years in several different column layouts,
// so a row's file number / registration / notes sit in different columns
// depending on the block. Only those three (plus a model description) can be
// read reliably, by pattern rather than by position. No deals, clients or
// payments are loaded for these vehicles.

const fileKeyOf = (f) => {
  const m = String(f ?? "").toUpperCase().replace(/\s+/g, "").match(/^([AB])0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : null;
};
{
  const FILE_RE = /^[AB]\s?0*\d{1,4}$/i;
  const PLATE_RE = /^[A-Z]{2,3}\s?\d{2,3}\s?[A-Z]{2,3}(GP|MP|L|NW|EC|FS|NC|WC|KZN)?$/i;
  const STATUS_RE = /\b(SOLD|SETTLED|WRITE|WRITTEN|PAID ?OFF|PAID OUT|STOLEN|RETURN|CANCEL|TERMINAT|BACK TO|RAN TILL)/i;
  const fleetKeys = new Set(vehicles.map((v) => fileKeyOf(v.fileNo)).filter(Boolean));
  const fleetPlates = new Set(vehicles.flatMap((v) => v.regKeys));
  const byFile = new Map();
  for (const r of readSheet(PATHS.fleet, "ENDED CONTRACTS").slice(2)) {
    const strs = r.map((v) => (v instanceof Date ? null : v)).filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean);
    const file = strs.find((t) => FILE_RE.test(t));
    if (!file) continue;
    const key = fileKeyOf(file);
    const plate = strs.find((t) => t !== file && PLATE_RE.test(t.split("/")[0].replace(/\s+/g, "")) && t.length <= 22);
    const status = strs.find((t) => STATUS_RE.test(t));
    const desc = strs.find(
      (t) => t !== file && t !== plate && t !== status && /[A-Za-z]{3,}\s+[A-Za-z0-9.]{2,}/.test(t) && !/^[A-Z0-9]{15,18}$/.test(t) && !/^(YES|NO|ON ROAD|WITH CLIENT)/i.test(t) && t.length > 7 && t.length < 60 && !/\b(SOLD|SETTLED|WRITE)/i.test(t)
    );
    const e = byFile.get(key) ?? { file: file.toUpperCase().replace(/\s+/g, ""), plates: [], notes: [], desc: null };
    if (plate) for (const p of plate.split("/")) if (plateKey(p) && !e.plates.includes(p.trim())) e.plates.push(p.trim());
    if (status && !e.notes.includes(status)) e.notes.push(status);
    if (desc && !e.desc) e.desc = desc;
    byFile.set(key, e);
  }
  let backInFleet = 0;
  const unclear = [];
  for (const [key, e] of byFile) {
    if (fleetKeys.has(key) || e.plates.some((p) => fleetPlates.has(plateKey(p)))) {
      backInFleet++;
      continue;
    }
    const noteText = e.notes.join(" | ");
    const status = /WRITE ?OFF|WRITTEN|STOLEN/i.test(noteText)
      ? "written_off"
      : /\b(SOLD|SETTLED|PAID ?OFF|PAID OUT|RAN TILL)\b/i.test(noteText)
        ? "sold"
        : "end_of_deal";
    if (status === "end_of_deal") unclear.push(e);
    const my = e.desc?.match(/^(\d{4})\s+(.*)$/);
    const makeModel = my ? my[2] : e.desc;
    const [make, ...rest] = (makeModel ?? "").split(" ");
    const plate = e.plates[0] ?? null;
    vehicles.push({
      id: randomUUID(), fileNo: e.file, reg: plate, regKeys: plate ? [plateKey(plate)] : [], make: make || null,
      model: rest.join(" ") || makeModel || null, year: my ? parseInt(my[1], 10) : null, colour: null, status,
      legacyStatusNote: noteText.slice(0, 500) || null, assignedToName: null, mileage: null, nextKm: null, nextDate: null,
      servicedBy: null, trackerSupplier: null, trackerRunning: "no_info", natis: false, licenseDisc: null, spare: false,
      warrantyActive: false, hasContractFile: false, cellRaw: null, clientSurname: null, wantsContract: false,
      contractType: "rent_to_own", payMethod: "other", flags: [], nameHint: null, ended: true,
    });
  }
  endedStats = { total: byFile.size, loaded: byFile.size - backInFleet, backInFleet, unclear: unclear.length };
  for (const e of unclear) {
    ex("Ended vehicles", `${e.file} ${e.plates[0] ?? ""}`.trim(), `No sold / written-off note on the ENDED CONTRACTS sheet${e.notes.length ? ` (note: "${e.notes.join(" | ")}")` : ""} — loaded as End of Deal`, "Was it sold, written off, or something else?", "info");
  }
}

// ---------------------------------------------------------------------------
// Deal matching (vehicle -> deal)
// ---------------------------------------------------------------------------

const isLive = (deal) => {
  const l = ledger.get(deal);
  return batch.has(deal) || Boolean(l?.lastRent && l.lastRent >= LIVE_SINCE);
};

const dealsByLedgerVehicle = new Map();
for (const [deal, l] of ledger) {
  if (l.lastVeh) {
    if (!dealsByLedgerVehicle.has(l.lastVeh)) dealsByLedgerVehicle.set(l.lastVeh, new Set());
    dealsByLedgerVehicle.get(l.lastVeh).add(deal);
  }
}
const accountsByFile = new Map();
const accountsByPlate = new Map();
for (const [deal, a] of accounts) {
  if (a.fileNo) {
    const f = a.fileNo.toUpperCase().replace(/\s+/g, "");
    if (!accountsByFile.has(f)) accountsByFile.set(f, new Set());
    accountsByFile.get(f).add(deal);
  }
  if (a.vehicle) {
    const p = plateKey(a.vehicle);
    if (!accountsByPlate.has(p)) accountsByPlate.set(p, new Set());
    accountsByPlate.get(p).add(deal);
  }
}

/** Returns { deal, via } or { none: true } / { ambiguous: [...] }. */
function matchDeal(v) {
  const cand = new Set();
  for (const k of v.regKeys) for (const d of dealsByLedgerVehicle.get(k) ?? []) cand.add(d);
  for (const d of accountsByFile.get(String(v.fileNo ?? "").toUpperCase().replace(/\s+/g, "")) ?? []) cand.add(d);
  for (const k of v.regKeys) for (const d of accountsByPlate.get(k) ?? []) cand.add(d);

  const live = [...cand].filter(isLive);
  if (live.length === 1) return { deal: live[0], via: "only live deal on this vehicle" };
  if (live.length > 1) {
    const inBatch = live.filter((d) => batch.has(d));
    if (inBatch.length === 1) return { deal: inBatch[0], via: "the only one of several live deals that is in the Nedbank batch" };
    const signed = live.filter((d) => SIGNED.test(accounts.get(d)?.workstate ?? ""));
    if (signed.length === 1) return { deal: signed[0], via: "the only one of several live deals marked 'signed and delivered'" };
    return { ambiguous: live };
  }
  return { none: true, candidates: [...cand] };
}

// ---------------------------------------------------------------------------
// Contracts, clients
// ---------------------------------------------------------------------------

const clients = new Map(); // key -> client
const contracts = [];
const usedDeals = new Map(); // deal -> vehicle ref
const heldDeals = new Map(); // deal -> vehicle it was a candidate for but was held back
const usedTags = new Set();

function nextTag(base) {
  const root = (base || "CLIENT").toUpperCase().replace(/\s+/g, " ").trim();
  let tag = root;
  let n = 2;
  while (usedTags.has(tag)) tag = `${root}${n++}`;
  usedTags.add(tag);
  return tag;
}

function clientFor(v, deal) {
  const acc = deal ? accounts.get(deal) : null;
  const id = acc ? normSaId(acc.customerRaw) : null;
  const code = acc?.customerRaw && !id ? acc.customerRaw.toUpperCase() : null;
  const cell = normCell(v.cellRaw);
  let key;
  let fullName;
  if (acc && id) {
    key = `id:${id}`;
    fullName = acc.name || v.clientSurname;
  } else if (acc && code) {
    // The legacy "Customer" field is sometimes a code (e.g. "JOHNSMITH-SAMC")
    // rather than an ID number — still a unique per-person identity, so it
    // keeps two people with the same surname apart.
    key = `code:${code}`;
    fullName = acc.name || v.clientSurname;
  } else if (acc?.name) {
    key = `name:${acc.name.toUpperCase()}|${cell ?? ""}`;
    fullName = acc.name;
  } else {
    key = `fleet:${(v.clientSurname ?? "").toUpperCase()}|${cell ?? ""}`;
    fullName = v.clientSurname;
  }
  let c = clients.get(key);
  if (!c) {
    c = { id: randomUUID(), key, fullName, idNumber: acc && id ? id : null, cell, cellRaw: v.cellRaw, deals: [] };
    clients.set(key, c);
    if (!c.idNumber) {
      ex("Client IDs", `${fullName}${deal ? ` (${deal})` : ` (${v.fileNo})`}`, acc ? `No ID number on the legacy system (customer code "${acc.customerRaw ?? "blank"}")` : "Not matched to a legacy deal, so no ID number", "What is their SA ID / registration number?", "info");
    }
    if (!cell) ex("Client cells", `${fullName} (${v.fileNo})`, `Cell number "${v.cellRaw ?? "blank"}" is missing or not a valid SA number`, "What is their cell number?");
  } else if (!c.cell && cell) {
    c.cell = cell;
  }
  return c;
}

for (const v of vehicles) {
  if (!v.wantsContract) continue;
  const m = matchDeal(v);
  let deal = null;
  let via = null;
  if (m.deal) {
    deal = m.deal;
    via = m.via;
    if (usedDeals.has(deal)) {
      ex("Deals", `${v.fileNo} ${v.reg ?? ""}`.trim(), `Deal ${deal} also matches ${usedDeals.get(deal)} — loaded on the first only`, "Which vehicle does this deal belong to?", "error");
      deal = null;
    }
  } else if (m.ambiguous) {
    ex("Deals", `${v.fileNo} ${v.reg ?? ""} (${v.clientSurname})`.trim(), `Several live deals fit this vehicle: ${m.ambiguous.join(", ")} — loaded with no deal number`, "Which deal is the current one?");
  } else {
    ex("Deals", `${v.fileNo} ${v.reg ?? ""} (${v.clientSurname})`.trim(), `No live deal found for this vehicle${m.candidates?.length ? ` (old/ended deals only: ${m.candidates.join(", ")})` : ""} — loaded with no deal number`, "What is the deal number for this vehicle?");
  }
  // Consistency check before the deal is attached. If the account holder's
  // name disagrees with the fleet sheet's client AND the legacy account does
  // not itself tie the deal to this vehicle (file no / reg), hold the deal
  // back: loading it would put someone else's payments, balance and bank
  // details on this client.
  if (deal) {
    const a0 = accounts.get(deal);
    const fileOk = a0?.fileNo && String(a0.fileNo).toUpperCase().replace(/\s+/g, "") === String(v.fileNo ?? "").toUpperCase().replace(/\s+/g, "");
    const plateOk = a0?.vehicle && v.regKeys.includes(plateKey(a0.vehicle));
    const nameOk = !a0?.name || !v.clientSurname || sameName(v.clientSurname, a0.name);
    if (!nameOk && !fileOk && !plateOk) {
      heldDeals.set(deal, `${v.fileNo} ${v.reg ?? ""}`.trim());
      ex("Deals", `${v.fileNo} ${v.reg ?? ""} ${deal}`.trim(), `NOT loaded — the fleet sheet says the client is "${v.clientSurname}", but deal ${deal} (the only live deal on this vehicle in the ledger) belongs to "${a0.name}", and the legacy account lists file "${a0.fileNo ?? "?"}" / reg "${a0.vehicle ?? "?"}". Contract loaded without a deal number.`, "Who is the current client on this vehicle, and which deal is theirs?");
      deal = null;
    } else if (!fileOk && !plateOk) {
      ex("Deals", `${v.fileNo} ${v.reg ?? ""} ${deal}`.trim(), `Loaded, but the legacy account lists file "${a0?.fileNo ?? "?"}" / reg "${a0?.vehicle ?? "?"}" for this deal rather than this vehicle`, "Please confirm this deal belongs to this vehicle.", "info");
    }
    if (deal && !nameOk) {
      ex("Name differences", `${v.fileNo} ${v.reg ?? ""} ${deal}`.trim(), `Loaded under the legacy account holder "${a0.name}" (the legacy account ties deal ${deal} to this vehicle), but the fleet sheet's client for this vehicle is "${v.clientSurname}"`, "Has the vehicle changed hands, or is the fleet sheet out of date?", "info");
    }
  }
  if (deal) usedDeals.set(deal, `${v.fileNo} ${v.reg ?? ""}`.trim());

  const client = clientFor(v, deal);
  const acc = deal ? accounts.get(deal) : null;
  const led = deal ? ledger.get(deal) : null;
  const bat = deal ? batch.get(deal) : null;

  if (bat?.amount != null && v.installment != null && Math.abs(bat.amount - v.installment) > 1) {
    const ratio = bat.amount / v.installment;
    if (Math.abs(ratio - 1.055) < 0.004) {
      // Systematic: the bank collects exactly 5.5% above the sheet — an
      // annual escalation the sheet doesn't reflect. Listed on its own sheet.
      ex("Installment escalation", `${deal} ${v.reg ?? ""}`.trim(), `Sheet R${v.installment} → bank collects R${bat.amount} (+${((ratio - 1) * 100).toFixed(1)}%)`, "", "info");
    } else {
      ex("Amounts", `${deal} ${v.reg ?? ""}`.trim(), `Fleet sheet installment R${v.installment} but the debit-order batch collects R${bat.amount} (${ratio > 1 ? "+" : ""}${((ratio - 1) * 100).toFixed(1)}%)`, "Which amount is correct?");
    }
  }

  const payments = led ? led.rows.filter((r) => PAYMENT_TYPES.has(r.type) && r.date <= TODAY) : [];
  const netCollected = payments.reduce((s, r) => s - r.amt, 0) + (led ? led.rows.filter((r) => r.type === "Returned debit order" && r.date <= TODAY).reduce((s, r) => s - r.amt, 0) : 0);
  const balance = led ? led.balance : null;
  if (balance != null && balance < -1) {
    ex("Balances", `${deal} ${v.reg ?? ""} (${client.fullName})`, `Account is in credit by R${Math.abs(balance).toFixed(2)} per the ledger — outstanding loaded as R0`, "Is this credit genuine (overpayment/deposit) or an error?");
  }

  let tag = null;
  if (deal) {
    const fromBatch = bat?.tag?.toUpperCase();
    if (fromBatch && !usedTags.has(fromBatch)) {
      usedTags.add(fromBatch);
      tag = fromBatch;
    } else {
      tag = nextTag(fromBatch || surnameOf(acc?.name) || v.clientSurname);
    }
  }

  const contract = {
    id: randomUUID(),
    vehicle: v,
    client,
    deal,
    tag,
    type: v.contractType,
    startDate: led?.firstDate ?? v.purchaseDate ?? TODAY,
    endDate: v.endDate,
    payMethod: bat ? "debit_order" : v.payMethod,
    installment: v.installment,
    purchasePrice: v.purchasePrice,
    potentialSale: v.potentialSale,
    rv: v.rv,
    totalCollected: led ? Math.max(0, netCollected) : (v.sheetTotalCollected ?? 0),
    outstanding: balance != null ? Math.max(0, Math.round(balance * 100) / 100) : 0,
    paidUp: v.paidUp,
    hasLedger: Boolean(led),
  };
  if (deal && !led) ex("Balances", `${deal} ${v.reg ?? ""}`.trim(), "No entries for this deal in the ledger export — no payment history or balance loaded", "Is the deal number right / is the ledger export complete?");
  contracts.push(contract);
  client.deals.push(deal);
}

// Active deals (Nedbank batch) that ended up on no contract
const contractDeals = new Set(contracts.map((c) => c.deal).filter(Boolean));
for (const [deal, b] of batch) {
  if (contractDeals.has(deal)) continue;
  const a = accounts.get(deal);
  const held = heldDeals.get(deal);
  ex("Active deals with no vehicle", `${deal} (${a?.name ?? b.holder ?? b.tag})`, `In the debit-order batch (R${b.amount ?? "?"}) but not loaded on any vehicle. ${held ? `It was the only live deal on ${held}, but the client names disagree (see Deals sheet). ` : "No vehicle in the fleet workbook matches it. "}Legacy file ${a?.fileNo ?? "?"} / reg ${a?.vehicle ?? "?"}; status "${a?.workstate ?? "?"}"`, "Which vehicle is this deal on?");
}

// ---------------------------------------------------------------------------
// Payments (ledger -> payment_transactions) for loaded deals only
// ---------------------------------------------------------------------------

const payments = [];
const pairStats = { returned: 0, paired: 0 };
for (const c of contracts) {
  if (!c.deal || !ledger.has(c.deal)) continue;
  const rows = ledger.get(c.deal).rows.filter((r) => r.date <= TODAY);
  const dos = rows.filter((r) => r.type === "Debit order");
  const used = new Set();
  const made = new Map();
  for (const r of rows) {
    if (PAYMENT_TYPES.has(r.type)) {
      const p = { id: randomUUID(), contractId: c.id, date: r.date, type: "receipt", ref: `L${r.id}`, amount: Math.abs(r.amt), cash: Math.abs(r.amt), srcType: r.type, pair: null, dealKey: c.deal };
      payments.push(p);
      made.set(r.id, p);
    }
  }
  for (const r of rows) {
    if (r.type !== "Returned debit order") continue;
    pairStats.returned++;
    const p = { id: randomUUID(), contractId: c.id, date: r.date, type: "debit_note", ref: `L${r.id}`, amount: Math.abs(r.amt), cash: -Math.abs(r.amt), srcType: r.type, pair: null, dealKey: c.deal };
    payments.push(p);
    const orig = dos.find((d) => !used.has(d.id) && d.date === r.date && Math.abs(Math.abs(d.amt) - Math.abs(r.amt)) < 0.005);
    if (orig) {
      used.add(orig.id);
      const op = made.get(orig.id);
      p.pair = op;
      op.pair = p;
      pairStats.paired++;
    } else {
      ex("Payments", `${c.deal} ${c.vehicle.reg ?? ""}`.trim(), `Returned debit order of R${Math.abs(r.amt)} on ${r.date} has no matching debit order the same day/amount`, "", "info");
    }
  }
}
const futureDebitOrders = ledgerRows.filter((r) => r.type === "Debit order" && r.date > TODAY && contractDeals.has(r.deal)).length;

// ---------------------------------------------------------------------------
// Banking (batch -> client_banking_details), per client; conflicts are skipped
// ---------------------------------------------------------------------------

const KEY = process.env.BANKING_ENCRYPTION_KEY ? Buffer.from(process.env.BANKING_ENCRYPTION_KEY, "base64") : null;
if (KEY && KEY.length !== 32) {
  console.error("BANKING_ENCRYPTION_KEY must decode to 32 bytes.");
  process.exit(1);
}
function encryptField(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: Buffer.concat([enc, cipher.getAuthTag()]).toString("base64"), iv: iv.toString("base64") };
}
const banking = [];
for (const client of clients.values()) {
  const variants = new Map();
  for (const deal of client.deals) {
    const b = deal ? batch.get(deal) : null;
    if (!b?.account || !b.bank) continue;
    variants.set(`${b.bank}|${b.branch}|${b.account}|${b.holder}`, { ...b, deal });
  }
  if (variants.size === 0) continue;
  if (variants.size > 1) {
    ex("Banking", `${client.fullName} (${[...variants.values()].map((x) => x.deal).join(", ")})`, `Different bank details across this client's deals (${variants.size} variants) — none loaded`, "Which bank account is current?");
    continue;
  }
  const b = [...variants.values()][0];
  if (!KEY && !process.argv.includes("--no-banking")) {
    console.error("Missing BANKING_ENCRYPTION_KEY — run with --env-file=.env.local (or pass --no-banking to skip banking).");
    process.exit(1);
  }
  banking.push({ id: randomUUID(), client, bank: b.bank, branch: b.branch, account: b.account, holder: b.holder ?? client.fullName, last4: b.account.slice(-4) });
}

// ---------------------------------------------------------------------------
// Vehicle-only exceptions
// ---------------------------------------------------------------------------

for (const v of vehicles) {
  for (const f of v.flags) ex("Vehicles", `${v.fileNo} ${v.reg ?? ""}`.trim(), f, "");
  if (v.status === "rental") ex("Rentals", `${v.fileNo} ${v.reg ?? ""}`.trim(), `Status Rental (note "${v.legacyStatusNote}") — vehicle loaded, no contract`, `Who rents it (${v.nameHint ?? "?"}) and on what terms? A Rental contract can be added.`);
  if (v.status === "str" && !v.wantsContract) ex("STR", `${v.fileNo} ${v.reg ?? ""}`.trim(), `Status STR (note "${v.legacyStatusNote}") but no client name — vehicle loaded, no contract`, "Who is the STR client?");
}

// Things the reload deliberately does not load — so the client knows what is missing.
{
  const unloadedDeals = [...ledger.keys()].filter((d) => !contractDeals.has(d)).length;
  const note = (ref, detail, question = "") => ex("Not loaded", ref, detail, question, "info");
  note("ENDED CONTRACTS sheet", `${endedStats.loaded} ended vehicles were loaded on the End of Contract tab with only file number, registration, model and the status note (the sheet's layout is inconsistent, so other details were not read); ${endedStats.backInFleet} more are back in the active fleet and were skipped. No deals, clients or payments are loaded for them.`, "Is this enough detail for ended vehicles, or do you want their old deals/clients linked?");
  note("Payment history of ended deals", `The ledger holds ${unloadedDeals} deals that are not on a loaded contract (ended, or not matched). Their payments are not loaded — only active deals, as agreed.`, "Do you also want the history of ended deals?");
  note("Ledger entries that only change the balance", "Charges (rentals, fees, deposits), credit notes, refunds, transfers and write-offs are used to calculate each account's outstanding balance but are not shown as payments.", "Please spot-check a few balances against the legacy system.");
  note("Scheduled debit orders", `${futureDebitOrders} debit orders dated in the future (scheduled) were not loaded as payments.`);
  note("Other workbook sheets", "STR DEALS, COLLECTIONS, CARS FOR SALE and WAITING PAYOUT INSURANCE were not loaded; PAST CLIENTS is not loaded.");
  note("Existing system data replaced", "The reload replaces everything created by the September import and any edits made since (including one vehicle cost entry).");
}

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------

const lit = (v) => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return `'${String(v).replace(/'/g, "''")}'`;
};
function insertChunks(table, columns, rows, size = 400) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    out.push(`insert into ${table} (${columns.join(", ")}) values\n${chunk.map((r) => `  (${r.map(lit).join(", ")})`).join(",\n")};`);
  }
  return out.join("\n");
}

const sql = [];
sql.push(`-- Fleet data reload — generated ${new Date().toISOString()}. One transaction (run with --single-transaction).`);
sql.push(`-- Wipes: payment_transactions, contract_vehicle_assignments, client_banking_details, rental_payment_periods, contracts, insurance_claims, sale_listings, vehicle_assignments, vehicle_costs, vehicle_registrations, vehicles, clients.`);
for (const t of ["payment_transactions", "contract_vehicle_assignments", "client_banking_details", "rental_payment_periods", "contracts", "insurance_claims", "sale_listings", "vehicle_assignments", "vehicle_costs", "vehicle_registrations", "vehicles", "clients"]) {
  sql.push(`delete from public.${t};`);
}
sql.push(
  insertChunks(
    "public.vehicles",
    ["id", "file_no", "make", "model", "year", "colour", "status", "legacy_status_note", "assigned_to_name", "current_mileage", "next_service_km", "next_service_date", "last_serviced_by", "tracker_supplier", "tracker_running", "natis_on_file", "license_disc_expiry", "has_spare_key", "warranty_active", "has_contract_file"],
    vehicles.map((v) => [v.id, v.fileNo, v.make, v.model, v.year, v.colour, v.status, v.legacyStatusNote, v.assignedToName, v.mileage, v.nextKm, v.nextDate, v.servicedBy, v.trackerSupplier, v.trackerRunning, v.natis, v.licenseDisc, v.spare, v.warrantyActive, v.hasContractFile])
  )
);
sql.push(
  insertChunks(
    "public.vehicle_registrations",
    ["id", "vehicle_id", "plate_number"],
    vehicles.filter((v) => v.reg).map((v) => [randomUUID(), v.id, v.reg])
  )
);
sql.push(
  insertChunks(
    "public.clients",
    ["id", "full_name", "id_number", "cell_number"],
    [...clients.values()].map((c) => [c.id, c.fullName, c.idNumber, c.cell ?? "0000000000"])
  )
);
sql.push(
  insertChunks(
    "public.contracts",
    ["id", "vehicle_id", "client_id", "contract_type", "status", "start_date", "end_date", "payment_method", "installment_amount", "purchase_price", "potential_sale_price", "residual_value", "total_collected", "outstanding_balance", "is_paid_up", "deal_number", "statement_tag"],
    contracts.map((c) => [c.id, c.vehicle.id, c.client.id, c.type, "active", c.startDate, c.endDate, c.payMethod, c.installment, c.purchasePrice, c.potentialSale, c.rv, c.totalCollected, c.outstanding, c.paidUp, c.deal, c.tag])
  )
);
sql.push(
  insertChunks(
    "public.contract_vehicle_assignments",
    ["id", "contract_id", "vehicle_id", "effective_from"],
    contracts.map((c) => [randomUUID(), c.id, c.vehicle.id, c.startDate])
  )
);
if (KEY) {
  sql.push(
    insertChunks(
      "public.client_banking_details",
      ["id", "client_id", "bank_name", "branch_code", "account_holder_name_encrypted", "account_holder_name_iv", "account_number_encrypted", "account_number_iv", "account_number_last4"],
      banking.map((b) => {
        const h = encryptField(b.holder);
        const a = encryptField(b.account);
        return [b.id, b.client.id, b.bank, b.branch, h.ciphertext, h.iv, a.ciphertext, a.iv, b.last4];
      })
    )
  );
}
sql.push(
  insertChunks(
    "public.payment_transactions",
    ["id", "contract_id", "transaction_date", "type", "reference", "invoice_reference", "amount", "cash_effect", "source"],
    payments.map((p) => [p.id, p.contractId, p.date, p.type, p.ref, "", p.amount, p.cash, "ledger_import"])
  )
);
const paired = payments.filter((p) => p.pair);
if (paired.length) {
  sql.push(
    `update public.payment_transactions t set reversed_transaction_id = v.other, reversal_reference = v.oref from (values\n${paired
      .map((p) => `  (${lit(p.id)}::uuid, ${lit(p.pair.id)}::uuid, ${lit(p.pair.ref)})`)
      .join(",\n")}\n) as v(id, other, oref) where t.id = v.id;`
  );
}

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const sqlPath = `${OUT_DIR}/reload-${TODAY}.sql`;
writeFileSync(sqlPath, sql.join("\n\n") + "\n");

const byArea = {};
for (const e of exceptions) byArea[e.area] = (byArea[e.area] ?? 0) + 1;

const wb = new ExcelJS.Workbook();
wb.creator = "SAR2O Fleet";
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F6B93" } };
function sheet(name, cols, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w }));
  ws.getRow(1).eachCell((cell) => {
    cell.fill = HEAD;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  for (const r of rows) ws.addRow(r);
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  ws.eachRow((row, i) => i > 1 && row.eachCell((c) => (c.alignment = { vertical: "top", wrapText: true })));
}
const summaryRows = [
  ["Vehicles loaded", vehicles.length],
  ["  of which in the fleet statuses", vehicles.filter((v) => !v.ended).length],
  ["  of which End of Contract (from the ENDED CONTRACTS sheet)", vehicles.filter((v) => v.ended).length],
  ["Contracts loaded", contracts.length],
  ["  with a deal number", contracts.filter((c) => c.deal).length],
  ["  without a deal number", contracts.filter((c) => !c.deal).length],
  ["Clients loaded", clients.size],
  ["  with a valid ID number", [...clients.values()].filter((c) => c.idNumber).length],
  ["Bank accounts loaded (encrypted)", banking.length],
  ["Payment rows loaded", payments.length],
  ["  returned debit orders", pairStats.returned],
  ["  of which paired with their original debit order", pairStats.paired],
  ["Scheduled (future-dated) debit orders not loaded", futureDebitOrders],
  ["Nedbank batch deals", batch.size],
  ["  matched to a vehicle/contract", [...batch.keys()].filter((d) => contractDeals.has(d)).length],
  ["  not matched to any vehicle", [...batch.keys()].filter((d) => !contractDeals.has(d)).length],
  ["Total outstanding loaded (R)", Math.round(contracts.reduce((s, c) => s + c.outstanding, 0))],
  [],
  ["Exceptions by area", ""],
  ...Object.entries(byArea).map(([a, n]) => [`  ${a}`, n]),
];
sheet("Summary", [{ h: "Item", k: "a", w: 52 }, { h: "Value", k: "b", w: 16 }], summaryRows.map((r) => ({ a: r[0], b: r[1] })));
const order = ["Deals", "Name differences", "Active deals with no vehicle", "Amounts", "Installment escalation", "Balances", "Client IDs", "Client cells", "Banking", "Vehicles", "Rentals", "STR", "Payments", "Ended vehicles", "Not loaded"];
const AREA_HELP = {
  Deals: "Deal numbers we could not safely attach to a vehicle, or that need a second pair of eyes.",
  "Active deals with no vehicle": "Deals the bank is still collecting on that we cannot place on any vehicle in the fleet list.",
  "Name differences": "Deals that are loaded because the legacy account itself ties them to the vehicle, but the account holder's name differs from the client on the fleet sheet.",
  Amounts: "The installment on the fleet sheet disagrees with what the bank collects.",
  Balances: "Accounts in credit, or deals missing from the ledger.",
  "Installment escalation": "Deals where the bank collects exactly 5.5% more than the installment on the fleet sheet (looks like an annual escalation the sheet does not reflect). Question for the client: should the system's installments be updated to what the bank collects?",
  "Client IDs": "Clients with no SA ID number on the legacy system (the legacy customer field holds a code, not an ID).",
  "Client cells": "Clients whose cell number is missing or invalid on the fleet sheet.",
  Banking: "Banking details we did not load because the deals disagree.",
  Vehicles: "Vehicle rows that needed a default or have extra data we did not load.",
  Rentals: "Vehicles marked Rental — no contract exists for them.",
  STR: "Short-term-rental vehicles with no client.",
  Payments: "Ledger oddities (informational).",
  "Ended vehicles": "Ended-contract vehicles whose outcome (sold / written off) is not stated on the sheet.",
  "Not loaded": "What the reload deliberately did not load.",
};
for (const area of order) {
  const rows = exceptions.filter((e) => e.area === area);
  if (!rows.length) continue;
  sheet(
    area.length > 28 ? area.slice(0, 28) : area,
    [
      { h: "Reference", k: "ref", w: 34 },
      { h: "What we found", k: "detail", w: 80 },
      { h: "Question for the client", k: "question", w: 48 },
      { h: "Client answer", k: "answer", w: 36 },
    ],
    [{ ref: area, detail: AREA_HELP[area] ?? "", question: "", answer: "" }, ...rows.map((e) => ({ ref: e.ref, detail: e.detail, question: e.question, answer: "" }))]
  );
}
const xlsxPath = `${OUT_DIR}/exceptions-${TODAY}.xlsx`;
await wb.xlsx.writeFile(xlsxPath);

console.log(`Plan (as of ${TODAY}; live-deal cutoff ${LIVE_SINCE}):`);
for (const r of summaryRows) if (r.length) console.log(`  ${String(r[0]).padEnd(52)} ${r[1]}`);
console.log(`\nSQL:        ${sqlPath}`);
console.log(`Exceptions: ${xlsxPath}`);
