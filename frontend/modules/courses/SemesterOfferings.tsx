import { getSemesterOfferings } from "./semesters";
import styles from "./courses.module.css";

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(value));
}
export async function SemesterOfferings({ courseId, semester }: { courseId: string; semester?: string }) {
  const offerings = await getSemesterOfferings(courseId, semester);
  return <section className={styles.detailPanel} aria-labelledby="semester-offerings-title">
    <h2 id="semester-offerings-title">Semester offerings</h2>
    <p>Course and section data provided by <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>. Registration rules below belong to each section; catalogue requirements may include additional grade conditions.</p>
    {offerings === null ? <p role="status">Semester details are temporarily unavailable.</p>
      : offerings.length === 0 ? <p>No imported offering is available{semester ? " for the selected semester" : " for this course"}. This does not establish whether AUB offers the course.</p>
      : offerings.map((offering) => <article key={offering.semester_id} className={styles.semesterOffering}>
        <h3>{offering.semester_name}</h3>
        <p><strong>Instructors:</strong> {offering.instructors.join(", ") || "Not listed"}</p>
        <p><strong>Attributes:</strong> {offering.attributes.join(", ") || "Not listed"}</p>
        <p className={styles.detailHint}>Imported {date(offering.synced_at)} (Beirut time). Individual sections may have older source updates.</p>
        <div className={styles.sectionList}>
          {offering.sections.map((section) => <details key={section.crn} className={styles.sectionDetails}>
            <summary>Section {section.section} · CRN {section.crn} · {section.instructors.join(", ") || "Instructor not listed"}</summary>
            <p><strong>Section title:</strong> {section.title}</p>
            <p><strong>Credits:</strong> {section.credits}</p>
            <p><strong>Attributes:</strong> {section.attributes.join(", ") || "Not listed"}</p>
            <p><strong>Registration prerequisites:</strong> {section.prerequisites || "No textual prerequisite rule was supplied by Resis. Verify requirements in AUB SIS."}</p>
            {section.restrictions && Object.keys(section.restrictions).length > 0 && <div>
              <strong>Registration restrictions</strong>
              {Object.entries(section.restrictions).map(([label, value]) => <p key={label}>{label} {Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : JSON.stringify(value)}</p>)}
            </div>}
            {section.sessions.map((session, index) => <p key={index}>{session.type || "Meeting"}: {session.days || "Days TBA"} · {session.start || "TBA"}–{session.end || "TBA"} · {session.location || "Location TBA"}{session.instructor ? ` · ${session.instructor}` : ""}</p>)}
            {section.source_updated_at && <p className={styles.detailHint}>Source updated {date(section.source_updated_at)} (Beirut time).</p>}
            {section.details_url && <a href={section.details_url} target="_blank" rel="noreferrer">Verify section in AUB SIS ↗</a>}
          </details>)}
        </div>
      </article>)}
  </section>;
}
