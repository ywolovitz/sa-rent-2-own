import "server-only";

import { createClient } from "@/lib/supabase/server";
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
 */
export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
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
}
