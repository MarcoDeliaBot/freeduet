/**
 * What has to be true before the single-user person's data may be moved, and nothing else.
 *
 * WHAT THE MOVE IS, AND WHY IT IS GUARDED. It hands everything one person owns to an address. Run
 * for the wrong address it is an account takeover: the conversations, the saved logins, the
 * connected apps and the standing permissions (Full access, always-allow rules) all become somebody
 * else's. So every question here is answered from the deployment's own configuration, which only the
 * person who runs it can have written, and never from anything the tool is told on the command
 * line beyond the address itself:
 *
 *  - a sign-in provider is configured, and it is one the sign-in can link a made row to;
 *  - the address is one this deployment would let in as an administrator, by the same three checks
 *    the sign-in runs (auth/index.ts: the domain list, the exact-address list, the removed list);
 *  - nothing is using the database, so nothing writes while the data moves.
 *
 * Each check answers with sentences that say what is wrong and what to do, and none is skipped by a
 * flag. The checks are read-only.
 */
import { eq, sql } from "drizzle-orm";
import { emailDomainAllowed } from "../../auth/email-domain";
import { isConfiguredAdmin } from "../../auth/roles";
import {
  configuredAuthProviders,
  type DeploymentConfig,
  loadConfig,
} from "../../config";
import type { Database } from "../../db/client";
import { revokedAccess } from "../../db/schema";
import { emailAddressAllowed, normalizeAddress } from "../signin-allowlist";
import { SOURCE_EMAIL } from "./registry";

/** Something the person has to fix before the move can run. The message says what. */
export class Refusal extends Error {
  override name = "Refusal";
}

type Environment = Record<string, string | undefined>;

/**
 * The deployment's configuration as the server would read it, and the refusals that follow from it.
 *
 * Throws {@link Refusal} when the environment does not load or this is not a deployment the move is
 * for. Returns the configuration otherwise.
 */
export function adoptionConfig(environment: Environment): DeploymentConfig {
  let config: DeploymentConfig;
  try {
    config = loadConfig(environment);
  } catch (error) {
    throw new Refusal(
      `The settings do not load, so the tool cannot tell what this installation is: ${error instanceof Error ? error.message : String(error)}. Run it from the openbot folder, with the same .env the server uses.`,
    );
  }
  const providers = configuredAuthProviders(config.auth);
  if (providers.length === 0) {
    throw new Refusal(
      "No sign-in provider is configured in these settings. The move is for an installation that is about to turn sign-in on: set the provider (for Google, GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, with BETTER_AUTH_SECRET, BETTER_AUTH_URL and INITIAL_ADMIN_EMAILS) in the same .env the server reads, then run this again.",
    );
  }
  if (config.runtime.mode !== "local") {
    throw new Refusal(
      "This installation keeps conversations and memories in CopilotKit Intelligence, which files them under the user's id and which this tool cannot change. The move is for FREEDUET_INTELLIGENCE=off.",
    );
  }
  if (providers.every((provider) => provider === "microsoft")) {
    throw new Refusal(
      "Microsoft is the only sign-in provider here, and a Microsoft sign-in is not expected to link to an account made ahead of it, so the data would be stranded again. Add Google or Okta, or do not use this tool.",
    );
  }
  return config;
}

/** The address as the sign-in will see it, or a refusal when it cannot be one. */
export function targetAddress(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === "") {
    throw new Refusal(
      "Say whose data this becomes: --to you@example.com (your own address, the one you will sign in with).",
    );
  }
  const address = normalizeAddress(raw);
  if (!address) {
    throw new Refusal(
      `"${raw}" is not an email address this tool can read. Give the one you will sign in with.`,
    );
  }
  if (address === SOURCE_EMAIL) {
    throw new Refusal(
      `${SOURCE_EMAIL} is the address of the person who has no sign-in. Give the address you will sign in with.`,
    );
  }
  return address;
}

/**
 * Why this address could not be the one the data goes to, as sentences. Empty when it can.
 *
 * The three sign-in checks are the sign-in's own (auth/index.ts, `user.create.before`), so an
 * address passes here exactly when the sign-in would let it in. The administrator check is this
 * move's: the single-user person is an administrator, and what it owns (Full access, team rules,
 * connected apps) is an administrator's.
 */
export async function addressProblems(
  config: DeploymentConfig,
  address: string,
  database: Pick<Database, "select">,
): Promise<string[]> {
  const problems: string[] = [];
  if (!isConfiguredAdmin(address, config.auth?.initialAdminEmails ?? [])) {
    problems.push(
      `${address} is not in INITIAL_ADMIN_EMAILS. What the single-user person owns is an administrator's, so it can only go to an address the settings name as one. Add it there, or give the address that is.`,
    );
  }
  if (!emailDomainAllowed(address, config.auth?.allowedEmailDomains ?? [])) {
    problems.push(
      `${address} is outside SIGNIN_ALLOWED_EMAIL_DOMAINS, so it could not sign in.`,
    );
  }
  if (!emailAddressAllowed(address, config.auth?.allowedEmails)) {
    problems.push(
      `${address} is not in SIGNIN_ALLOWED_EMAILS, so it could not sign in.`,
    );
  }
  const removed = await database
    .select({ email: revokedAccess.email })
    .from(revokedAccess)
    .where(eq(revokedAccess.email, address))
    .limit(1);
  if (removed.length > 0) {
    problems.push(
      `${address} was removed by an administrator, and the sign-in would turn it away.`,
    );
  }
  return problems;
}

/** Whether something answers as the OpenBot server on this port, on either loopback address. */
export async function serverAnswersOn(
  port: number,
  timeoutMs = 1500,
): Promise<boolean> {
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const response = await fetch(`http://${host}:${port}/api/capabilities`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as Record<string, unknown>;
      // The one key every OpenBot server states and a stranger's service does not.
      if (body && typeof body === "object" && "durableHistory" in body) {
        return true;
      }
    } catch {
      // Nothing is listening there, or what is listening is not speaking HTTP: not the server.
    }
  }
  return false;
}

/** How long a connection that is closing is given to finish, before it is taken to be in use. */
export const SETTLE_MS = 2000;

export type OtherConnection = {
  user: string;
  application: string;
  state: string;
};

/**
 * Every other connection to this database, from anything: the server, the worker, a console, a
 * restarted stack. This is the proof that nothing else is writing, and it does not depend on where
 * the server runs, on which port, or on what it is called.
 *
 * Counted from the tool's own connection, which is the only one it opens (a second would be listed
 * here as somebody else's).
 */
export async function otherConnections(
  database: Pick<Database, "execute">,
): Promise<OtherConnection[]> {
  const rows = (await database.execute(sql`
    select usename as "user", application_name as application, state
    from pg_stat_activity
    where datname = current_database()
      and pid <> pg_backend_pid()
      and backend_type = 'client backend'
    order by usename, application_name
  `)) as unknown as {
    user: string | null;
    application: string | null;
    state: string | null;
  }[];
  return rows.map((row) => ({
    user: row.user ?? "?",
    application: row.application ?? "",
    state: row.state ?? "",
  }));
}

/**
 * Why the server cannot be taken to be stopped, as sentences. Empty when nothing uses the database.
 *
 * Two questions, because each catches what the other cannot: an HTTP answer on the server's port
 * names the server plainly, and the list of connections catches the worker, a console, a server on
 * another port or inside a container, and a stack something restarted a moment ago.
 */
export async function serverProblems(
  config: DeploymentConfig,
  database: Pick<Database, "execute">,
  settleMs = SETTLE_MS,
): Promise<string[]> {
  const problems: string[] = [];
  if (await serverAnswersOn(config.port)) {
    problems.push(
      `The OpenBot server is answering on port ${config.port}. Stop it (and anything that restarts it) before moving data.`,
    );
  }
  let others = await otherConnections(database);
  // A server that was stopped a moment ago may still be listed while the database finishes closing
  // its connections. Look again for a short while before calling it running: this only forgives a
  // connection that goes away by itself, and a connection that stays is still a refusal.
  const deadline = Date.now() + settleMs;
  while (others.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    others = await otherConnections(database);
  }
  if (others.length > 0) {
    const named = others
      .slice(0, 5)
      .map(
        (other) =>
          `${other.user}${other.application ? ` (${other.application})` : ""}`,
      )
      .join(", ");
    problems.push(
      `${others.length} other connection${others.length === 1 ? " is" : "s are"} using the database: ${named}${others.length > 5 ? ", and more" : ""}. Stop the server and the worker, close any database console, and make sure nothing restarts them, then run this again.`,
    );
  }
  return problems;
}
