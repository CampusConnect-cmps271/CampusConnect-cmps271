import { firstBeirutSlot, type ConflictReport } from "../conflicts";
import { timeFromMinutes, WEEKDAYS } from "../time";
import type { PlanDetails } from "../types";

type Block = { id: string; code: string; weekday: number; start: number; end: number; conflict: boolean; lane: number; lanes: number };

const HOUR_REM = 2.5;

/** Side-by-side lanes for blocks that overlap within one day. */
function assignLanes(blocks: Omit<Block, "lane" | "lanes">[]): Block[] {
  const placed: Block[] = [];
  for (const day of WEEKDAYS) {
    const dayBlocks = blocks.filter((block) => block.weekday === day.value).sort((a, b) => a.start - b.start || a.end - b.end);
    const laneEnds: number[] = [];
    const inDay: Block[] = [];
    for (const block of dayBlocks) {
      let lane = laneEnds.findIndex((end) => end <= block.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = block.end;
      inDay.push({ ...block, lane, lanes: 0 });
    }
    placed.push(...inDay.map((block) => ({ ...block, lanes: laneEnds.length })));
  }
  return placed;
}

/**
 * A compact, read-only week (Mon-Sun) of the plan's meetings in Beirut time,
 * as they fall in the first week of term. Hidden from assistive technology:
 * the course list and the conflict panel carry the same information.
 */
export function WeekView({ plan, report }: { plan: PlanDetails; report: ConflictReport }) {
  const conflicting = new Set(report.conflicts.flatMap((conflict) => conflict.meetings.map((side) => side.meeting_id)));
  const raw = plan.courses.flatMap((planned) =>
    planned.meetings.flatMap((meeting) => {
      const slot = firstBeirutSlot(meeting, plan);
      return slot
        ? [{
            id: meeting.id,
            code: planned.code,
            weekday: slot.weekday,
            start: slot.start_minute,
            end: Math.min(slot.end_minute, 1440),
            conflict: conflicting.has(meeting.id),
          }]
        : [];
    }),
  );
  if (raw.length === 0) return null;

  const blocks = assignLanes(raw);
  const first = Math.floor(Math.min(...blocks.map((block) => block.start)) / 60) * 60;
  const last = Math.ceil(Math.max(...blocks.map((block) => block.end)) / 60) * 60;
  const hours = Array.from({ length: (last - first) / 60 }, (_, index) => first + index * 60);
  const height = `${hours.length * HOUR_REM}rem`;
  const percent = (minute: number) => `${((minute - first) / (last - first)) * 100}%`;

  return (
    <section aria-labelledby="week-view-heading" className="flex flex-col gap-2">
      <h2 id="week-view-heading" className="text-lg font-semibold text-[var(--ink)]">
        Week at a glance
      </h2>
      <p className="text-xs text-[var(--ink-soft)]">
        Beirut time, as in the first week of term. Overlapping meetings are marked ⚠. The course list below has
        every detail.
      </p>
      <div aria-hidden="true" className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
        <div className="grid min-w-[520px] grid-cols-[3rem_repeat(7,minmax(0,1fr))] text-xs text-[var(--ink)]">
          <div />
          {WEEKDAYS.map((day) => (
            <div key={day.value} className="border-b border-l border-[var(--border)] py-1 text-center font-semibold">
              {day.short}
            </div>
          ))}

          <div className="relative" style={{ height }}>
            {hours.map((hour) => (
              <span key={hour} className="absolute right-1 -translate-y-1/2 text-[10px] text-[var(--ink-soft)]" style={{ top: percent(hour) }}>
                {hour === first ? "" : timeFromMinutes(hour)}
              </span>
            ))}
          </div>
          {WEEKDAYS.map((day) => (
            <div key={day.value} className="relative border-l border-[var(--border)]" style={{ height }}>
              {hours.slice(1).map((hour) => (
                <div key={hour} className="absolute inset-x-0 border-t border-dashed border-[var(--border)]" style={{ top: percent(hour) }} />
              ))}
              {blocks
                .filter((block) => block.weekday === day.value)
                .map((block) => (
                  <div
                    key={block.id}
                    className={`absolute overflow-hidden rounded border px-1 leading-tight ${
                      block.conflict ? "border-2 border-[var(--danger)] font-semibold" : "border-[var(--maroon-200)] bg-[var(--maroon-50)]"
                    }`}
                    style={{
                      top: percent(block.start),
                      height: `calc(${percent(block.end)} - ${percent(block.start)})`,
                      left: `${(block.lane / block.lanes) * 100}%`,
                      width: `${100 / block.lanes}%`,
                      ...(block.conflict
                        ? { backgroundImage: "repeating-linear-gradient(45deg, #fdecea 0 4px, #f8c9c4 4px 8px)" }
                        : {}),
                    }}
                  >
                    {block.conflict ? "⚠ " : ""}
                    {block.code}
                  </div>
                ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
