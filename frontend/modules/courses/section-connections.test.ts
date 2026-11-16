import {expect,it} from "vitest";
import {meetingDuration} from "./SectionConnections";
it("calculates actual meeting durations instead of inferring them from MWF",()=>{
 expect(meetingDuration("10:00","10:50")).toBe(50);
 expect(meetingDuration("09:30","10:45")).toBe(75);
 expect(meetingDuration("TBA", "11:00")).toBeNull();
 expect(meetingDuration("11:00", "10:00")).toBeNull();
});
