import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { cleanLabel, showCode } from "./browser-pairings";
import type { AppVariables } from "./guards";
import type { PairingGate } from "./install-secret";

/**
 * FreeDuet (docs/M1_PLAN.md D49): pairing a phone or another browser from the browser at the computer.
 * Mounted at `/api/pairings`, behind sign-in, only where the deployment has sign-in and an installation secret.
 *
 *  - `GET /`: the person's pairings and whether this browser may make a code. Only a paired browser sees it.
 *  - `POST /code`: a one-time code, good for two minutes. Only a pairing of kind `computer` may ask; a
 *    `device` cannot, so a stolen phone cannot pair a second one.
 *  - `POST /redeem`: the one route a REMOTE session may call (auth/remote-limits.ts). The person is the
 *    session's and nothing in the body names anybody, so a code is only ever good for the person who made it.
 *    The code travels in the body of a POST, never in a URL (a URL goes to logs and to Referer headers).
 *  - `PATCH /:id` and `DELETE /:id`: rename and revoke. A `computer` pairing may do either to any pairing of its
 *    person; a `device` only to itself. Revoking also ends the sign-in session that browser was last seen with
 *    (D74), never the revoking browser's own unless it is the one revoked.
 *
 * Every answer is `no-store`. Nothing here returns a token or a hash, and nothing logs a code.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

const NOT_PAIRED =
  "This browser is not paired with the computer FreeDuet runs on.";

const redeemBody = z.strictObject({
  code: z.string().min(1).max(64),
  label: z.string().max(200).optional(),
});
const renameBody = z.strictObject({ label: z.string().min(1).max(200) });

export function createBrowserPairingRoutes(
  gate: PairingGate,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  options: { appUrl?: string } = {},
) {
  const { pairings } = gate;
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);

  routes.get("/", async (context) => {
    const me = context.var.actor.id;
    const standing = await pairings
      .standing(context.req.raw, me)
      .catch(() => null);
    if (!standing) return context.json({ error: NOT_PAIRED }, 403, NO_STORE);
    const list = await pairings.list(me);
    return context.json(
      {
        pairings: list.map((pairing) => ({
          id: pairing.id,
          label: pairing.label,
          kind: pairing.kind,
          createdAt: pairing.createdAt.toISOString(),
          lastSeenAt: pairing.lastSeenAt.toISOString(),
          current: pairing.id === standing.id,
        })),
        canPair: standing.kind === "computer",
        ...(options.appUrl ? { appUrl: options.appUrl } : {}),
      },
      200,
      NO_STORE,
    );
  });

  routes.post("/code", async (context) => {
    const me = context.var.actor.id;
    const standing = await pairings
      .standing(context.req.raw, me)
      .catch(() => null);
    if (!standing) return context.json({ error: NOT_PAIRED }, 403, NO_STORE);
    if (standing.kind !== "computer")
      return context.json(
        {
          error:
            "Only the browser paired at the computer can pair another one.",
        },
        403,
        NO_STORE,
      );
    const minted = await pairings.mintCode(me, standing.id);
    return context.json(
      {
        code: showCode(minted.code),
        expiresInSeconds: minted.expiresInSeconds,
        ...(options.appUrl
          ? { link: `${options.appUrl}/settings#pair=${minted.code}` }
          : {}),
      },
      200,
      NO_STORE,
    );
  });

  routes.post("/redeem", async (context) => {
    const me = context.var.actor.id;
    const parsed = redeemBody.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return context.json({ error: "Send the code." }, 400, NO_STORE);
    // A browser that is already paired is not paired again: its cookie would be overwritten, a `computer` by a
    // `device`, and its row left with nobody holding it. The code is not used up by the refusal.
    const already = await pairings
      .standing(context.req.raw, me)
      .catch(() => null);
    if (already)
      return context.json(
        {
          error:
            "This browser is already paired. Revoke it first to pair it again.",
        },
        409,
        NO_STORE,
      );
    const address = peerAddress(context.env, context.req.raw);
    const outcome = await pairings.checkCode(me, address, parsed.data.code);
    if (!outcome.ok) {
      return outcome.reason === "rate_limited"
        ? context.json(
            { error: "Too many tries. Wait a minute, then try again." },
            429,
            { ...NO_STORE, "Retry-After": "60" },
          )
        : context.json(
            {
              error:
                "That code is not right, or it has run out. Make a new one on the computer.",
            },
            400,
            NO_STORE,
          );
    }
    const label = cleanLabel(parsed.data.label, "Phone or other browser");
    const made = await pairings.issue(me, "device", label, "code");
    return new Response(
      JSON.stringify({ pairing: { id: made.id, label, kind: "device" } }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "Set-Cookie": made.setCookie,
        },
      },
    );
  });

  /** Whether this browser may act on this pairing: a computer on any of the person's, a device on itself. */
  const mayTouch = async (
    request: Request,
    me: string,
    id: string,
  ): Promise<{ ok: true; self: boolean } | { ok: false }> => {
    const standing = await pairings.standing(request, me).catch(() => null);
    if (!standing) return { ok: false };
    if (standing.kind === "computer" || standing.id === id)
      return { ok: true, self: standing.id === id };
    return { ok: false };
  };

  routes.patch("/:id", async (context) => {
    const me = context.var.actor.id;
    const id = context.req.param("id");
    const allowed = await mayTouch(context.req.raw, me, id);
    if (!allowed.ok) return context.json({ error: NOT_PAIRED }, 403, NO_STORE);
    const parsed = renameBody.safeParse(
      await context.req.json().catch(() => undefined),
    );
    if (!parsed.success)
      return context.json({ error: "Send a name." }, 400, NO_STORE);
    const done = await pairings.rename(
      me,
      id,
      cleanLabel(parsed.data.label, "Browser"),
    );
    return done
      ? context.json({ renamed: true }, 200, NO_STORE)
      : context.json({ error: "There is no such pairing." }, 404, NO_STORE);
  });

  routes.delete("/:id", async (context) => {
    const me = context.var.actor.id;
    const id = context.req.param("id");
    const allowed = await mayTouch(context.req.raw, me, id);
    if (!allowed.ok) return context.json({ error: NOT_PAIRED }, 403, NO_STORE);
    const standing = await pairings
      .standing(context.req.raw, me)
      .catch(() => null);
    // D74: the revoke also ends the sign-in session of the browser that held the pairing. Never the session of the
    // browser doing the revoking, unless that is the browser revoked.
    const done = await pairings.revoke(
      me,
      id,
      standing?.id ?? "unknown",
      allowed.self ? null : (standing?.sessionId ?? null),
    );
    if (!done)
      return context.json(
        { error: "There is no such pairing." },
        404,
        NO_STORE,
      );
    const headers = new Headers({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    // Revoking this very browser also clears its cookie, so it does not keep sending a dead token.
    if (allowed.self)
      for (const header of pairings.clearHeaders())
        headers.append("Set-Cookie", header);
    return new Response(
      JSON.stringify({ revoked: true, signedOut: done.sessionEnded }),
      {
        status: 200,
        headers,
      },
    );
  });

  return routes;
}

/** The peer the server saw, or null. Read from the socket, never from a header. */
function peerAddress(env: unknown, request: Request): string | null {
  const server = (
    env as
      | {
          server?: {
            requestIP?: (r: Request) => { address: string } | null;
          };
        }
      | null
      | undefined
  )?.server;
  try {
    return server?.requestIP?.(request)?.address ?? null;
  } catch {
    return null;
  }
}
