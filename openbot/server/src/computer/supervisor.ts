/**
 * Where a Bot's computer lives, asked of the supervisor.
 *
 * Each Bot gets a container of its own, which means the address of a computer is no longer one
 * fixed URL, it is whatever port the supervisor published for that Bot, and it changes when the
 * computer is reset. So the server stops holding an address and starts asking for one.
 *
 * The server still never touches Docker. It asks for a Bot's computer by Bot; the supervisor decides
 * what that means. Everything the API server can express is in this file, and it is four verbs.
 *
 * Without a supervisor configured, nothing here is used and the fixed `AGENT_COMPUTER_URL` still
 * answers for every Bot. That is the single-container mode: fine for one person on a laptop, and
 * honest about being one shared computer.
 */

import type { ComputerLocation, ComputerProvider } from "./provider";
import type { ComputerStatus } from "./schema";

type SupervisorComputerLocation = {
  botId: string;
  container?: string;
  status: string;
  port?: number;
  /** Where to reach it, decided by the supervisor rather than assembled here. */
  url?: string;
  startedAt?: string;
  /** The token this computer takes. Said by `/ensure`, and never by a listing. */
  token?: string;
};

export type SupervisorOptions = {
  baseUrl: string;
  token?: string;
  /** How a published port becomes a URL the server can reach. */
  hostForPort?: (port: number) => string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** The clock the token memory reads, so a test can move it. */
  now?: () => number;
};

/**
 * How many Bots' tokens are remembered at once, and for how long.
 *
 * A token is remembered to save a call, and never to be right: the supervisor is the one that knows
 * what a computer holds, and every `/ensure` (which every governed action makes) says it again and
 * replaces what was remembered. What a memory has to do is stay small and stop being believed. Small:
 * a token is 64 characters, so a thousand of them are about 100 KB, and a Bot beyond the thousandth
 * pushes out the one remembered longest ago. Not believed for long: a computer that another replica
 * replaced holds a new token, and a minute is the longest this replica goes on presenting the old one
 * to it from a read that is not an `/ensure` (the policy push to every running computer, the live
 * screen), before it asks again.
 */
export const TOKEN_MEMORY_MAX_BOTS = 1024;
export const TOKEN_MEMORY_MAX_AGE_MS = 60_000;

export class SupervisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupervisorError";
  }
}

export function createDockerSupervisorProvider(
  options: SupervisorOptions,
): ComputerProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const base = options.baseUrl.replace(/\/$/, "");
  const timeoutMs = options.timeoutMs ?? 120_000;
  /*
   * Numeric, never `localhost`.
   *
   * `localhost` does not resolve the same way on every operating system — Node prefers `::1`, bun
   * prefers `127.0.0.1` — so a name here reaches a different interface depending on what started
   * the process, and a computer that is listening looks like one that is not.
   */
  const hostForPort =
    options.hostForPort ?? ((port) => `http://127.0.0.1:${port}`);

  /**
   * The last container start time seen for each Bot, from the `/ensure` that located it.
   *
   * ONE MAP PER PROVIDER, not one per process. It was module-scope, so every provider built in a
   * process shared it: two supervisors, or a test's second stack, answered each other's question
   * about which run a Bot's computer is on, and the answer they gave was whichever one wrote last.
   *
   * Not a cache in front of the supervisor: `locate` still calls it every time, and a governed
   * action locates before it asks. This only carries that answer the few lines to whoever needs to
   * know which run of the computer they are talking to.
   *
   * Still process-local, and therefore never the only answer. A replica that has never located this
   * Bot has nothing here, and an unknown run skips the generation check rather than failing it, so
   * `sessionOf` falls back to asking rather than letting an empty map quietly stop checking.
   */
  const sessions = new Map<string, string>();

  /**
   * The token each Bot's computer takes, as the supervisor last said it (see TOKEN_MEMORY_MAX_BOTS).
   *
   * Per provider for the reason `sessions` is. Insertion order is age order, because an entry is
   * deleted before it is written again, so the first key is always the one remembered longest ago.
   */
  const now = options.now ?? Date.now;
  const tokens = new Map<string, { token: string; at: number }>();
  /** A question about one Bot's token that is already out, so a crowd of callers asks it once. */
  const asking = new Map<string, Promise<string>>();

  function remember(botId: string, token: string): void {
    tokens.delete(botId);
    tokens.set(botId, { token, at: now() });
    while (tokens.size > TOKEN_MEMORY_MAX_BOTS) {
      const oldest = tokens.keys().next().value;
      if (oldest === undefined) break;
      tokens.delete(oldest);
    }
  }

  async function call(path: string, method = "POST"): Promise<unknown> {
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: options.token
          ? { authorization: `Bearer ${options.token}` }
          : {},
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new SupervisorError(
        `The container supervisor at ${base} could not be reached (${error instanceof Error ? error.message : String(error)}).`,
      );
    }

    const body = (await response.json().catch(() => null)) as {
      error?: string;
      stopped?: boolean;
      reset?: boolean;
      computers?: SupervisorComputerLocation[];
    } | null;
    if (!response.ok) {
      throw new SupervisorError(
        body?.error ?? `The supervisor answered ${response.status}.`,
      );
    }
    return body;
  }

  async function listRaw(): Promise<SupervisorComputerLocation[]> {
    const body = (await call("/computers", "GET")) as {
      computers?: SupervisorComputerLocation[];
    } | null;
    return body?.computers ?? [];
  }

  async function list(): Promise<ComputerLocation[]> {
    const computers = await listRaw();
    return computers.map((computer) => ({
      botId: computer.botId,
      status:
        computer.status.toLowerCase() === "running" ? "running" : "stopped",
      ...(computer.url
        ? { url: computer.url }
        : computer.port
          ? { url: hostForPort(computer.port) }
          : {}),
      ...(computer.startedAt ? { startedAt: computer.startedAt } : {}),
    }));
  }

  function statusFromLocation(
    botId: string,
    location: SupervisorComputerLocation | undefined,
  ): ComputerStatus {
    if (!location) return { botId, state: "absent" };

    const rawStatus = location.status.toLowerCase();
    switch (rawStatus) {
      case "running":
        return { botId, state: "ready" };
      case "created":
      case "restarting":
        return { botId, state: "starting" };
      case "paused":
      case "removing":
      case "exited":
        return { botId, state: "absent" };
      case "dead":
        return {
          botId,
          state: "unreachable",
          reason: `The computer reported state "${location.status}".`,
        };
      default:
        return {
          botId,
          state: "unreachable",
          reason: `The computer reported unknown state "${location.status}".`,
        };
    }
  }

  return {
    name: "Docker supervisor",
    isolation: "per-bot",

    /**
     * The URL of this Bot's computer, starting it if it is not already up.
     *
     * A computer that is running but has published no port is a computer nothing can reach, so that
     * is an error rather than a URL, the alternative is a caller quietly falling back to somebody
     * else's computer.
     */
    async sessionOf(botId: string): Promise<string | undefined> {
      /*
       * Read from the same `/ensure` every action already makes, and remembered rather than asked
       * for again: on the replica that located this Bot, `locate` ran immediately before the call
       * that needs this, so the value is as fresh as the address it was fetched with. Asking twice
       * would double the supervisor's work on the hot path to learn something it just told us.
       */
      const known = sessions.get(botId);
      if (known) return known;

      /*
       * Nothing here means another replica did the work, not that there is nothing to know.
       *
       * LISTING, NOT ENSURING, and the difference is the whole feature. `/ensure` starts a computer
       * that is not running, so answering "which run is this" with it would wake every idle Bot that
       * anything asked about, and a deployment that suspends idle computers would quietly never
       * suspend one. Listing is a read: a Bot with no computer answers undefined, which is the same
       * answer as before and leaves the check exactly where it was.
       */
      try {
        const computers = await listRaw();
        const startedAt = computers.find(
          (computer) => computer.botId === botId,
        )?.startedAt;
        if (startedAt) sessions.set(botId, startedAt);
        return startedAt;
      } catch {
        // Unknown, not mismatched. A supervisor that cannot be reached must not turn every ref into
        // a refusal; the generation check goes back to being skipped, which is where it started.
        return undefined;
      }
    },

    async locate(botId: string): Promise<string> {
      const state = (await call(
        `/computers/${encodeURIComponent(botId)}/ensure`,
      )) as SupervisorComputerLocation;
      // Recorded on every ensure, so a replaced container is visible to whatever asks next.
      if (state?.startedAt) sessions.set(botId, state.startedAt);
      // The token it takes, from the same answer, so the call this `locate` is for does not need a
      // second trip to learn it. An answer without one is left for `tokenFor` to refuse, which is the
      // one place that says what it means.
      if (typeof state?.token === "string" && state.token)
        remember(botId, state.token);
      // The supervisor says where it is, because only it knows whether these computers sit on a
      // shared network or answer on a published port.
      if (state?.url) return state.url;
      if (state?.port) return hostForPort(state.port);
      throw new SupervisorError(
        `The computer for ${botId} started but reported no address, so it cannot be reached.`,
      );
    },

    /**
     * The token this Bot's computer takes, asked of the supervisor and never of the computer.
     *
     * Remembered from the last `/ensure`, and otherwise asked for once: a Bot nothing here has
     * located (a computer that was already running when this server started, and the next policy
     * push reaches it before any action does) has a miss, and the supervisor answers it with what the
     * container actually holds, which is the old shared token for a computer that has not yet been
     * replaced. Not waking anything: it reads, it never ensures.
     *
     * Refuses rather than guesses. A supervisor too old to say gives no token, and the deployment's
     * `COMPUTER_TOKEN` is not tried in its place: a computer with a token of its own must never be
     * sent the one that opens the others (provider.ts `tokenFor`).
     */
    async tokenFor(botId: string): Promise<string> {
      const known = tokens.get(botId);
      if (known && now() - known.at < TOKEN_MEMORY_MAX_AGE_MS) {
        return known.token;
      }
      const pending = asking.get(botId);
      if (pending) return pending;

      const startedAt = now();
      const question = (async () => {
        let body: { token?: unknown } | null;
        try {
          body = (await call(
            `/computers/${encodeURIComponent(botId)}/token`,
            "GET",
          )) as { token?: unknown } | null;
        } catch (error) {
          // A 404 with no sentence in it is a supervisor that has no such route, which is what an
          // older one answers; the one that has it says "no computer" in words.
          if (
            error instanceof SupervisorError &&
            error.message === "The supervisor answered 404."
          ) {
            throw new SupervisorError(
              "The container supervisor did not answer the request for this computer's token, so it may be older than this server. Update it to the same release.",
            );
          }
          throw error;
        }
        if (typeof body?.token !== "string" || body.token.length === 0) {
          throw new SupervisorError(
            "The container supervisor did not say which token this computer takes, so it may be older than this server. Update it to the same release.",
          );
        }
        // Written only if nothing newer has been: an `/ensure` that finished while this was out
        // knows what the computer holds now, and this answer may be from before it replaced it.
        const current = tokens.get(botId);
        if (!current || current.at < startedAt) remember(botId, body.token);
        return body.token;
      })().finally(() => asking.delete(botId));
      asking.set(botId, question);
      return question;
    },

    async status(botId: string): Promise<ComputerStatus> {
      try {
        const computers = await listRaw();
        return statusFromLocation(
          botId,
          computers.find((computer) => computer.botId === botId),
        );
      } catch (error) {
        return {
          botId,
          state: "unreachable",
          reason:
            error instanceof Error && error.message.length > 0
              ? error.message
              : "Unknown failure.",
        };
      }
    },

    async stop(botId: string): Promise<{ wasRunning: boolean }> {
      const result = (await call(
        `/computers/${encodeURIComponent(botId)}/stop`,
      )) as { stopped?: boolean } | null;
      return { wasRunning: result?.stopped === true };
    },

    async reset(botId: string): Promise<{ cleared: boolean }> {
      const result = (await call(
        `/computers/${encodeURIComponent(botId)}/reset`,
      )) as { reset?: boolean } | null;
      // The computer the token belonged to is gone; the next `/ensure` says the one that replaces it.
      tokens.delete(botId);
      return { cleared: result?.reset === true };
    },

    list,
  };
}
