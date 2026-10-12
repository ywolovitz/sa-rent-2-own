#!/usr/bin/env node
/**
 * Creates a new staff account directly with a password (skipping the
 * normal OTP-based first-time setup, which needs Twilio — see SPEC.md
 * §11 item 1). Mirrors createStaffUser() in
 * src/app/(app)/admin/users/actions.ts, but sets a password up front
 * instead of sending a setup code.
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-staff-user.mjs <phone> <password> <full-name> <role>
 *
 * <phone> must be in +27... format (E.164). <role> is admin, manager,
 * or technician.
 */

import { createClient } from "@supabase/supabase-js";

const [, , phone, password, fullName, role] = process.argv;

if (!phone || !password || !fullName || !role) {
  console.error(
    "Usage: node --env-file=.env.local scripts/create-staff-user.mjs <phone> <password> <full-name> <role>"
  );
  process.exit(1);
}

if (!["admin", "manager", "technician"].includes(role)) {
  console.error(`Invalid role "${role}" — must be admin, manager, or technician.`);
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
  phone,
  password,
  phone_confirm: true,
  user_metadata: { full_name: fullName, role },
});

if (error) {
  console.error("Failed to create user:", {
    message: error.message,
    status: error.status,
    code: error.code,
  });
  process.exit(1);
}

console.log(`Auth user created: ${data.user.id} (${data.user.phone})`);

const { data: profile, error: profileError } = await admin
  .from("profiles")
  .select("id, full_name, phone, role, is_active")
  .eq("id", data.user.id)
  .maybeSingle();

if (profileError) {
  console.error("Auth user created, but couldn't confirm the linked profiles row:", profileError.message);
  process.exit(1);
}

console.log("Linked profile:", profile);
console.log("You can now log in at /login with that phone number and password.");
