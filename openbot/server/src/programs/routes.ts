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
 *   POST /helper/pair     the helper's setup, with the one-time code the person typed. No session: the code is the
 *                         proof (`pairing.ts`). Answers the helper's secret ONCE and rotates the salt.
 *   POST /pairing/code    a new one-time code for the person. Session AND at the computer, like the switch.
 *   GET  /pairing         a plain page with three buttons (switch on, switch off, show a code): the first live trial's
 *                         way, until the app has its own screen. Session AND at the computer; carries no secret.
 *
 * Every one of them is on the list of what a remote session may not reach (`auth/remote-limits.ts`, family
 * `computers`), and the helper's two have no session at all: their credential is the mac.
 */
import { createHash } from "node:crypto";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { AuditStore } from "../audit";
import type { AppVariables } from "../auth/guards";
import { atTheComputer } from "../freeduet/at-the-computer";
import type { ProgramsBroker } from "./broker";
import {
  createProgramsPairing,
  PAIRING_CODE_LIFETIME_MS,
  type ProgramsPairing,
} from "./pairing";
import { type ProgramsSwitch, ProgramsUnavailableError } from "./switch";

/** The pairing gate `atTheComputer` takes, named from it so this file does not import the secret's module. */
type PairingGate = Parameters<typeof atTheComputer>[2];

/**
 * The most a helper's body may be, read before anything is parsed: above `MAX_PAYLOAD` of the result's
 * payload and a little more for the rest. The two helper routes need no session, so nobody has to prove
 * anything before the server reads what they send.
 */
export const HELPER_BODY_LIMIT = 512 * 1024;
const tooBig = bodyLimit({
  maxSize: HELPER_BODY_LIMIT,
  onError: (context) => context.json({ error: "That was too large." }, 413),
});

export const NOT_AT_THE_COMPUTER =
  "Programs on this computer can only be switched on or off from this computer.";

const change = z.strictObject({ enabled: z.boolean() });
const redeemBody = z.strictObject({ code: z.string().min(1).max(64) });

/** The plain page of the first live trial. One inline script, allowed by its hash and nothing else. */
const PAIRING_SCRIPT = `
const out = document.getElementById("out");
async function call(method, path, body) {
  out.textContent = "...";
  try {
    const r = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return [r.ok, await r.json()];
  } catch { return [false, {}]; }
}
document.getElementById("on").addEventListener("click", async () => {
  const [ok, j] = await call("PUT", "/api/programs/switch", { enabled: true });
  out.textContent = ok ? "Switched on." : (j.error || "Not possible.");
});
document.getElementById("off").addEventListener("click", async () => {
  const [ok, j] = await call("PUT", "/api/programs/switch", { enabled: false });
  out.textContent = ok ? "Switched off." : (j.error || "Not possible.");
});
document.getElementById("go").addEventListener("click", async () => {
  const [ok, j] = await call("POST", "/api/programs/pairing/code", {});
  out.textContent = ok ? j.code + "  (good for 2 minutes, once)" : (j.error || "Not possible.");
});
`;
const PAIRING_PAGE = `<!doctype html><meta charset="utf-8"><title>Programs on this computer</title>
<body style="font-family:system-ui;max-width:32rem;margin:3rem auto;line-height:1.5">
<h1>Programs on this computer</h1>
<p>A temporary page for the first trial, until Settings has its own screen. 1. Switch on. 2. Show a code and type it into the helper's setup window on this PC; it works once and for two minutes.</p>
<p><button id="on">Switch on</button> <button id="off">Switch off</button> <button id="go">Show a code</button></p>
<p id="out" style="font:600 1.6rem ui-monospace,monospace"></p>
<script>${PAIRING_SCRIPT}</script>`;
const PAIRING_CSP = `default-src 'none'; script-src 'sha256-${createHash("sha256").update(PAIRING_SCRIPT).digest("base64")}'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`;

export function createProgramsRoutes(options: {
  broker: ProgramsBroker;
  switch: Pick<ProgramsSwitch, "isOn" | "set" | "rotateSalt">;
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  /** With sign-in and an installation secret, "at the computer" also asks for a live pairing of this person. */
  pairing?: PairingGate;
  auditStore?: AuditStore;
  /** Tests inject one with their own clock; the server makes its own. */
  programsPairing?: ProgramsPairing;
}) {
  const { broker, requireUser } = options;
  const pairing =
    options.programsPairing ??
    createProgramsPairing({
      isOn: (actorId) => options.switch.isOn(actorId),
      rotateSalt: (actorId) => options.switch.rotateSalt(actorId),
      secretFor: (actorId) => broker.helperSecretFor(actorId),
      ...(options.auditStore ? { audit: options.auditStore } : {}),
    });
  const gate = options.pairing;
  const routes = new Hono<{ Variables: AppVariables }>();

  routes.post("/helper/poll", tooBig, async (context) => {
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

  routes.post("/helper/result", tooBig, async (context) => {
    const body = await context.req.json().catch(() => null);
    const outcome = await broker.result(body);
    return outcome.ok
      ? context.json({ ok: true })
      : context.json({ error: outcome.reason }, 401);
  });

  routes.post("/helper/pair", tooBig, async (context) => {
    const body = redeemBody.safeParse(
      await context.req.json().catch(() => null),
    );
    // A body of the wrong shape counts as a wrong try, like a wrong code.
    const outcome = await pairing.redeem(body.success ? body.data.code : null);
    if (outcome.ok)
      return context.json(
        {
          actorId: outcome.actorId,
          secret: outcome.secret,
          serverTime: outcome.serverTime,
        },
        200,
        { "Cache-Control": "no-store" },
      );
    return context.json(
      { error: "That code was not accepted." },
      outcome.reason === "rate_limited" ? 429 : 401,
    );
  });

  routes.post("/pairing/code", requireUser, async (context) => {
    const actor = context.var.actor;
    if (!(await atTheComputer(context.env, context.req.raw, gate, actor.id)))
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    const made = await pairing.makeCode(actor.id);
    if (!made.ok)
      return context.json(
        {
          error:
            made.reason === "off"
              ? "Switch programs on this computer on first."
              : "Too many codes. Wait a minute.",
        },
        made.reason === "off" ? 409 : 429,
      );
    return context.json(
      {
        code: made.code,
        expiresInSeconds: PAIRING_CODE_LIFETIME_MS / 1000,
      },
      200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.get("/pairing", requireUser, async (context) => {
    if (
      !(await atTheComputer(
        context.env,
        context.req.raw,
        gate,
        context.var.actor.id,
      ))
    )
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    return context.html(PAIRING_PAGE, 200, {
      "Cache-Control": "no-store",
      "Content-Security-Policy": PAIRING_CSP,
    });
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
    if (!(await atTheComputer(context.env, context.req.raw, gate, actor.id)))
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    const parsed = change.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success)
      return context.json(
        { error: "Send { enabled: true } or { enabled: false }." },
        400,
      );
    let on: boolean;
    try {
      on = await options.switch.set(actor.id, parsed.data.enabled);
    } catch (error) {
      if (error instanceof ProgramsUnavailableError)
        return context.json({ error: error.message }, 409);
      throw error;
    }
    // Off: what is queued and not yet with the helper fails; what the helper has is let finish (Q7).
    if (!on) broker.switchedOff(actor.id);
    return context.json({ enabled: on });
  });

  return routes;
}
