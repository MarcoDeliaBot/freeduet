/**
 * The person's own Undo of a change a Bot made from chat, and the list of those changes
 * (docs/design/settings-in-chat.md, section 8).
 *
 * Only a signed-in person reaches them. No member tool and no run calls them, because putting a value back
 * is the person's decision (rule R4), and the change id names a change of this person's only. The list is
 * read for the person's own id alone, so another person gets none of these changes.
 */
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import { type SettingChanges, SettingRefusedError } from "./changes";

export function createSettingChangeRoutes(
  changes: SettingChanges,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
) {
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.get("/", requireUser, async (context) => {
    const list = await changes.list({ ownerUserId: context.var.actor.id });
    return context.json({ changes: list });
  });

  /** The proposal card calls this once, right after the person pressed Create, so the line can offer Undo. */
  routes.post("/members", requireUser, async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      agentId?: unknown;
    } | null;
    if (typeof body?.agentId !== "string" || body.agentId.trim() === "")
      return context.json({ error: "A member id is required." }, 400);
    try {
      const outcome = await changes.memberAdded({
        ownerUserId: context.var.actor.id,
        agentId: body.agentId,
      });
      return context.json({ change: outcome }, 201);
    } catch (error) {
      if (error instanceof SettingRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });

  routes.post("/:changeId/undo", requireUser, async (context) => {
    try {
      const outcome = await changes.undo({
        ownerUserId: context.var.actor.id,
        changeId: context.req.param("changeId"),
      });
      return context.json({
        undone: true,
        changeId: outcome.changeId,
        setting: outcome.setting,
        value: outcome.value,
      });
    } catch (error) {
      if (error instanceof SettingRefusedError)
        return context.json({ error: error.message }, error.status);
      throw error;
    }
  });

  return routes;
}
