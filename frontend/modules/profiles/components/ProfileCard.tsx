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

const LABEL_CLASS = "block text-sm font-bold text-gray-600 mb-1";
const VALUE_CLASS = "bg-gray-50 p-3 rounded-md text-gray-800 break-words";
const INPUT_CLASS =
  "w-full p-3 border border-gray-300 rounded-md bg-white text-gray-900 aria-[invalid]:border-red-600";

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
    <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 w-full">
      <h1 className="text-2xl font-bold text-center text-gray-800 border-b-2 border-gray-200 pb-4 mb-6">
        Student Profile
      </h1>

      {!isEditing ? (
        <>
          <dl className="space-y-4">
            <DisplayField label="Full name">{profile.fullName}</DisplayField>
            <DisplayField label="Major">{profile.major || "N/A"}</DisplayField>
            <DisplayField label="Graduation year">
              {profile.graduationYear ?? "N/A"}
            </DisplayField>
            <DisplayField label="Bio">
              <span className="whitespace-pre-wrap">{profile.bio || "N/A"}</span>
            </DisplayField>
            <DisplayField label="Interests">
              {profile.interests.length > 0 ? (
                <InterestTags interests={profile.interests} />
              ) : (
                "N/A"
              )}
            </DisplayField>
          </dl>

          <p role="status" className="mt-4 text-sm text-green-700 empty:hidden">
            {state.status === "saved" ? "Profile saved." : ""}
          </p>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={startEditing}
              className="flex-1 bg-blue-600 text-white py-3 rounded-md font-bold hover:bg-blue-700"
            >
              Edit Profile
            </button>
          </div>
        </>
      ) : (
        <form action={formAction} noValidate>
          {state.status === "error" && state.message ? (
            <p
              role="alert"
              className="mb-4 rounded-md border border-red-600/30 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {state.message}
            </p>
          ) : null}

          <div className="space-y-4">
            <EditField label="Full name" errors={errors?.fullName}>
              {(props) => (
                <input
                  {...props}
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
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

            <EditField
              label="Bio"
              errors={errors?.bio}
              hint={`Up to ${PROFILE_LIMITS.bio} characters.`}
            >
              {(props) => (
                <textarea
                  {...props}
                  name="bio"
                  rows={4}
                  defaultValue={values.bio}
                  className={INPUT_CLASS}
                />
              )}
            </EditField>

            <EditField
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
            </EditField>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={cancelEditing}
              disabled={pending}
              className="flex-1 bg-gray-400 text-white py-3 rounded-md font-bold hover:bg-gray-500 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 bg-green-600 text-white py-3 rounded-md font-bold hover:bg-green-700 disabled:opacity-60"
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
        <p id={`${id}-hint`} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

