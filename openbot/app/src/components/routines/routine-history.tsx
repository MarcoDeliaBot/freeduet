import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { PageEmpty, PageRows } from "@/components/layout/page-shell";
import { Separator } from "@/components/ui/separator";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage, useT } from "@/freeduet/i18n/provider";
import type { RoutineRecord, RoutineRunRecord } from "@/lib/routines/queries";
import {
  type OwnedRunRecord,
  routineHistoryQueryOptions,
} from "@/lib/routines/schedule-queries";
import { routinesById, stampOf } from "@/lib/routines/schedule-view";
import { cn } from "@/lib/utils";
import { useBotNames } from "./bot-names";

/**
 * How a run's outcome reads, with its dot and tone. Shared by a routine's own history and the history
 * across all of them, so the same outcome has the same word on both.
 */
export const RUN_STATUS: Record<
  RoutineRunRecord["status"],
  { key: MessageId; dot: string; className: string }
> = {
  running: {
    key: "routines.status.running",
    dot: "animate-pulse bg-muted-foreground",
    className: "",
  },
  succeeded: {
    key: "routines.status.succeeded",
    dot: "bg-emerald-500",
    className: "",
  },
  failed: {
    key: "routines.status.failed",
    dot: "bg-destructive",
    className: "text-destructive",
  },
  skipped: {
    key: "routines.status.skipped",
    dot: "bg-amber-500",
    className: "text-amber-600 dark:text-amber-500",
  },
  waiting: {
    key: "routines.status.waiting",
    dot: "bg-sky-500",
    className: "",
  },
};

/**
 * A firing the server did not run. It is stored as `skipped`, which reads like a choice, so it has its
 * own word: nobody skipped it; the server reached it too late to run it.
 */
const MISSED_STATUS: { key: MessageId; dot: string; className: string } = {
  key: "routines.status.missed",
  dot: "bg-amber-500",
  className: "text-amber-600 dark:text-amber-500",
};

/** The word and tone for one run: a missed firing says so, anything else reads its outcome. */
export function runStatusOf(run: {
  status: RoutineRunRecord["status"];
  missed: boolean;
}): { key: MessageId; dot: string; className: string } {
  if (run.missed) return MISSED_STATUS;
  return RUN_STATUS[run.status] ?? RUN_STATUS.skipped;
}

const SOURCE_KEY: Record<OwnedRunRecord["source"], MessageId> = {
  schedule: "routines.scheduled",
  run_now: "routines.runNow",
  trigger: "routines.triggered",
};

/** The rows the server keeps before it says "the latest". Matches the limit the history asks for. */
const HISTORY_LIMIT = 100;

/**
 * Every firing of the person's routines, newest first: when it ran, which member ran it, how it ended,
 * and where to go to see it. A run that waits for an approval says so, and the conversation is where
 * the approval is answered. Read-only: nothing here changes a run or a routine.
 */
export function RoutineHistory({
  agentId,
  routines,
}: {
  /** Show only the runs of the routines one Bot carries out. Absent shows all of them. */
  agentId?: string;
  routines: RoutineRecord[];
}) {
  const t = useT();
  const names = useBotNames();
  const history = useQuery(routineHistoryQueryOptions(agentId, t));
  if (history.isPending) return null;
  if (history.error) {
    return (
      <p className="mt-4 text-destructive text-sm" role="alert">
        {history.error.message}
      </p>
    );
  }
  const runs = history.data;
  if (runs.length === 0) {
    return <PageEmpty>{t("routines.history.empty")}</PageEmpty>;
  }
  const byId = routinesById(routines);
  return (
    <>
      <PageRows>
        {runs.map((run, index) => (
          <Fragment key={run.id}>
            {index > 0 ? <Separator /> : null}
            <HistoryRow
              memberName={names.get(run.agentId) ?? t("routines.history.aBot")}
              routine={byId.get(run.routineId)}
              run={run}
            />
          </Fragment>
        ))}
      </PageRows>
      {runs.length === HISTORY_LIMIT ? (
        <p className="mt-4 text-muted-foreground text-xs">
          {t("routines.history.latest", { count: HISTORY_LIMIT })}
        </p>
      ) : null}
    </>
  );
}

function HistoryRow({
  run,
  routine,
  memberName,
}: {
  run: OwnedRunRecord;
  routine: RoutineRecord | undefined;
  memberName: string;
}) {
  const { t, language } = useAppLanguage();
  const status = runStatusOf(run);
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span
          className={cn("inline-flex items-center gap-1.5", status.className)}
        >
          <span className={cn("size-1.5 rounded-full", status.dot)} />
          {t(status.key)}
        </span>
        <span className="text-muted-foreground">
          {stampOf(new Date(run.startedAt), language)} ·{" "}
          {t(SOURCE_KEY[run.source])} · {memberName}
        </span>
      </div>
      {routine ? (
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm">
            {routine.schedule}
            <span className="ml-1.5 text-muted-foreground text-xs">
              {routine.timezone}
            </span>
          </p>
          {/* The instruction tells apart two routines that share a schedule. */}
          <p className="line-clamp-2 text-muted-foreground text-xs">
            {routine.instruction}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("routines.history.deleted")}
        </p>
      )}
      {run.status === "waiting" ? (
        <p className="text-muted-foreground text-xs">
          {t("routines.history.waitingNote")}
        </p>
      ) : null}
      {run.error ? (
        <p className="break-words text-muted-foreground text-xs">{run.error}</p>
      ) : null}
      {/* The conversation this run posted into, not the routine's current one; absent when none is open to the person. */}
      {run.channelId ? (
        <Link
          className="self-start text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
          params={{ channelId: run.channelId }}
          to="/channel/$channelId"
        >
          {t("stalled.open")}
        </Link>
      ) : null}
    </div>
  );
}
