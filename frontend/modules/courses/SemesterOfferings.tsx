import { getSemesterOfferings } from "./semesters";
import styles from "./courses.module.css";

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Beirut" }).format(new Date(value));
}
const DAY_NAMES: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };
function meetingDays(value: string) {
  const days = value.replace(/\s/g, "");
  return /^[MTWRFSU]+$/.test(days) ? [...days].map((day) => DAY_NAMES[day]).join(" · ") : value || "Days TBA";
}
export async function SemesterOfferings({ courseId, semester }: { courseId: string; semester?: string }) {
  const offerings = await getSemesterOfferings(courseId, semester);
  return <section className={styles.detailPanel} aria-labelledby="semester-offerings-title">
    <h2 id="semester-offerings-title">Semester offerings</h2>
    <p>Course and section data provided by <a href="https://resis.org/" target="_blank" rel="noreferrer">Resis</a>. Registration rules below belong to each section; catalogue requirements may include additional grade conditions.</p>
    {offerings === null ? <p role="status">Semester details are temporarily unavailable.</p>
      : offerings.length === 0 ? <p>No imported offering is available{semester ? " for the selected semester" : " for this course"}. This does not establish whether AUB offers the course.</p>
      : offerings.map((offering) => <article key={offering.semester_id} className={styles.semesterOffering}>
        <div className={styles.offeringHeader}>
          <h3>{offering.semester_name}</h3>
          <span className={styles.sectionCount}>{offering.sections.length} {offering.sections.length === 1 ? "section" : "sections"}</span>
        </div>
        <p className={styles.offeringAttributes}><strong>Attributes:</strong> {offering.attributes.join(", ") || "Not listed"}</p>
        <p className={styles.detailHint}>Imported {date(offering.synced_at)} (Beirut time). Individual sections may have older source updates.</p>
        <div className={styles.sectionList}>
          {offering.sections.map((section) => <details key={section.crn} className={styles.sectionDetails}>
            <summary className={styles.sectionSummary}>
              <span className={styles.sectionCardHeader}>
                <span className={styles.sectionNumber}>Section {section.section}</span>
                <span className={styles.sectionCrn}>CRN {section.crn}</span>
              </span>
              <span className={styles.sectionInstructor}><strong>Instructor:</strong> {section.instructors.join(", ") || "TBA"}</span>
              <span className={styles.sectionAttributes}><strong>Attributes:</strong> {section.attributes.join(", ") || "Not listed"}</span>
              <span className={styles.sectionMeetings}>
                {section.sessions.length ? section.sessions.map((session, index) => <span key={index} className={styles.meetingSlot}>
                  <span className={styles.meetingType}>{session.type || "Meeting"}</span>
                  <span className={styles.meetingDays}>{meetingDays(session.days)}</span>
                  <span className={styles.meetingTime}>{session.start || "TBA"}–{session.end || "TBA"}</span>
                  <span className={styles.meetingLocation}>{session.location || "Location TBA"}</span>
                  {session.instructor && <span className={styles.meetingLocation}><strong>Meeting instructor:</strong> {session.instructor}</span>}
                </span>) : <span className={styles.meetingSlot}><span className={styles.meetingTime}>Time TBA</span><span className={styles.meetingLocation}>Meeting details have not been listed.</span></span>}
              </span>
              <span className={styles.sectionExpand}><span className={styles.collapsedLabel}>View section details +</span><span className={styles.expandedLabel}>Hide section details −</span></span>
            </summary>
            <div className={styles.sectionBody}>
              <p><strong>Section title:</strong> {section.title}</p>
              <p><strong>Credits:</strong> {section.credits}</p>
              <p><strong>Registration prerequisites:</strong> {section.prerequisites || "No textual prerequisite rule was supplied by Resis. Verify requirements in AUB SIS."}</p>
              {section.restrictions && Object.keys(section.restrictions).length > 0 && <div>
                <strong>Registration restrictions</strong>
                {Object.entries(section.restrictions).map(([label, value]) => <p key={label}>{label} {Array.isArray(value) ? value.join(", ") : typeof value === "string" ? value : JSON.stringify(value)}</p>)}
              </div>}
              {section.source_updated_at && <p className={styles.detailHint}>Source updated {date(section.source_updated_at)} (Beirut time).</p>}
              {section.details_url && <a href={section.details_url} target="_blank" rel="noreferrer">Verify section in AUB SIS ↗</a>}
            </div>
          </details>)}
        </div>
      </article>)}
  </section>;
}
