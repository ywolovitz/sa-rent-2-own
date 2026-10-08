import "server-only";

import { cache } from "react";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { VERIFIED_USER_ID_HEADER } from "@/lib/supabase/verified-user-header";
import type { UserRole } from "@/lib/database.types";

export interface CurrentProfile {
  id: string;
  fullName: string;
  phone: string;
  role: UserRole;
}

/**
 * Resolves the signed-in user's profile server-side. Used to gate pages
 * and Server Actions in addition to RLS — Proxy coverage alone isn't
 * sufficient (a matcher change or route refactor can silently remove it),
 * so every sensitive Server Action re-checks here too.
 *
 * Wrapped in React's `cache()` so the layout, the page, and any Server
 * Action on the same request share one `profiles` lookup instead of each
 * re-querying it — safe because it carries no arguments to vary by.
 */
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const supabase = await createClient();

  // proxy.ts already verified the session this request; trust its header
  // rather than paying for a second Supabase Auth round-trip. Only a
  // request path proxy.ts somehow didn't cover falls back to verifying
  // the JWT directly here.
  let userId = (await headers()).get(VERIFIED_USER_ID_HEADER);
  if (!userId) {
    const { data: claimsData } = await supabase.auth.getClaims();
    userId = claimsData?.claims?.sub ?? null;
  }
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, is_active")
    .eq("id", userId)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    fullName: profile.full_name,
    phone: profile.phone,
    role: profile.role,
  };
});
