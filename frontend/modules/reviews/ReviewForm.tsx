"use client";

import { useActionState, useId, useState } from "react";
import { deleteMyReview, saveMyReview } from "./actions";
import { EMPTY_REVIEW_VALUES, RATING_FIELDS, RATING_LABELS, readReviewForm, reviewSchema, type ReviewValues } from "./schema";
import type { MyReview, ReviewState } from "./types";
import styles from "./reviews.module.css";

const idle: ReviewState = { status: "idle" };

export function ReviewForm({ courseId, review }: { courseId: string; review: MyReview | null }) {
  const prefix = useId();
  const [values, setValues] = useState<ReviewValues>(() => review ? {
    difficulty: String(review.difficulty_rating), workload: String(review.workload_rating),
    usefulness: String(review.usefulness_rating), overall: String(review.overall_rating),
    semester: review.semester_taken, body: review.body, completedCourse: review.completed_course,
  } : { ...EMPTY_REVIEW_VALUES });
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [operation, setOperation] = useState<"save" | "delete">("save");
  const [saveState, saveAction, saving] = useActionState<ReviewState, FormData>(async (previous, data) => {
    setOperation("save");
    const parsed = reviewSchema.safeParse(readReviewForm(data));
    if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", errors: parsed.error.flatten().fieldErrors };
    try { return await saveMyReview(previous, data); }
    catch { return { status: "error", message: "The request couldn't be completed. Your changes are still here; try again or sign in again." }; }
  }, idle);
  const [deleteState, deleteAction, deleting] = useActionState<ReviewState, FormData>(async (previous, data) => {
    setOperation("delete");
    try {
      const state = await deleteMyReview(previous, data);
      if (state.status === "deleted") {
        setValues({ ...EMPTY_REVIEW_VALUES });
        setConfirmingDelete(false);
      }
      return state;
    } catch { return { status: "error", message: "The request couldn't be completed. Please try again or sign in again." }; }
  }, idle);
  const pending = saving || deleting;
  const state = operation === "save" ? saveState : deleteState;
  const errors = operation === "save" ? saveState.errors : undefined;
  const fieldError = (field: keyof ReviewValues) => errors?.[field]?.[0];
  const errorId = (field: keyof ReviewValues) => `${prefix}-${field}-error`;

  return <div className={styles.editor}>
    <h3>{review ? "Edit your review" : "Write your review"}</h3>
    <p className={styles.intro}>Share your experience after completing this course. You can submit one review per course and edit it later.</p>
    {state.message && <p className={state.status === "error" ? styles.error : styles.success}
      role={state.status === "error" ? "alert" : "status"} aria-label="Review feedback">{state.message}</p>}
    <form action={saveAction} noValidate onReset={(event) => event.preventDefault()}>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="reviewId" value={review?.id ?? ""} />
      <input type="hidden" name="updatedAt" value={review?.updated_at ?? ""} />
      <fieldset disabled={pending} className={styles.fields}>
        <legend className={styles.legend}>Your ratings</legend>
        <div className={styles.ratings}>
          {RATING_FIELDS.map((field) => <div key={field}>
            <label htmlFor={`${prefix}-${field}`}>{RATING_LABELS[field]}</label>
            <select id={`${prefix}-${field}`} name={field} value={values[field]}
              onChange={(event) => setValues({ ...values, [field]: event.target.value })}
              aria-invalid={Boolean(fieldError(field))} aria-describedby={`${prefix}-${field}-hint${fieldError(field) ? ` ${errorId(field)}` : ""}`} required>
              <option value="">Choose a rating</option>
              {[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}
            </select>
            <p id={`${prefix}-${field}-hint`} className={styles.hint}>{field === "difficulty" ? "1 = easiest · 5 = hardest"
              : field === "workload" ? "1 = lightest · 5 = heaviest"
              : field === "usefulness" ? "1 = least useful · 5 = most useful" : "1 = lowest · 5 = highest"}</p>
            {fieldError(field) && <p id={errorId(field)} className={styles.error}>{fieldError(field)}</p>}
          </div>)}
        </div>
        <div>
          <label htmlFor={`${prefix}-semester`}>Semester taken</label>
          <input id={`${prefix}-semester`} name="semester" placeholder="e.g. Fall 2026" maxLength={80} required
            value={values.semester} onChange={(event) => setValues({ ...values, semester: event.target.value })}
            aria-invalid={Boolean(fieldError("semester"))} aria-describedby={fieldError("semester") ? errorId("semester") : undefined} />
          {fieldError("semester") && <p id={errorId("semester")} className={styles.error}>{fieldError("semester")}</p>}
        </div>
        <div>
          <label htmlFor={`${prefix}-body`}>Your written review</label>
          <textarea id={`${prefix}-body`} name="body" rows={6} maxLength={5000} required value={values.body}
            onChange={(event) => setValues({ ...values, body: event.target.value })}
            aria-invalid={Boolean(fieldError("body"))} aria-describedby={`${prefix}-body-hint${fieldError("body") ? ` ${errorId("body")}` : ""}`} />
          <p id={`${prefix}-body-hint`} className={styles.hint}>Keep your review respectful and useful. {values.body.length.toLocaleString("en-US")} / 5,000 characters.</p>
          {fieldError("body") && <p id={errorId("body")} className={styles.error}>{fieldError("body")}</p>}
        </div>
        <div>
          <label className={styles.checkbox}>
            <input type="checkbox" name="completedCourse" checked={values.completedCourse}
              onChange={(event) => setValues({ ...values, completedCourse: event.target.checked })}
              aria-invalid={Boolean(fieldError("completedCourse"))} aria-describedby={fieldError("completedCourse") ? errorId("completedCourse") : undefined} required />
            I completed this course
          </label>
          {fieldError("completedCourse") && <p id={errorId("completedCourse")} className={styles.error}>{fieldError("completedCourse")}</p>}
        </div>
        <button type="submit" className={styles.primary}>{saving ? "Saving…" : review ? "Save changes" : "Post review"}</button>
      </fieldset>
    </form>
    {review && <div className={styles.deleteArea}>
      {confirmingDelete ? <form action={deleteAction}>
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="reviewId" value={review.id} />
        <input type="hidden" name="updatedAt" value={review.updated_at} />
        <input type="hidden" name="confirmDelete" value="yes" />
        <p>Delete your review? This removes your ratings and written review.</p>
        <div className={styles.deleteButtons}>
          <button type="submit" className={styles.danger} disabled={pending}>{deleting ? "Deleting…" : "Confirm delete"}</button>
          <button type="button" onClick={() => setConfirmingDelete(false)} disabled={pending}>Cancel</button>
        </div>
      </form> : <button type="button" className={styles.danger} disabled={pending} onClick={() => setConfirmingDelete(true)}>Delete my review</button>}
    </div>}
  </div>;
}
