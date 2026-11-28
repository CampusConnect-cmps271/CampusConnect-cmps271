import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({user:vi.fn(),course:vi.fn(),plan:vi.fn(),add:vi.fn(),redirect:vi.fn()}));
vi.mock("@/modules/auth",()=>({requireUser:m.user}));
vi.mock("./schedule",()=>({getScheduleCourse:m.course}));
vi.mock("@/modules/planner/queries",()=>({getMyPlan:m.plan}));
vi.mock("@/modules/planner/actions",()=>({addCourse:m.add}));
vi.mock("next/navigation",()=>({redirect:m.redirect}));
import { addElectiveToSchedule } from "./schedule-actions";
const planId="10000000-0000-4000-8000-000000000001", courseId="20000000-0000-4000-8000-000000000001";
function form(){const f=new FormData();f.set("courseId",courseId);f.set("semesterId","202720");f.set("planId",planId);return f;}
beforeEach(()=>{
 vi.clearAllMocks();
 m.user.mockResolvedValue({id:"owner"});m.course.mockResolvedValue({id:courseId,semester_id:"202720"});
 m.plan.mockResolvedValue({student_id:"owner",semester:{id:"202720"},course_ids:[]});
 m.add.mockResolvedValue({ok:true,message:"Added"});
 m.redirect.mockImplementation((url:string)=>{throw new Error(`NEXT_REDIRECT:${url}`);});
});
it("requires authentication before looking up or mutating a plan",async()=>{
 m.user.mockRejectedValue(new Error("sign in"));await expect(addElectiveToSchedule(undefined,form())).rejects.toThrow("sign in");
 expect(m.course).not.toHaveBeenCalled();expect(m.add).not.toHaveBeenCalled();
});
it.each([null,{student_id:"someone-else",semester:{id:"202720"},course_ids:[]},{student_id:"owner",semester:{id:"202710"},course_ids:[]},{student_id:"owner",semester:null,course_ids:[]}])("rejects another owner's, missing or wrong-semester plan",async(plan)=>{
 m.plan.mockResolvedValue(plan);expect((await addElectiveToSchedule(undefined,form()))?.ok).toBe(false);expect(m.add).not.toHaveBeenCalled();
});
it("rejects malformed plans and disappeared offerings",async()=>{
 const f=form();f.set("planId","bad");expect((await addElectiveToSchedule(undefined,f))?.ok).toBe(false);
 m.course.mockResolvedValue(null);expect((await addElectiveToSchedule(undefined,form()))?.ok).toBe(false);expect(m.add).not.toHaveBeenCalled();
});
it("opens an already-added course's calendar without inserting twice",async()=>{
 m.plan.mockResolvedValue({student_id:"owner",semester:{id:"202720"},course_ids:[courseId]});
 await expect(addElectiveToSchedule(undefined,form())).rejects.toThrow(`NEXT_REDIRECT:/planner/${planId}#calendar`);expect(m.add).not.toHaveBeenCalled();
});
it("uses the existing planner and opens its calendar after a successful add",async()=>{
 await expect(addElectiveToSchedule(undefined,form())).rejects.toThrow(`NEXT_REDIRECT:/planner/${planId}#calendar`);
 const input=m.add.mock.calls[0][1];expect(input.get("planId")).toBe(planId);expect(input.get("courseId")).toBe(courseId);
});
it("preserves section-picker redirects and add failures",async()=>{
 m.add.mockRejectedValueOnce(new Error("NEXT_REDIRECT:section-picker"));await expect(addElectiveToSchedule(undefined,form())).rejects.toThrow("NEXT_REDIRECT:section-picker");
 m.add.mockResolvedValue({ok:false,message:"Plan is full"});expect(await addElectiveToSchedule(undefined,form())).toEqual({ok:false,message:"Plan is full"});
});
it("reports read failures without exposing database details",async()=>{
 m.plan.mockRejectedValue(new Error("private SQL"));const result=await addElectiveToSchedule(undefined,form());expect(result?.message).not.toContain("SQL");expect(m.add).not.toHaveBeenCalled();
});
