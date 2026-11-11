"use client";
import { useActionState, useState } from "react";
import { updatePreferences } from "./actions";
import { MEETING_DAYS, preferenceValues, type ElectivePreferences, type PreferenceValues } from "./schema";
import type { OfferingOptions } from "./offering-options";
import styles from "./electives.module.css";

export function PreferenceForm({ initial, offeringOptions = { semesters: [], instructors: {}, attributes: {} } }: { initial: ElectivePreferences | null; offeringOptions?: OfferingOptions }) {
  const [state, action, pending] = useActionState(updatePreferences, { status: "idle" }, "/electives/preferences");
  // A native form submission can render the returned draft before hydration.
  const [values, setValues] = useState(() => state.values ?? preferenceValues(initial));
  const errorKey = (key: keyof PreferenceValues): keyof ElectivePreferences => ["semester_id", "instructors", "attributes", "earliest_start", "latest_end", "meeting_days"].includes(key) ? "offering_preferences" : key as keyof ElectivePreferences;
  const field = (key: keyof PreferenceValues) => ({ id: key, name: key, value: values[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setValues(previous => key === "semester_id" && !value
        ? { ...previous, semester_id: "", instructors: "", attributes: "", meeting_days: "", earliest_start: "", latest_end: "" }
        : { ...previous, [key]: value });
    },
    "aria-invalid": Boolean(state.errors?.[errorKey(key)]), "aria-describedby": `${key}-hint ${errorKey(key)}-error`, disabled: pending });
  const errors = (key: keyof ElectivePreferences) => <p id={`${key}-error`} className={styles.error}>{state.errors?.[key]?.join(" ")}</p>;
  return <form action={action} className={styles.form}>
    <fieldset className={styles.offeringPreferences} aria-describedby="offering-preferences-hint offering_preferences-error">
      <legend>Semester and class preferences</legend>
      <p id="offering-preferences-hint">Optional. Find electives with at least one section that meets all your choices. Course offerings provided by <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>.</p>
      {offeringOptions.unavailable && <p role="status">Semester options are temporarily unavailable. Reload to try again.</p>}
      <div><label htmlFor="semester_id">Semester</label>
        <p id="semester_id-hint">Only courses listed for this semester will be recommended.</p>
        <select {...field("semester_id")}>
          <option value="">All catalogue courses</option>
          {values.semester_id && !offeringOptions.semesters.some(s => s.id === values.semester_id) && <option value={values.semester_id}>Saved semester {values.semester_id} (unavailable)</option>}
          {offeringOptions.semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <fieldset disabled={pending || !values.semester_id} className={styles.offeringFields}>
        <legend>Section requirements</legend>
        <p>Choose a semester to enable these filters. Leave any field empty for no restriction.</p>
        <div><label htmlFor="instructors">Instructors</label>
          <p id="instructors-hint">Match any listed instructor. Enter up to 10 names, separated by commas; suggestions come from the selected semester.</p>
          <input {...field("instructors")} list="elective-instructors" maxLength={3020} autoComplete="off" />
          <datalist id="elective-instructors">{(offeringOptions.instructors[values.semester_id ?? ""] ?? []).map(name => <option key={name} value={name} />)}</datalist>
        </div>
        <div><label htmlFor="attributes">Required course attributes</label>
          <p id="attributes-hint">Attributes are AUB course classifications. Choose from the semester suggestions or enter up to 10, separated by commas. Each recommended section must have every attribute you enter.</p>
          <input {...field("attributes")} list="elective-attributes" maxLength={3020} autoComplete="off" />
          <datalist id="elective-attributes">{(offeringOptions.attributes[values.semester_id ?? ""] ?? []).map(name => <option key={name} value={name} />)}</datalist>
        </div>
        <fieldset className={styles.dayChoices}><legend>Allowed meeting days</legend>
          <p>Leave all unchecked for any day. Every listed meeting must fit your selected days.</p>
          <div>{MEETING_DAYS.map(day => <label key={day.value}><input type="checkbox" name="meeting_days" value={day.value}
            checked={(values.meeting_days ?? "").split(",").includes(day.value)} onChange={event => {
              const selected = new Set((values.meeting_days ?? "").split(",").filter(Boolean));
              if (event.target.checked) selected.add(day.value); else selected.delete(day.value);
              setValues(previous => ({ ...previous, meeting_days: [...selected].join(",") }));
            }} />{day.label}</label>)}</div>
        </fieldset>
        <div className={styles.timeChoices}>
          <div><label htmlFor="earliest_start">Earliest class start</label><p id="earliest_start-hint">Optional, using AUB SIS meeting times.</p><input {...field("earliest_start")} type="time" /></div>
          <div><label htmlFor="latest_end">Latest class end</label><p id="latest_end-hint">All meetings must finish by this time.</p><input {...field("latest_end")} type="time" /></div>
        </div>
        <p>Sections with unlisted days or times cannot match the corresponding schedule filter. Prerequisite and registration checks remain advisory.</p>
      </fieldset>
      {errors("offering_preferences")}
    </fieldset>
    <div><label htmlFor="interests">Interests</label>
      <p id="interests-hint">Up to 10 interests, separated by commas; 60 characters each. Words within one interest are matched together: software security, cryptography means software AND security, OR cryptography.</p>
      <input {...field("interests")} required maxLength={620} autoComplete="off" />{errors("interests")}</div>
    <div><label htmlFor="preferred_workload">Preferred workload</label>
      <p id="preferred_workload-hint">Choose the workload that fits your semester.</p>
      <select {...field("preferred_workload")}><option value="light">Light</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option></select>{errors("preferred_workload")}</div>
    <div><label htmlFor="academic_goals">Academic goals</label>
      <p id="academic_goals-hint">What would you like to learn? Separate goals with commas; words within each goal are matched together for an extra ranking bonus. Up to 1,000 characters.</p>
      <textarea {...field("academic_goals")} required maxLength={1000} rows={4} />{errors("academic_goals")}</div>
    <div><label htmlFor="completed_course_codes">Completed course codes (self-reported)</label>
      <p id="completed_course_codes-hint">Optional. Use catalogue codes separated by commas (up to 60). These are not verified academic records.</p>
      <input {...field("completed_course_codes")} maxLength={2040} autoComplete="off" />{errors("completed_course_codes")}</div>
    {state.status === "error" && <p role="alert" className={styles.error}>{state.message ?? "Please check the highlighted fields. Your draft has been kept."}</p>}
    {state.status === "saved" && <p role="status">{state.message}</p>}
    <button disabled={pending} type="submit">{pending ? "Saving…" : "Save preferences"}</button>
  </form>;
}
