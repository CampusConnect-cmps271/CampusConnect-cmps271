"use client";

import { useActionState, useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { findCourseCommunities, type CommunityFormState } from "../actions";
import {
  COMMUNITY_LIMITS,
  COMMUNITY_TOPICS,
  TOPIC_LABELS,
  validateCommunityForm,
  type CommunityFieldErrors,
  type CommunityFormValues,
} from "../schema";
import { CoursePicker } from "./CoursePicker";
import { FIELD_CLASS, LABEL_CLASS, plural, PRIMARY_BUTTON } from "./styles";

type Existing = { id: string; slug: string; name: string; memberCount: number };

type CommunityFormProps = {
  /** createCommunity, or updateCommunity bound to the community. */
  action: (state: CommunityFormState, formData: FormData) => Promise<CommunityFormState>;
  initialValues: CommunityFormValues;
  submitLabel: string;
  pendingLabel: string;
  cancelHref: string;
  /** On the create page: list a chosen course's communities first. */
  suggestExisting?: boolean;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

/** A community's name, description and topic, with a course for a course community. */
export function CommunityForm({ action, initialValues, submitLabel, pendingLabel, cancelHref, suggestExisting = false }: CommunityFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<CommunityFieldErrors>({});
  const [existing, setExisting] = useState<{ courseId: string; communities: Existing[] } | null>(null);
  const [, startLookup] = useTransition();

  // A failed save returns what was typed; show it and its errors.
  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    setClientErrors({});
  }

  const errors: CommunityFieldErrors = { ...state?.errors, ...clientErrors };
  const courseId = values.topic === "course" ? values.courseId : "";

  useEffect(() => {
    if (!suggestExisting || !courseId) return;
    startLookup(async () => {
      const communities = await findCourseCommunities(courseId);
      setExisting({ courseId, communities });
    });
  }, [suggestExisting, courseId]);

  function update(field: keyof CommunityFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field as keyof CommunityFieldErrors]) {
      setClientErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateCommunityForm(values);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
  }

  const described = (field: keyof CommunityFieldErrors, extra?: string) =>
    [extra, errors[field] ? `${field}-error` : undefined].filter(Boolean).join(" ") || undefined;
  const courseName = values.courseLabel.split(" · ")[0] || "This course";
  const shownExisting = existing && existing.courseId === courseId ? existing.communities : null;

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="topic" className={LABEL_CLASS}>
          Topic
        </label>
        <select
          id="topic"
          name="topic"
          value={values.topic}
          onChange={(event) => update("topic", event.target.value)}
          aria-invalid={errors.topic ? true : undefined}
          aria-describedby={described("topic")}
          className={FIELD_CLASS}
        >
          <option value="">Choose a topic</option>
          {COMMUNITY_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {TOPIC_LABELS[topic]}
            </option>
          ))}
        </select>
        <FieldError id="topic-error" message={errors.topic} />
      </div>

      {values.topic === "course" ? (
        <CoursePicker
          courseId={values.courseId}
          courseLabel={values.courseLabel}
          error={errors.courseId}
          onChange={(course) => {
            setValues((current) => ({ ...current, courseId: course?.id ?? "", courseLabel: course?.label ?? "" }));
            setClientErrors((current) => ({ ...current, courseId: undefined }));
          }}
        />
      ) : null}

      {suggestExisting && courseId && shownExisting ? (
        shownExisting.length > 0 ? (
          <section aria-labelledby="join-instead" className="rounded-lg border border-[var(--maroon-200)] bg-[var(--maroon-50)] p-4">
            <h2 id="join-instead" className="text-sm font-semibold text-[var(--ink)]">
              Join instead?
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">{courseName} already has these communities:</p>
            <ul className="mt-2 flex flex-col gap-1">
              {shownExisting.map((community) => (
                <li key={community.id} className="text-sm">
                  <Link href={`/communities/${community.slug}`} className="font-semibold text-[var(--maroon)] hover:underline">
                    {community.name}
                  </Link>{" "}
                  <span className="text-[var(--ink-soft)]">· {plural(community.memberCount, "member")}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p role="status" className="text-sm text-[var(--ink-soft)]">
            {courseName} has no community yet. Yours will be the first.
          </p>
        )
      ) : null}

      <div className="flex flex-col gap-1">
        <label htmlFor="name" className={LABEL_CLASS}>
          Name
        </label>
        <input
          id="name"
          name="name"
          value={values.name}
          onChange={(event) => update("name", event.target.value)}
          maxLength={COMMUNITY_LIMITS.nameMax + 20}
          placeholder="e.g. CMPS 271 study group"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={described("name")}
          className={FIELD_CLASS}
        />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description" className={LABEL_CLASS}>
          Description <span className="font-normal text-[var(--ink-soft)]">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          value={values.description}
          onChange={(event) => update("description", event.target.value)}
          placeholder="What the community is for"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={described("description", "description-count")}
          className={`${FIELD_CLASS} resize-y`}
        />
        <p id="description-count" className="text-xs text-[var(--ink-soft)]">
          {values.description.trim().length}/{COMMUNITY_LIMITS.description}
        </p>
        <FieldError id="description-error" message={errors.description} />
      </div>

      {values.topic !== "course" ? <input type="hidden" name="courseId" value="" /> : null}

      {state?.error ? (
        <p role="alert" className="rounded-md bg-[#fdecea] px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? pendingLabel : submitLabel}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-[var(--ink-soft)] hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
