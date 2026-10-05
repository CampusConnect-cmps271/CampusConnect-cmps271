import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks, from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-pathname": "/home" }) }));

import { getCurrentUser } from "./session";
import { getCurrentUserAndRole } from "@/lib/auth/server";
import { PATCH } from "@/app/api/admin/roles/route";

beforeEach(() => { vi.clearAllMocks(); });

describe("server-side email confirmation", () => {
  it("does not trust an unconfirmed user's editable metadata", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "student", email: "student@mail.aub.edu", email_confirmed_at: null, user_metadata: { email_verified: true, email_confirmed_at: "pretend" } } }, error: null });
    await expect(getCurrentUser()).rejects.toThrow("REDIRECT:/verify-email?email=student%40mail.aub.edu");
  });

  it("returns confirmed users and preserves their profile name", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "student", email: "student@mail.aub.edu", email_confirmed_at: "confirmed", user_metadata: { full_name: " Test Student " } } }, error: null });
    expect(await getCurrentUser()).toEqual({ id: "student", email: "student@mail.aub.edu", name: "Test Student" });
  });

  it("treats rejected sessions as signed out", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { code: "bad_jwt" } });
    expect(await getCurrentUser()).toBeNull();
  });

  it("redirects unconfirmed role-gated users before reading roles", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "student", email: "a+b@mail.aub.edu", email_confirmed_at: null } }, error: null });
    await expect(getCurrentUserAndRole()).rejects.toThrow("REDIRECT:/verify-email?email=a%2Bb%40mail.aub.edu");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects direct unconfirmed admin API requests before any database operation", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "student", email_confirmed_at: null } }, error: null });
    const response = await PATCH(new Request("http://localhost/api/admin/roles", { method: "PATCH" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Email verification required" });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
