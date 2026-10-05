/**
 * Headers the root proxy adds to the incoming request so Server Components can
 * read request details Next.js does not otherwise expose to them.
 */

/** Pathname (plus query string) of the request currently being rendered. */
export const PATHNAME_HEADER = "x-pathname";

/** Verified Supabase account ID. Incoming values are always overwritten. */
export const ACCOUNT_ID_HEADER = "x-account-id";
