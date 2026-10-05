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
// Test-only state, isolated by email so parallel recovery cases cannot affect
// each other or the existing login/verification fixtures. Never real users.
const recoveryAccounts = new Map();

function authFailure(response, status, code) {
  response.statusCode = status;
  return response.end(JSON.stringify({ code, msg: "Test-only Auth rejection" }));
}

function bearerEmail(request) {
  const token = request.headers.authorization?.slice(7);
  if (!token) return null;
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).email;
  } catch {
    return null;
  }
}

function sessionFor(email, confirmed) {
  const id = confirmed ? user.id : "00000000-0000-4000-8000-000000000002";
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aud: "authenticated", role: "authenticated", email, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  return { access_token, refresh_token: "test-refresh-token", expires_in: 3600, token_type: "bearer", user: { ...user, id, email, email_confirmed_at: confirmed ? user.email_confirmed_at : null } };
}

createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:3101");
  const path = url.pathname;
  response.setHeader("Content-Type", "application/json");
  response.setHeader("x-supabase-api-version", "2024-01-01");
  if (path === "/health") return response.end("{}");
  if (path === "/test/role-lookups") return response.end(JSON.stringify({ roleLookups }));
  if (path === "/test/resends") return response.end(JSON.stringify({ resends }));
  if (path === "/test/recovery") {
    const account = recoveryAccounts.get(url.searchParams.get("email"));
    const { requests = 0, verifications = 0, updates = 0, revocations = 0 } = account ?? {};
    // Only counts are observable; no passwords or session tokens are exposed.
    return response.end(JSON.stringify({ requests, verifications, updates, revocations }));
  }
  if (path === "/auth/v1/recover" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email } = JSON.parse(raw);
    if (email.startsWith("recovery-limit@")) return authFailure(response, 429, "over_email_send_rate_limit");
    if (email.startsWith("recovery-unavailable@")) return authFailure(response, 500, "unexpected_failure");
    if (email.startsWith("recovery-unknown@")) return response.end("{}");
    const account = recoveryAccounts.get(email) ?? { password: "test-verified-password", requests: 0, verifications: 0, updates: 0, revocations: 0 };
    account.requests++;
    account.used = false;
    recoveryAccounts.set(email, account);
    return response.end("{}");
  }
  if (path === "/auth/v1/verify" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email, token, type } = JSON.parse(raw);
    const account = recoveryAccounts.get(email);
    if (account) account.verifications++;
    if (type !== "recovery" || !account || account.used) return authFailure(response, 403, "otp_expired");
    if (token === "33333333") return authFailure(response, 429, "over_request_rate_limit");
    if (token === "44444444") return authFailure(response, 500, "unexpected_failure");
    if (token !== "01234567") return authFailure(response, 403, "otp_expired");
    account.used = true;
    return response.end(JSON.stringify(sessionFor(email, true)));
  }
  if (path === "/auth/v1/user" && request.method === "PUT") {
    const account = recoveryAccounts.get(bearerEmail(request));
    if (!account?.used) return authFailure(response, 401, "session_not_found");
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { password } = JSON.parse(raw);
    if (password === account.password) return authFailure(response, 422, "same_password");
    if (password === "LeakedPass#2026") return authFailure(response, 422, "weak_password");
    account.password = password;
    account.updates++;
    return response.end(JSON.stringify({ ...user, email: bearerEmail(request) }));
  }
  if (path === "/auth/v1/token" && request.method === "POST") {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const { email, password } = JSON.parse(raw);
    const recovered = recoveryAccounts.get(email);
    if (recovered) {
      if (password === recovered.password) return response.end(JSON.stringify(sessionFor(email, true)));
      return authFailure(response, 400, "invalid_credentials");
    }
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
  if (path === "/auth/v1/logout") {
    const account = recoveryAccounts.get(bearerEmail(request));
    if (account && url.searchParams.get("scope") === "global") account.revocations++;
    return response.end("{}");
  }
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
