/** The one place this header may be set is proxy.ts, after it verifies the
 * session — never trust a client-supplied value. getCurrentProfile() reads
 * it instead of re-verifying the JWT (an extra Supabase Auth round-trip)
 * on every Server Component render. */
export const VERIFIED_USER_ID_HEADER = "x-sar2o-verified-user-id";
