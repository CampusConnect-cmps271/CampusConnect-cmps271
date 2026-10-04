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
export async function updateSession(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    PATHNAME_HEADER,
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const config = getSupabaseConfig();
  if (!config) return response;

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        // Rebuild the response so it carries the updated request cookies,
        // keeping anything already written by an earlier call.
        const previousCookies = response.cookies.getAll();
        const previousHeaders = response.headers;
        response = NextResponse.next({ request: { headers: requestHeaders } });
        previousHeaders.forEach((value, name) => response.headers.set(name, value));
        previousCookies.forEach((cookie) => response.cookies.set(cookie));

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });

        // Responses that set auth cookies must not be cached by a CDN or proxy,
        // otherwise one user's tokens could be served to another.
        Object.entries(headers ?? {}).forEach(([name, value]) => {
          response.headers.set(name, value);
        });
      },
    },
  });

  await supabase.auth.getClaims();

  return response;
}
