/**
 * `GET /api/freeduet/work-status` (D168): who is working and on what, read-only. Behind `requireUser`,
 * and every row is narrowed to the signed-in person's own hand-offs. The answer holds member ids and
 * names, a clip of the task the person's own Bot wrote, times, a state and a plain step label made from a
 * tool NAME (`work-status.ts`); no tool argument, no page content, no address, no secret.
 */
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import { DEFAULT_MAX_ATTEMPTS } from "../work/queue";
import {
  buildWorkStatus,
  DONE_VISIBLE_MS,
  type HopRow,
  type WorkNotes,
  workNotes,
} from "./work-status";

export type WorkStatusSources = {
  hops: (ownerUserId: string, sinceMs: number) => Promise<readonly HopRow[]>;
  attention: (
    ownerUserId: string,
  ) => Promise<
    ReadonlyArray<{ agentId: string; questions: number; approvals: number }>
  >;
};

export function createWorkStatusRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  sources: WorkStatusSources,
  notes: Pick<WorkNotes, "get"> = workNotes,
  now: () => number = Date.now,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.get("/", async (context) => {
    const ownerUserId = context.var.actor.id;
    const [hops, attention] = await Promise.all([
      sources.hops(ownerUserId, DONE_VISIBLE_MS),
      sources.attention(ownerUserId),
    ]);
    const needsYou = new Map(
      attention.map((row) => [row.agentId, row.questions + row.approvals]),
    );
    context.header("Cache-Control", "private, no-store");
    return context.json({
      ...buildWorkStatus({
        hops,
        notes,
        needsYou,
        names: new Map(),
        now: now(),
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      }),
      at: new Date(now()).toISOString(),
    });
  });
  return routes;
}
