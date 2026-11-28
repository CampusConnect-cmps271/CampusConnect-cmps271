import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({user:vi.fn(),client:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),limit:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/modules/auth",()=>({requireUser:m.user}));
vi.mock("@/lib/supabase/server",()=>({createClient:m.client}));
import {getScheduleCourse} from "./schedule";
const id="20000000-0000-4000-8000-000000000001";
beforeEach(()=>{vi.clearAllMocks();m.user.mockResolvedValue({id:"owner"});const chain={select:m.select,eq:m.eq,limit:m.limit};m.from.mockReturnValue(chain);m.select.mockReturnValue(chain);m.eq.mockReturnValue(chain);m.client.mockResolvedValue({from:m.from});m.limit.mockResolvedValue({data:[],error:null});});
it("authenticates and bounds invalid identifiers before reading data",async()=>{
 expect(await getScheduleCourse("bad","202720")).toBeNull();expect(await getScheduleCourse(id,"anything")).toBeNull();expect(m.client).not.toHaveBeenCalled();expect(m.user).toHaveBeenCalledTimes(2);
});
it("returns the authoritative offering scoped to course and semester",async()=>{
 const row={id,code:"SOCI 200",name:"Social science",semester_id:"202720",semester_name:"Spring 2026-2027"};m.limit.mockResolvedValue({data:[row],error:null});
 expect(await getScheduleCourse(id,"202720")).toEqual(row);expect(m.from).toHaveBeenCalledWith("course_semester_catalogue");expect(m.eq.mock.calls).toEqual([["id",id],["semester_id","202720"]]);
});
it("distinguishes a missing offering from a private database error",async()=>{
 expect(await getScheduleCourse(id,"202720")).toBeNull();m.limit.mockResolvedValue({data:null,error:{message:"private SQL"}});await expect(getScheduleCourse(id,"202720")).rejects.toThrow("The elective could not be loaded. Please try again.");
});
