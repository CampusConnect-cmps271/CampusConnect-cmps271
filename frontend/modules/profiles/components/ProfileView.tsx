import type { ReactNode } from "react";
import type { Profile } from "../types";
import { InterestTags } from "./InterestTags";

const LABEL_CLASS = "block text-sm font-bold text-gray-600 mb-1";
const VALUE_CLASS = "bg-gray-50 p-3 rounded-md text-gray-800 break-words";

/** Another student's profile, read-only. Same card as the owner's view. */
export function ProfileView({ profile }: { profile: Profile }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 w-full">
      <h1 className="text-2xl font-bold text-center text-gray-800 border-b-2 border-gray-200 pb-4 mb-6 break-words">
        {profile.fullName}
      </h1>

      <dl className="space-y-4">
        <Field label="Major">{profile.major || "N/A"}</Field>
        <Field label="Graduation year">{profile.graduationYear ?? "N/A"}</Field>
        <Field label="Bio">
          <span className="whitespace-pre-wrap">{profile.bio || "N/A"}</span>
        </Field>
        <Field label="Interests">
          {profile.interests.length > 0 ? (
            <InterestTags interests={profile.interests} />
          ) : (
            "N/A"
          )}
        </Field>
      </dl>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className={VALUE_CLASS}>{children}</dd>
    </div>
  );
}
