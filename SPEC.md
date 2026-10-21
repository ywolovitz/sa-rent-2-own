# SA Rent 2 Own — Fleet Management System

Living specification document. Started from initial planning before any code existed; now kept in sync with what's actually built and deployed. Update it whenever a schema or design decision changes — treat it as the source of truth for *why* things are the way they are, not just a historical record.

**Current status: live in production**, deployed on Vercel, actively used by the client. See [§9](#9-whats-built) for what's actually shipped and [§11](#11-open-items) for what's still outstanding.

## 1. Overview

Internal web application replacing a OneDrive Excel workbook used to manage a rent-to-own vehicle fleet (registrations, clients, contracts, service history, and short-term rentals). Used by the business owner, managers, and technicians. Not public-facing. No integration with the separate legacy PHP business system — this is an independent, clean rebuild.

Core domains: vehicles, clients, rent-to-own and short-term-rental contracts, vehicle costs/service history, staff/technicians. Reporting/email notifications and WhatsApp-based automation are planned next phases (not yet built — see §11).

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19 Server Components + Server Actions |
| Backend / DB | Supabase — Postgres, Supabase Auth, Row Level Security |
| Styling / UI | Tailwind CSS v4 + hand-built shadcn/ui-style components, custom brand theme (§2.1) |
| Drag-and-drop | `@dnd-kit` — used for the Vehicles table's reorderable columns |
| Spreadsheet export | `exceljs` — styled `.xlsx` export (themed header, status chips, meta rows); `xlsx` (SheetJS) is kept only for the one-off local import script, since its free tier can't write cell styles |
| File storage | Supabase Storage (private `vehicle-invoices` bucket, RLS-gated) |
| Hosting | Vercel, deployed from the `main` branch (auto-deploy on push) |
| Access control | Supabase Auth (invite-only, phone + password) + Postgres RLS + Next.js Proxy (`proxy.ts`, the Next 16 rename of middleware) for route gating |
| Language / tooling | TypeScript throughout |

Not yet built/chosen: transactional email (Resend is the plan — see §11), PDF generation, WhatsApp Business API / Twilio automation beyond the phone-auth OTP use case.

### 2.1 Brand palette

Fixed brand colors, defined as CSS custom properties in `src/app/globals.css` and reused as Tailwind theme tokens (`bg-sidebar`, `text-destructive`, etc.) rather than scattered as one-off hex values:

| Token | Hex | Used for |
|---|---|---|
| `--brand-blue-dark` | `#0F6B93` | Sidebar background, Excel export header fill |
| `--brand-blue` | `#007FA3` | Active sidebar nav item |
| `--brand-red` | `#FF5252` | Destructive actions, overdue indicators, dashboard stat-card labels |
| `--brand-grey` | `#9E9E9E` | Secondary/muted text |
| `--brand-grey-light` | `#D6D6D6` | Borders, inputs |

The sidebar keeps this identity fixed in both light and dark mode (it's a brand color, not a theme-relative one).

## 3. Source Data (from client's OneDrive workbook)

Access note: the OneDrive share link itself could not be opened (requires the client's Microsoft login). The workbook was instead provided directly as `SAR2O_FLEET-YONI_APRIL_2026.xlsx` and read in full. It contains 7 sheets:

| Sheet | Rows | Purpose |
|---|---|---|
| CURRENT FLEET | 399 | Main fleet table — one row per vehicle, with current client/contract flattened onto it |
| Sheet2 | 341 | `REG` + `CURRENT CLIENT` only — appears to be a stale duplicate/lookup list, not a distinct source |
| CARS FOR SALE | 14 | Vehicles listed for sale: make/model/year/spec/mileage/colour/location/condition/auto price/our price |
| ENDED CONTRACTS | 230 | Same shape as CURRENT FLEET plus sale price — confirms contracts are their own entity; ending a deal currently means manually cutting the row into this sheet |
| STR DEALS | 43 | Short-term rental tracking — a hand-built pivot (one column per deal, one row per month) recording billing day, pays-ahead/pays-back direction, and monthly paid/owes/ended status |
| WAITING PAYOUT INSURANCE | 4 | Write-offs/stolen vehicles awaiting insurance payout |
| COLLECTIONS | 149 | Arrears tracking: deal, vehicle, customer, deal end, installment, RV, outstanding, arrears, notes |

Known data-quality issues that drove the schema design below:
- `STATUS` on the main sheet is free text and includes non-status values — rental type (`STR`) and people's names (`REPAIR DANIEL`, `BOOYSEN TIM`) mixed in, because there was nowhere else to put that information.
- Registration sometimes contains two plates in one field (e.g. `"JG52RVGP (JGN814MP)"`), almost certainly an un-modeled plate change.
- Client is denormalized onto the vehicle (`CURRENT CLIENT`, `PAST CLIENTS` as a comma-separated string) rather than being its own entity with history.
- No real payment ledger exists — a single `INSTALLMENT` amount and a manually-set `PAID` yes/no flag.
- An unlabeled column in CURRENT FLEET (between `INSTALLMENT` and `PAST CLIENTS`) holds numeric values and text like `"NO DATA"` / `"FINE"` — most likely an arrears figure that never got a header.
- STR deal "car" references are inconsistent free text (partial reg, model name, or manufacturer only) rather than a real reference to a fleet vehicle.

## 4. Data Model

Schema lives in `supabase/migrations/`, applied in filename order. `src/lib/database.types.ts` is hand-maintained to match it (see the note at the top of that file — keep it in sync whenever a migration changes a table shape).

### `profiles` (extends `auth.users`)
- `id` (uuid, = `auth.users.id`)
- `full_name`
- `phone` (E.164, also the login identifier via `auth.users.phone`)
- `email` (optional, metadata only — not used for login)
- `role` enum(`admin`, `manager`, `technician`)
- `is_active` boolean
- `created_at`

### `clients`
- `id`, `full_name`, `id_number`, `cell_number`, `alt_cell_number`, `email`, `address`, `notes`, timestamps

### `client_banking_details`
- `id`, `client_id` fk → clients
- `bank_name`, `account_type`, `branch_code` (plaintext — not sensitive alone)
- `account_holder_name_encrypted`, `account_number_encrypted` (application-level AES-256-GCM ciphertext)
- `account_holder_name_iv`, `account_number_iv` (each encrypted field gets its own IV — AES-GCM requires a unique key+IV pair per encryption, so the two fields can't share one)
- `account_number_last4` (plaintext, for masked display without decrypting)
- `key_version` (supports future key rotation)
- `created_by` fk → profiles, `created_at`, `updated_at`
- RLS: `admin`/`manager` only — `technician` denied entirely at the database level.
- Every decrypt/reveal action is written to `audit_log`. Never included in exports, generated PDFs, or WhatsApp/SMS messages. (The Excel export feature — see §9 — deliberately only ever reads the already-masked `account_number_last4`, never the encrypted fields.)
- Backfilled for 126 clients from the bank batch sample via `scripts/backfill-client-banking.mjs`, matched to contracts via `deal_number` — overwrites an existing row (client-confirmed policy); `account_type` isn't in the source file and is never touched by it (defaults to `other` on first insert). 18 rows were withheld as conflicts: the batch disagreed on banking details across a client's deals — which, on inspection, is actually a pre-existing client-identity bug (distinct real people merged into one `client_id` by the original import), not a banking data problem — see §11 item 20.

### `vehicles`
- `id`, `file_no` (unique, legacy reference e.g. `A025`)
- `make`, `model`, `year`, `colour`
- `vin`, `engine_number`
- `status` enum(`available`, `on_road`, `parked`, `in_repair`, `for_sale`, `sold`, `written_off`)
- `legacy_status_note` (text — raw original sheet value, preserved verbatim)
- `assigned_to` (nullable fk → profiles, when the assignee has a real account) / `assigned_to_name` (free text, added post-launch for when they don't — e.g. imported historical data, an external contractor without a login)
- `current_mileage`, `next_service_km`, `next_service_date`, `last_serviced_by`
- `tracker_supplier`, `tracker_running` enum(`yes`, `no`, `no_info`)
- `natis_on_file` boolean, `license_disc_expiry` date, `has_spare_key` boolean
- `warranty_active` boolean, `warranty_notes` text
- `has_contract_file` boolean
- `insurance_claim_status` enum(`none`, `pending`, `paid`, `denied`) — **schema exists, not yet surfaced in the UI**
- timestamps

### `vehicle_registrations` (license plate history)
- `id`, `vehicle_id` fk → vehicles
- `plate_number`, `effective_from` date, `effective_to` date (null = current), `reason`, `created_at`
- Constraint: at most one row per vehicle with `effective_to IS NULL`
- Current-screen usage always joins to the open (`effective_to IS NULL`) row; historical plates remain queryable

### `contract_vehicle_assignments` (vehicle ↔ contract history — same relationship, both directions)
- `id`, `contract_id` fk → contracts, `vehicle_id` fk → vehicles
- `effective_from` date, `effective_to` date (null = current), `reason`, `created_at`
- Constraint: at most one open row per `contract_id`, and at most one open row per `vehicle_id` — "a vehicle belongs to one contract at a time"
- Mirrors the `vehicle_registrations` pattern above, just linking two parents instead of one. `contracts.vehicle_id` remains the quick "current vehicle" pointer most of the app reads directly, kept in sync with this table's open row by `syncVehicleAssignment()` (`src/lib/vehicle-assignments.ts`), called from `createContract`/`updateContract`
- Surfaced as a "Contract history" tab on the Vehicle panel and a "Vehicle history" tab on the Contract panel
- Bootstrapped with one row per existing contract at migration time (its current vehicle, open-ended) — no deeper history assumed; older deal history can slot in later as additional closed rows with no schema change

### `vehicle_costs`
- `id`, `vehicle_id` fk → vehicles
- `cost_type` enum(`service`, `repair`, `car_wash`, `maintenance`, `other`)
- `cost_date`, `supplier`, `amount`, `mileage_at_time` (nullable)
- `invoice_file_path` — object path in the private `vehicle-invoices` Storage bucket, stored as `"<vehicle_id>/<filename>"` so Storage RLS can reuse the same `vehicle_assignments`-based visibility rule as `vehicle_costs` itself
- `notes`, `recorded_by` fk → profiles, `created_at`
- Doubles as the vehicle's service history log — no separate table needed. Shown in the Vehicle detail panel as a tabbed table (one tab per `cost_type`, plus "All"), with upload/download of the invoice PDF.

### `contracts`
- `id`, `vehicle_id` fk → vehicles, `client_id` fk → clients
- `contract_type` enum(`rent_to_own`, `short_term_rental`, `other`)
- `start_date`, `end_date`, `status` enum(`active`, `completed`, `cancelled`, `defaulted`, `repossessed`)
- `payment_method` enum(`debit_order`, `eft`, `cash`, `other`) — new contracts default to `debit_order`
- `installment_amount`, `purchase_price`, `potential_sale_price`, `sale_price`, `residual_value`
- `total_collected`, `outstanding_balance`, `arrears_amount` (simple manually-maintained numeric fields — not a full payment ledger, by design choice for v1)
- `is_paid_up` boolean, `notes`
- `deal_number` (text, unique where set) — the client's own "MAD..." deal reference, surfaced as its own Contracts table column
- `statement_tag` (text, unique where set) — short per-deal label used in bank debit-order batch "statement description" fields (e.g. "NEL", "NEL2" on collision). Auto-generated from the client's surname with a collision counter when left blank on save; always manually editable per contract.
- `billing_day` int (day of month payment is due, nullable), `billing_direction` enum(`advance`, `arrears`), `billing_frequency` enum(`weekly`, `monthly`) — generalized onto every contract (not just short-term rentals, since rent-to-own deals collect by debit order too)
- `billing_status` enum(`active`, `paused`, `stopped`) — whether this contract's debit order is currently collected, independent of the contract's own `status`
- timestamps
- A vehicle's "current client" = the client on its `active` contract; "past clients" = clients on its `completed`/`cancelled` contracts. No denormalized client fields on `vehicles`.
- `deal_number`/`statement_tag` were backfilled onto existing contracts from the client's accounts export and a bank batch sample via `scripts/backfill-deal-numbers.mjs` (matches by vehicle registration, then file number; anything ambiguous or unmatched is written to an Excel review file instead of guessed at — see the script's own header comment for the full matching policy).

### `rental_payment_periods`, `insurance_claims`, `sale_listings`
- Schema exists (generalized payment-period tracking, insurance claim records, for-sale listing details), migrated from the source workbook, but **no app UI reads or writes these yet**. They're reachable today only via direct SQL/Supabase dashboard. Candidates for a future module once the client prioritizes them.

### `payment_transactions` (per-transaction debit-order ledger)
- `id`, `contract_id` fk → contracts
- `transaction_date`, `type` enum(`receipt`, `debit_note`), `reference` (e.g. `REC-379`/`D-2201`), `invoice_reference` (e.g. `I-2971` — groups a billing period's receipt with any reversal/re-attempts against it), `amount`, `cash_effect` (signed: `+` receipt, `-` debit note)
- `reversal_reference` (the paired reference as given in the source ledger, kept even if the link below can't be resolved), `reversed_transaction_id` (nullable fk → `payment_transactions`, resolved where the paired row was also imported)
- `source` (default `'legacy_import'`, to distinguish from any future live-recon-written rows), `created_at`
- Unique on `(reference, invoice_reference)` — not `reference` alone, since the same debit-order reference can legitimately apply to two different invoices (confirmed in the real export)
- This is the "individual bank-transaction attempt" layer `rental_payment_periods` was missing — a `receipt` with no later `debit_note` means that period's payment cleared; a `receipt` followed by a `debit_note`, then a fresh `receipt` against the same `invoice_reference`, means the debit order bounced and was re-presented
- Backfilled from the legacy system's full payment-history export via `scripts/backfill-payment-transactions.mjs`, matched to contracts via `deal_number` (same join key as the deal-number/banking backfills) — only accounts whose contract already has a `deal_number` can match; see the script's own header for the full matching/dedup policy
- RLS: `admin`/`manager` only, same as `contracts` and `client_banking_details`
- Surfaced as a "Payment history" tab on the Contract panel (per-contract ledger, each row's status derived as Cleared/Reversed/Reversal from `type` + `reversed_transaction_id`), and as a fleet-wide `/payments` dashboard (stat cards, a monthly net-collected chart, and a sortable/searchable per-contract rollup table — each contract's net collected, reversal count, and last-attempt status derived from its most recent transaction)

### `status_migration_map` (import-time only, not part of the running app schema)
- `raw_status`, `normalized_status`, `assigned_to`, `contract_type`
- One-off table used to map the ~11 distinct free-text status values found in the source data to clean enum values before import. Used once during the real data import (see §7), no longer actively referenced.

### `audit_log`
- `id`, `table_name`, `record_id`, `action`, `changed_by` fk → profiles, `diff` jsonb, `created_at`
- Covers all writes to financially sensitive tables, plus explicit "viewed banking details" reveal events.

### `vehicle_assignments`
- `id`, `vehicle_id`, `technician_id` fk → profiles, `assigned_at`, `unassigned_at` (null = currently assigned)
- Drives technician-scoped RLS (a technician only sees vehicles currently assigned to them) and the `vehicle-invoices` Storage policies.

## 5. Authentication & Access Control

- **Login identifier**: cell phone number (E.164, normalized from local input), not email — several technicians may not have an email address.
- **Pattern**: phone + password. One-time SMS OTP during account setup (admin creates the account; the new user verifies their number and sets a password) and for password resets. Day-to-day logins are number + password, no SMS required.
- **Current real-world caveat**: the client's Twilio SMS sending isn't fully live yet (regulatory/account setup still in progress on their side), so the normal "Add staff" → OTP → `/setup-account` flow doesn't reliably reach new users right now. Until that's resolved, new accounts are created directly via the Supabase Admin API with a password set immediately (bypassing the OTP step) — see the Staff page for the normal flow, which will work end-to-end once Twilio is live.
- **Future**: OTP channel is built as a config-level setting (`OTP_CHANNEL=sms`), so switching the setup/reset OTP from SMS to WhatsApp (via Twilio's WhatsApp channel) once the client's WhatsApp Business environment is ready requires no code changes.
- **No public sign-up.** Accounts are created only by an admin, via a server-side action using the Supabase Admin API.
- **Roles**: `admin` (full access), `manager` (day-to-day operations), `technician` (assigned vehicles + cost/service logging only). The client confirmed this 3-role model is sufficient (no per-action granular permissions matrix needed). Role *editing* after account creation isn't built yet — see §11.
- **Enforcement layers**:
  - Postgres RLS on every table (e.g. technicians scoped to vehicles via `vehicle_assignments`; banking details denied entirely to technicians)
  - Next.js Proxy (`src/lib/supabase/proxy.ts`) for route-level gating and session refresh
  - Server Actions re-check authorization server-side (never trust client-side role checks alone)
- **Perf note**: Proxy verifies the JWT once per request (`getClaims()`, which round-trips to Supabase Auth when the project uses the default HS256 signing key) and forwards the verified user id to Server Components via a request header (`VERIFIED_USER_ID_HEADER` in `verified-user-header.ts`) instead of re-verifying it again in `getCurrentProfile()` — that duplicate round-trip was the single biggest contributor to slow page-to-page navigation. The header is set only in Proxy, after verification, and any client-supplied value is stripped first, so it can't be spoofed; a request path Proxy somehow doesn't cover still falls back to verifying the JWT directly. `getCurrentProfile()` is also wrapped in React's `cache()` so the layout and the page don't each re-query `profiles`.

## 6. Security

- **In transit**: TLS enforced end-to-end (Supabase connections and Vercel hosting both default to HTTPS/TLS); no path where data leaves over plain HTTP.
- **At rest, infrastructure level**: Supabase's underlying Postgres storage is disk-encrypted by default (covers physical media / backup theft).
- **At rest, application level**: client banking details (`client_banking_details.account_number_encrypted`, `account_holder_name_encrypted`) are additionally encrypted with AES-256-GCM in server-only TypeScript code (`src/lib/crypto.ts`) before ever reaching Postgres — the database itself only ever stores ciphertext. The encryption key (`BANKING_ENCRYPTION_KEY`) lives as a server-only secret (never bundled client-side, never logged, not stored in the database). `key_version` is included from day one to support future key rotation without a data migration.
- **Defense in depth**: encryption is paired with RLS (technicians denied at the DB level, not just hidden in the UI), not a substitute for it.
- **Masking & audit**: banking details are masked by default in the UI (last 4 digits only); a full reveal is an explicit user action and is written to `audit_log`. Banking details are never included in exports, generated PDFs, or outbound WhatsApp/SMS messages.
- **Dependency posture**: `xlsx` (SheetJS) has a known high-severity prototype-pollution/ReDoS advisory with no upstream fix; it's scoped to the local, dev-only import script (`scripts/import-current-fleet.mjs`), which only ever reads a file the operator supplies themselves — accepted as a low-risk, contained exception rather than something blocking a release.
- **Future option, not needed for v1**: if automated debit-order collection is ever required (rather than an admin doing manual EFTs), consider a payment processor that tokenizes bank accounts, removing the need to store real account numbers at all.

## 7. Data Migration — completed

Real production data has been imported (this section is now a historical record, not a plan):

- `scripts/import-current-fleet.mjs` imported the real CURRENT FLEET sheet: **208 vehicles and 170 contracts** created, with a confidence-based policy that skips anything ambiguous rather than guessing, writing skipped/flagged rows to a markdown review report (`.import-reports/`) for manual follow-up.
- Status normalization: the ~11 distinct raw `STATUS` values were mapped via `status_migration_map` into the clean `status` enum plus a separate `assigned_to`/`assigned_to_name` field, with the original raw value preserved in `legacy_status_note`.
- `ENDED CONTRACTS`, `CARS FOR SALE`, `WAITING PAYOUT INSURANCE`, and `STR DEALS` were **not** part of this first import pass (no `rental_payment_periods`/`insurance_claims`/`sale_listings` UI exists yet to make use of them — see §4). Migrating them is straightforward with the same script pattern once those modules are prioritized.
- `Sheet2` (REG + CURRENT CLIENT only) was treated as a stale duplicate and not used as a migration source.

## 8. Deployment

- **Hosting**: Vercel, auto-deploying from the `main` branch on every push.
- **Branching**: feature work happens on `claude/hopeful-volta-ew7rh5`; merges/fast-forwards to `main` trigger production deploys. (The repo had no `main` branch until the first production deploy — it was created from this branch's state at that point.)
- **Environment variables** (set in both `.env.local` for local dev and Vercel's project settings): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (both "Config" type in Vercel — they're meant to reach the browser), `SUPABASE_SERVICE_ROLE_KEY`, `BANKING_ENCRYPTION_KEY` (both "Secret" type — never exposed client-side), `OTP_CHANNEL`.
- **Database**: a single live Supabase project (no separate staging environment yet) — see §11 if that becomes a problem.

## 9. What's Built

- **Dashboard** (`/`) — compact, clickable stat-card row (Fleet / Active / Idle / Workshop / Servicing / Contracts), each linking to a pre-filtered Vehicles/Contracts view; below it, a dummy interactive fleet-map placeholder (no real location tracking yet, 2/3 width, height matched to the chart column via flex) alongside two charts (1/3 width, via `recharts`): a horizontal bar chart of total purchase price vs. total collected across active contracts (`admin`/`manager` only, matching the contracts RLS policy), and a pie chart of vehicle count by status (visible to everyone, scoped by the same per-technician RLS as the stat cards). Below that, a full-width grouped bar chart (`admin`/`manager` only) of upcoming deadlines over the next 8 weeks — vehicles due for service, active contracts ending, and license discs expiring — bucketed by week.
- **Vehicles** (`/vehicles`) — full CRUD via a right-side detail panel; license-plate history; per-vehicle cost/service log (tabbed by cost type, with invoice PDF upload/download); service-due and contract-ending countdown columns; quick filters ("Due for service", "Contract ending"); **configurable columns** — drag-to-reorder, show/hide via a Columns menu, reset to default, all persisted per-browser; row-click or pencil-icon to edit; **Export to Excel** (see below).
- **Clients** (`/clients`) — full CRUD; encrypted banking details with masked display and an explicit reveal action; Excel export.
- **Contracts** (`/contracts`) — full CRUD; a Vehicle history tab (vehicle↔contract assignment history) and a Payment history tab (`payment_transactions`, showing receipts/reversals with a Cleared/Reversed/Reversal status badge) on the detail panel when editing; Excel export.
- **Staff / admin** (`/admin/users`, `admin`-only) — create staff accounts (phone + role), activate/deactivate. Role editing after creation is not yet built (see §11).
- **Payments** (`/payments`, `admin`/`manager`-only) — fleet-wide payment-history dashboard: stat cards, a monthly net-collected chart, and a sortable/searchable per-contract rollup table. Reads `payment_transactions`.
- **Excel export** — every list view (Vehicles, Clients, Contracts) has an "Export" button producing a styled `.xlsx` of exactly what's currently on screen (respecting active search/filters/sort, and for Vehicles, the current column order/visibility): a title + "Filter applied" / "Exported" timestamp / "Exported by" meta block, a brand-themed frozen header row with autofilter, zebra-striped rows, color-coded status chips matching the on-screen badges, and Rand-formatted currency columns.
- **Table row density** — table body cells use tighter vertical padding (`src/components/ui/table.tsx`) so more rows fit on screen at once, per client request.
- **App shell** — collapsible branded sidebar (role-filtered nav) with the user menu pinned to its bottom on desktop (a light top bar with the user menu is the mobile-only fallback, since the sidebar itself is desktop-only — see §11); independent table scrolling (sidebar/header/toolbar stay fixed while only table rows scroll); responsive down to the layout level (full mobile nav is still open — see §11). The Vehicles and Contracts pages put their heading on the left and their primary action button + quick-filter pills on the right, on one line, instead of stacking them.
- **Auth** — phone + password login, admin-created accounts only, first-time setup via SMS OTP (see the Twilio caveat in §5).
- **Navigation performance** — every route has a `loading.tsx` (a centered spinner, `src/components/ui/spinner.tsx` — an earlier skeleton-block version read as "the page went blank" rather than "this is loading") so a nav click shows feedback instantly via Suspense streaming instead of a blank screen; the duplicate per-request auth round-trip is eliminated (see §5's perf note); `FleetStatsCards`' two independent queries run in parallel instead of waterfalling; Vehicles and Clients each collapsed their multi-wave sequential data fetches (vehicles→registrations/contracts→clients; clients→banking) into one parallel wave (see §11 item 13 for the further, lower-priority step of folding these into true single-request PostgREST embedded selects).
- **Quick-filter stat pills** — the Fleet/Active/Idle/Workshop/Servicing/Contracts pills are real filters (`vehicles.status`, or a computed due-soon/ending-soon date window), not just a summary. On the Dashboard they're links (`FleetStatsCards`, `src/components/dashboard/fleet-stats-cards.tsx`) — real navigation is unavoidable there since nothing is loaded yet. On the Vehicles and Contracts pages, the pills whose data is already loaded on that page act as instant local-state toggles instead (`StatButtonPill`, `src/components/dashboard/stat-pill.tsx`) — clicking "Active" behaves exactly like the status dropdown next to it (no round-trip), where it previously re-ran the whole page's server-side data fetch just to change a filter already available client-side. The one pill on each page whose data lives elsewhere (Contracts' "ending soon" count shown on Vehicles; the vehicle-status pills shown on Contracts) stays a real link, since that's a genuine cross-page navigation. The active/selected pill renders filled in instead of looking identical to the rest.

## 10. Import Script

- `scripts/import-current-fleet.mjs` — reads `data/SAR2O_FLEET.xlsx` (gitignored), applies the confidence-based status-parsing policy described in §7, writes vehicles/vehicle_registrations/clients/contracts, supports `--dry-run`, writes a markdown review report to `.import-reports/`.

## 11. Open Items

Roughly in priority order, per the client's stated priorities:

1. **Twilio SMS** — client's regulatory/account setup still in progress; blocks the normal staff-onboarding OTP flow (see §5 workaround). This is also the sole blocker on the **forgot-password workflow**: the reset flow itself already exists (`/setup-account` doubles as first-time setup and password reset), it just needs working OTP delivery to reach users end-to-end — no separate fix needed once Twilio is live.
2. **Archive view** — client wants vehicles whose contracts have ended moved out of the main Vehicles view into a separate Archive view. Design question pending the client's answer: trigger it off vehicle `status` (sold/written-off) vs. "no active contract" vs. an explicit manual archive action — each has different schema/UX implications.
3. **Role editing** — admin should be able to change a staff member's role after creation from inside the app, not just at creation (currently requires a direct Supabase dashboard edit). Scoped to the existing 3-role model per the client's confirmation — no granular per-action permissions needed.
4. **Lock fields pending an edit trigger** — client wants certain fields locked/read-only by default, only opening for edit on some event. **Trigger event still TBC (client to confirm)** — which fields, and what event unlocks them (a role check, a workflow step, an explicit "unlock" action), before this can be scoped or built.
5. **Login phone number input UX** — the login form already normalizes on submit (`normalizeSaPhone` accepts local `0...`, `27...`, and `+27...` forms, with spaces/dashes stripped), so a missing/extra country code doesn't currently fail login. Not yet built: live input formatting/masking as the user types and inline validation feedback before submit, rather than only a plain `type="tel"` field.
6. **Email notifications & reporting** — not started. Plan: Resend for sending, Vercel Cron for scheduling. Needs the client's input on which notifications matter (weekly digest, new-staff welcome, arrears alerts, etc.) before building.
7. **WhatsApp Business API** — client's WhatsApp Business environment not yet configured. Two distinct pieces, both blocked on it: (a) switching the existing OTP channel (login/reset codes) from SMS to WhatsApp — config-only, no code changes needed, see §5; (b) a **client-facing WhatsApp bot** — automated outbound messages to clients (e.g. payment reminders, arrears alerts) — a new feature, not yet designed. Needs the client's input on which messages/triggers matter, similar to item 6.
8. **Staff-facing WhatsApp bot** — distinct from item 7, which is client-facing. Lets staff (technicians/managers) interact with the fleet system from WhatsApp instead of the web app. Two capabilities, split by how settled each is:
   - **Query fleet data** — "what's the status of ABC123GP", fleet-wide counts, etc. Current near-term focus.
   - **Log a completed service** — a write path (updates mileage/next-service-date, logs a service record), including typo-tolerant vehicle lookup (reg/file no are easy to mistype) and a confirm-before-write step so a bad fuzzy match can't silently corrupt a vehicle's record. Deliberately logged here only at a high level — this one needs a proper spec pass (exact fields captured, confirmation UX, who's authorized to log for which vehicles) before any build starts, not folded into the query work.
   Groundwork either capability needs: an `ANTHROPIC_API_KEY` (not yet in `.env.local`/Vercel), a Twilio WhatsApp Business sender (same client-side blocker as item 7 — not yet configured), identity mapping from the inbound WhatsApp number to a `profiles` row (the existing `profiles.phone` covers this), and a webhook endpoint + Claude tool-use layer calling the same kind of server-side functions the app's Server Actions already use (no new public API needed).
9. **Full mobile support** — the layout is responsive at a basic level, but there's no way to navigate between pages on a phone (the sidebar is desktop-only with no mobile replacement), and the dense data tables, side panels, and forms haven't been audited or adapted for small screens.
10. **`insurance_claims` / `sale_listings` / `rental_payment_periods`** — schema and historical source data exist; no UI module built yet.
11. **PDF generation** — not yet started, no library chosen.
12. **Staging environment** — currently one production Supabase project; consider a separate project for testing schema changes before they hit real data, if that becomes painful.
13. **Further query collapsing via PostgREST embedded selects** — `vehicles/page.tsx` and `clients/page.tsx` now fetch all their tables in one `Promise.all` wave (registrations/contracts/clients are small tables fetched in full rather than filtered by the vehicles query's results first — same pattern `contracts/page.tsx` already used), down from 3 and 2 sequential waves respectively. A further step — PostgREST embedded-resource selects (e.g. `vehicles.select("*, vehicle_registrations(...), contracts(*, clients(...)))")`) — could fold these into literally one HTTP request instead of several run in parallel, but `database.types.ts`'s `Relationships` arrays are currently all empty (hand-maintained, never filled in), so Supabase's type inference can't check an embedded select's shape today. Lower priority now that the sequential-wave cost is gone.
14. **Bank debit-order batch file generation** — not yet started; the underlying fields exist (`contracts.deal_number`/`statement_tag`/`billing_day`/`billing_direction`/`billing_frequency`/`billing_status`, `client_banking_details.bank_name`/`branch_code`/account number), but the actual file generator is blocked on the client's real batch-file spec (a sample was used only to identify which fields were needed). The company's own collection account/statement-label fields in that sample (account number, "silver trio trading t/a sarent2own", "SARENT2OWN") are constants, not per-record data — hold them as config when this is built, not as a DB table.
15. **Debit order / payment reconciliation — flagged urgent by the client.** Schema built and backfilled: `payment_transactions` (see §4) provides the individual bank-transaction-attempt layer that was missing, populated from the legacy system's real payment history (3,610 transactions across 144 contracts — the other 199 legacy accounts don't yet have a matching `deal_number`, same gap as item 20) and surfaced both per-contract (Payment history tab) and fleet-wide (`/payments` — see item 18, now built). Remaining: decide how *live*, ongoing reconciliation gets fed once this isn't just a one-off historical import (e.g. a recurring bank-statement/batch-result upload, or manual entry).
16. **Vehicles table perf — column-visibility toggle and colour dropdown lag** — each column added to the Vehicles table (and the inline colour-swatch dropdown) introduces a noticeable delay toggling it. Not yet investigated.
17. **Contract panel → wide tabbed modal** — client wants the Contract detail panel changed from the current right-side sheet to a wider modal, with tabbed sub-views. Needs a spec/wireframe pass before building.
18. **Payments dashboard** — built: `/payments` (`admin`/`manager` only, own sidebar nav item). Stat cards (net collected all-time, net collected in the most recent month on file, contracts currently in arrears, contracts tracked), a monthly net-collected bar chart (last 12 months present in the data), and a sortable/searchable per-contract table (deal number, client, last transaction date, Cleared/Reversed status, net collected, reversal count). All computed server-side from `payment_transactions` + `contracts` + `clients` (plain parallel queries, JS-side joins — same convention as the rest of the app). No export yet; add if asked. Future: once item 15's live-reconciliation question is settled, this is the natural place to surface ongoing (not just historical) collection status.
19. **Restrict the vehicle picker on contracts to `Idle` status** — when assigning/changing a contract's vehicle, the dropdown currently lists every vehicle regardless of status; it should only offer vehicles with status `available`/"Idle". When editing an existing contract, the vehicle it's already on should presumably still show even if that vehicle's status isn't Idle.
20. **Split merged client records** — the original fleet import merged at least 7 distinct real people/companies into single `client_id`s each (surfaced by the banking backfill's conflict detection — see `client_banking_details` above — and confirmed against `accounts.txt`: e.g. FEDERICK NGWENYA and ELMON NGWENYA, two different people with different file numbers and vehicles, share one `client_id`). That detection method only catches a merge when both merged people's deals happen to be in a bank-batch sample and already have `deal_number` set, so there are likely more undetected merges in the full ~516-deal dataset. Needs an audit against `accounts.txt`/the source workbook, then a decision on how to split each one (which contact details belong to which real person — may need the client's own input).
21. **Client banking-details edit UX** — editing banking details today is all-or-nothing: the form renders all 5 fields blank, and saving is skipped entirely unless account holder name *and* account number are both retyped (see `upsertBankingDetailsIfProvided` in `clients/actions.ts`), so changing just the branch code means first clicking Reveal, then retyping every field. Wanted instead: fields populated but masked by default; Reveal unmasks all of them (not just a one-line readout); a dedicated "Edit banking details" button unlocks them for a scoped save, rather than bundling banking into the main client form's save. Needs a UX pass (how masked-but-editable fields behave on focus, whether unmasking re-triggers Reveal's audit-log path, whether the save becomes its own server action) before building.
