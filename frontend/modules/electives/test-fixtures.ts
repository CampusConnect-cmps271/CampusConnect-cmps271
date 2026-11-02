import type { ElectivePreferences } from "./schema";

// Shared validated input for the questionnaire and independent recommendation tests.
export const electivePreferencesFixture: ElectivePreferences = {
  interests: ["robotics", "فن"],
  preferred_workload: "moderate",
  academic_goals: "Learn design",
  completed_course_codes: ["CMPS 101"],
};
