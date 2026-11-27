import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({getCurrentUser:vi.fn(),getUser:vi.fn(),rpc:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/modules/auth",()=>({getCurrentUser:m.getCurrentUser}));
vi.mock("./server",()=>({createEventServerClient:async()=>({auth:{getUser:m.getUser},rpc:m.rpc})}));
import { listPublishedEvents, listPublishedEventCategories } from "./discovery";
beforeEach(()=>{vi.resetAllMocks();m.getCurrentUser.mockResolvedValue({id:"verified"});m.rpc.mockResolvedValue({data:[],error:null});});
it("reuses live verified identity for events and categories without Auth-user requests",async()=>{
  await Promise.all([listPublishedEvents(),listPublishedEventCategories()]);
  expect(m.getUser).not.toHaveBeenCalled();expect(m.rpc).toHaveBeenCalledTimes(2);
});
it("denies discovery before data reads when the live identity is rejected",async()=>{
  m.getCurrentUser.mockResolvedValue(null);
  await expect(listPublishedEvents()).rejects.toThrow("signed in");await expect(listPublishedEventCategories()).rejects.toThrow("signed in");
  expect(m.rpc).not.toHaveBeenCalled();expect(m.getUser).not.toHaveBeenCalled();
});
it("propagates confirmation/auth redirects to the page guard",async()=>{
  m.getCurrentUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(listPublishedEvents()).rejects.toThrow("NEXT_REDIRECT");expect(m.rpc).not.toHaveBeenCalled();
});
