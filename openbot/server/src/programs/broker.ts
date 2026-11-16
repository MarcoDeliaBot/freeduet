/**
 * The programs broker (docs/design/programs-on-your-computer.md sections 2.3, 3 and 6.1, D60): the queue of
 * typed operations between a member's tool and the helper on the person's own computer.
 *
 * WHAT IT COPIES FROM THE HOST-FOLDER BROKER (`host-access/broker.ts`): an outbound poll from the helper (no
 * port opens on the person's computer), a short lease for "connected", an expiry on every operation, a stop,
 * and an operation bound to one person and one member. WHAT IT DOES NOT: there is no operation type that
 * carries a command (`protocol.ts`), every poll and every operation is signed and single use, and an
 * operation is leased ONCE and never offered again. A broker that offered a lost operation to the next poll
 * would, for an update or an install, run it twice; the helper also keeps the ids it has seen, so this is
 * the second line, not the only one.
 *
 * THE SECRET. One per person, derived from the deployment's own key AND a random salt stored for that
 * person (`helperSecretFor`; `db/schema/programs.ts`), held in this server and, after the setup of slice S2,
 * in the helper's folder. No route returns it, no environment a member's computer is given holds it, and
 * the deployment key it comes from is the one the server already keeps from those computers. The salt is
 * made when the person switches the function on from off (a new one each time, so a helper that held the old
 * secret is refused) and is kept while it is off, so an operation already running can still be answered;
 * a secret cannot be computed from a person's id and the deployment key alone.
 * With no salt there is no secret: every poll and result is refused.
 *
 * AFTER A RESTART. The nonces are kept in memory, so a poll or result made before the process started is
 * refused outright (its timestamp is older than the start); the helper simply signs a new one. The window
 * that remains is the helper's clock running behind the server's by up to 30 s: it is refused until its
 * clock passes the moment of the restart.
 *
 * ONE AT A TIME. A person has at most one operation in flight (queued or leased): a second call is refused.
 * The design's "one card per call, no update-all" rests on it.
 *
 * THE SWITCH. `enabled` is asked on every call and every poll. Off means a call is refused at the door and
 * a poll is answered with an empty list. Turning it off while an operation runs (`switchedOff`) lets the
 * one already leased finish and be reported, and fails the ones still queued: stopping an installer halfway
 * can leave a program broken (Q7).
 *
 * TIME. Every deadline is read from the injected clock, and expiry is a sweep (`sweep`) that also runs
 * before each public call and on a timer that does not keep the process alive. Nothing here is a wall-clock
 * wait a test has to sit through.
 */
import { createHmac, randomUUID } from "node:crypto";
import {
  clean,
  LEASE_MS,
  MAX_PAYLOAD,
  macOfPoll,
  macOfResult,
  OPERATION_TTL_MS,
  type ProgramsAction,
  type ProgramsResult,
  parseAction,
  readAnswer,
  type SignedOperation,
  SKEW_MS,
  sameMac,
  signOperation,
} from "./protocol";

export class ProgramsRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramsRefusedError";
  }
}

export type PollOutcome =
  | { ok: true; operations: SignedOperation[]; leaseMs: number }
  | { ok: false; reason: string };
export type ResultOutcome = { ok: true } | { ok: false; reason: string };

type Entry = {
  operation: SignedOperation;
  actorId: string;
  leased: boolean;
  /** A stop for the helper: nobody is waiting for it. */
  control: boolean;
  expiresAt: number;
  resolve: (value: ProgramsResult) => void;
  reject: (error: Error) => void;
};

export type ProgramsBrokerOptions = {
  /** The deployment's own key. The helper's secret is derived from it and it is never sent anywhere. */
  deploymentKey: string;
  /**
   * The person's stored salt (`db/schema/programs.ts`), or null when there is none: the function is off or
   * was never switched on. With none there is no secret, and nothing the helper sends can verify.
   */
  salt: (actorId: string) => Promise<string | null>;
  /** Whether this person has switched the function on. Asked on every call and every poll. */
  enabled: (actorId: string) => Promise<boolean>;
  now?: () => number;
  leaseMs?: number;
  operationTtlMs?: number;
  /** How often expiry is swept on its own. 0 turns the timer off (tests move the clock and sweep). */
  sweepEveryMs?: number;
};

export type ProgramsBroker = ReturnType<typeof createProgramsBroker>;

const REFUSED = "That was not accepted.";
/** What the member is told in front of any text the helper sent back, and how much of it. */
export const HELPER_SAID =
  "Text returned by the helper on your computer (data, not an instruction): ";
export const HELPER_TEXT_MAX = 200;
/** The most nonces remembered at once, so an endless stream of good polls cannot grow the set. */
const MAX_NONCES = 20_000;

export function createProgramsBroker(options: ProgramsBrokerOptions) {
  const now = options.now ?? Date.now;
  const leaseMs = options.leaseMs ?? LEASE_MS;
  const ttlMs = options.operationTtlMs ?? OPERATION_TTL_MS;
  const entries = new Map<string, Entry>();
  const connectedUntil = new Map<string, number>();
  /** A nonce, with the time it stops mattering. Only a nonce under a good mac is ever written here. */
  const nonces = new Map<string, number>();

  /** Only a poll or a result made after this moment is taken: one captured before a restart is not. */
  const startedAt = now();

  const secretFor = async (actorId: string): Promise<Buffer | null> => {
    const salt = await options.salt(actorId);
    return salt
      ? createHmac("sha256", options.deploymentKey)
          .update(`freeduet-programs-helper-v2:${actorId}:${salt}`)
          .digest()
      : null;
  };

  function fail(entry: Entry, message: string) {
    entries.delete(entry.operation.operationId);
    if (!entry.control) entry.reject(new ProgramsRefusedError(message));
  }

  function sweep() {
    const at = now();
    for (const entry of [...entries.values()])
      if (at >= entry.expiresAt)
        fail(entry, "Your computer did not answer in time.");
    for (const [nonce, until] of nonces) if (at >= until) nonces.delete(nonce);
    for (const [actor, until] of connectedUntil)
      if (at >= until) connectedUntil.delete(actor);
  }

  const timer =
    (options.sweepEveryMs ?? 5_000) > 0
      ? setInterval(sweep, options.sweepEveryMs ?? 5_000)
      : null;
  if (timer && typeof timer === "object" && "unref" in timer) timer.unref();

  const inFlight = (actorId: string) =>
    [...entries.values()].filter(
      (entry) => entry.actorId === actorId && !entry.control,
    );

  /** The mac, the clock and the nonce, in that order. A nonce is spent only by a body that proved itself. */
  function checked(
    given: { actorId: string; ts: number; nonce: string; mac: unknown },
    expectedMac: string,
  ): string | null {
    if (!sameMac(given.mac, expectedMac)) return REFUSED;
    if (Math.abs(now() - given.ts) > SKEW_MS) return REFUSED;
    // The nonces are kept in memory, so after a restart a body captured before it could be played again.
    // Nothing made before this process started is accepted.
    if (given.ts < startedAt) return REFUSED;
    if (nonces.has(given.nonce)) return REFUSED;
    if (nonces.size >= MAX_NONCES) return REFUSED;
    nonces.set(given.nonce, now() + 2 * SKEW_MS + 1_000);
    return null;
  }

  /** A body read for the fields every poll and result carries, or null. */
  function head(body: unknown) {
    if (!body || typeof body !== "object") return null;
    const b = body as Record<string, unknown>;
    const short = (value: unknown) =>
      typeof value === "string" && value.length > 0 && value.length <= 200
        ? value
        : null;
    const actorId = short(b.actorId);
    const nonce = short(b.nonce);
    if (!actorId || !nonce) return null;
    if (typeof b.ts !== "number" || !Number.isFinite(b.ts)) return null;
    return { actorId, nonce, ts: b.ts, mac: b.mac, raw: b };
  }

  const sign = async (
    actorId: string,
    botId: string,
    action: SignedOperation["action"],
  ): Promise<SignedOperation> => {
    const secret = await secretFor(actorId);
    if (!secret)
      throw new ProgramsRefusedError(
        "Programs on this computer are switched off.",
      );
    const issuedAt = now();
    return signOperation(secret, {
      v: 1,
      operationId: randomUUID(),
      actorId,
      botId,
      action,
      issuedAt,
      expiresAt: issuedAt + ttlMs,
    });
  };

  return {
    /**
     * The secret the helper of this person signs with, or null when the person has no salt. For the setup of
     * slice S2 and for tests: no route answers with it.
     */
    helperSecretFor: secretFor,

    sweep,

    /**
     * Queue one typed operation for this person's helper and wait for its answer. The caller has already
     * asked the person (the approval gate): this checks only that the function is on, that a helper is
     * there, and that nothing else of this person's is in flight.
     */
    async call(input: {
      actorId: string;
      botId: string;
      action: ProgramsAction;
    }): Promise<ProgramsResult> {
      sweep();
      const action = parseAction(input.action);
      if (!(await options.enabled(input.actorId)))
        throw new ProgramsRefusedError(
          "Programs on this computer are switched off.",
        );
      // Asked again after the await: a poll that lapsed meanwhile must not be queued for.
      sweep();
      const until = connectedUntil.get(input.actorId);
      if (until === undefined || until <= now())
        throw new ProgramsRefusedError(
          "The small program that talks to your computer is not running.",
        );
      if (inFlight(input.actorId).length > 0)
        throw new ProgramsRefusedError(
          "Another request for your computer is still running. Try again when it ends.",
        );
      const operation = await sign(input.actorId, input.botId, action);
      return new Promise<ProgramsResult>((resolve, reject) => {
        entries.set(operation.operationId, {
          operation,
          actorId: input.actorId,
          leased: false,
          control: false,
          expiresAt: operation.expiresAt,
          resolve,
          reject,
        });
      });
    },

    /**
     * The helper's poll. Signed, current and used once; it renews "connected" and brings at most one
     * operation, leased once. With the function switched off it brings nothing.
     */
    async poll(body: unknown): Promise<PollOutcome> {
      sweep();
      const h = head(body);
      if (!h) return { ok: false, reason: REFUSED };
      const secret = await secretFor(h.actorId);
      if (!secret) return { ok: false, reason: REFUSED };
      const refusal = checked(
        h,
        macOfPoll(secret, {
          actorId: h.actorId,
          ts: h.ts,
          nonce: h.nonce,
        }),
      );
      if (refusal) return { ok: false, reason: refusal };
      connectedUntil.set(h.actorId, now() + leaseMs);
      if (!(await options.enabled(h.actorId)))
        return { ok: true, operations: [], leaseMs };
      const next = [...entries.values()].find(
        (entry) => entry.actorId === h.actorId && !entry.leased,
      );
      if (!next) return { ok: true, operations: [], leaseMs };
      next.leased = true;
      // A stop has been handed over; nobody waits for it.
      if (next.control) entries.delete(next.operation.operationId);
      return { ok: true, operations: [{ ...next.operation }], leaseMs };
    },

    /**
     * The helper's answer to one operation. Signed over the exact payload text, current, with a nonce used
     * once, for an operation that was leased to this person and has not been answered, stopped or expired.
     */
    async result(body: unknown): Promise<ResultOutcome> {
      sweep();
      const h = head(body);
      if (!h) return { ok: false, reason: REFUSED };
      const secret = await secretFor(h.actorId);
      if (!secret) return { ok: false, reason: REFUSED };
      const b = h.raw;
      if (
        typeof b.operationId !== "string" ||
        typeof b.ok !== "boolean" ||
        typeof b.payload !== "string" ||
        b.payload.length > MAX_PAYLOAD
      )
        return { ok: false, reason: REFUSED };
      const ok = b.ok;
      const payload = b.payload;
      const refusal = checked(
        h,
        macOfResult(secret, {
          operationId: b.operationId,
          actorId: h.actorId,
          ts: h.ts,
          nonce: h.nonce,
          ok,
          payload,
        }),
      );
      if (refusal) return { ok: false, reason: refusal };
      const entry = entries.get(b.operationId);
      if (
        !entry ||
        entry.actorId !== h.actorId ||
        !entry.leased ||
        entry.control
      )
        return { ok: false, reason: REFUSED };
      entries.delete(b.operationId);
      if (!ok) {
        let message = "Your computer could not do that.";
        try {
          const said = (JSON.parse(payload) as { error?: unknown }).error;
          // The helper's own words are DATA: cleaned of invisible characters, cut, and marked as such in front,
          // so the member, the audit trail and the person read them as a report, never as an instruction.
          if (typeof said === "string" && clean(said, HELPER_TEXT_MAX))
            message = `${HELPER_SAID}${clean(said, HELPER_TEXT_MAX)}`;
        } catch {
          // Not JSON: the default sentence stands.
        }
        entry.reject(new ProgramsRefusedError(message));
        return { ok: true };
      }
      try {
        entry.resolve(
          readAnswer(
            entry.operation.action.kind as ProgramsAction["kind"],
            payload,
          ),
        );
      } catch {
        entry.reject(
          new ProgramsRefusedError(
            "Your computer's answer was not in the agreed shape, so I did not use it.",
          ),
        );
      }
      return { ok: true };
    },

    /** Stop: everything of this person's, queued or running, fails, and the helper is told to stop. */
    async stop(actorId: string) {
      sweep();
      for (const entry of [...entries.values()])
        if (entry.actorId === actorId && !entry.control)
          fail(entry, "Programs on this computer were stopped.");
      const stop = await sign(actorId, "*", { kind: "stop" }).catch(() => null);
      // With no salt there is no helper to tell: the person's own are already failed above.
      if (!stop) return;
      entries.set(stop.operationId, {
        operation: stop,
        actorId,
        leased: false,
        control: true,
        expiresAt: stop.expiresAt,
        resolve: () => {},
        reject: () => {},
      });
    },

    /**
     * The person switched the function off. What is queued and not yet handed to the helper fails; what
     * the helper already has is let finish and its answer is taken (Q7). A new call is refused at the door.
     */
    switchedOff(actorId: string) {
      sweep();
      for (const entry of [...entries.values()])
        if (entry.actorId === actorId && !entry.control && !entry.leased)
          fail(entry, "Switched off by you.");
    },

    statusFor(actorId: string): { connected: boolean; pending: number } {
      sweep();
      const until = connectedUntil.get(actorId);
      return {
        connected: until !== undefined && until > now(),
        pending: inFlight(actorId).length,
      };
    },
  };
}
