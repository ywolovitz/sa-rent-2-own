import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";
import type { Database } from "@/lib/database.types";

/**
 * Service-role client for admin-only operations (creating staff accounts,
 * etc.) via the Supabase Admin API. Bypasses RLS entirely — never import
 * this outside of code that has already verified the caller is an admin,
 * and never expose it to the browser.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
