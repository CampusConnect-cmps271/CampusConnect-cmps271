export type ClubVerificationStatus = "pending" | "verified" | "rejected";

export type ClubSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  verification_status: ClubVerificationStatus;
};

export type ClubProfile = ClubSummary & {
  public_email: string | null;
  public_website: string | null;
  verification_reason: string | null;
};

export type ClubAnnouncement = {
  id: string;
  club_id: string;
  author_id: string;
  title: string;
  body: string;
  status: "draft" | "published" | "removed";
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClubMembership = { club_id: string; user_id: string; role: "member" | "representative" };
