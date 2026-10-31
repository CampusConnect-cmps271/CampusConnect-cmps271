"use client";
import { useState } from "react";
import Link from "next/link";
import type { EvidenceSample } from "./evidence";
import type { ReviewAnalysis, AnalysisStage } from "./analysis";
import styles from "./electives.module.css";

export function EvidenceView({ courseId, code }: { courseId: string; code: string }) {
  const [data, setData] = useState<{ sample: EvidenceSample; analysis: ReviewAnalysis } | null>(null);
  const [pending, setPending] = useState(false), [error, setError] = useState("");
  const sourceLink = (id: string) => `/courses/${encodeURIComponent(code.replace(/ /g, "-"))}#review-${id}`;
  async function load() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/electives/analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ course_id: courseId }), signal: AbortSignal.timeout(20000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Review evidence is unavailable."); setData(result);
    } catch { setError("Review evidence is temporarily unavailable. Your recommendations are still available."); }
    finally { setPending(false); }
  }
  const stage = (title: string, value: AnalysisStage) => <section>
    <h4 className="font-bold">{title}</h4><p>{value.summary}</p><p><strong>Uncertainty:</strong> {value.uncertainty}</p>
    {value.claims.map((claim, index) => <blockquote key={`${claim.review_id}-${index}`} className={styles.evidence}>
      <p>“{claim.quote}”</p><p>{claim.observation}</p><Link href={sourceLink(claim.review_id)}>Read cited review</Link>
    </blockquote>)}
  </section>;
  return <section aria-label={`Review evidence for ${code}`}>
    <button onClick={load} disabled={pending}>{pending ? "Loading evidence…" : data ? "Refresh review evidence" : "Explore review evidence"}</button>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {pending && <p role="status">Loading published reviews…</p>}
    {data && <div>
      <h3 className="font-bold mt-4">Published review evidence</h3>
      <p>{data.sample.sampled} reviews sampled from {data.sample.total} published reviews. {data.sample.truncated ? "Showing the 24 most recent reviews; this sample may not represent all students." : ""}</p>
      <p>By overall rating: {data.sample.positive} positive (4–5), {data.sample.mixed} mixed (3), {data.sample.negative} negative (1–2).</p>
      {!data.sample.sampled && <p>No published reviews are available for this course.</p>}
      {data.analysis.status === "unavailable" && <p>{data.analysis.reason === "insufficient_reviews" ? "Too few reviews for a balanced analysis." : data.analysis.reason === "unconfigured" ? "AI analysis is not configured. You can inspect the source evidence below." : "AI analysis could not be verified. You can inspect the source evidence below."}</p>}
      {data.analysis.status === "available" && <div>{stage("Defender · benefits", data.analysis.defender)}{stage("Prosecutor · drawbacks", data.analysis.prosecutor)}{stage("Judge · balanced assessment", data.analysis.judge)}</div>}
      <details><summary>Source review excerpts (up to 1,500 characters each)</summary>
        {data.sample.reviews.map(review => <blockquote key={review.id} className={styles.evidence}><p>{review.body}</p><p>Overall {review.overall_rating}/5 · Workload {review.workload_rating}/5</p><Link href={sourceLink(review.id)}>Read source review</Link></blockquote>)}
      </details>
    </div>}
  </section>;
}
