/**
 * The routes of programs on the person's computer (docs/design/programs-on-your-computer.md 2.3 and 6.1, D60),
 * mounted at `/api/programs`.
 *
 *   POST /helper/poll     the helper's poll. No session: the body is signed (`protocol.ts`), current and used
 *                         once. Answers `{ operations, leaseMs }`; a body that does not prove itself is 401.
 *   POST /helper/result   the helper's answer to one operation, signed over its exact payload.
 *   GET  /                the person's own view: is it on, is the helper there, is something running.
 *   PUT  /switch          { enabled: boolean }: the switch. The person's own session AND at the computer
 *                         (`freeduet/at-the-computer.ts`, the one definition): a browser that is not paired
 *                         with this computer, a request through a tunnel or proxy, and a request that did not
 *                         come from this machine are refused. Nothing a member runs reaches it.
 *
 * Every one of them is on the list of what a remote session may not reach (`auth/remote-limits.ts`, family
 * `computers`), and the helper's two have no session at all: their credential is the mac.
 */
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import type { AuditStore } from "../audit";
import type { AppVariables } from "../auth/guards";
import type { PairingGate } from "../auth/install-secret";
import { atTheComputer } from "../freeduet/at-the-computer";
import type { ProgramsBroker } from "./broker";
import type { ProgramsSwitch } from "./switch";

export const NOT_AT_THE_COMPUTER =
  "Programs on this computer can only be switched on or off from this computer.";

const change = z.strictObject({ enabled: z.boolean() });

export function createProgramsRoutes(options: {
  broker: ProgramsBroker;
  switch: Pick<ProgramsSwitch, "isOn" | "set">;
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  /** With sign-in and an installation secret, "at the computer" also asks for a live pairing of this person. */
  pairing?: PairingGate;
  auditStore?: AuditStore;
}) {
  const { broker, requireUser } = options;
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.post("/helper/poll", async (context) => {
    const body = await context.req.json().catch(() => null);
    const outcome = await broker.poll(body);
    return outcome.ok
      ? context.json(
          { operations: outcome.operations, leaseMs: outcome.leaseMs },
          200,
          { "Cache-Control": "no-store" },
        )
      : context.json({ error: outcome.reason }, 401);
  });

  routes.post("/helper/result", async (context) => {
    const body = await context.req.json().catch(() => null);
    const outcome = broker.result(body);
    return outcome.ok
      ? context.json({ ok: true })
      : context.json({ error: outcome.reason }, 401);
  });

  routes.get("/", requireUser, async (context) => {
    const actorId = context.var.actor.id;
    return context.json(
      {
        enabled: await options.switch.isOn(actorId),
        ...broker.statusFor(actorId),
      },
      200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.put("/switch", requireUser, async (context) => {
    const actor = context.var.actor;
    if (
      !(await atTheComputer(
        context.env,
        context.req.raw,
        options.pairing,
        actor.id,
      ))
    )
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    const parsed = change.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success)
      return context.json(
        { error: "Send { enabled: true } or { enabled: false }." },
        400,
      );
    const on = await options.switch.set(actor.id, parsed.data.enabled);
    // Off: what is queued and not yet with the helper fails; what the helper has is let finish (Q7).
    if (!on) broker.switchedOff(actor.id);
    return context.json({ enabled: on });
  });

  return routes;
}
