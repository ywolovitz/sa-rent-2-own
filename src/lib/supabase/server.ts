import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import type { Database } from "@/lib/database.types";

/**
 * Creates a request-scoped Supabase client for Server Components, Server
 * Actions, and Route Handlers. Must be created fresh per request — never
 * cached or reused across requests.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies can't be
          // set. Harmless as long as proxy.ts is refreshing the session on
          // every request (see src/proxy.ts).
        }
      },
    },
  });
}
