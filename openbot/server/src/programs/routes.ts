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
 *   GET  /pairing/helper.zip  the helper's four files as one zip, from the folder the server itself carries. Session
 *                         AND at the computer; a fixed name, never a path from the request; an audit row.
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
import { recordAuditEvent } from "../audit";
import { atTheComputer } from "../freeduet/at-the-computer";
import {
  buildHelperZip,
  HELPER_ZIP_NAME,
  HelperFilesMissingError,
  HelperFilesRefusedError,
} from "./helper-bundle";
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

export const CANNOT_TELL_THE_PERSON =
  "Programs on this computer cannot be switched on here: without an installation secret, FreeDuet cannot tell you from a program that runs in an assistant's computer. Run scripts/start.sh, which writes the secret, and open FreeDuet with the link it prints.";

export const NOT_AT_THE_COMPUTER =
  "Programs on this computer can only be switched on or off from this computer.";

const change = z.strictObject({ enabled: z.boolean() });
const redeemBody = z.strictObject({ code: z.string().min(1).max(64) });

/** The plain page of the first live trial. One inline script, allowed by its hash and nothing else. */
export const PAIRING_SCRIPT = `
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
<body style="font-family:system-ui;max-width:36rem;margin:3rem auto;line-height:1.5">
<h1>Programs on this computer</h1>
<p>A temporary page, until Settings has its own screen. Do the three steps on this computer, in this order.</p>
<p><b>1.</b> <button id="on">Switch on</button> <button id="off">Switch off</button></p>
<p><b>2.</b> <a id="dl" href="/api/programs/pairing/helper.zip" download>Download the helper</a> (a zip of four files). Save it and extract it into a folder of your own, for example <code>Downloads\\freeduet-programs-helper</code>.</p>
<p><b>3.</b> Open a normal PowerShell window (not "as administrator") in that folder and run these two lines, one after the other:</p>
<pre style="background:#f3f3f3;padding:.6rem;overflow:auto;user-select:all">Unblock-File .\\*.ps1
powershell -NoProfile -ExecutionPolicy RemoteSigned -File .\\setup.ps1</pre>
<p>These scripts come from this FreeDuet installation, and they are plain text: open each one in Notepad and read it before you run it. <code>Unblock-File</code> removes the "downloaded from the Internet" mark that Windows puts on these files; that mark is what stops Windows running them under <code>RemoteSigned</code>.</p>
<p>When the window asks for the code, press <button id="go">Show a code</button> here and type the code <b>into that window only</b>. It works once and for two minutes. Never type it into a chat and never give it to anyone.</p>
<p id="out" style="font:600 1.6rem ui-monospace,monospace"></p>
<script>${PAIRING_SCRIPT}</script>`;
const PAIRING_CSP = `default-src 'none'; script-src 'sha256-${createHash("sha256").update(PAIRING_SCRIPT).digest("base64")}'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

export function createProgramsRoutes(options: {
  broker: ProgramsBroker;
  switch: Pick<ProgramsSwitch, "isOn" | "set" | "rotateSalt">;
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  /** With sign-in and an installation secret, "at the computer" also asks for a live pairing of this person. */
  pairing?: PairingGate;
  auditStore?: AuditStore;
  /**
   * True when this deployment cannot tell the person from a member's computer: single-user mode with no installation
   * secret (a loopback caller is "the person", and on Docker Desktop a member's computer arrives as loopback). Then the
   * function cannot be switched ON and no pairing code is made. Set by `app.ts`, which already knows the secret.
   */
  singleUserWithoutSecret?: boolean;
  /** Where the helper's files are; tests name a folder, the server uses the one it carries. */
  helperDir?: string;
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
  const refused = () => options.singleUserWithoutSecret === true;
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
    const server = (
      context.env as {
        server?: { requestIP?: (r: Request) => { address: string } | null };
      } | null
    )?.server;
    let source = "unknown";
    try {
      source = server?.requestIP?.(context.req.raw)?.address ?? "unknown";
    } catch {
      source = "unknown";
    }
    const outcome = await pairing.redeem(
      body.success ? body.data.code : null,
      source,
    );
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
    if (refused()) return context.json({ error: CANNOT_TELL_THE_PERSON }, 403);
    if (!(await atTheComputer(context.env, context.req.raw, gate, actor.id)))
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    const made = await pairing.makeCode(actor.id);
    if (!made.ok)
      return context.json(
        {
          error:
            made.reason === "off"
              ? "Turn on programs on this computer first."
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

  routes.get("/pairing/helper.zip", requireUser, async (context) => {
    const actor = context.var.actor;
    if (refused()) return context.json({ error: CANNOT_TELL_THE_PERSON }, 403);
    if (!(await atTheComputer(context.env, context.req.raw, gate, actor.id)))
      return context.json({ error: NOT_AT_THE_COMPUTER }, 403);
    let zip: Buffer;
    try {
      zip = await buildHelperZip(options.helperDir);
    } catch (error) {
      if (error instanceof HelperFilesRefusedError && options.auditStore)
        await recordAuditEvent(options.auditStore, {
          eventType: "configuration.changed",
          targetType: "programs",
          actorUserId: actor.id,
          payload: {
            change: "programs_helper_refused",
            file: error.file,
            reason: error.reason,
          },
        }).catch(() => undefined);
      if (
        error instanceof HelperFilesMissingError ||
        error instanceof HelperFilesRefusedError
      )
        return context.json(
          {
            error:
              "This FreeDuet does not carry the helper's files. Update FreeDuet, or take the folder openbot/scripts/programs-helper from the repository.",
          },
          404,
        );
      throw error;
    }
    if (options.auditStore)
      await recordAuditEvent(options.auditStore, {
        eventType: "configuration.changed",
        targetType: "programs",
        actorUserId: actor.id,
        payload: { change: "programs_helper_downloaded", bytes: zip.length },
      }).catch(() => undefined);
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${HELPER_ZIP_NAME}"`,
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  routes.get("/pairing", requireUser, async (context) => {
    if (refused()) return context.json({ error: CANNOT_TELL_THE_PERSON }, 403);
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
      "X-Frame-Options": "DENY",
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
    if (parsed.success && parsed.data.enabled && refused())
      return context.json({ error: CANNOT_TELL_THE_PERSON }, 403);
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
