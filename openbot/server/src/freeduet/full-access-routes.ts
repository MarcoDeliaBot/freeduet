/**
 * The person's own Full access settings (docs/FULL_ACCESS.md), mounted at `/api/approvals/full-access`
 * by `approvals/routes.ts`. Behind `requireUser`, so only the signed-in person's own session reaches
 * it, and behind the app's same-origin guard like every other change. Nothing a member runs can make
 * this request as the person.
 *
 *   GET /            the members that have it, each with its setting (`full` or `no_payments`), and the
 *                    last actions taken without asking
 *   PUT /:botId      { enabled, mode?, confirm? }: `mode` is `full` (the default, so the body that was
 *                    always valid still means plain Full access) or `no_payments`, Full access without
 *                    payments. Anything that raises what the member may do without asking needs
 *                    `confirm: true`, the app's warning having been accepted: turning either setting on,
 *                    and moving from "without payments" to plain Full access. Moving down to "without
 *                    payments", or off, needs nothing and is immediate.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { ApprovalRefusedError } from "../approvals/types";
import type { AppVariables } from "../auth/guards";
import {
  type FullAccess,
  type FullAccessMode,
  type FullAccessSetting,
  modeOf,
} from "./full-access";

const change = z.strictObject({
  enabled: z.boolean(),
  mode: z.enum(["full", "no_payments"]).optional(),
  confirm: z.boolean().optional(),
});

const CONFIRM: Record<FullAccessMode, string> = {
  full: "Confirm that this member may send, pay, sign, book and delete without asking.",
  no_payments:
    "Confirm that this member may send, sign, book and delete without asking. Payments and purchases still ask.",
};

/** What the person's app reads: each member that has it, with the setting it has. */
const shown = (setting: FullAccessSetting) =>
  Object.fromEntries(
    Object.entries(setting).map(([bot, entry]) => [
      bot,
      { since: entry.since, mode: modeOf(entry) },
    ]),
  );

export function createFullAccessRoutes(
  fullAccess: FullAccess,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  routes.onError((error, context) =>
    error instanceof SyntaxError
      ? context.json({ error: "Supply a valid request." }, 400)
      : context.json(
          { error: error.message },
          error instanceof ApprovalRefusedError || error instanceof z.ZodError
            ? 400
            : 500,
        ),
  );
  routes.get("/", async (context) =>
    context.json({
      bots: shown(await fullAccess.list(context.var.actor.id)),
      recent: await fullAccess.recent(context.var.actor.id),
    }),
  );
  routes.put("/:botId", async (context) => {
    const input = change.parse(await context.req.json());
    const actorId = context.var.actor.id;
    const botId = context.req.param("botId");
    if (!input.enabled && input.mode !== undefined)
      throw new ApprovalRefusedError(
        "Choose a kind of Full access only when turning it on.",
      );
    const mode: FullAccessMode = input.mode ?? "full";
    if (input.enabled) {
      // Only a move down, from plain Full access to "without payments", is made without a confirm.
      const current = (await fullAccess.list(actorId))[botId];
      const movesDown =
        mode === "no_payments" &&
        current !== undefined &&
        modeOf(current) === "full";
      if (!movesDown && input.confirm !== true)
        throw new ApprovalRefusedError(CONFIRM[mode]);
    }
    return context.json({
      bots: shown(await fullAccess.set(actorId, botId, input.enabled, mode)),
    });
  });
  return routes;
}
