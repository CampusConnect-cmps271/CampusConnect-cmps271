import type { Candidate, Recommendation } from "./types";

function isComputerScience(major: string | null): boolean {
  const normalized = major?.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return ["cs", "cmps", "computer science", "bs computer science", "b s computer science", "bsc computer science", "computer science bs", "bachelor of science in computer science"].includes(normalized ?? "");
}

/** Advisory checks from profile and catalogue text, never registration clearance. */
export function registrationGuidance(course: Candidate, major: string | null): Recommendation["registration"] {
  if (isComputerScience(major)) {
    const evidence = `${course.description}\n${course.prerequisites}`.split(/(?<=[.!?])\s+|\n/u)
      .find(sentence => /\bnot open (?:to|for) (?:computer science|cmps|cs) (?:majors|students)\b/i.test(sentence));
    if (evidence) return {
      status: "restricted", message: "The catalogue states this course is not open to Computer Science students. Ask your adviser about alternatives.",
      evidence: evidence.trim().slice(0, 1000),
    };
    if (/^EECE\s/i.test(course.code)) return {
      status: "review_required",
      message: "EECE course outside your Computer Science major: departmental approval or a petition may be required before enrolling. Confirm access and elective credit with your adviser and the EECE department.",
    };
    if (!/^CMPS\s/i.test(course.code)) return {
      status: "review_required",
      message: "Outside Computer Science: ask your adviser whether this course counts as an elective and whether departmental approval is needed.",
    };
  }
  return { status: "unverified", message: "Confirm registration eligibility and degree requirements with your adviser." };
}
