#!/usr/bin/env node
/**
 * Looks up which Supabase Auth user (if any) currently holds a given
 * phone number, and compares it against the `profiles` row of the same
 * id, so a phone-uniqueness conflict during account recovery can be
 * diagnosed instead of guessed at.
 *
 * Usage:
 *   node --env-file=.env.local scripts/find-auth-user.mjs <phone> [profile-id]
 *
 * <phone> must be in +27... format (E.164).
 */

import { createClient } from "@supabase/supabase-js";

const [, , phone, profileId] = process.argv;

if (!phone) {
  console.error(
    "Usage: node --env-file=.env.local scripts/find-auth-user.mjs <phone> [profile-id]"
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

let page = 1;
let match;
for (;;) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("Failed to list auth users:", error.message);
    process.exit(1);
  }
  match = data.users.find((u) => u.phone === phone.replace(/^\+/, ""));
  if (match || data.users.length < 1000) break;
  page += 1;
}

if (!match) {
  console.log(`No auth user found with phone ${phone}.`);
} else {
  console.log("Auth user found:");
  console.log({
    id: match.id,
    phone: match.phone,
    phone_confirmed_at: match.phone_confirmed_at,
    created_at: match.created_at,
    last_sign_in_at: match.last_sign_in_at,
    banned_until: match.banned_until ?? null,
  });

  const { data: linkedProfile, error: linkedError } = await admin
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .eq("id", match.id)
    .maybeSingle();
  if (linkedError) {
    console.error("Couldn't look up the profiles row for this auth user:", linkedError.message);
  } else {
    console.log("Linked profiles row (by this auth user's id):", linkedProfile ?? "(none — orphaned auth user)");
  }
}

if (profileId) {
  const { data: targetProfile, error: targetError } = await admin
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .eq("id", profileId)
    .maybeSingle();
  if (targetError) {
    console.error(`Couldn't look up profiles row ${profileId}:`, targetError.message);
  } else {
    console.log(`profiles row ${profileId}:`, targetProfile ?? "(not found)");
  }
}
