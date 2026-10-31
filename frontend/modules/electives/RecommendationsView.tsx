"use client";
import Link from "next/link";
import { useState } from "react";
import type { ElectivePreferences } from "./schema";
import type { RecommendationResult } from "./recommendations";
import styles from "./electives.module.css";
import { EvidenceView } from "./EvidenceView";

export function RecommendationsView({ preferences }: { preferences: ElectivePreferences | null }) {
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function generate() {
    setPending(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/electives/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences), signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Recommendations are unavailable.");
      setResult(data);
    } catch (error) { setError(error instanceof Error && error.name !== "TimeoutError" ? error.message : "Recommendations took too long. Please try again."); }
    finally { setPending(false); }
  }
  if (!preferences) return <section className={styles.card}><h2>Start with your preferences</h2><p>Save your interests, workload and goals to get recommendations.</p><Link href="/electives/preferences">Set elective preferences</Link></section>;
  return <section aria-label="Personalized elective recommendations">
    <p><Link href="/electives/preferences">Edit your preferences</Link></p>
    <p>Recommendations are guidance. Verify prerequisites and registration eligibility with your adviser; completed courses are self-reported.</p>
    <button disabled={pending} onClick={generate}>{pending ? "Finding electives…" : "Get recommendations"}</button>
    {pending && <p role="status">Finding electives that match your preferences…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <div aria-live="polite">
      <p role="status">{result.recommendations.length} recommendations found.</p>
      {result.mode === "baseline" && <p className={styles.muted}>{result.providerStatus === "failed" ? "AI assistance is temporarily unavailable." : "AI assistance is not configured."} Showing catalogue-based recommendations.</p>}
      <p className={styles.muted}>Searched {result.catalogueCount.toLocaleString()} courses across all departments.</p>
      {result.studentMajor ? <p>Major from your profile: <strong>{result.studentMajor}</strong>. Department checks are advisory.</p>
        : <p>{result.majorStatus === "unavailable" ? "Your major could not be loaded. Major-specific restrictions have not been checked." : "Add your major in Profile for major-specific department checks."} <Link href="/profile">Open Profile</Link></p>}
      {!result.recommendations.length && <p>No catalogue candidates remain to suggest. Try updating your preferences or browse the course catalogue.</p>}
      {result.recommendations.map(course => <article key={course.course_id} className={styles.card}>
        <h2><Link href={`/courses/${encodeURIComponent(course.code.replace(/ /g, "-"))}`}>{course.code} · {course.name}</Link></h2>
        <p className={styles.muted}>Department: {course.department}</p>
        {course.registration.status !== "unverified" && <aside aria-label={`Registration check for ${course.code}`} className={styles.registration}>
          <strong>{course.registration.status === "restricted" ? "Catalogue restriction" : "Department approval check"}</strong>
          <p>{course.registration.message}</p>
          {course.registration.evidence && <blockquote>Catalogue: “{course.registration.evidence}”</blockquote>}
        </aside>}
        <p>{course.rationale}</p><p><strong>Prerequisites: {course.prerequisite_status}</strong></p>
        <p>{course.prerequisites || "No prerequisite details supplied by the catalogue."}</p>
        <p>{course.review_count === null ? "Review count unavailable" : `${course.review_count} published reviews${course.review_count < 3 ? " · limited evidence" : ""}`}</p>
        <EvidenceView courseId={course.course_id} code={course.code} />
      </article>)}
    </div>}
  </section>;
}
