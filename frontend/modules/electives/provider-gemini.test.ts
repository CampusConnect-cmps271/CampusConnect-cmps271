import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { configuredProvider } from "./provider";
import { recommend } from "./recommendations";
import { analyzeReviews } from "./analysis";
import type { EvidenceSample } from "./evidence";
import type { Candidate } from "./types";

const item = { course_id: "course-one", rationale: "Robotics matches your interests.", evidence_review_ids: [] };
const output = { items: [item] };
const stage = { summary: "Experiences vary.", uncertainty: "Only three reviews were sampled.", claims: [{ review_id: "review-one", quote: "Useful projects", observation: "A reviewer values the projects." }] };
const sample: EvidenceSample = {
  reviews: ["review-one", "review-two", "review-three"].map(id => ({ id, course_id: "course-one", body: "Useful projects", overall_rating: 4, workload_rating: 3 })),
  total: 3, sampled: 3, truncated: false, positive: 3, negative: 0, mixed: 0,
};
const course: Candidate = { id: "course-one", code: "CMPS 201", name: "Robotics", description: "Robotics design", department: "CMPS", credits: 3, prerequisites: "CMPS 101 or consent", review_count: 0, average_workload: null, average_overall: null };
const preferences = { interests: ["robotics"], preferred_workload: "light", academic_goals: "Learn design", completed_course_codes: [] };
const envelope = (value: unknown) => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }] });
const reply = (value: unknown) => new Response(JSON.stringify(envelope(value)));

beforeEach(() => {
  vi.stubEnv("ELECTIVES_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-key");
  vi.stubEnv("GEMINI_MODEL", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Gemini provider integration", () => {
  it("requires explicit selection and a key, and rejects model path injection", () => {
    vi.stubEnv("ELECTIVES_PROVIDER_URL", "https://gateway.example/api");
    vi.stubEnv("ELECTIVES_PROVIDER_TOKEN", "synthetic-gateway-token");
    vi.stubEnv("GEMINI_API_KEY", " ");
    expect(configuredProvider()).toBeUndefined();
    vi.stubEnv("GEMINI_API_KEY", "synthetic-gemini-key");
    for (const model of ["../models/other?key=leak", "https://untrusted.example", "gemini-" + "x".repeat(100)]) {
      vi.stubEnv("GEMINI_MODEL", model);
      expect(configuredProvider()).toBeUndefined();
    }
    vi.stubEnv("GEMINI_MODEL", "gemini-custom-model");
    vi.stubEnv("ELECTIVES_PROVIDER", "unknown");
    expect(configuredProvider()).toBeUndefined();
  });

  it("does not activate Gemini from a key alone or send that key to an existing gateway", async () => {
    vi.stubEnv("ELECTIVES_PROVIDER", "");
    vi.stubEnv("ELECTIVES_PROVIDER_URL", "");
    vi.stubEnv("ELECTIVES_PROVIDER_TOKEN", "");
    expect(configuredProvider()).toBeUndefined();
    vi.stubEnv("ELECTIVES_PROVIDER_URL", "https://gateway.example/api");
    vi.stubEnv("ELECTIVES_PROVIDER_TOKEN", "synthetic-gateway-token");
    const fetch = vi.fn().mockResolvedValue(Response.json(output));
    vi.stubGlobal("fetch", fetch);
    expect(await configuredProvider()!("recommend", {})).toEqual(output);
    expect(fetch.mock.calls[0][0].toString()).toBe("https://gateway.example/api");
    expect(fetch.mock.calls[0][1].headers).toEqual({ "content-type": "application/json", authorization: "Bearer synthetic-gateway-token" });
    expect(JSON.stringify(fetch.mock.calls)).not.toContain("synthetic-gemini-key");
  });

  it("uses Google's fixed HTTPS endpoint, a header-only key and structured JSON without redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(output));
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.stubGlobal("fetch", fetch);
    try {
      expect(await configuredProvider()!("recommend", { candidates: [item] })).toEqual(output);
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent");
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "x-goog-api-key": "synthetic-gemini-key" } });
      expect(timeout).toHaveBeenCalledWith(4000);
      const body = JSON.parse(init.body);
      expect(body.systemInstruction.parts[0].text).toContain("untrusted");
      expect(body.generationConfig).toMatchObject({ candidateCount: 1, maxOutputTokens: 4096, responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: { required: ["items"], additionalProperties: false } } } });
      expect(JSON.parse(body.contents[0].parts[0].text)).toEqual({ operation: "recommend", input: { candidates: [item] } });
      expect(String(url) + init.body).not.toContain("synthetic-gemini-key");
    } finally { timeout.mockRestore(); }
  });

  it("allows a configured model and reconstructs text parts while excluding thoughts", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-custom-model");
    const text = JSON.stringify(output);
    const fetch = vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [
      { text: "Not application output", thought: true }, { text: text.slice(0, 15) }, { text: text.slice(15) },
    ] } }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await configuredProvider()!("recommend", {})).toEqual(output);
    expect(fetch.mock.calls[0][0]).toContain("/gemini-custom-model:generateContent");
  });

  it("runs all three analysis stages and supplies the verified earlier stages to the judge", async () => {
    const fetch = vi.fn().mockImplementation(async () => reply(stage));
    vi.stubGlobal("fetch", fetch);
    expect((await analyzeReviews(sample, configuredProvider())).status).toBe("available");
    const inputs = fetch.mock.calls.map(([, init]) => JSON.parse(JSON.parse(init.body).contents[0].parts[0].text));
    expect(inputs.map(row => row.operation)).toEqual(["defender", "prosecutor", "judge"]);
    expect(inputs[2].input).toMatchObject({ defender: stage, prosecutor: stage, evidence: sample });
  });

  it("accepts Gemini recommendations without overriding catalogue facts or prerequisite uncertainty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(output)));
    const result = await recommend(preferences, { courses: [course], truncated: false }, configuredProvider());
    expect(result).toMatchObject({ mode: "provider", providerStatus: "available" });
    expect(result.recommendations[0]).toMatchObject({ code: course.code, prerequisite_status: "unknown", rationale: item.rationale });
  });

  it("keeps source verification after Gemini returns syntactically valid JSON", async () => {
    const fetch = vi.fn().mockResolvedValue(reply({ ...stage, claims: [{ ...stage.claims[0], review_id: "removed-review" }] }));
    vi.stubGlobal("fetch", fetch);
    expect(await analyzeReviews(sample, configuredProvider())).toEqual({ status: "unavailable", reason: "provider_failure" });
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValue(reply({ items: [{ ...item, course_id: "invented-course" }] }));
    const result = await recommend(preferences, { courses: [course], truncated: false }, configuredProvider());
    expect(result.providerStatus).toBe("failed");
    expect(result.recommendations[0].course_id).toBe(course.id);
  });

  it.each([
    ["blocked prompt", { ...envelope(output), promptFeedback: { blockReason: "SAFETY" } }],
    ["truncated output", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify(output) }] } }] }],
    ["missing candidate", { candidates: [] }],
    ["multiple candidates", { candidates: [...envelope(output).candidates, ...envelope(output).candidates] }],
    ["empty parts", { candidates: [{ finishReason: "STOP", content: { parts: [] } }] }],
    ["malformed JSON", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not JSON" }] } }] }],
    ["invalid application schema", envelope({ items: [{ ...item, secret: "unexpected" }] })],
    ["oversized response", { padding: "x".repeat(32769), ...envelope(output) }],
  ])("falls back on %s without losing catalogue recommendations", async (_name, value) => {
    const fetch = vi.fn().mockResolvedValue(Response.json(value));
    vi.stubGlobal("fetch", fetch);
    const result = await recommend(preferences, { courses: [course], truncated: false }, configuredProvider());
    expect(result.providerStatus).toBe("failed");
    expect(result.recommendations[0].course_id).toBe(course.id);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([401, 429, 503])("does not expose provider error bodies or retry on HTTP %s", async status => {
    const fetch = vi.fn().mockResolvedValue(new Response("private provider details", { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(configuredProvider()!("recommend", {})).rejects.toThrow("Provider unavailable");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back on a transport timeout and rejects unsupported operations before calling Google", async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException("Timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetch);
    const result = await recommend(preferences, { courses: [course], truncated: false }, configuredProvider());
    expect(result.providerStatus).toBe("failed");
    fetch.mockClear();
    await expect(configuredProvider()!("execute", {})).rejects.toThrow("Unsupported");
    expect(fetch).not.toHaveBeenCalled();
  });
});
