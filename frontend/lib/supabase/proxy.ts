import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { PATHNAME_HEADER } from "@/lib/headers";
import { getSupabaseConfig } from "./config";

/**
 * Validates and refreshes the Supabase session on every request, and passes the
 * current pathname to Server Components through a request header.
 *
 * Access rules are not enforced here. Proxy runs on prefetches too, so it only
 * touches the session cookie; `modules/auth` guards pages and Server Actions.
 */

/**
 * Snapshot of the request headers, plus the pathname.
 *
 * Taken fresh each time, because `request.cookies.set()` rewrites the live
 * `cookie` header: a snapshot taken before a token refresh still carries the
 * expired token, and the render downstream would reject the very session this
 * response is refreshing.
 */
function requestHeadersFor(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.set(
    PATHNAME_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return headers;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: requestHeadersFor(request) },
  });

  const config = getSupabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // Rebuild the response so it carries the refreshed cookies, keeping
        // anything an earlier call already wrote.
        const previousCookies = response.cookies.getAll();
        const previousHeaders = response.headers;
        response = NextResponse.next({
          request: { headers: requestHeadersFor(request) },
        });
        previousHeaders.forEach((value, name) => response.headers.set(name, value));
        previousCookies.forEach((cookie) => response.cookies.set(cookie));

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Extra no-cache headers the library supplies with a cookie write.
        Object.entries(headers ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();

  // Unconditional, not only when cookies are written: a response can render
  // signed-in content without refreshing anything, and a shared cache must
  // never hand that to the next visitor. The library's own headers arrive only
  // on the first cookie write, so they cannot carry this on their own.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}
