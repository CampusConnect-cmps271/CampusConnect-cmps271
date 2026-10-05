import { createServer } from "node:http";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "student@mail.aub.edu",
  email_confirmed_at: "2026-10-05T12:00:00Z",
  aud: "authenticated",
  role: "authenticated",
};
let roleLookups = 0;

createServer((request, response) => {
  const path = new URL(request.url, "http://127.0.0.1:3101").pathname;
  response.setHeader("Content-Type", "application/json");
  if (path === "/health") return response.end("{}");
  if (path === "/test/role-lookups") return response.end(JSON.stringify({ roleLookups }));
  if (path === "/auth/v1/user" && request.headers.authorization?.startsWith("Bearer ")) {
    return response.end(JSON.stringify(user));
  }
  if (path === "/rest/v1/user_roles") {
    roleLookups++;
    response.statusCode = 404;
    return response.end(JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.user_roles' in the schema cache", details: null, hint: null }));
  }
  response.statusCode = 500;
  response.end(JSON.stringify({ message: "Unexpected request to local test fixture" }));
}).listen(3101, "127.0.0.1");
