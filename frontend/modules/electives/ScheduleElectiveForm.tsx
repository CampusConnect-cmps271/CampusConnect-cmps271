"use client";
import { useActionState } from "react";
import { addElectiveToSchedule } from "./schedule-actions";
import type { PlanSummary } from "@/modules/planner/types";
import styles from "./electives.module.css";

export function ScheduleElectiveForm({ courseId, semesterId, plans }: {courseId:string; semesterId:string; plans:PlanSummary[]}) {
  const [state, action, pending] = useActionState(addElectiveToSchedule, undefined);
  return <form action={action} className={`${styles.form} ${styles.scheduleForm}`}>
    <input type="hidden" name="courseId" value={courseId} />
    <input type="hidden" name="semesterId" value={semesterId} />
    <label htmlFor="elective-plan">Add to this plan</label>
    <select id="elective-plan" name="planId" required disabled={pending}>
      {plans.map(plan => <option key={plan.id} value={plan.id}>{plan.term} · {plan.course_count} courses</option>)}
    </select>
    <button disabled={pending} type="submit">{pending ? "Adding…" : "Add elective to my schedule"}</button>
    {state && <p role={state.ok ? "status" : "alert"}>{state.message}</p>}
  </form>;
}
