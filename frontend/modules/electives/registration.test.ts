import { expect, it } from "vitest";
import { registrationGuidance } from "./registration";
import type { Candidate } from "./types";
const eece: Candidate = { id: "eece", code: "EECE 463", name: "Robotics", department: "Electrical and Computer Engineering", description: "Robotics and control", prerequisites: "CMPS 201 or consent", credits: 3, review_count: 0, average_workload: null, average_overall: null };
it.each(["Computer Science", "CS", "CMPS", "BS Computer Science"])("flags EECE approval checks for major %s", major => {
  expect(registrationGuidance(eece, major)).toMatchObject({ status: "review_required", message: expect.stringContaining("petition may be required") });
});
it.each([null, "Computer Science and Engineering", "Electrical Engineering"])("does not assume a Computer Science major from %s", major => {
  expect(registrationGuidance(eece, major).status).toBe("unverified");
});
it("preserves explicit source restrictions separately from petition guidance", () => {
  const sentence = "This course is not open for computer science majors.";
  const result = registrationGuidance({ ...eece, code: "CMPS 260", description: `An introduction to AI. ${sentence}` }, "Computer Science");
  expect(result).toMatchObject({ status: "restricted", evidence: sentence });
  expect(result.message).toContain("not open");
  expect(result.message).not.toContain("petition");
});
it("does not reverse restrictions on non-CS students", () => {
  expect(registrationGuidance({ ...eece, code: "CMPS 400", description: "Not open to non-computer science students." }, "Computer Science").status).toBe("unverified");
});
