import { createServer } from "node:http";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "student@mail.aub.edu",
  email_confirmed_at: "2026-10-05T12:00:00Z",
  aud: "authenticated",
  role: "authenticated",
};
let roleLookups = 0;
let resends = 0;

function sessionFor(email, confirmed) {
  const id = confirmed ? user.id : "00000000-0000-4000-8000-000000000002";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  return { access_token, refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer", user: { ...user, id, email, email_confirmed_at: confirmed ? user.email_confirmed_at : null } };
}

createServer(async (request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:3101").pathname;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("x-supabase-api-version", "2024-01-01");
  if (path === "/health") return response.end("{}");
  if (path === "/test/role-lookups") return response.end(JSON.stringify({ roleLookups }));
  if (path === "/test/resends") return response.end(JSON.stringify({ resends }));
  if (path === "/auth/v1/token" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email, password } = JSON.parse(raw);
    if (password === "test-unverified-password") {
      response.statusCode = 400;
      return response.end(JSON.stringify({ code: "email_not_confirmed", msg: "Email not confirmed" }));
    }
    if (password === "test-verified-password" || password === "test-unexpected-unverified-session") {
      return response.end(JSON.stringify(sessionFor(email, password === "test-verified-password")));
    }
    response.statusCode = password === "test-rate-limit" ? 429 : 400;
    return response.end(JSON.stringify({ code: password === "test-rate-limit" ? "over_request_rate_limit" : "invalid_credentials", msg: "Test-only Auth rejection" }));
  }
  if (path === "/auth/v1/logout") return response.end("{}");
  if (path === "/auth/v1/resend") { resends++; return response.end("{}"); }
  if (path === "/auth/v1/user" && request.headers.authorization?.startsWith("Bearer ")) {
    const token = request.headers.authorization.slice(7);
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    if (claims.sub === "00000000-0000-4000-8000-000000000002") {
      return response.end(JSON.stringify({ ...user, id: claims.sub, email: claims.email, email_confirmed_at: null, user_metadata: { email_verified: true } }));
    }
    return response.end(JSON.stringify({ ...user, email: claims.email ?? user.email }));
  }
  if (path === "/rest/v1/app_logs" && request.method === "POST") {
    response.statusCode = 201;
    return response.end("{}");
  }
  if (path === "/rest/v1/user_roles") {
    roleLookups++;
    response.statusCode = 404;
    return response.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.user_roles' in the schema cache", details: null, hint: null }));
  }
  response.statusCode = 500;
  response.end(JSON.stringify({ message: "Unexpected request to local test fixture" }));
}).listen(3101, "127.0.0.1");
