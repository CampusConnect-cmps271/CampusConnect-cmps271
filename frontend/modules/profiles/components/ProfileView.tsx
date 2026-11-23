import type { ReactNode } from "react";
import type { Profile } from "../types";
import { InterestTags } from "./InterestTags";

const VALUE_CLASS = "min-w-0 rounded-lg bg-[var(--maroon-50)] px-3 py-3 text-sm text-[var(--ink)] break-words sm:text-base";

/** Public information only. Editing and private account information are not shown. */
export function ProfileView({ profile }: { profile: Profile }) {
  const initials = profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?";

  return (
    <section aria-labelledby="student-profile-name" className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-7">
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-5">
        <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--maroon)] text-xl font-bold text-white sm:size-20 sm:text-2xl">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]">Student profile</p>
          <h1 id="student-profile-name" className="break-words text-xl font-bold text-[var(--ink)] sm:text-2xl">{profile.fullName}</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Public student information</p>
        </div>
      </header>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field label="Major">{profile.major || "Not added yet"}</Field>
        <Field label="Graduation year">{profile.graduationYear ?? "Not added yet"}</Field>
        <div className="sm:col-span-2"><Field label="Bio"><span className="whitespace-pre-wrap">{profile.bio || "Not added yet"}</span></Field></div>
        <div className="sm:col-span-2"><Field label="Interests">{profile.interests.length ? <InterestTags interests={profile.interests} /> : "Not added yet"}</Field></div>
      </dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><dt className="mb-1 block text-sm font-semibold text-[var(--ink-soft)]">{label}</dt><dd className={VALUE_CLASS}>{children}</dd></div>;
}
