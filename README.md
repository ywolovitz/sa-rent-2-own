# SAR2O Fleet

Internal fleet management app for the SA Rent 2 Own rent-to-own vehicle fleet — replaces the OneDrive Excel workbook. See [`SPEC.md`](./SPEC.md) for the full data model, tech stack, and security design this was built against.

## Stack

Next.js (App Router) + Supabase (Postgres, Auth, RLS) + Tailwind CSS + shadcn/ui. Login is by cell phone number + password (no email required) via Supabase phone auth.

## Getting started

### 1. Supabase project

Create a project at [supabase.com](https://supabase.com) (or run one locally with the Supabase CLI + Docker), then apply the schema:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This runs every migration in `supabase/migrations/` — all tables, enums, triggers, and Row Level Security policies described in `SPEC.md`.

In the Supabase dashboard, under **Authentication → Providers → Phone**, enable phone auth and configure Twilio (or another supported provider) as the SMS sender.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY` — same page. **Server-only, never commit this or expose it to the browser.**
- `BANKING_ENCRYPTION_KEY` — a 32-byte AES-256 key for encrypting client banking details, generated with `openssl rand -base64 32`. Losing this key makes existing encrypted banking rows unrecoverable, so store it in your secrets manager, not just `.env.local`.

### 3. Install and run

```bash
npm install
npm run dev
```

### 4. Create the first admin account

There's no public sign-up — every account is created by an admin from inside the app (**Staff** page). To bootstrap the very first admin before any account exists, create one directly via the Supabase dashboard (**Authentication → Users → Add user**, with phone number set and `phone_confirm` on), then insert a matching row in `public.profiles` with `role = 'admin'` (or set `role` in that user's metadata before creating them, so the `handle_new_auth_user` trigger picks it up automatically).

From there, the admin can add every other staff member from the **Staff** page — it creates their account and sends them a one-time SMS code to verify their number and set a password (see `/setup-account`).

## Project structure

- `supabase/migrations/` — the full schema, RLS policies, and helper functions, in the order they apply
- `src/app/(app)/` — the authenticated app shell and pages (Dashboard, Vehicles, Clients, Staff)
- `src/app/login`, `src/app/setup-account` — phone/password login and the first-time setup / password-reset flow
- `src/lib/supabase/` — Supabase client helpers (browser, server, admin, Proxy session refresh)
- `src/lib/crypto.ts` — AES-256-GCM encryption used for client banking details
- `src/lib/database.types.ts` — hand-maintained TypeScript types matching the migrations (see the note at the top of that file about regenerating it once a Supabase instance is reachable from this environment)

## What's built vs. what's next

Vehicles is the first complete CRUD module (list, create, edit, delete, license plate history, role-scoped visibility). Clients, contracts, vehicle costs, and STR deals follow the same pattern next — the schema and RLS for all of them already exist in `supabase/migrations/`.
