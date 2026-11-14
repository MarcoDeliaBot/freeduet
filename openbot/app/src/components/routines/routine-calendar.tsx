import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { PageEmpty, PageRows } from "@/components/layout/page-shell";
import { Separator } from "@/components/ui/separator";
import type { RoutineRecord } from "@/lib/routines/queries";
import { routineCalendarQueryOptions } from "@/lib/routines/schedule-queries";
import {
  CALENDAR_DAYS,
  CALENDAR_MAX_RUNS,
  type CalendarRow,
  calendarRange,
  calendarRows,
  clockOf,
  countRoutines,
  groupByDay,
  ownClockNote,
} from "@/lib/routines/schedule-view";
import { useBotNames } from "./bot-names";

/**
 * When each switched-on routine runs next, for the next fourteen days, grouped by day in the person's own
 * time zone. The times are the sweep's own (the server expands the same schedule the sweep fires from);
 * nothing here decides one. Read-only.
 */
export function RoutineCalendar({
  agentId,
  routines,
}: {
  /** Show only the runs of the routines one Bot carries out. Absent shows all of them. */
  agentId?: string;
  routines: RoutineRecord[];
}) {
  const names = useBotNames();
  // Fixed when the view opens: a window that moved on every render would refetch on every render.
  const [range] = useState(() => calendarRange(new Date()));
  const calendar = useQuery(routineCalendarQueryOptions({ ...range, agentId }));
  if (calendar.isPending) return null;
  if (calendar.error) {
    return (
      <p className="mt-4 text-destructive text-sm" role="alert">
        {calendar.error.message}
      </p>
    );
  }
  const now = new Date();
  const rows = calendarRows(calendar.data.runs, routines);
  const paused = routines.filter((routine) => !routine.enabled).length;
  const switchedOn = routines.length - paused;
  const groups = groupByDay(rows, (row) => row.at, now);

  return (
    <>
      <p className="mt-4 text-muted-foreground text-sm">
        The next {CALENDAR_DAYS} days, for the routines that are switched on.
        Times are in your time zone.
      </p>
      {rows.length === 0 ? (
        <PageEmpty>
          {routines.length === 0
            ? "No routines yet, so nothing is scheduled."
            : switchedOn === 0
              ? "None of these routines is switched on, so none will run."
              : `Nothing is scheduled in the next ${CALENDAR_DAYS} days.`}
        </PageEmpty>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h3 className="mt-6 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {group.heading}
            </h3>
            <PageRows className="mt-2">
              {group.items.map((row, index) => (
                <Fragment key={`${row.routineId}-${row.at.getTime()}`}>
                  {index > 0 ? <Separator /> : null}
                  <CalendarItem
                    memberName={names.get(row.agentId) ?? "A Bot"}
                    row={row}
                  />
                </Fragment>
              ))}
            </PageRows>
          </section>
        ))
      )}
      {calendar.data.truncated ? (
        <p className="mt-4 text-muted-foreground text-xs">
          Only the first {CALENDAR_MAX_RUNS} runs in these {CALENDAR_DAYS} days
          are listed.
        </p>
      ) : null}
      {paused > 0 ? (
        <p className="mt-4 text-muted-foreground text-xs">
          {countRoutines(paused)} paused, so not listed here. Switch one on to
          see when it runs.
        </p>
      ) : null}
    </>
  );
}

function CalendarItem({
  row,
  memberName,
}: {
  row: CalendarRow;
  memberName: string;
}) {
  // The routine's own clock, written out only where it differs from the person's.
  const ownClock = ownClockNote(row.at, row.routine.timezone);
  return (
    <div className="flex items-start gap-4 py-3">
      <div className="w-20 shrink-0 text-right">
        <p className="font-medium text-sm tabular-nums">{clockOf(row.at)}</p>
        {ownClock ? (
          <p className="text-muted-foreground text-xs">{ownClock}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm">
          {row.routine.schedule}
          <span className="ml-1.5 text-muted-foreground text-xs">
            {row.routine.timezone}
          </span>
        </p>
        <p className="text-muted-foreground text-xs">{memberName}</p>
        <p className="line-clamp-2 text-muted-foreground text-xs">
          {row.routine.instruction}
        </p>
      </div>
      {row.routine.channel.gone ? null : (
        <Link
          className="shrink-0 text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
          params={{ channelId: row.routine.channel.id }}
          to="/channel/$channelId"
        >
          Open conversation
        </Link>
      )}
    </div>
  );
}
