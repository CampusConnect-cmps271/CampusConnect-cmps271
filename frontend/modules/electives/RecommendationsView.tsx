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
      const response = await fetch("/api/electives/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences), signal: AbortSignal.timeout(30000) });
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
    <p>Each result matches all words from at least one comma-separated interest. Up to 20 matching courses are shown.</p>
    {preferences.offering_preferences?.semester_id && <p className={styles.offeringNotice}>Showing only the selected semester and sections that match your saved class preferences. Course offerings provided by <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>. Verify current registration details in AUB SIS.</p>}
    <button disabled={pending} onClick={generate}>{pending ? "Finding electives…" : "Get recommendations"}</button>
    {pending && <p role="status">Finding electives that match your preferences…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {result && <div aria-live="polite">
      <p role="status">{result.recommendations.length} {result.recommendations.length === 1 ? "recommendation" : "recommendations"} found.</p>
      {result.mode === "provider" && <p className={styles.muted}>AI-assisted explanations for catalogue-matched courses.</p>}
      {result.mode === "baseline" && result.providerStatus !== "not_needed" && <p className={styles.muted}>{result.providerStatus === "failed" ? "AI assistance is temporarily unavailable." : "AI assistance is not configured."} Showing catalogue-based recommendations.</p>}
      <p className={styles.muted}>{preferences.offering_preferences?.semester_id ? "Considered" : "Searched"} {result.catalogueCount.toLocaleString()} {result.catalogueCount === 1 ? "course" : "courses"} across all departments{preferences.offering_preferences?.semester_id ? " after applying your semester and section filters" : ""}.</p>
      {result.studentMajor ? <p>Major from your profile: <strong>{result.studentMajor}</strong>. Department checks are advisory.</p>
        : <p>{result.majorStatus === "unavailable" ? "Your major could not be loaded. Major-specific restrictions have not been checked." : "Add your major in Profile for major-specific department checks."} <Link href="/profile">Open Profile</Link></p>}
      {!result.recommendations.length && <p>No available courses match a complete interest group. Try different interests or browse the course catalogue.</p>}
      {result.recommendations.map(course => <article key={course.course_id} className={styles.card}>
        <h2><Link href={`/courses/${encodeURIComponent(course.code.replace(/ /g, "-"))}${course.offering ? `?semester=${course.offering.semester_id}` : ""}`}>{course.code} · {course.name}</Link></h2>
        <p className={styles.muted}>Department: {course.department}</p>
        {course.registration.status !== "unverified" && <aside aria-label={`Registration check for ${course.code}`} className={styles.registration}>
          <strong>{course.registration.status === "restricted" ? "Catalogue restriction" : "Department approval check"}</strong>
          <p>{course.registration.message}</p>
          {course.registration.evidence && <blockquote>Catalogue: “{course.registration.evidence}”</blockquote>}
        </aside>}
        <p>{course.rationale}</p><p><strong>Prerequisites: {course.prerequisite_status}</strong></p>
        <p>{course.prerequisites || "No prerequisite details supplied by the catalogue."}</p>
        {course.offering && <section aria-label={`Matching sections for ${course.code}`} className={styles.matchingOffering}>
          <h3>{course.offering.semester_name} · {course.offering.sections.length} matching {course.offering.sections.length === 1 ? "section" : "sections"}</h3>
          <p className={styles.muted}>Saved offering data; verify current registration details in AUB SIS. Catalogue grade requirements above still apply.</p>
          <div className={styles.matchingSections}>{course.offering.sections.map(section => <div key={section.crn} className={styles.matchingSection}>
            <strong>Section {section.section}</strong><span className={styles.muted}>CRN {section.crn}</span>
            <p><strong>Instructor:</strong> {section.instructors.join(", ") || "TBA"}</p>
            <p><strong>Attributes:</strong> {section.attributes.join(", ") || "Not listed"}</p>
            {section.sessions.length ? section.sessions.map((meeting, index) => <p key={index}><strong>{meeting.days || "Days TBA"} · {meeting.start || "TBA"}–{meeting.end || "TBA"}</strong><br />{meeting.location || "Location TBA"}{meeting.instructor && <><br /><strong>Meeting instructor:</strong> {meeting.instructor}</>}</p>) : <p>Meeting time TBA</p>}
            <p><strong>Section prerequisites:</strong> {section.prerequisites || "Not supplied; verify in AUB SIS."}</p>
          </div>)}</div>
        </section>}
        <p>{course.review_count === null ? "Review count unavailable" : `${course.review_count} published reviews${course.review_count < 3 ? " · limited evidence" : ""}`}</p>
        <EvidenceView courseId={course.course_id} code={course.code} />
      </article>)}
    </div>}
  </section>;
}
