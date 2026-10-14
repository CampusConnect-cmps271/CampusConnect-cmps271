/** A student's profile as the app reads it. Holds no email or Auth data. */
export type Profile = {
  id: string;
  fullName: string;
  major: string | null;
  graduationYear: number | null;
  bio: string | null;
  interests: string[];
  pinnedPostId: string | null;
};

