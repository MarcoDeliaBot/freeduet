/**
 * The person's own Full access settings (docs/FULL_ACCESS.md), mounted at `/api/approvals/full-access`
 * by `approvals/routes.ts`. Behind `requireUser`, so only the signed-in person's own session reaches
 * it, and behind the app's same-origin guard like every other change. Nothing a member runs can make
 * this request as the person.
 *
 *   GET /            the members that have it, and the last actions taken without asking
 *   PUT /:botId      { enabled, confirm? }: turning it on needs `confirm: true`, the app's warning
 *                    having been accepted; turning it off needs nothing and is immediate
 */
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { ApprovalRefusedError } from "../approvals/types";
import type { AppVariables } from "../auth/guards";
import type { FullAccess } from "./full-access";

const change = z.strictObject({
  enabled: z.boolean(),
  confirm: z.boolean().optional(),
});

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
      bots: await fullAccess.list(context.var.actor.id),
      recent: await fullAccess.recent(context.var.actor.id),
    }),
  );
  routes.put("/:botId", async (context) => {
    const input = change.parse(await context.req.json());
    if (input.enabled && input.confirm !== true)
      throw new ApprovalRefusedError(
        "Confirm that this member may send, pay, sign, book and delete without asking.",
      );
    return context.json({
      bots: await fullAccess.set(
        context.var.actor.id,
        context.req.param("botId"),
        input.enabled,
      ),
    });
  });
  return routes;
}
