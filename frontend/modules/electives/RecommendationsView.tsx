"use client";
import Link from "next/link";
import { useState } from "react";
import type { ElectivePreferences } from "./schema";
import type { RecommendationResult } from "./recommendations";
import styles from "./electives.module.css";
import { preferenceGroups } from "./preference-matching";
import { CourseResult } from "./CourseResult";

export function RecommendationsView({ preferences, initialResult = null, embedded = false }: { preferences: ElectivePreferences | null; initialResult?: RecommendationResult | null; embedded?: boolean }) {
  const [result, setResult] = useState<RecommendationResult | null>(initialResult);
  const [visible, setVisible] = useState(24);
  const browsing = Boolean(preferences?.offering_preferences?.semester_id) && !preferenceGroups(preferences?.interests ?? []).length;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setPending(true); setError(""); setResult(null); setVisible(24);
    try {
      const response = await fetch("/api/electives/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences), signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Recommendations are unavailable.");
      setResult(data);
    } catch (error) { setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Recommendations took too long. Please try again."); }
    finally { setPending(false); }
  }
  if (!preferences) return <section className={styles.card}><h2>Start with your preferences</h2><p>Choose a semester and filters to browse courses, or add interests for personalized recommendations.</p><Link href="/electives/preferences">Set elective preferences</Link></section>;
  return <section aria-label={embedded ? "Matching elective courses" : "Personalized elective recommendations"}>
    {!embedded && <p><Link href="/electives/preferences">Edit your preferences</Link></p>}
    {!embedded && <>
    <p>Recommendations are guidance. Verify prerequisites and registration eligibility with your adviser; completed courses are self-reported.</p>
    <p>{browsing ? "Browse all courses matching your selected semester and section filters. Results are shown 24 at a time; no 20-course limit applies." : "Each result matches all words from at least one comma-separated interest. Up to 20 matching courses are shown."}</p>
    {preferences.offering_preferences?.semester_id && <p className={styles.offeringNotice}>Showing only the selected semester and sections that match your selected filters. Course offerings provided by <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>. Verify current registration details in AUB SIS.</p>}
    </>}
    {!embedded && <button disabled={pending} onClick={generate}>{pending ? "Finding electives…" : browsing ? "Browse matching courses" : "Get recommendations"}</button>}
    {pending && <p role="status">Finding electives that match your preferences…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <div aria-live="polite">
      <p role="status">{result.recommendations.length} {browsing ? (result.recommendations.length === 1 ? "matching course" : "matching courses") : (result.recommendations.length === 1 ? "recommendation" : "recommendations")} found.</p>
      {result.mode === "provider" && <p className={styles.muted}>AI-assisted explanations for catalogue-matched courses.</p>}
      {result.mode === "baseline" && result.providerStatus !== "not_needed" && <p className={styles.muted}>{result.providerStatus === "failed" ? "AI assistance is temporarily unavailable." : "AI assistance is not configured."} Showing catalogue-based recommendations.</p>}
      {embedded && <p className={styles.muted}>Showing matching sections from <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>. Verify prerequisites and registration details in AUB SIS.</p>}
      {!embedded && <>
      <p className={styles.muted}>{preferences.offering_preferences?.semester_id ? "Considered" : "Searched"} {result.catalogueCount.toLocaleString()} {result.catalogueCount === 1 ? "course" : "courses"} across all departments{preferences.offering_preferences?.semester_id ? " after applying your semester and section filters" : ""}.</p>
      {result.studentMajor ? <p>Major from your profile: <strong>{result.studentMajor}</strong>. Department checks are advisory.</p>
        : <p>{result.majorStatus === "unavailable" ? "Your major could not be loaded. Major-specific restrictions have not been checked." : "Add your major in Profile for major-specific department checks."} <Link href="/profile">Open Profile</Link></p>}
      </>}
      {!result.recommendations.length && <p>{browsing ? "No available courses match your semester and section filters. Try another attribute or schedule." : "No available courses match a complete interest group. Try different interests or browse the course catalogue."}</p>}
      {result.recommendations.slice(0,visible).map(course => <CourseResult key={course.course_id} course={course} compact={embedded} />)}
      {visible < result.recommendations.length && <button type="button" onClick={() => setVisible(count => count+24)}>Show more courses ({result.recommendations.length-visible} remaining)</button>}
    </div>}
  </section>;
}
