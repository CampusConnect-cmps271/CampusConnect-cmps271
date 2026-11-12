import { describe, expect, it } from "vitest";
import { isCitableUrl } from "./schema";

describe("isCitableUrl", () => {
  it("accepts https AUB pages and the app's course, club and event pages", () => {
    expect(isCitableUrl("https://www.aub.edu.lb/registrar")).toBe(true);
    expect(isCitableUrl("/courses/CMPS-271")).toBe(true);
    expect(isCitableUrl("/clubs/robotics-club")).toBe(true);
    expect(isCitableUrl("/clubs/ieee")).toBe(true);
    expect(isCitableUrl("/events/6f1c2a40-1b2c-4d3e-8f50-123456789abc")).toBe(true);
  });

  it("rejects other hosts, schemes and credentials", () => {
    expect(isCitableUrl("https://aub.edu.lb.evil.example/")).toBe(false);
    expect(isCitableUrl("http://www.aub.edu.lb/registrar")).toBe(false);
    expect(isCitableUrl("https://user:pw@www.aub.edu.lb/")).toBe(false);
    expect(isCitableUrl("javascript:alert(1)")).toBe(false);
    expect(isCitableUrl("//evil.example/clubs/robotics-club")).toBe(false);
  });

  it("rejects club and event paths that are not a plain slug or id", () => {
    expect(isCitableUrl("/clubs/")).toBe(false);
    expect(isCitableUrl("/clubs/Robotics_Club")).toBe(false);
    expect(isCitableUrl("/clubs/robotics-club/announcements/new")).toBe(false);
    expect(isCitableUrl("/clubs/robotics-club?next=https://evil.example")).toBe(false);
    expect(isCitableUrl("/events/new")).toBe(false);
    expect(isCitableUrl("/events/manage")).toBe(false);
    expect(isCitableUrl("/events/6f1c2a40-1b2c-4d3e-8f50-123456789abc/edit")).toBe(false);
  });
});
