#!/usr/bin/env node
/**
 * Creates a Supabase Auth user with a SPECIFIC uuid, so it slots into an
 * existing `profiles` row instead of creating a new one. For recovering
 * accounts whose `profiles` row was seeded directly (e.g. via the fleet
 * import) without ever going through Supabase Auth, so there's no real
 * auth.users row to sign in with.
 *
 * `profiles.id` is a foreign key to `auth.users.id`, so the profile can't
 * be deleted and recreated once anything else (vehicle_costs, audit_log,
 * etc.) references it — this links the existing row instead of orphaning
 * that history.
 *
 * Usage:
 *   node --env-file=.env.local scripts/link-auth-user.mjs <profile-id> <phone> <password>
 *
 * <phone> must be in +27... format (E.164). Find <profile-id> and <phone>
 * from the `profiles` row in Supabase's Table Editor.
 */

import { createClient } from "@supabase/supabase-js";

const [, , profileId, phone, password] = process.argv;

if (!profileId || !phone || !password) {
  console.error(
    "Usage: node --env-file=.env.local scripts/link-auth-user.mjs <profile-id> <phone> <password>"
  );
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local."
  );
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  id: profileId,
  phone,
  password,
  phone_confirm: true,
});

if (error) {
  console.error("Failed to create auth user:", error.message);
  process.exit(1);
}

console.log(`Auth user created: ${data.user.id} (${data.user.phone})`);

const { data: profile, error: profileError } = await admin
  .from("profiles")
  .select("id, full_name, phone, role, is_active")
  .eq("id", profileId)
  .single();

if (profileError) {
  console.error(
    "Auth user created, but couldn't confirm the linked profiles row:",
    profileError.message
  );
  process.exit(1);
}

console.log("Linked profile:", profile);
console.log("You can now log in at /login with that phone number and password.");
