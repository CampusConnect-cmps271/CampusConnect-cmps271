import { describe, expect, it } from "vitest";
import { ARCHIVED_MESSAGE, communityErrorMessage } from "./errors";

describe("community error messages", () => {
  it("explains the database's own refusals", () => {
    expect(communityErrorMessage("create", "CM001")).toMatch(/3 communities a day/);
    expect(communityErrorMessage("create", "CM002")).toMatch(/20 active communities/);
    expect(communityErrorMessage("join", "CM010")).toBe(ARCHIVED_MESSAGE);
    expect(communityErrorMessage("post", "CM011")).toBe("Join this community to post in it.");
    expect(communityErrorMessage("leave", "CM011")).toBe("You're not a member of this community.");
    expect(communityErrorMessage("leave", "CM012")).toMatch(/owner you can't leave/);
    expect(communityErrorMessage("create", "23505")).toMatch(/already exists/);
  });

  it("tells a suspended student why, and a non-owner who can archive", () => {
    expect(communityErrorMessage("post", "42501")).toMatch(/suspended/);
    expect(communityErrorMessage("archive", "42501")).toMatch(/owner, a moderator or an administrator/);
  });

  it("falls back to a generic message for anything else", () => {
    expect(communityErrorMessage("unfollow", "XX000")).toBe("We couldn't unfollow this community. Please try again.");
    expect(communityErrorMessage("create", null)).toBe("We couldn't create the community. Please try again.");
  });
});
