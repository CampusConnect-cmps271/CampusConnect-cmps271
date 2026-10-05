import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT:${path}`); }),
  warn: vi.fn(),
  info: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: mocks }) }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/logging", () => ({ log: mocks }));

import { login, register } from "./actions";

function submission(email = " STUDENT+test@MAIL.AUB.EDU ", password = " exact password ", next = "/home") {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  data.set("next", next);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValue({ error: null });
});

describe("registration action", () => {
  function registration(email = " STUDENT@MAIL.AUB.EDU ", password = "ValidPassword1!", confirmPassword = password) {
    const data = submission(email, password);
    data.set("fullName", " Test Student ");
    data.set("confirmPassword", confirmPassword);
    return data;
  }

  it("creates an unconfirmed account with the normalized email and code-template contract", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "student", identities: [{ id: "identity" }] }, session: null }, error: null });
    expect(await register(undefined, registration())).toEqual({ status: "sent", email: "student@mail.aub.edu" });
    expect(mocks.signUp).toHaveBeenCalledWith({ email: "student@mail.aub.edu", password: "ValidPassword1!", options: { data: { full_name: "Test Student" } } });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain("ValidPassword1!");
  });

  it("rejects a mismatched password before creating an account", async () => {
    const state = await register(undefined, registration(undefined, undefined, "DifferentPassword1!"));
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.errors?.confirmPassword).toContain("Passwords do not match");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("reports obfuscated duplicate accounts instead of claiming a code was sent", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: { id: "student", identities: [] }, session: null }, error: null });
    expect(await register(undefined, registration())).toMatchObject({ status: "error", message: "This email is already registered. Log in instead." });
  });

  it("handles email rate limits without echoing the password or raw provider details", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "over_email_send_rate_limit", status: 429, message: "private SMTP details" } });
    const state = await register(undefined, registration());
    expect(state).toMatchObject({ status: "error", message: "Too many verification emails sent. Please wait a few minutes and try again." });
    expect(JSON.stringify(state)).not.toContain("ValidPassword1!");
    expect(JSON.stringify(state)).not.toContain("private SMTP");
  });
});

describe("login verification handoff", () => {
  it("redirects the specific unconfirmed-email error with an encoded, normalized email", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code: "email_not_confirmed", status: 400 } });
    await expect(login({}, submission())).rejects.toThrow("REDIRECT:/verify-email?email=student%2Btest%40mail.aub.edu");
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: "student+test@mail.aub.edu", password: " exact password " });
    expect(mocks.redirect).toHaveBeenCalledOnce();
    expect(mocks.info).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain("exact password");
  });

  it.each(["invalid_credentials", "unexpected_failure", undefined])("keeps %s errors on login, even when their text says email not confirmed", async (code) => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { code, status: 403, message: "Email not confirmed" } });
    const state = await login({}, submission());
    expect(state.email).toBe("student+test@mail.aub.edu");
    expect(state.message).toBe(code === "invalid_credentials" ? "Incorrect email or password" : "Something went wrong. Please try again.");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(state).not.toHaveProperty("password");
  });

  it("validates input before contacting Auth", async () => {
    const state = await login({}, submission("outsider@gmail.com", ""));
    expect(state.errors?.email).toBeDefined();
    expect(state.errors?.password).toBeDefined();
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("keeps a confirmed sign-in's destination and rejects an off-site next URL", async () => {
    const user = { id: "test-user", email_confirmed_at: "2026-10-05T12:00:00Z" };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    await expect(login({}, submission(undefined, undefined, "/profile?tab=email"))).rejects.toThrow("REDIRECT:/profile?tab=email");
    await expect(login({}, submission(undefined, undefined, "https://evil.test"))).rejects.toThrow("REDIRECT:/home");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("clears only the local session if Auth unexpectedly signs in an unconfirmed user", async () => {
    const user = { id: "test-user", email_confirmed_at: null };
    mocks.signInWithPassword.mockResolvedValue({ data: { user, session: { user } }, error: null });
    await expect(login({}, submission())).rejects.toThrow("REDIRECT:/verify-email?");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it("does not report success without a session", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "test-user", email_confirmed_at: "confirmed" }, session: null }, error: null });
    expect((await login({}, submission())).message).toBe("Something went wrong. Please try again.");
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
