"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { updateMyProfile, type ProfileFormState } from "../actions";
import {
  PROFILE_LIMITS,
  profileFormValues,
  readProfileForm,
  validateProfileForm,
} from "../schema";
import type { Profile } from "../types";
import { InterestTags } from "./InterestTags";

const INITIAL_STATE: ProfileFormState = { status: "idle" };

const LABEL_CLASS = "mb-1 block text-sm font-semibold text-[var(--ink-soft)]";
const VALUE_CLASS = "min-w-0 rounded-lg bg-[var(--maroon-50)] px-3 py-3 text-sm text-[var(--ink)] break-words sm:text-base";
const INPUT_CLASS =
  "w-full min-w-0 rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] aria-[invalid=true]:border-[var(--danger)]";

/**
 * The signed-in student's own profile: shown read-only, edited in place.
 * Layout and Edit / Save / Cancel flow from Refai's original card.
 */
export function ProfileCard({ profile }: { profile: Profile }) {
  const [isEditing, setIsEditing] = useState(false);
  // useActionState cannot be reset, so Cancel remembers the result it closed
  // and the next edit starts clean instead of showing old errors.
  const [dismissed, setDismissed] = useState<ProfileFormState | null>(null);

  const [actionState, formAction, pending] = useActionState(
    async (
      previous: ProfileFormState,
      formData: FormData,
    ): Promise<ProfileFormState> => {
      // Same schema as the server: report mistakes without a round trip.
      const values = readProfileForm(formData);
      const checked = validateProfileForm(values);
      if (!checked.success) {
        return { status: "error", errors: checked.errors, values };
      }

      const result = await updateMyProfile(previous, formData);
      if (result.status === "saved") setIsEditing(false);
      return result;
    },
    INITIAL_STATE,
  );

  const state = actionState === dismissed ? INITIAL_STATE : actionState;
  const errors = state.status === "error" ? state.errors : undefined;
  const values =
    state.status === "error" ? state.values : profileFormValues(profile);

  function startEditing() {
    setDismissed(actionState);
    setIsEditing(true);
  }

  function cancelEditing() {
    setDismissed(actionState);
    setIsEditing(false);
  }

  return (
    <div className="w-full min-w-0 rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm sm:p-7">
      <h1 className="sr-only">Student Profile</h1>
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-[var(--border)] pb-5">
        <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-[var(--maroon)] text-xl font-bold text-white sm:size-20 sm:text-2xl">
          {profile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("") || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--ink-soft)]">My profile</p>
          <h2 className="break-words text-xl font-bold text-[var(--ink)] sm:text-2xl">Your campus profile</h2>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Manage the information others see on your student profile.</p>
        </div>
      </header>

      {!isEditing ? (
        <>
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2">
            <DisplayField label="Full name">{profile.fullName}</DisplayField>
            <DisplayField label="Major">{profile.major || "Not added yet"}</DisplayField>
            <DisplayField label="Graduation year">
              {profile.graduationYear ?? "Not added yet"}
            </DisplayField>
            <div className="sm:col-span-2"><DisplayField label="Bio">
              <span className="whitespace-pre-wrap">{profile.bio || "Not added yet"}</span>
            </DisplayField>
            </div>
            <div className="sm:col-span-2"><DisplayField label="Interests">
              {profile.interests.length > 0 ? (
                <InterestTags interests={profile.interests} />
              ) : (
                "Not added yet"
              )}
            </DisplayField></div>
          </dl>

          <p role="status" className="mt-4 text-sm text-[var(--success)] empty:hidden">
            {state.status === "saved" ? "Profile saved." : ""}
          </p>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={startEditing}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--maroon)] px-5 py-3 font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] sm:w-auto"
            >
              Edit Profile
            </button>
          </div>
        </>
      ) : (
        <form action={formAction} noValidate>
          <h2 className="mb-1 text-lg font-semibold text-[var(--ink)]">Edit your information</h2>
          <p className="mb-5 text-sm text-[var(--ink-soft)]">Only your full name is required. Other fields may be left blank.</p>
          {state.status === "error" && state.message ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-[var(--danger)]/30 bg-red-50 px-3 py-2 text-sm text-[var(--danger)]"
            >
              {state.message}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <EditField label="Full name" errors={errors?.fullName}>
              {(props) => (
                <input
                  {...props}
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={PROFILE_LIMITS.fullName}
                  defaultValue={values.fullName}
                  className={INPUT_CLASS}
                />
              )}
            </EditField>

            <EditField label="Major" errors={errors?.major}>
              {(props) => (
                <input
                  {...props}
                  name="major"
                  type="text"
                  maxLength={PROFILE_LIMITS.major}
                  defaultValue={values.major}
                  className={INPUT_CLASS}
                />
              )}
            </EditField>

            <EditField
              label="Graduation year"
              errors={errors?.graduationYear}
              hint={`A year from ${PROFILE_LIMITS.firstGraduationYear} to ${PROFILE_LIMITS.lastGraduationYear}.`}
            >
              {(props) => (
                <input
                  {...props}
                  name="graduationYear"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={values.graduationYear}
                  className={INPUT_CLASS}
                />
              )}
            </EditField>

            <div className="sm:col-span-2"><EditField
              label="Bio"
              errors={errors?.bio}
              hint={`Up to ${PROFILE_LIMITS.bio} characters.`}
            >
              {(props) => (
                <textarea
                  {...props}
                  name="bio"
                  rows={4}
                  maxLength={PROFILE_LIMITS.bio}
                  defaultValue={values.bio}
                  className={INPUT_CLASS}
                />
              )}
            </EditField></div>

            <div className="sm:col-span-2"><EditField
              label="Interests"
              errors={errors?.interests}
              hint={`Separate with commas, up to ${PROFILE_LIMITS.interests}.`}
            >
              {(props) => (
                <input
                  {...props}
                  name="interests"
                  type="text"
                  autoComplete="off"
                  defaultValue={values.interests}
                  className={INPUT_CLASS}
                />
              )}
            </EditField></div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={pending}
              className="min-h-11 rounded-lg border border-[var(--border)] bg-white px-5 py-3 font-semibold text-[var(--ink)] hover:bg-[var(--maroon-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 rounded-lg bg-[var(--maroon)] px-5 py-3 font-semibold text-white hover:bg-[var(--maroon-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--maroon)] disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DisplayField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className={LABEL_CLASS}>{label}</dt>
      <dd className={VALUE_CLASS}>{children}</dd>
    </div>
  );
}

type ControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

/** A labelled control with its hint and inline error wired up for screen readers. */
function EditField({
  label,
  errors,
  hint,
  children,
}: {
  label: string;
  errors?: string[];
  hint?: string;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();
  const error = errors?.[0];
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[var(--ink-soft)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

