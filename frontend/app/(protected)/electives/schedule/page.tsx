import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/modules/auth";
import { getScheduleCourse } from "@/modules/electives/schedule";
import { ScheduleElectiveForm } from "@/modules/electives/ScheduleElectiveForm";
import { listMyPlans } from "@/modules/planner/queries";
import { NewPlanForm } from "@/modules/planner/components/NewPlanForm";
import { OFFICIAL_TERMS, resisSemesterName } from "@/modules/planner/terms";
import styles from "@/modules/electives/electives.module.css";

export const metadata = {title:"Add elective to schedule · CampusConnect"};
export default async function ScheduleElectivePage({searchParams}: {searchParams:Promise<{course?:string;semester?:string}>}) {
  await requireUser();
  const params = await searchParams;
  const course = await getScheduleCourse(params.course ?? "", params.semester ?? "");
  if (!course) notFound();
  const plans = await listMyPlans();
  const matching = plans.filter(plan => plan.semester?.id === course.semester_id);
  const terms = OFFICIAL_TERMS.filter(term => resisSemesterName(term.term) === course.semester_name && !plans.some(plan => plan.term === term.term));
  return <AppShell><main className={styles.page}>
    <Link href="/electives/preferences">← Back to electives</Link>
    <h1>Add elective to your schedule</h1>
    <h2>{course.code} · {course.name}</h2>
    <p>{course.semester_name}</p>
    <p>Add this elective to your plan, then choose a section to see its class times and any overlaps on your calendar. This plans your timetable; it does not register you for the course.</p>
    {matching.length ? <ScheduleElectiveForm courseId={course.id} semesterId={course.semester_id} plans={matching} /> : <>
      <p>You don’t have a plan linked to this semester yet.</p>
      {terms.length ? <section className={styles.card}><h2>Create a plan to continue</h2><NewPlanForm terms={terms} elective={{courseId:course.id,semesterId:course.semester_id}} /></section>
        : <p><Link href="/planner">Open the semester planner</Link> to link a plan to this semester’s AUB schedule, then return here.</p>}
    </>}
    <p><Link href="/planner">View my plans and calendars</Link></p>
  </main></AppShell>;
}
