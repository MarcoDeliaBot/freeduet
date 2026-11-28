import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PageEmpty } from "@/components/layout/page-shell";
import { useAppLanguage, useT } from "@/freeduet/i18n/provider";
import type { RoutineRecord } from "@/lib/routines/queries";
import {
  routineCalendarQueryOptions,
  routineHistoryQueryOptions,
} from "@/lib/routines/schedule-queries";
import {
  blockLabel,
  buildWeek,
  dayAndClock,
  deviceZone,
  HOUR_PX,
  memberHue,
  minuteLabel,
  type RunStatus,
  routineTitle,
  type WeekBlock,
  type WeekRun,
  weekDays,
  weekWindow,
} from "@/lib/routines/week-view";
import { cn } from "@/lib/utils";
import { useBotNames } from "./bot-names";

/** How close a recorded start has to be to the time a run was due for the two to be the same run. */
const RECORDED_WITHIN_MS = 2 * 60_000;

const HISTORY_STATUS: Record<string, RunStatus> = {
  succeeded: "done",
  failed: "failed",
  running: "running",
  waiting: "running",
  skipped: "missed",
};

/**
 * The week as a calendar: Monday first, the hours down the side, each routine a coloured block at the time it
 * runs. Upcoming runs are the server's own list (the same expansion the sweep fires from); runs that already
 * happened this week come from the run history. Nothing here expands a schedule or decides a time. Read-only.
 */
export function RoutineWeek({
  agentId,
  routines,
  now: fixedNow,
  zone: fixedZone,
}: {
  agentId?: string;
  routines: RoutineRecord[];
  /** For tests and previews; the page leaves them out. */
  now?: Date;
  zone?: string;
}) {
  const { t, language } = useAppLanguage();
  const names = useBotNames();
  const zone = fixedZone ?? deviceZone();
  // The clock moves each minute (and when the tab comes back); the window asked for only moves when the
  // day changes, because a window that moved on every tick would refetch on every tick.
  const [clock, setClock] = useState(() => fixedNow ?? new Date());
  const [opened, setOpened] = useState(clock);
  useEffect(() => {
    if (fixedNow) return;
    const tick = () => setClock(new Date());
    const timer = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fixedNow]);
  useEffect(() => {
    const day = (at: Date) => weekDays(at, zone).find((d) => d.isToday)?.key;
    if (day(clock) !== day(opened)) setOpened(clock);
  }, [clock, opened, zone]);
  // Kept on screen while the next day's window loads: a midnight must not blank the grid.
  const calendar = useQuery({
    ...routineCalendarQueryOptions({ ...weekWindow(opened), agentId }),
    placeholderData: keepPreviousData,
  });
  const history = useQuery(routineHistoryQueryOptions(agentId, t));
  const refetchHistory = history.refetch;

  const runs = useMemo<WeekRun[]>(() => {
    const list: WeekRun[] = [];
    const recorded = history.data ?? [];
    for (const run of recorded) {
      list.push({
        routineId: run.routineId,
        agentId: run.agentId,
        at: new Date(run.startedAt),
        status: run.missed ? "missed" : (HISTORY_STATUS[run.status] ?? "done"),
      });
    }
    for (const run of calendar.data?.runs ?? []) {
      const at = new Date(run.at);
      if (at.getTime() > clock.getTime()) {
        list.push({
          routineId: run.routineId,
          agentId: run.agentId,
          at,
          status: "upcoming",
        });
        continue;
      }
      // It has passed. Once the history holds its row, that row is the run; until then it is shown as due.
      const isRecorded = recorded.some(
        (row) =>
          row.routineId === run.routineId &&
          Math.abs(new Date(row.startedAt).getTime() - at.getTime()) <=
            RECORDED_WITHIN_MS,
      );
      if (!isRecorded) {
        list.push({
          routineId: run.routineId,
          agentId: run.agentId,
          at,
          status: "pending",
        });
      }
    }
    return list;
  }, [calendar.data, history.data, clock]);
  const hasPending = runs.some((run) => run.status === "pending");

  // A tick that moves a run into the past, or finds one still due, asks the history again.
  const lastTick = useRef(clock);
  useEffect(() => {
    if (lastTick.current === clock) return;
    lastTick.current = clock;
    if (hasPending) void refetchHistory();
  }, [clock, hasPending, refetchHistory]);

  const week = useMemo(
    () => buildWeek({ runs, routines, now: clock, zone }),
    [runs, routines, clock, zone],
  );

  if (calendar.isPending) return null;
  if (calendar.error) {
    return (
      <p className="mt-4 text-destructive text-sm" role="alert">
        {calendar.error.message}
      </p>
    );
  }
  const switchedOn = routines.filter((routine) => routine.enabled).length;
  if (week.routinesOnGrid === 0) {
    return (
      <PageEmpty>
        {routines.length === 0
          ? t("routines.cal.none")
          : switchedOn === 0
            ? t("routines.cal.noneOn")
            : t("routines.week.nothing")}
      </PageEmpty>
    );
  }

  const columns = week.columns.filter(
    (column) => week.showWeekend || column.index < 5,
  );
  const hours = Array.from(
    { length: week.lastHour - week.firstHour },
    (_, i) => week.firstHour + i,
  );
  const height = hours.length * HOUR_PX;
  const gridCols = `3rem repeat(${columns.length}, minmax(5.5rem, 1fr))`;

  return (
    <section aria-label={t("routines.week.label")} className="mt-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-[36rem]">
          <div
            className="grid border-border border-b bg-muted/40"
            style={{ gridTemplateColumns: gridCols }}
          >
            <div />
            {columns.map((column) => (
              <div
                className={cn(
                  "px-2 py-2 text-center text-xs",
                  column.isToday
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
                key={column.key}
              >
                {new Intl.DateTimeFormat(language, {
                  weekday: "short",
                  timeZone: "UTC",
                }).format(
                  new Date(
                    Date.UTC(
                      column.civil.year,
                      column.civil.month - 1,
                      column.civil.day,
                    ),
                  ),
                )}{" "}
                <span
                  className={cn(
                    "inline-flex min-w-5 justify-center rounded-full px-1 tabular-nums",
                    column.isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {column.civil.day}
                </span>
                {column.isToday ? (
                  <span className="sr-only"> ({t("routines.week.today")})</span>
                ) : null}
              </div>
            ))}
          </div>
          <div
            className="grid"
            style={{ gridTemplateColumns: gridCols, height }}
          >
            <div className="relative" aria-hidden="true">
              {hours.map((hour, i) => (
                <span
                  className="absolute right-1 -translate-y-1/2 text-[0.65rem] text-muted-foreground tabular-nums"
                  key={hour}
                  style={{ top: i * HOUR_PX }}
                >
                  {i === 0 ? "" : minuteLabel(hour * 60)}
                </span>
              ))}
            </div>
            {columns.map((column) => (
              <div
                className={cn(
                  "relative border-border border-l",
                  column.isToday && "bg-primary/5",
                )}
                data-today={column.isToday ? "true" : undefined}
                key={column.key}
              >
                {hours.map((hour, i) => (
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 border-border/60 border-t"
                    key={hour}
                    style={{ top: i * HOUR_PX }}
                  />
                ))}
                {column.isToday ? (
                  <div
                    aria-label={t("routines.week.now", {
                      time: minuteLabel(week.nowMin),
                    })}
                    className="absolute inset-x-0 z-20 border-red-500 border-t-2"
                    data-now="true"
                    role="img"
                    style={{
                      top: ((week.nowMin - week.firstHour * 60) / 60) * HOUR_PX,
                    }}
                  >
                    <span className="-top-1.5 -left-1 absolute size-2.5 rounded-full bg-red-500" />
                  </div>
                ) : null}
                {column.blocks.map((block) => (
                  <Block
                    block={block}
                    firstHour={week.firstHour}
                    key={block.id}
                    memberName={
                      names.get(block.agentId) ?? t("routines.history.aBot")
                    }
                    zone={zone}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm" data-next="true">
        {week.next ? (
          <>
            <span className="text-muted-foreground">
              {t("routines.week.next")}{" "}
            </span>
            <span className="font-medium">
              {routineTitle(week.next.routine, undefined, t)}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {dayAndClock(week.next.at, zone, language)}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {t("routines.week.nothingElse")}
          </span>
        )}
      </p>
      {calendar.data?.truncated ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("routines.week.truncated")}
        </p>
      ) : null}
      {history.error ? (
        <p className="mt-1 text-muted-foreground text-xs" role="status">
          {t("routines.week.historyError")}
        </p>
      ) : null}
      <p className="mt-1 text-muted-foreground text-xs">
        {t("routines.week.note")}
      </p>
    </section>
  );
}

function Block({
  block,
  firstHour,
  memberName,
  zone,
}: {
  block: WeekBlock;
  firstHour: number;
  memberName: string;
  zone: string;
}) {
  const { t, language } = useAppLanguage();
  const hue = memberHue(block.agentId);
  const style = {
    top: ((block.startMin - firstHour * 60) / 60) * HOUR_PX,
    height: Math.max(((block.endMin - block.startMin) / 60) * HOUR_PX - 2, 20),
    left: `calc(${(block.lane / block.lanes) * 100}% + 2px)`,
    width: `calc(${100 / block.lanes}% - 4px)`,
    "--cal-light": `oklch(0.94 0.05 ${hue})`,
    "--cal-dark": `oklch(0.34 0.07 ${hue})`,
    "--cal-edge": `oklch(0.55 0.16 ${hue})`,
  } as CSSProperties;
  const label = blockLabel(block, memberName, zone, language, t);
  const className = cn(
    "absolute z-10 flex flex-col overflow-hidden rounded-md border-l-4 px-1.5 py-1 text-left text-xs leading-tight",
    "border-[var(--cal-edge)] bg-[var(--cal-light)] text-foreground dark:bg-[var(--cal-dark)]",
    "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
    block.status === "missed" && "border-dashed opacity-70",
    block.status === "upcoming" ? "" : "shadow-sm",
  );
  const body = (
    <>
      <span className="flex items-center gap-1 font-medium">
        <span className="truncate">{routineTitle(block.routine, 40, t)}</span>
        {block.status === "done" ? (
          <IconCheck aria-hidden="true" className="ml-auto size-3 shrink-0" />
        ) : null}
        {block.status === "failed" ? (
          <IconAlertTriangle
            aria-hidden="true"
            className="ml-auto size-3 shrink-0 text-destructive"
          />
        ) : null}
      </span>
      <span className="truncate text-muted-foreground">{memberName}</span>
      {block.kind === "summary" ? (
        <span className="text-muted-foreground">
          {t("routines.week.summary", {
            count: block.count ?? 0,
            minutes: block.everyMinutes ?? 0,
          })}
        </span>
      ) : null}
    </>
  );
  if (block.routine.channel.gone) {
    return (
      <button
        aria-label={t("routines.week.gone", { label })}
        className={className}
        disabled
        style={style}
        title={label}
        type="button"
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      aria-label={label}
      className={className}
      data-status={block.status}
      params={{ channelId: block.routine.channel.id }}
      style={style}
      title={label}
      to="/channel/$channelId"
    >
      {body}
    </Link>
  );
}
