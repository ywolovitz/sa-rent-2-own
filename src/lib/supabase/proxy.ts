import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAnonKey, getSupabaseUrl } from "./env";
import { VERIFIED_USER_ID_HEADER } from "./verified-user-header";

const PUBLIC_PATHS = ["/login", "/setup-account"];

/**
 * Refreshes the Supabase session on every request and gates access to
 * everything except the public auth routes. Route Handlers and Server
 * Actions still re-check authorization themselves (see the Next.js data
 * security guidance on Proxy coverage) — this is the first line of
 * defense, not the only one.
 */
export async function updateSession(request: NextRequest) {
  let pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];
  let pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        pendingCookies = cookiesToSet;
        pendingHeaders = headers;
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub ?? null;
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  let response: NextResponse;

  if (!userId && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    response = NextResponse.redirect(loginUrl);
  } else if (userId && pathname === "/login") {
    response = NextResponse.redirect(new URL("/", request.url));
  } else {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete(VERIFIED_USER_ID_HEADER);
    if (userId) requestHeaders.set(VERIFIED_USER_ID_HEADER, userId);
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  // Applied on every branch (including redirects) so a session refresh
  // that happened during getClaims() above is never silently dropped.
  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}
