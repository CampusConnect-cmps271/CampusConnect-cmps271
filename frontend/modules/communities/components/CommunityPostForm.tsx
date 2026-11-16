"use client";

import { useActionState, useState, type FormEvent } from "react";
import Link from "next/link";
import type { CommunityPostFormState } from "../actions";
import {
  COMMUNITY_POST_CATEGORIES,
  EMPTY_COMMUNITY_POST_FORM,
  validateCommunityPostForm,
  type CommunityPostFieldErrors,
  type CommunityPostFormValues,
} from "../schema";
import { FIELD_CLASS, LABEL_CLASS, PRIMARY_BUTTON } from "./styles";

type CommunityPostFormProps = {
  /** createCommunityPost bound to the community. */
  action: (state: CommunityPostFormState, formData: FormData) => Promise<CommunityPostFormState>;
  cancelHref: string;
};

/** The normal post fields: title, category and content. */
export function CommunityPostForm({ action, cancelHref }: CommunityPostFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [values, setValues] = useState<CommunityPostFormValues>(EMPTY_COMMUNITY_POST_FORM);
  const [clientErrors, setClientErrors] = useState<CommunityPostFieldErrors>({});

  const [returned, setReturned] = useState(state);
  if (returned !== state) {
    setReturned(state);
    if (state?.values) setValues(state.values);
    setClientErrors({});
  }

  const errors: CommunityPostFieldErrors = { ...state?.errors, ...clientErrors };

  function update(field: keyof CommunityPostFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (clientErrors[field]) setClientErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateCommunityPostForm(values);
    if (result.success) {
      setClientErrors({});
      return;
    }
    event.preventDefault();
    setClientErrors(result.errors);
  }

  const error = (field: keyof CommunityPostFieldErrors) =>
    errors[field] ? (
      <p id={`${field}-error`} className="text-sm text-[var(--danger)]">
        {errors[field]}
      </p>
    ) : null;

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="title" className={LABEL_CLASS}>
          Title
        </label>
        <input
          id="title"
          name="title"
          value={values.title}
          onChange={(event) => update("title", event.target.value)}
          maxLength={220}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          className={FIELD_CLASS}
        />
        {error("title")}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category" className={LABEL_CLASS}>
          Category
        </label>
        <select
          id="category"
          name="category"
          value={values.category}
          onChange={(event) => update("category", event.target.value)}
          aria-invalid={errors.category ? true : undefined}
          aria-describedby={errors.category ? "category-error" : undefined}
          className={FIELD_CLASS}
        >
          <option value="">Choose a category</option>
          {COMMUNITY_POST_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        {error("category")}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="body" className={LABEL_CLASS}>
          Content
        </label>
        <textarea
          id="body"
          name="body"
          rows={8}
          value={values.body}
          onChange={(event) => update("body", event.target.value)}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? "body-error" : undefined}
          className={`${FIELD_CLASS} resize-y`}
        />
        {error("body")}
      </div>

      {state?.error ? (
        <p role="alert" className="rounded-md bg-[#fdecea] px-3 py-2 text-sm text-[var(--danger)]">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY_BUTTON}>
          {pending ? "Posting…" : "Post"}
        </button>
        <Link href={cancelHref} className="text-sm font-medium text-[var(--ink-soft)] hover:underline">
          Cancel
        </Link>
      </div>
    </form>
  );
}
