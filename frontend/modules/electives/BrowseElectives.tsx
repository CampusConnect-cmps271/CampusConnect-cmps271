"use client";
import { useEffect, useRef, useState } from "react";
import { AttributePicker } from "./AttributePicker";
import { RecommendationsView } from "./RecommendationsView";
import type { OfferingOptions } from "./offering-options";
import type { RecommendationResult } from "./recommendations";
import type { ElectivePreferences } from "./schema";
import styles from "./electives.module.css";

export function BrowseElectives({ options }: { options: OfferingOptions }) {
  const [semester, setSemester] = useState("");
  const [attributes, setAttributes] = useState<string[]>([]);
  const [match, setMatch] = useState<"any" | "all">("any");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ data: RecommendationResult; preferences: ElectivePreferences; id: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const reset = () => { setResult(null); setError(""); };
  async function browse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !semester) return;
    const controller = new AbortController();
    request.current?.abort(); request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    const preferences: ElectivePreferences = { interests: [], academic_goals: "", preferred_workload: "moderate", completed_course_codes: [],
      offering_preferences: { semester_id: semester, attributes, attribute_match: match } };
    setPending(true); reset();
    try {
      const response = await fetch("/api/electives/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Courses are temporarily unavailable.");
      setResult({ data, preferences, id: Date.now() });
    } catch (error) {
      setError(controller.signal.aborted ? "Finding courses took too long. Please try again." : error instanceof Error ? error.message : "Courses are temporarily unavailable.");
    } finally { clearTimeout(timeout); setPending(false); }
  }
  return <section aria-label="Browse electives by attribute">
    <p>Choose a semester and the attributes you need. See matching courses here.</p>
    {options.unavailable && <p role="alert">Course filters are temporarily unavailable. Reload to try again.</p>}
    <form onSubmit={browse} className={styles.form}>
      <fieldset disabled={pending || options.unavailable} className={styles.browseControls}>
        <label htmlFor="browse-semester">Browse semester</label>
        <select id="browse-semester" required value={semester} onChange={event => { setSemester(event.target.value); setAttributes([]); reset(); }}>
          <option value="">Choose a semester</option>
          {options.semesters.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
        </select>
        {semester && <>
          <AttributePicker key={semester} options={options.attributes[semester] ?? []} selected={attributes} onChange={values => { setAttributes(values); reset(); }} />
          {attributes.length > 1 && <div className={styles.matchMode}><label htmlFor="attribute-match">Match courses with</label>
            <select id="attribute-match" value={match} onChange={event => { setMatch(event.target.value as "any" | "all"); reset(); }}>
              <option value="any">Any selected attribute (I or II)</option>
              <option value="all">All selected attributes on the same section</option>
            </select></div>}
          <p>{attributes.length ? `${attributes.length} selected · ${match === "any" ? "Match any" : "Match all"}` : "No attribute selected: show every course in this semester."}</p>
        </>}
        <button type="submit" disabled={!semester || pending}>{pending ? "Finding courses…" : "Show courses"}</button>
      </fieldset>
    </form>
    {pending && <p role="status">Finding matching courses…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <RecommendationsView key={result.id} preferences={result.preferences} initialResult={result.data} embedded />}
  </section>;
}
