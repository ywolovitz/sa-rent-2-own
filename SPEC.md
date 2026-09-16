# SA Rent 2 Own — Fleet Management System

Specification document, captured from initial planning discussion. This reflects the state of the design **before any migrations or code have been written** — treat it as the source of truth to build against, and update it as decisions change.

## 1. Overview

Internal web application to replace a OneDrive Excel workbook currently used to manage a rent-to-own vehicle fleet (registrations, clients, contracts, service history, and short-term rentals). Used by the business owner, managers, and technicians. Not public-facing. No integration with the separate legacy PHP business system — this is an independent, clean rebuild.

Core domains: vehicles, clients, rent-to-own and short-term-rental contracts, vehicle costs/service history, staff/technicians, and (in a later phase) WhatsApp-based automation and reporting.

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router), React Server Components + Server Actions |
| Backend / DB | Supabase — Postgres, Supabase Auth, Row Level Security |
| Styling / UI | Tailwind CSS + shadcn/ui |
| File storage | Supabase Storage (private buckets, signed URLs) — invoices, contract files, documents |
| Transactional email | Resend — auth-related notifications, reports |
| PDF generation | Server-side PDF library (TBD — e.g. `@react-pdf/renderer`), rendered in a Route Handler / Edge Function |
| Messaging / automation | Supabase Edge Functions calling WhatsApp Business API / Twilio (kept as a separate integration boundary) |
| Access control | Supabase Auth (invite-only) + Postgres RLS + Next.js middleware for route gating |
| Language / tooling | TypeScript throughout, Supabase CLI for local dev + migrations |

Open (not yet pinned): specific PDF library, specific WhatsApp/Twilio provider setup (client's WhatsApp Business environment is not yet configured).

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

Known data-quality issues driving the schema design below:
- `STATUS` on the main sheet is free text and includes non-status values — rental type (`STR`) and people's names (`REPAIR DANIEL`, `BOOYSEN TIM`) mixed in, because there was nowhere else to put that information.
- Registration sometimes contains two plates in one field (e.g. `"JG52RVGP (JGN814MP)"`), almost certainly an un-modeled plate change.
- Client is denormalized onto the vehicle (`CURRENT CLIENT`, `PAST CLIENTS` as a comma-separated string) rather than being its own entity with history.
- No real payment ledger exists — a single `INSTALLMENT` amount and a manually-set `PAID` yes/no flag.
- An unlabeled column in CURRENT FLEET (between `INSTALLMENT` and `PAST CLIENTS`) holds numeric values and text like `"NO DATA"` / `"FINE"` — most likely an arrears figure that never got a header.
- STR deal "car" references are inconsistent free text (partial reg, model name, or manufacturer only) rather than a real reference to a fleet vehicle.

## 4. Data Model

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
- Every decrypt/reveal action is written to `audit_log`. Never included in exports, generated PDFs, or WhatsApp/SMS messages.

### `vehicles`
- `id`, `file_no` (unique, legacy reference e.g. `A025`)
- `make`, `model`, `year`, `colour`
- `vin`, `engine_number`
- `status` enum(`available`, `on_road`, `parked`, `in_repair`, `for_sale`, `sold`, `written_off`)
- `legacy_status_note` (text — raw original sheet value, preserved verbatim)
- `assigned_to` (nullable fk → profiles, or free text where it doesn't match a real staff account)
- `current_mileage`, `next_service_km`, `next_service_date`, `last_serviced_by`
- `tracker_supplier`, `tracker_running` enum(`yes`, `no`, `no_info`)
- `natis_on_file` boolean, `license_disc_expiry` date, `has_spare_key` boolean
- `warranty_active` boolean, `warranty_notes` text
- `has_contract_file` boolean
- `insurance_claim_status` enum(`none`, `pending`, `paid`, `denied`)
- timestamps

### `vehicle_registrations` (license plate history)
- `id`, `vehicle_id` fk → vehicles
- `plate_number`, `effective_from` date, `effective_to` date (null = current), `reason`, `created_at`
- Constraint: at most one row per vehicle with `effective_to IS NULL`
- Current-screen usage always joins to the open (`effective_to IS NULL`) row; historical plates remain queryable

### `vehicle_costs`
- `id`, `vehicle_id` fk → vehicles
- `cost_type` enum(`service`, `repair`, `car_wash`, `maintenance`, `other`)
- `cost_date`, `supplier`, `amount`, `mileage_at_time` (nullable)
- `invoice_file_path` (Supabase Storage object, private bucket)
- `notes`, `recorded_by` fk → profiles, `created_at`
- Doubles as the vehicle's service history log — no separate table needed.

### `contracts`
- `id`, `vehicle_id` fk → vehicles, `client_id` fk → clients
- `contract_type` enum(`rent_to_own`, `short_term_rental`, `other`)
- `start_date`, `end_date`, `status` enum(`active`, `completed`, `cancelled`, `defaulted`, `repossessed`)
- `payment_method` enum(`eft`, `cash`, `other`)
- `installment_amount`, `purchase_price`, `potential_sale_price`, `sale_price`, `residual_value`
- `total_collected`, `outstanding_balance`, `arrears_amount` (simple manually-maintained numeric fields — not a full payment ledger, by design choice for v1)
- `is_paid_up` boolean, `notes`
- timestamps
- A vehicle's "current client" = the client on its `active` contract; "past clients" = clients on its `completed`/`cancelled` contracts. No denormalized client fields on `vehicles`.

### `str_deal_details` (1:1 extension of `contracts` where `contract_type = short_term_rental`)
- `contract_id` fk → contracts
- `billing_day` int (day of month payment is due)
- `billing_direction` enum(`advance`, `arrears`) — "pays ahead" vs "pays back"
- `billing_frequency` enum(`weekly`, `monthly`)

### `rental_payment_periods` (generalized; populated first for STR deals)
- `id`, `contract_id` fk → contracts
- `period_label` (e.g. `"2025-05"`), `due_date`
- `status` enum(`paid`, `owed`, `ended`, `upcoming`)
- `amount_due`, `amount_owed`, `paid_date`, `notes`

### `insurance_claims`
- `id`, `vehicle_id` fk → vehicles
- `claimant_name`, `amount`, `filed_date`, `paid_date`, `notes`

### `sale_listings`
- `id`, `vehicle_id` fk → vehicles
- `spec`, `condition`, `mileage_at_listing`, `location`
- `dealer_price` (the sheet's "auto price"), `listed_price` ("our price")
- `listed_at`

### `status_migration_map` (import-time only, not part of the running app schema)
- `raw_status`, `normalized_status`, `assigned_to`, `contract_type`
- One-off table used to map the ~11 distinct free-text status values found in the source data to clean enum values before import. Filled in collaboratively with the client, then discarded after migration.

### `audit_log`
- `id`, `table_name`, `record_id`, `action`, `changed_by` fk → profiles, `diff` jsonb, `created_at`
- Covers all writes to financially sensitive tables, plus explicit "viewed banking details" reveal events.

## 5. Authentication & Access Control

- **Login identifier**: cell phone number (E.164, normalized from local input), not email — several technicians may not have an email address.
- **Pattern**: phone + password. One-time SMS OTP during account setup (admin creates the account; the new user verifies their number and sets a password) and for password resets. Day-to-day logins are number + password, no SMS required.
- **Future**: OTP channel is built as a config-level setting (`OTP_CHANNEL=sms`), so switching the setup/reset OTP from SMS to WhatsApp (via Twilio's WhatsApp channel) once the client's WhatsApp Business environment is ready requires no code changes.
- **No public sign-up.** Accounts are created only by an admin, via a server-side action using the Supabase Admin API.
- **Roles**: `admin` (full access), `manager` (day-to-day operations), `technician` (assigned vehicles + cost/service logging only). No additional roles or branch scoping requested at this time.
- **Enforcement layers**:
  - Postgres RLS on every table (e.g. technicians scoped to vehicles via a `vehicle_assignments` table; banking details denied entirely to technicians)
  - Next.js middleware for route-level gating
  - Server Actions re-check authorization server-side (never trust client-side role checks alone)

## 6. Security

- **In transit**: TLS enforced end-to-end (Supabase connections and hosting platform both default to HTTPS/TLS); HSTS enabled; no path where data leaves over plain HTTP.
- **At rest, infrastructure level**: Supabase's underlying Postgres storage is disk-encrypted by default (covers physical media / backup theft).
- **At rest, application level**: client banking details (`client_banking_details.account_number_encrypted`, `account_holder_name_encrypted`) are additionally encrypted with AES-256-GCM in server-only TypeScript code before ever reaching Postgres — the database itself only ever stores ciphertext. The encryption key lives as a server-only secret (never bundled client-side, never logged, not stored in the database). `key_version` is included from day one to support future key rotation without a data migration.
- **Defense in depth**: encryption is paired with RLS (technicians denied at the DB level, not just hidden in the UI), not a substitute for it.
- **Masking & audit**: banking details are masked by default in the UI (last 4 digits only); a full reveal is an explicit user action and is written to `audit_log`. Banking details are never included in exports, generated PDFs, or outbound WhatsApp/SMS messages.
- **Future option, not needed for v1**: if automated debit-order collection is ever required (rather than an admin doing manual EFTs), consider a payment processor that tokenizes bank accounts, removing the need to store real account numbers at all.

## 7. Data Migration

- Historical fleet, client, and contract data will be migrated from the workbook (`CURRENT FLEET`, `ENDED CONTRACTS`, `CARS FOR SALE`, `WAITING PAYOUT INSURANCE`).
- STR deal history will also be migrated, reshaped from the pivot layout in `STR DEALS` into `contracts` + `str_deal_details` + `rental_payment_periods` rows.
- Status normalization: the ~11 distinct raw `STATUS` values are mapped via `status_migration_map` into a clean `status` enum plus a separate `assigned_to` field, with the original raw value preserved in `legacy_status_note`.
- STR vehicle references (partial reg/model/manufacturer text) are resolved to real `vehicle_id` foreign keys via a best-effort matcher; anything below a confidence threshold is flagged in a manual review list rather than guessed silently.
- `Sheet2` (REG + CURRENT CLIENT only) is treated as a stale duplicate and not used as a migration source unless the client says otherwise.

## 8. Open Items

- Real staff list (name, cell number, role) needed to seed actual user accounts.
- PDF generation library not yet chosen.
- WhatsApp Business API / Twilio environment not yet set up on the client's side (planned for a later phase).
- Confirm meaning of two data-quality items found during analysis, to resolve during migration rather than guess:
  - Registration values containing two plates in one field (assumed to be a plate change — now modeled via `vehicle_registrations`).
  - The unlabeled arrears-like column in `CURRENT FLEET` (assumed to map to `contracts.arrears_amount` / `outstanding_balance`).
