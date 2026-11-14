import type { CourseSection } from "./semesters";
export function meetingDuration(start: string, end: string) {
  if (![start,end].every(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
  const minutes = (time: string) => Number(time.slice(0,2))*60+Number(time.slice(3));
  const duration = minutes(end)-minutes(start);
  return duration > 0 ? duration : null;
}
export function SectionConnections({ section }: { section: CourseSection }) {
  const kinds = [...new Set(section.sessions.map(meeting => meeting.type).filter(Boolean))];
  return <>
    {/^(E\d+|L\d+|R\d+)$/i.test(section.section) && <p><strong>Component {section.section}:</strong> {kinds.join(" / ") || "Type not listed"}. Verify whether this component is required with your lecture.</p>}
    {!!section.connected_crns?.length && <aside aria-label={`Linked sections for CRN ${section.crn}`}><strong>Linked CRNs:</strong> {section.connected_crns.join(", ")}.{!!section.connected_labels?.length && <p>{section.connected_labels.join("; ")}</p>} Resis lists these section connections. Verify which combination to register in AUB SIS; a linked meeting may fall outside your selected days or times.</aside>}
  </>;
}
