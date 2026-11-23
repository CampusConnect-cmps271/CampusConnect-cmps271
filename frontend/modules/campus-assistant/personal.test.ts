import { describe, expect, it } from "vitest";
import { isPersonalQuestion } from "./personal";

describe("isPersonalQuestion", () => {
  it.each([
    "What is on my schedule today?",
    "Do I have any conflicts in my plan?",
    "Which events did I save?",
    "Which of my saved events am I going to?",
    "Am I free on Thursday afternoon?",
    "Should I take CMPS 271 next semester?",
    "What did I post last week?",
    "How many credits am I taking?",
    "Show my bookmarks",
    "I'm going to the robotics night, is there a clash with my classes?",
  ])("treats %j as personal", (question) => {
    expect(isPersonalQuestion(question)).toBe(true);
  });

  it.each([
    "ما هو جدولي اليوم؟",
    "هل عندي تعارض في خطتي؟",
    "ما هي فعالياتي المحفوظة؟",
    "هل لدي محاضرة غدا؟",
  ])("treats the Arabic question %j as personal", (question) => {
    expect(isPersonalQuestion(question)).toBe(true);
  });

  it.each([
    "What are the library opening hours?",
    "Who issues transcripts?",
    "How do I request an official transcript?",
    "Can I get a certificate of enrolment?",
    "What events are happening this week?",
    "Tell me about the robotics club",
    "What are the prerequisites of CMPS 271?",
    "How do I register for a course?",
    "ما هي مواعيد المكتبة؟",
    "من يصدر كشف العلامات؟",
  ])("keeps %j away from private data", (question) => {
    expect(isPersonalQuestion(question)).toBe(false);
  });

  it("needs a topic, not just the first person", () => {
    expect(isPersonalQuestion("my transcript")).toBe(false);
    expect(isPersonalQuestion("Do I need a visa?")).toBe(false);
  });

  it("is not fooled by words that merely contain a topic word", () => {
    expect(isPersonalQuestion("my classmates are noisy")).toBe(false);
    expect(isPersonalQuestion("my planetarium visit")).toBe(false);
  });

  it("is false for empty input", () => {
    expect(isPersonalQuestion("")).toBe(false);
    expect(isPersonalQuestion("   ?! ")).toBe(false);
  });
});
