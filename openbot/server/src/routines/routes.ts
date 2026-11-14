import type { Context, MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { AppVariables } from "../auth/guards";
import { calendarWindow, upcomingRuns } from "./calendar";
import type { RoutineRunner } from "./runner";
import { MINIMUM_INTERVAL_MS } from "./schedule";
import {
  type OwnedRunSummary,
  RoutineNotFoundError,
  RoutineRefusedError,
  type RoutineRunOutcome,
  type RoutineStore,
  type RoutineSummary,
} from "./store";

export type { RoutineStore } from "./store";

/**
 * The routines page: what a person's standing instructions are, and a switch to stop one.
 *
 * THERE IS DELIBERATELY NO CREATE AND NO EDIT ENDPOINT HERE. Making a routine and changing one are
 * conversational — the four `RoutineTools` a Bot calls mid-chat, in `plugins/builtin-routines.ts` —
 * because the hard part of both is turning a sentence into a cron expression and a channel, which
 * is exactly what a conversation is for. This surface answers a narrower question: what is standing,
 * and does it stay standing. So it shows and it stops; it does not compose.
 *
 * THERE IS ALSO NO GET-BY-ID. A routine id is never a page's own state — nothing links to one, and
 * nothing needs to fetch one in isolation — so the list is the read, the same way the channel
 * roster is a list with no companion single-channel screen.
 *
 * Owner-scoped through the store on every route, never by filtering a broader read afterwards:
 * `listFor`, `setEnabled` and `remove` all take the caller's id and answer as if a routine that
 * belongs to somebody else does not exist, which is what keeps a wrong id and somebody else's id
 * indistinguishable from outside.
 */
export function createRoutineRoutes(
  routineStore: RoutineStore,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  options: { runner?: RoutineRunner; auditStore?: AuditStore } = {},
) {
  const routes = new Hono<{ Variables: AppVariables }>();

  /*
   * Run now — the page's Test button. It DOES REAL WORK: the routine's Bot runs its instruction in
   * the routine's channel exactly as a scheduled firing would, through the same runner and headless
   * AG-UI path. A paused routine is refused (paused never runs), and so is a second click while a
   * run is still open.
   */
  if (options.runner) {
    const runner = options.runner;
    routes.post("/:id/run", requireUser, async (context) => {
      const id = context.req.param("id");
      try {
        const { runId } = await routineStore.startManualRun(
          context.var.actor.id,
          id,
        );
        if (options.auditStore)
          await recordAuditEvent(options.auditStore, {
            eventType: "routines.run_requested",
            targetType: "routine",
            targetId: id,
            actorUserId: context.var.actor.id,
            payload: { runId, source: "manual" },
          }).catch(() => undefined);
        void runner.run(runId).catch(() => {});
        return context.json({ accepted: true, runId }, 202);
      } catch (error) {
        return mapStoreError(context, error);
      }
    });
  }

  routes.get("/:id/runs", requireUser, async (context) => {
    try {
      const runs = await routineStore.listRuns(
        context.var.actor.id,
        context.req.param("id"),
      );
      return context.json({
        runs: runs.map((run) => ({
          id: run.id,
          status: run.status ?? "running",
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null,
          error: run.error,
          source: run.source,
        })),
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /*
   * The calendar: when each switched-on routine runs next, inside a window of at most fourteen days. It
   * reads the same stored clock the sweep advances (see `calendar.ts`), owner-scoped through `scheduleFor`.
   * Paused routines are left out; the routines list still shows them as paused.
   */
  routes.get("/calendar", requireUser, async (context) => {
    const range = calendarWindow(
      context.req.query("from"),
      context.req.query("to"),
      new Date(),
    );
    if (typeof range === "string") {
      return context.json({ error: range }, 400);
    }
    const agentId = context.req.query("agentId");
    if (agentId !== undefined && agentId.trim() === "") {
      return context.json({ error: "agentId must not be empty." }, 400);
    }
    try {
      const schedules = await routineStore.scheduleFor(context.var.actor.id);
      const { runs, truncated } = upcomingRuns(
        schedules.filter(
          (schedule) =>
            schedule.enabled &&
            (agentId === undefined || schedule.agentId === agentId),
        ),
        range,
      );
      return context.json({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        runs: runs.map((run) => ({
          routineId: run.routineId,
          agentId: run.agentId,
          at: run.at.toISOString(),
        })),
        truncated,
      });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  /*
   * The run history across all the person's routines, newest first, at most 100. Each row names its
   * routine and Bot, so the page can say which member ran and link to the conversation the routine
   * posts into. Read-only: a run is never changed from here.
   */
  routes.get("/runs", requireUser, async (context) => {
    const limit = runsLimit(context.req.query("limit"));
    if (limit === null) {
      return context.json(
        { error: "limit must be a whole number from 1 to 100." },
        400,
      );
    }
    const agentId = context.req.query("agentId");
    if (agentId !== undefined && agentId.trim() === "") {
      return context.json({ error: "agentId must not be empty." }, 400);
    }
    try {
      const runs = await routineStore.listRunsFor(
        context.var.actor.id,
        limit,
        agentId,
      );
      return context.json({ runs: runs.map(ownedRunDto) });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.get("/", requireUser, async (context) => {
    const [routines, sweptAt] = await Promise.all([
      routineStore.listFor(context.var.actor.id),
      routineStore.lastSweptAt().catch(() => null),
    ]);
    return context.json({
      routines: routines.map(routineDto),
      sweep: sweepDto(sweptAt),
    });
  });

  routes.put("/:id/enabled", requireUser, async (context) => {
    const body = await context.req.json().catch(() => null);
    const enabled = (body as { enabled?: unknown } | null)?.enabled;
    if (typeof enabled !== "boolean") {
      return context.json({ error: "enabled must be true or false." }, 400);
    }
    // An empty id would reach the store and answer 500 on some backends instead of a 400 for a
    // malformed call. Owner-scoping stays in the store; shape is checked here.
    const id = context.req.param("id");
    if (!id.trim()) {
      return context.json({ error: "A routine id is required." }, 400);
    }

    try {
      await routineStore.setEnabled(context.var.actor.id, id, enabled);
      return context.json({ enabled });
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  routes.delete("/:id", requireUser, async (context) => {
    const id = context.req.param("id");
    if (!id.trim()) {
      return context.json({ error: "A routine id is required." }, 400);
    }
    try {
      await routineStore.remove(context.var.actor.id, id);
      return context.body(null, 204);
    } catch (error) {
      return mapStoreError(context, error);
    }
  });

  return routes;
}

/**
 * One row of the routines page.
 *
 * THE DTO CARRIES THE WORDS, NOT THE CRON. The client never parses a schedule, so words-from-cron is
 * computed once, server-side, by the same library that decides when a routine actually fires — there
 * is no second implementation of cron-to-English anywhere to drift out of step with it. `schedule` is
 * opaque display text, never a value to parse: prose for the shapes `describeCron` recognizes, and
 * the raw five-field expression for everything stranger than that. `nextRunAt` is the one place a
 * time is computed, and it is computed the same way, by `nextOccurrence`.
 */
type RoutineDto = {
  id: string;
  /** Which Bot carries it out, so a Bot's own screen can show only its routines. */
  agentId: string;
  schedule: string;
  timezone: string;
  instruction: string;
  channel: { id: string; name: string | null; gone: boolean };
  enabled: boolean;
  nextRunAt: string;
  lastRun: { status: RoutineRunOutcome | null; at: string | null } | null;
};

export const SWEEP_SILENCE_MS = MINIMUM_INTERVAL_MS;

type SweepDto = {
  lastSweptAt: string | null;
  working: boolean;
};

function sweepDto(sweptAt: Date | null, now = new Date()): SweepDto {
  return {
    lastSweptAt: sweptAt?.toISOString() ?? null,
    working:
      sweptAt !== null && now.getTime() - sweptAt.getTime() <= SWEEP_SILENCE_MS,
  };
}

function routineDto(routine: RoutineSummary): RoutineDto {
  return {
    id: routine.id,
    agentId: routine.agentId,
    schedule: routine.schedule,
    timezone: routine.timezone,
    instruction: routine.instruction,
    channel: {
      id: routine.channelId,
      name: routine.channelName,
      gone: routine.channelDeleted,
    },
    enabled: routine.enabled,
    nextRunAt: routine.nextRunAt.toISOString(),
    lastRun: routine.lastRun
      ? {
          status: routine.lastRun.status,
          at: routine.lastRun.finishedAt?.toISOString() ?? null,
        }
      : null,
  };
}

/** One firing in the cross-routine history. `status: null` is in flight, shown as "running". */
function ownedRunDto(run: OwnedRunSummary) {
  return {
    id: run.id,
    routineId: run.routineId,
    agentId: run.agentId,
    status: run.status ?? "running",
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error,
    source: run.source,
  };
}

/** The history's row limit: absent is 50, a whole number from 1 to 100 is that, anything else is refused. */
function runsLimit(text: string | undefined): number | null {
  if (text === undefined) return 50;
  if (!/^\d{1,3}$/.test(text)) return null;
  const value = Number.parseInt(text, 10);
  return value >= 1 && value <= 100 ? value : null;
}

function mapStoreError(context: Context, error: unknown): Response {
  // The store's own sentence, verbatim: it already reads the same whether the id belongs to nobody
  // or to somebody else, which is what keeps ownership unprobeable from out here.
  if (error instanceof RoutineNotFoundError) {
    return context.json({ error: error.message }, 404);
  }
  if (error instanceof RoutineRefusedError) {
    return context.json({ error: error.message }, 400);
  }
  throw error;
}
