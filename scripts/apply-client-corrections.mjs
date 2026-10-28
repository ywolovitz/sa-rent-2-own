// Turns the client's returned exception sheet into a guarded SQL patch (never executes it).
// Usage: node scripts/apply-client-corrections.mjs "data/<returned sheet>.xlsx" "data/<original exceptions>.xlsx"
// Output: .import-reports/reload/corrections-<date>.sql and corrections-<date>.txt (review list).
// The client typed some answers over the "Question for the client" column, so each sheet's
// answer is whichever of columns C/D differs from the original question.
import XLSX from "xlsx";
import fs from "node:fs";

const [retPath, origPath] = process.argv.slice(2);
if (!retPath || !origPath) throw new Error("usage: apply-client-corrections.mjs <returned.xlsx> <original.xlsx>");
const ret = XLSX.readFile(retPath);
const orig = XLSX.readFile(origPath);
const rows = (wb, n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" }).slice(1);

const origQ = new Map();
for (const n of orig.SheetNames) for (const r of rows(orig, n)) origQ.set(`${n}|${r[0]}|${r[1]}`, String(r[2]).trim());
function answers(sheet) {
  const out = [];
  for (const r of rows(ret, sheet)) {
    const q = origQ.get(`${sheet}|${r[0]}|${r[1]}`);
    if (q === undefined) continue;
    const typed = String(r[3]).trim() || (String(r[2]).trim() !== q ? String(r[2]).trim() : "");
    if (typed) out.push({ ref: String(r[0]).trim(), found: String(r[1]), ans: typed });
  }
  return out;
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql = [];
const review = [];
const held = [];

sql.push(`-- Client corrections from the returned exception sheet. One transaction; each statement must hit exactly the rows expected.`);
sql.push(`begin;`);
sql.push(`create function pg_temp.chk(label text, n bigint) returns void language plpgsql as $f$ begin
  if n > 1 then raise exception '% updated % rows (expected at most 1)', label, n; end if;
  if n = 0 then raise notice 'NO MATCH (nothing changed): %', label; end if;
end $f$;`);

// 1. Installment amounts, by deal number (Amounts sheet)
sql.push(`\n-- Installment amounts`);
for (const a of answers("Amounts")) {
  const deal = a.ref.split(/\s+/)[0];
  const m = a.ans.match(/(\d[\d ]*\.?\d*)/);
  if (!/^MAD\d+[A-Z]?$/.test(deal) || !m) { held.push(`Amounts ${a.ref}: could not parse "${a.ans}"`); continue; }
  const amt = Number(m[1].replace(/\s/g, ""));
  sql.push(`with u as (update public.contracts set installment_amount = ${amt} where deal_number = ${q(deal)} returning 1) select pg_temp.chk(${q("installment " + deal)}, count(*)) from u;`);
  review.push(`Installment  ${deal} -> R${amt.toFixed(2)}${/reg/i.test(a.ans) ? "   (her note: " + a.ans + " — the reg swap itself is NOT applied)" : ""}`);
}

// 2. Cell numbers, matched via the vehicle's contract; client name must match the reference
sql.push(`\n-- Client cell numbers`);
for (const a of answers("Client cells")) {
  const mm = a.ref.match(/^(.*)\s\(([AB]\d+)\)$/);
  const cell = a.ans.replace(/\D/g, "");
  if (!mm || !/^0\d{9}$/.test(cell)) { held.push(`Client cells ${a.ref}: "${a.ans}"`); continue; }
  const [, name, file] = mm;
  sql.push(`with u as (update public.clients set cell_number = ${q(cell)} where id in (select c.client_id from public.contracts c join public.vehicles v on v.id = c.vehicle_id where v.file_no = ${q(file)}) and lower(full_name) = lower(${q(name)}) returning 1) select pg_temp.chk(${q("cell " + name + " " + file)}, count(*)) from u;`);
  review.push(`Cell         ${name} (${file}) -> ${cell}`);
}

// 3. ID numbers: valid SA ID (Luhn) or flagged passport, not shared with another client, only where none is set yet
const luhn = (s) => { let t = 0; for (let i = 0; i < 13; i++) { let d = +s[12 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; } return t % 10 === 0; };
sql.push(`\n-- Client ID numbers (only where the client has none yet)`);
const idAns = answers("Client IDs").map((a) => {
  const tok = a.ans.match(/^\s*([A-Za-z0-9/]+)/)?.[1] ?? "";
  return { ...a, tok, passport: /passport/i.test(a.ans) };
});
const count = new Map();
for (const a of idAns) count.set(a.tok, (count.get(a.tok) || 0) + 1);
for (const a of idAns) {
  const mm = a.ref.match(/^(.*)\s\(([A-Za-z0-9]+)\)$/);
  if (!mm) { held.push(`Client IDs ${a.ref}: unparsable reference`); continue; }
  const [, name, key] = mm;
  if (/^\d{13}$/.test(a.tok)) {
    if (count.get(a.tok) > 1) { held.push(`Client IDs ${name} (${key}): ${a.tok} was also given for another client`); continue; }
    if (!luhn(a.tok)) { held.push(`Client IDs ${name} (${key}): ${a.tok} fails the SA ID check digit`); continue; }
  } else if (!a.passport) { held.push(`Client IDs ${name} (${key}): "${a.ans}" is not an SA ID or flagged passport`); continue; }
  const byDeal = /^MAD/.test(key);
  const where = byDeal
    ? `id in (select client_id from public.contracts where deal_number = ${q(key)}) and lower(full_name) = lower(${q(name)})`
    : `lower(full_name) = lower(${q(name)})`;
  sql.push(`with u as (update public.clients set id_number = ${q(a.tok)} where ${where} and id_number is null returning 1) select pg_temp.chk(${q("id " + name + " " + key)}, count(*)) from u;`);
  review.push(`ID number    ${name} (${key}) -> ${a.tok}${a.passport ? " (passport)" : ""}${/terminat|hold/i.test(a.ans) ? "   [" + a.ans.replace(a.tok, "").trim() + "]" : ""}`);
}

// 4. Vehicle statuses she stated outright
sql.push(`\n-- Vehicle statuses`);
for (const [file, status, why] of [
  ["B0151", "str", 'Rentals: "STR"'],
  ["B0166", "str", 'Rentals: "STR"'],
  ["B0180", "sold", 'Ended vehicles: "SOLD"'],
]) {
  sql.push(`with u as (update public.vehicles set status = ${q(status)}::public.vehicle_status where file_no = ${q(file)} returning 1) select pg_temp.chk(${q("status " + file)}, count(*)) from u;`);
  review.push(`Status       ${file} -> ${status}   (${why})`);
}

// 5. Deal number she named outright for a contract that has none
sql.push(`\n-- Deal numbers`);
sql.push(`with u as (update public.contracts set deal_number = 'MAD3600S' where deal_number is null and vehicle_id in (select id from public.vehicles where file_no = 'B0154') returning 1) select pg_temp.chk('deal B0154', count(*)) from u;`);
review.push(`Deal number  B0154 -> MAD3600S   (Deals: "MAD0003600S")`);

sql.push(`\ncommit;`);

const day = new Date().toISOString().slice(0, 10);
fs.mkdirSync(".import-reports/reload", { recursive: true });
fs.writeFileSync(`.import-reports/reload/corrections-${day}.sql`, sql.join("\n") + "\n");
fs.writeFileSync(`.import-reports/reload/corrections-${day}.txt`, ["APPLIED BY THE PATCH", ...review, "", "HELD BACK", ...held, ""].join("\n"));
console.log(`${review.length} changes, ${held.length} held back -> .import-reports/reload/corrections-${day}.{sql,txt}`);
