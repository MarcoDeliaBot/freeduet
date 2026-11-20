/**
 * Whether a request comes from the person at the computer FreeDuet runs on, and not through a tunnel, a proxy or
 * from another machine (docs/design/engines-dashboard.md 6.8).
 *
 * The Engines page lets an administrator change how the team's engines behave. That is the installation's own
 * business, so it is asked of someone who is at the installation, on top of being an administrator:
 *
 *  1. The TCP peer is this machine's own loopback. It is read from the socket by the server and never from a header
 *     (auth/peer.ts). On a server opened with `OPENBOT_HOST`, where everybody who can reach it is the administrator,
 *     this is the check that still tells the person at the computer from the rest of the network.
 *  2. The request carries none of the headers a proxy, a tunnel or a load balancer adds. A tunnel that runs on this
 *     machine (Tailscale serve, a Cloudflare tunnel, nginx) hands the server a loopback connection for a person who
 *     is far away, and the connection alone cannot tell them apart; the headers they add can. A browser talking to
 *     this machine directly sends none of them.
 *  3. With sign-in and an installation secret, the browser is also paired with this computer: its cookie holds the
 *     token of a live pairing of the SAME signed-in person (D49, auth/browser-pairings.ts, docs/design/phone-and-remote.md
 *     3.5). A tunnel that strips the headers of (2) cannot make that up, and a token of another person is no use. It
 *     is one notion, asked in one place: whoever has the gate (`signInGate`) passes it as `pairing`, with the person.
 *     Without one (single-user mode, where every route already asks for the cookie, and a sign-in deployment that has
 *     no secret) the answer is what it always was.
 *
 * One exception, for the engine choices only (D106): `mayChangeEngines`, below. Everything else asks this function.
 *
 * WHAT THIS IS NOT. It is a second lock and not the first. On Docker Desktop a Bot's computer reaches the server as
 * loopback too (docs/M1_PLAN.md D39), so what keeps that out is the pairing cookie of single-user mode (D28) or the
 * session of a deployment with sign-in, which every `/api` route already needs.
 */
import { isRemote } from "../auth/remote-limits";
import type { PairingGate } from "../auth/install-secret";
import { isDirectRequest } from "../auth/direct-request";

/**
 * Whether this request came straight from this machine. `env` is what `app.fetch(request, env)` was given, which is
 * `{ server }` from `startHttpServer`; a request made in-process has no peer and is nobody's. `pairing` is the gate
 * of a deployment with sign-in and an installation secret (`signInGate`), which adds the pairing to the conditions;
 * `userId` is the person the session names, whose pairing it has to be.
 */
export async function atTheComputer(
  env: unknown,
  request: Request,
  pairing: PairingGate | undefined,
  userId: string,
): Promise<boolean> {
  if (!isDirectRequest(env, request)) return false;
  return pairing === undefined || !(await isRemote(pairing, request, userId));
}

/** The verdict of `mayChangeEngines`: whether the change may go on, and whether it came through an intermediary. */
export type EngineChangeVerdict = { allowed: boolean; viaTunnel: boolean };

/**
 * D106 (docs/M1_PLAN.md, section 68): who may change the engine choices, and ONLY them. The administrator is "at the
 * computer" as `atTheComputer` says, OR, with sign-in and an installation secret, signed in from a browser that holds
 * a live pairing of kind `computer` of the SAME person, whether or not the request came through a tunnel or a proxy
 * that runs on this machine (the maintainer's decision of 20 November 2026: nobody else can sign in as the
 * administrator). The pairing is asked of the gate's own `standing` (the one definition, auth/remote-limits.ts); a
 * `device` pairing (a phone), no pairing and a failing lookup are refused. Without a gate (single-user mode, or sign-in
 * with no secret) the answer is `atTheComputer`'s and a tunnel is still refused.
 *
 * Nothing else asks this: every other "at the computer" route keeps `atTheComputer` and its direct-request condition.
 */
export async function mayChangeEngines(
  env: unknown,
  request: Request,
  pairing: PairingGate | undefined,
  userId: string,
): Promise<EngineChangeVerdict> {
  const direct = isDirectRequest(env, request);
  if (await atTheComputer(env, request, pairing, userId))
    return { allowed: true, viaTunnel: false };
  if (!pairing) return { allowed: false, viaTunnel: !direct };
  try {
    const standing = await pairing.pairings.standing(request, userId);
    return { allowed: standing?.kind === "computer", viaTunnel: !direct };
  } catch {
    return { allowed: false, viaTunnel: !direct };
  }
}
