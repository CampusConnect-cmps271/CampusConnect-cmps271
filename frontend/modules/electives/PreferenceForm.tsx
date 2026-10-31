"use client";
import { useActionState, useState } from "react";
import { updatePreferences } from "./actions";
import { preferenceValues, type ElectivePreferences, type PreferenceValues } from "./schema";
import styles from "./electives.module.css";

export function PreferenceForm({ initial }: { initial: ElectivePreferences | null }) {
  const [state, action, pending] = useActionState(updatePreferences, { status: "idle" }, "/electives/preferences");
  // A native form submission can render the returned draft before hydration.
  const [values, setValues] = useState(() => state.values ?? preferenceValues(initial));
  const field = (key: keyof PreferenceValues) => ({ id: key, name: key, value: values[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setValues(previous => ({ ...previous, [key]: value }));
    },
    "aria-invalid": Boolean(state.errors?.[key]), "aria-describedby": `${key}-hint ${key}-error`, disabled: pending });
  const errors = (key: keyof PreferenceValues) => <p id={`${key}-error`} className={styles.error}>{state.errors?.[key]?.join(" ")}</p>;
  return <form action={action} className={styles.form}>
    <div><label htmlFor="interests">Interests</label>
      <p id="interests-hint">Up to 10 interests, separated by commas; 60 characters each.</p>
      <input {...field("interests")} required maxLength={620} autoComplete="off" />{errors("interests")}</div>
    <div><label htmlFor="preferred_workload">Preferred workload</label>
      <p id="preferred_workload-hint">Choose the workload that fits your semester.</p>
      <select {...field("preferred_workload")}><option value="light">Light</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option></select>{errors("preferred_workload")}</div>
    <div><label htmlFor="academic_goals">Academic goals</label>
      <p id="academic_goals-hint">What would you like to learn? Up to 1,000 characters.</p>
      <textarea {...field("academic_goals")} required maxLength={1000} rows={4} />{errors("academic_goals")}</div>
    <div><label htmlFor="completed_course_codes">Completed course codes (self-reported)</label>
      <p id="completed_course_codes-hint">Optional. Use catalogue codes separated by commas (up to 60). These are not verified academic records.</p>
      <input {...field("completed_course_codes")} maxLength={2040} autoComplete="off" />{errors("completed_course_codes")}</div>
    {state.status === "error" && <p role="alert" className={styles.error}>{state.message ?? "Please check the highlighted fields. Your draft has been kept."}</p>}
    {state.status === "saved" && <p role="status">{state.message}</p>}
    <button disabled={pending} type="submit">{pending ? "Saving…" : "Save preferences"}</button>
  </form>;
}
