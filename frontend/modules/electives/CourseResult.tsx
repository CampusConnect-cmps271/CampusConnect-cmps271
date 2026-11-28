"use client";
import Link from "next/link";
import { useState } from "react";
import type { Recommendation } from "./types";
import { SectionConnections, meetingDuration } from "@/modules/courses/SectionConnections";
import { EvidenceView } from "./EvidenceView";
import styles from "./electives.module.css";

export function CourseResult({ course, compact = false }: { course: Recommendation; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const content = () => <article className={styles.card}>
        <h2><Link href={`/courses/${encodeURIComponent(course.code.replace(/ /g, "-"))}${course.offering ? `?semester=${course.offering.semester_id}` : ""}`}>{course.code} · {course.name}</Link></h2>
        <p className={styles.muted}>Department: {course.department}</p>
        {course.registration.status !== "unverified" && <aside aria-label={`Registration check for ${course.code}`} className={styles.registration}>
          <strong>{course.registration.status === "restricted" ? "Catalogue restriction" : "Department approval check"}</strong>
          <p>{course.registration.message}</p>
          {course.registration.evidence && <blockquote>Catalogue: “{course.registration.evidence}”</blockquote>}
        </aside>}
        <p>{course.description || "No course description supplied by the catalogue."}</p>
        <p>{course.rationale}</p><p><strong>Prerequisites: {course.prerequisite_status}</strong></p>
        <p>{course.prerequisites || "No prerequisite details supplied by the catalogue."}</p>
        {course.offering && <section aria-label={`Matching sections for ${course.code}`} className={styles.matchingOffering}>
          <h3>{course.offering.semester_name} · {course.offering.sections.length} matching {course.offering.sections.length === 1 ? "section" : "sections"}</h3>
          <p className={styles.muted}>Saved offering data; verify current registration details in AUB SIS. Catalogue grade requirements above still apply.</p>
          <div className={styles.matchingSections}>{course.offering.sections.map(section => <div key={section.crn} className={styles.matchingSection}>
            <strong>Section {section.section}</strong><SectionConnections section={section} /><span className={styles.muted}>CRN {section.crn}</span>
            <p><strong>Instructor:</strong> {section.instructors.join(", ") || "TBA"}</p>
            <p><strong>Attributes:</strong> {section.attributes.join(", ") || "Not listed"}</p>
            {section.sessions.length ? section.sessions.map((meeting, index) => <p key={index}><strong>{meeting.days || "Days TBA"} · {meeting.start || "TBA"}–{meeting.end || "TBA"}{meetingDuration(meeting.start, meeting.end) && ` · ${meetingDuration(meeting.start, meeting.end)} min`}</strong><br />{meeting.location || "Location TBA"}{meeting.instructor && <><br /><strong>Meeting instructor:</strong> {meeting.instructor}</>}</p>) : <p>Meeting time TBA</p>}
            <p><strong>Section prerequisite / co-requisite text:</strong> {section.prerequisites || "Not supplied; verify in AUB SIS."}</p>
          </div>)}</div>
        </section>}
        <p>{course.review_count === null ? "Review count unavailable" : `${course.review_count} published reviews${course.review_count < 3 ? " · limited evidence" : ""}`}</p>
        <EvidenceView courseId={course.course_id} code={course.code} />

    {course.offering && <Link className={styles.scheduleButton} href={`/electives/schedule?course=${encodeURIComponent(course.course_id)}&semester=${encodeURIComponent(course.offering.semester_id)}`}>Add to schedule</Link>}
  </article>;
  if (!compact) return content();
  return <details className={styles.courseRow} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><strong>{course.code}</strong><span>{course.name}</span><span className={styles.rowHint}>Details</span></summary>
    {open && content()}
  </details>;
}
