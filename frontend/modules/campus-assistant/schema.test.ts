import { describe, expect, it } from "vitest";
import { isCitableUrl, sourceLabel } from "./schema";

describe("sourceLabel", () => {
  it.each([
    ["course-catalogue", "/courses/CMPS-271", "AUB course catalogue"],
    ["club-directory", "/clubs/robotics-club", "Student clubs"],
    ["campus-events", "/events/6f1c2a40-1b2c-4d3e-8f50-123456789abc", "Campus events"],
    ["student-plan", "/planner/6f1c2a40-1b2c-4d3e-8f50-123456789abc", "Your semester plan"],
    ["student-events", "/events", "Your saved events"],
    ["student-posts", "/saved", "Your posts"],
    ["campus-feed", "/home", "Campus feed"],
  ])("names %s as %s", (sourceId, url, label) => {
    expect(sourceLabel(sourceId, url)).toBe(label);
  });

  it("falls back on the link: https pages are the AUB website, anything else is the app", () => {
    expect(sourceLabel("registrar", "https://www.aub.edu.lb/registrar")).toBe("AUB website");
    expect(sourceLabel("new-thing", "/clubs/robotics-club")).toBe("CampusConnect");
  });
});

describe("isCitableUrl", () => {
  it("accepts https AUB pages and the app's course, club and event pages", () => {
    expect(isCitableUrl("https://www.aub.edu.lb/registrar")).toBe(true);
    expect(isCitableUrl("/courses/CMPS-271")).toBe(true);
    expect(isCitableUrl("/clubs/robotics-club")).toBe(true);
    expect(isCitableUrl("/clubs/ieee")).toBe(true);
    expect(isCitableUrl("/events/6f1c2a40-1b2c-4d3e-8f50-123456789abc")).toBe(true);
  });

  it("accepts the student's own plan page and the few pages their private context points to", () => {
    expect(isCitableUrl("/planner/11111111-1111-4111-8111-111111111111")).toBe(true);
    for (const path of ["/events", "/saved", "/profile", "/home"]) expect(isCitableUrl(path)).toBe(true);
  });

  it("rejects every other page of the app, including other students' profiles and plan lists", () => {
    for (const path of [
      "/planner", "/planner/new", "/planner/not-a-uuid", "/planner/11111111-1111-4111-8111-111111111111/edit",
      "/profile/11111111-1111-4111-8111-111111111111", "/messages", "/messages/11111111-1111-4111-8111-111111111111",
      "/admin", "/events/", "/saved/", "/home?x=1", "/profile#top", "/posts/new",
    ]) {
      expect(isCitableUrl(path), path).toBe(false);
    }
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
