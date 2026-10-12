#!/usr/bin/env node
/**
 * Directly sets a new password for an existing Supabase Auth user, for
 * password recovery when the SMS/WhatsApp OTP channel isn't available
 * (see SPEC.md §11 item 1).
 *
 * Usage:
 *   node --env-file=.env.local scripts/set-user-password.mjs <user-id> <new-password>
 */

import { createClient } from "@supabase/supabase-js";

const [, , userId, newPassword] = process.argv;

if (!userId || !newPassword) {
  console.error(
    "Usage: node --env-file=.env.local scripts/set-user-password.mjs <user-id> <new-password>"
  );
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_RE.test(userId)) {
  console.error(
    `"${userId}" (received as ${JSON.stringify(userId)}) doesn't look like a valid UUID — check for a stray character or whitespace from copy/paste.`
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

// Direct-by-id lookup first (same GoTrue endpoint updateUserById PUTs to,
// just a GET) — isolates whether the id itself resolves before we try to
// write anything.
const { data: lookup, error: lookupError } = await admin.auth.admin.getUserById(userId);
if (lookupError) {
  console.error("getUserById also failed (lookup, before any write):", {
    message: lookupError.message,
    status: lookupError.status,
    code: lookupError.code,
  });
  process.exit(1);
}
console.log("getUserById found:", { id: lookup.user.id, phone: lookup.user.phone });

const { data, error } = await admin.auth.admin.updateUserById(userId, {
  password: newPassword,
});

if (error) {
  console.error("Failed to update password:", {
    message: error.message,
    status: error.status,
    code: error.code,
  });
  process.exit(1);
}

console.log(`Password updated for ${data.user.phone} (${data.user.id}).`);
console.log("You can now log in at /login with that phone number and the new password.");
