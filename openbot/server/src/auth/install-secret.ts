import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import type { DeploymentConfig } from "../config";
import { isLoopbackRequest, personIsLoopbackOnly } from "./peer";

/**
 * FreeDuet (docs/M1_PLAN.md D28): one secret per installation, for the one thing a network position
 * cannot settle.
 *
 * THE GAP. With no sign-in the person is a loopback peer (auth/peer.ts), which is exact on Linux,
 * where a container reaches this server on the Docker bridge and its peer is the bridge. On Docker
 * Desktop (Windows, macOS) a container that calls the host's published port is carried through the
 * VM's own proxy, and the server sees 127.0.0.1: the same address as the person's browser. Nothing in
 * the TCP connection tells the two apart, so the peer rule cannot, and a process in a member's
 * computer reaches `/api/approvals` as the administrator.
 *
 * THE RULE. Where the person is a loopback peer and this installation has a secret, the person is also
 * the one who holds it. The browser holds it as a cookie that only a pairing link, opened on this
 * machine by `scripts/open.sh`, ever sets; the host's own scripts send the same cookie. Nothing a
 * member's container can reach hands it out: it is in no environment and no mount that container gets,
 * in no route anybody can call, and the link that sets the cookie is minted by a call that needs the
 * secret itself.
 *
 * WHAT IT DOES NOT DO. It decides nothing where the peer rule already says no, it does not touch a
 * deployment with sign-in, and it does not touch one the person opened with `OPENBOT_HOST` (everybody
 * who can reach it is the administrator, which that setting has always said and the boot log repeats).
 * A server started by hand with no secret keeps the peer rule alone, and says so at boot.
 *
 * The secret is never logged and never in a URL: the only thing a URL carries is a pairing token
 * that is good once, for two minutes.
 */

export const INSTALL_SECRET_VARIABLE = "FREEDUET_INSTALL_SECRET";

/** The code the 401 carries when the peer is the person's machine but the browser is not paired. */
export const PAIRING_REQUIRED = "pairing_required";

/** Where the host's own launcher asks for a link. Not under /api: it is not the browser's. */
export const PAIRING_MINT_PATH = "/internal/pairing";

/** Where the browser exchanges a link for the cookie. Under /api, so the app's own proxy carries it. */
export const PAIRING_REDEEM_PATH = "/api/pair";

/** A pairing link is good once, for this long. */
const PAIRING_LIFETIME_MS = 120_000;

/** Links minted and not yet used, at most. The oldest goes first. */
const PAIRING_OUTSTANDING = 16;

/** 400 days, which is the longest lifetime Chrome keeps whatever a cookie asks for. */
const COOKIE_MAX_AGE_SECONDS = 34_560_000;

const SECRET_SHAPE = /^[A-Za-z0-9_-]{32,256}$/;

/**
 * `installSecret` for the configuration. Read only in single-user mode: a deployment with sign-in has
 * nothing to ask it for. A value that is set and cannot be one stops the boot, because ignoring it
 * would quietly switch the protection off.
 */
export function installSecretSetting(
  environment: Record<string, string | undefined>,
  singleUser: boolean,
): { installSecret?: string } {
  if (!singleUser) return {};
  const value = environment[INSTALL_SECRET_VARIABLE]?.trim();
  if (!value) return {};
  if (!SECRET_SHAPE.test(value)) {
    throw new Error(
      `${INSTALL_SECRET_VARIABLE} must be 32 to 256 letters, digits, "-" or "_". Delete the line and run scripts/start.sh, which writes a new one.`,
    );
  }
  return { installSecret: value };
}

/**
 * The cookie's name. The server's port is in it so that two installations on one machine (the real
 * stack and the eval stack, say) keep a cookie each: a cookie is shared by every port of a host.
 */
export function installCookieName(port: number): string {
  return `freeduet_install_${port}`;
}

/** What the person proves, when this installation has a secret. */
export type InstallGate = { readonly secret: string; readonly cookie: string };

/**
 * Who the person is, for a deployment with no sign-in.
 *
 * `loopbackOnly`: only a loopback peer (auth/peer.ts); false is everybody who reaches the server.
 * `install`: besides that, the holder of this installation's secret.
 */
export type PersonRule = {
  loopbackOnly: boolean;
  install?: InstallGate;
};

export function personRule(
  config: Pick<
    DeploymentConfig,
    "singleUser" | "listen" | "port" | "installSecret"
  >,
): PersonRule {
  const loopbackOnly = personIsLoopbackOnly(config);
  return {
    loopbackOnly,
    ...(loopbackOnly && config.installSecret
      ? {
          install: {
            secret: config.installSecret,
            cookie: installCookieName(config.port),
          },
        }
      : {}),
  };
}

/** `person`; `elsewhere`, not this machine's loopback; `unpaired`, this machine's, but no secret. */
export type PersonVerdict = "person" | "elsewhere" | "unpaired";

/**
 * Whether a request is the person. The one place the answer is given: the app's guard, the CopilotKit
 * mount behind it and the live-screen upgrade, which resolves its actor outside the app, all ask here.
 */
export function personVerdict(
  rule: PersonRule,
  env: unknown,
  request: Request,
): PersonVerdict {
  if (!rule.loopbackOnly) return "person";
  if (!isLoopbackRequest(env, request)) return "elsewhere";
  if (rule.install && !holdsInstallSecret(request, rule.install)) {
    return "unpaired";
  }
  return "person";
}

/** Both digested, so neither the length nor any prefix of the secret shows in how long this takes. */
function sameSecret(offered: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(offered).digest(),
    createHash("sha256").update(expected).digest(),
  );
}

/** Whether the request carries the secret, as the cookie. Any one of several cookies of the name. */
export function holdsInstallSecret(
  request: Request,
  gate: InstallGate,
): boolean {
  const header = request.headers.get("cookie");
  if (!header) return false;
  return header.split(";").some((part) => {
    const equals = part.indexOf("=");
    if (equals < 0 || part.slice(0, equals).trim() !== gate.cookie) {
      return false;
    }
    return sameSecret(part.slice(equals + 1).trim(), gate.secret);
  });
}

/**
 * The cookie that pairing sets.
 *
 * HttpOnly, so no page script reads it. SameSite=Strict, so a page on another site never has it sent.
 * Host-only, with no Domain. Not Secure, because the app is `http://localhost`. `Path=/api` is where
 * every guarded route and both websockets are, and keeps it off the app's own assets.
 */
function installCookie(gate: InstallGate): string {
  return `${gate.cookie}=${gate.secret}; Path=/api; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict`;
}

/**
 * Links that are good once. Held in memory: a link only has to outlive the second or two between the
 * launcher asking for it and the browser opening it, and a restart in between is a new link.
 */
export function createPairingLinks(now: () => number = Date.now) {
  // Hashes, not the links, though nothing here is written anywhere.
  const outstanding = new Map<string, number>();
  const digest = (link: string) =>
    createHash("sha256").update(link).digest("hex");
  const sweep = () => {
    const current = now();
    for (const [key, expires] of outstanding) {
      if (expires <= current) outstanding.delete(key);
    }
  };
  return {
    mint(): { link: string; expiresInSeconds: number } {
      sweep();
      while (outstanding.size >= PAIRING_OUTSTANDING) {
        const oldest = outstanding.keys().next().value;
        if (oldest === undefined) break;
        outstanding.delete(oldest);
      }
      const link = randomBytes(32).toString("base64url");
      outstanding.set(digest(link), now() + PAIRING_LIFETIME_MS);
      return { link, expiresInSeconds: PAIRING_LIFETIME_MS / 1000 };
    },
    /** True once per link, inside its lifetime. */
    redeem(link: string): boolean {
      sweep();
      return outstanding.delete(digest(link));
    },
  };
}

function bearer(request: Request): string | null {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    /\s+/,
    2,
  );
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function logPairing(outcome: "minted" | "paired" | "refused") {
  // No link, no secret, no address: that a pairing happened, and which way it went.
  console.info(JSON.stringify({ type: "install-pairing", outcome }));
}

/**
 * The two doors of pairing. Mounted only where the rule asks for the secret, so everywhere else
 * there is no door at all rather than one that always refuses.
 *
 *  - `POST /internal/pairing`: the launcher, on this machine, with the secret as a bearer token,
 *    gets a link that is good once. The secret is the credential; a request without it (a
 *    container's, on Docker Desktop) is refused with the same answer whatever was wrong.
 *  - `GET /api/pair?token=`: the browser, handed that link by the launcher, gets the cookie and is
 *    sent to the app. A link that is unknown, used or old gets nothing. The address it redirects to
 *    is fixed, so there is no `next` to bend.
 */
export function createInstallPairingRoutes(
  gate: InstallGate,
  options: { now?: () => number } = {},
) {
  const links = createPairingLinks(options.now);
  const routes = new Hono();

  routes.post(PAIRING_MINT_PATH, (context) => {
    const offered = bearer(context.req.raw);
    if (
      !isLoopbackRequest(context.env, context.req.raw) ||
      !offered ||
      !sameSecret(offered, gate.secret)
    ) {
      logPairing("refused");
      return context.json({ error: "This endpoint is the launcher's." }, 401);
    }
    const { link, expiresInSeconds } = links.mint();
    logPairing("minted");
    context.header("Cache-Control", "no-store");
    return context.json({
      path: `${PAIRING_REDEEM_PATH}?token=${link}`,
      expiresInSeconds,
    });
  });

  routes.get(PAIRING_REDEEM_PATH, (context) => {
    const offered = context.req.query("token");
    if (
      !isLoopbackRequest(context.env, context.req.raw) ||
      !offered ||
      !links.redeem(offered)
    ) {
      logPairing("refused");
      return new Response(
        "This link has expired or was already used. On the computer this runs on, run: bash scripts/open.sh",
        {
          status: 401,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }
    logPairing("paired");
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/",
        "Set-Cookie": installCookie(gate),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  });

  return routes;
}
