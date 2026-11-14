import type { MiddlewareHandler } from "hono";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import type { AppVariables, AuthenticatedActor } from "./guards";
import {
  PAIRING_REQUIRED,
  type PersonRule,
  personVerdict,
} from "./install-secret";

/**
 * A signed-in person, without signing in.
 *
 * A deployment with no identity provider is one administrator and no sign-in, so `bun run dev`
 * reaches the product without registering an OAuth client first. Nobody should have to set up Entra
 * to look at a Bot. `.env.example` ships that line switched on, so a clone still runs with no
 * configuration at all.
 *
 * The lock is the flag and nothing else. It used to be `NODE_ENV`, which is exactly backwards:
 * `NODE_ENV` is unset by default, so the one case it had to catch was the one it let through. A
 * container run on a VM with a hand-written env file and no provider served every visitor on the
 * internet as an administrator, and said nothing, because it looked like it was working. Now the
 * deployment refuses to start unless somebody wrote down that they meant it.
 *
 * The actor is an administrator so admin surfaces can be reached too, and its id is fixed so
 * Intelligence threads and memory stay attached to the same person across restarts.
 */

export const DEV_ACTOR: AuthenticatedActor = {
  id: "dev-local-user",
  email: "dev@openbot.local",
  role: "admin",
};

type UserWriter = Pick<Database, "insert">;

export async function initializeDevActorUser(
  database: UserWriter,
  enabled: boolean,
): Promise<boolean> {
  if (!enabled) return false;

  const name = DEV_ACTOR.name ?? DEV_ACTOR.email;
  await database
    .insert(users)
    .values({
      id: DEV_ACTOR.id,
      email: DEV_ACTOR.email,
      name,
      emailVerified: false,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: DEV_ACTOR.email,
        name,
        updatedAt: new Date(),
      },
    });

  return true;
}

/**
 * Whether this deployment admits everybody as one administrator.
 *
 * Only ever true when no identity provider is configured: a provider always wins, so a deployment
 * cannot half sign people in.
 *
 * @param hasProvider whether any identity provider is configured
 */
export function singleUserEnabled(
  environment: Record<string, string | undefined>,
  hasProvider: boolean,
): boolean {
  if (hasProvider) return false;

  // Said explicitly, which is the only way to run with no sign-in at all. Not a default, and not
  // inferred from anything: every signal that could stand in for "this is only my laptop" is absent
  // by default on a server too, which is what made the previous NODE_ENV check useless.
  const asked =
    environment.OPENBOT_SINGLE_USER?.trim() === "true" ||
    // The name this had before. Still honoured so an existing .env keeps working.
    environment.OPENBOT_DEV_NO_AUTH?.trim() === "true";
  if (asked) return true;

  throw new Error(
    "No identity provider is configured. Set GOOGLE_OAUTH_*, MICROSOFT_OAUTH_* or OKTA_OAUTH_* with BETTER_AUTH_SECRET and BETTER_AUTH_URL, or set OPENBOT_SINGLE_USER=true to run with one administrator and no sign-in. Refusing to start rather than serving a deployment where every visitor is an administrator.",
  );
}

/**
 * A guard that admits as {@link DEV_ACTOR}. Only ever mounted when singleUserEnabled().
 *
 * `rule` is `personRule(config)` (auth/install-secret.ts). Where the server listens on this machine
 * alone, only a request whose TCP peer is loopback is the person (auth/peer.ts), and any other peer (a
 * container on the Docker bridge) answers 401. Where the installation also has a secret, a loopback
 * peer that does not hold it answers 401 too, which is how a container on Docker Desktop, whose
 * request arrives as loopback, is told from the person's browser. Where somebody opened the server
 * with `OPENBOT_HOST`, everybody who reaches it is admitted, as that setting has always documented.
 */
export function createDevRequireUser(rule: PersonRule): MiddlewareHandler<{
  Variables: AppVariables;
}> {
  return async (context, next) => {
    const verdict = personVerdict(rule, context.env, context.req.raw);
    if (verdict === "elsewhere") {
      return context.json(
        {
          error:
            "Authentication required. With no sign-in, only this machine's own loopback address is the person.",
        },
        401,
      );
    }
    if (verdict === "unpaired") {
      return context.json(
        {
          error:
            "This browser is not paired with this installation. On the computer it runs on, run: bash scripts/open.sh",
          code: PAIRING_REQUIRED,
        },
        401,
      );
    }
    context.set("actor", DEV_ACTOR);
    await next();
  };
}
