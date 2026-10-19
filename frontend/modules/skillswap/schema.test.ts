import { describe, expect, it } from "vitest";
import {
  EMPTY_SKILLSWAP_FORM,
  MEETING_METHOD_OPTIONS,
  meetingMethodLabel,
  readSkillSwapForm,
  validateSkillSwapForm,
} from "./schema";

const valid = {
  canTeach: "  Python for CMPS 200 ",
  wantsToLearn: "Conversational French",
  meetingMethod: "online",
  availability: " Weekday evenings ",
  details: "",
};

describe("validateSkillSwapForm", () => {
  it("trims the boxes and turns empty optional fields into null", () => {
    expect(validateSkillSwapForm(valid)).toEqual({
      success: true,
      data: {
        canTeach: "Python for CMPS 200",
        wantsToLearn: "Conversational French",
        meetingMethod: "online",
        availability: "Weekday evenings",
        details: null,
      },
    });
  });

  it("keeps line breaks and non-Latin text", () => {
    const result = validateSkillSwapForm({ ...valid, canTeach: "العربية\nالفصحى" });
    expect(result.success && result.data.canTeach).toBe("العربية\nالفصحى");
  });

  it("requires both boxes", () => {
    expect(validateSkillSwapForm({ ...valid, canTeach: "  ", wantsToLearn: "" })).toEqual({
      success: false,
      errors: {
        canTeach: "Tell students what you can teach.",
        wantsToLearn: "Tell students what you want to learn.",
      },
    });
  });

  it("enforces each field's length after trimming", () => {
    const result = validateSkillSwapForm({
      ...valid,
      canTeach: "x".repeat(301),
      wantsToLearn: ` ${"y".repeat(300)} `,
      availability: "a".repeat(121),
      details: "d".repeat(2001),
    });

    expect(result).toEqual({
      success: false,
      errors: {
        canTeach: "What you can teach can be up to 300 characters.",
        availability: "Availability can be up to 120 characters.",
        details: "Extra details can be up to 2000 characters.",
      },
    });
  });

  it("accepts only the three meeting methods", () => {
    for (const meetingMethod of ["online", "in_person", "either"]) {
      expect(validateSkillSwapForm({ ...valid, meetingMethod }).success).toBe(true);
    }
    expect(validateSkillSwapForm({ ...valid, meetingMethod: "carrier pigeon" })).toEqual({
      success: false,
      errors: { meetingMethod: "Choose how you'd like to meet." },
    });
  });
});

describe("readSkillSwapForm", () => {
  it("reads every field, treating missing ones as empty", () => {
    const formData = new FormData();
    formData.set("canTeach", "Python");
    formData.set("meetingMethod", "either");

    expect(readSkillSwapForm(formData)).toEqual({
      canTeach: "Python",
      wantsToLearn: "",
      meetingMethod: "either",
      availability: "",
      details: "",
    });
  });

  it("starts a new post with 'Either'", () => {
    expect(EMPTY_SKILLSWAP_FORM.meetingMethod).toBe("either");
  });
});

describe("meeting method labels", () => {
  it("names each method the way the post body does", () => {
    expect(meetingMethodLabel("online")).toBe("Online");
    expect(meetingMethodLabel("in_person")).toBe("In person");
    expect(meetingMethodLabel("either")).toBe("Online or in person");
  });

  it("reads anything unknown as either", () => {
    expect(meetingMethodLabel("")).toBe("Online or in person");
  });

  it("labels the form's choices", () => {
    expect(MEETING_METHOD_OPTIONS).toEqual({ online: "Online", in_person: "In person", either: "Either" });
  });
});
