import type { PluginRouteContext } from "./context";

/**
 * The person's own mail rules (docs/design/mail-rules.md): see them, switch one off or on, delete one.
 *
 * There is no route that CREATES a rule: a rule is made only through the mailbox gate, by a member's tool
 * call the person ordered or approved. Everything here is scoped to the signed-in person. These routes sit
 * under /api/plugins, which a remote session may not reach (auth/remote-limits.ts), so a phone that is
 * not paired with the computer can neither see nor change the list from the screen; it can ask a member in
 * chat, and a member's change is a card there.
 */
export function mountMailRuleRoutes({
  routes,
  store,
  requireUser,
}: PluginRouteContext) {
  routes.get("/mail-rules", requireUser, async (context) => {
    const rules = await store.listMailRules(context.var.actor.id);
    return context.json({ rules });
  });

  routes.post("/mail-rules/:id/enabled", requireUser, async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      enabled?: unknown;
    } | null;
    if (typeof body?.enabled !== "boolean") {
      return context.json({ error: "enabled is true or false." }, 400);
    }
    const done = await store.changeMailRule(
      context.var.actor.id,
      context.req.param("id"),
      body.enabled ? "enable" : "disable",
    );
    return done
      ? context.json({ ok: true })
      : context.json({ error: "No such rule." }, 404);
  });

  routes.delete("/mail-rules/:id", requireUser, async (context) => {
    const done = await store.changeMailRule(
      context.var.actor.id,
      context.req.param("id"),
      "delete",
    );
    return done
      ? context.json({ ok: true })
      : context.json({ error: "No such rule." }, 404);
  });
}
