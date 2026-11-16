/**
 * Pairing the programs helper (docs/design/programs-on-your-computer.md 2.3, slice S2, D62): how the helper on the
 * person's own PC gets its secret, once.
 *
 * THE FLOW. The person, at the computer, asks for a code (`makeCode`, behind `atTheComputer`). The code is ten
 * letters and digits that cannot be mistaken for each other, good for two minutes and good once. The person types it
 * into the helper's setup. The setup sends it to `redeem`, which has no session (the helper has none yet): the code
 * IS the credential, so it is bound to the person who made it, short-lived, single use and rate limited.
 *
 * WHAT REDEEM DOES, in this order: the code is spent (even when what follows fails, so a half-done pairing cannot be
 * retried with the same code); the function must still be on; the person's salt is rotated (`rotateSalt`: the secret
 * of any helper that paired before is refused from its next poll); the NEW secret is derived and returned, this once.
 * The secret is never stored here, never logged and never in an audit row; a lost secret is a new pairing.
 *
 * GUESSING, AND WHY NO STRANGER CAN STOP PAIRING. The code is ten characters from an alphabet of 31, so one guess
 * hits a live code with probability 1 / 31^10 = 1 / 819,628,286,980,801 (about 49.5 bits). The route has no session,
 * so it is open to anyone who can reach the port; the design therefore does not let guessing damage anybody:
 *   - A wrong code never invalidates anybody's code, and there is no global counter: a flood of wrong codes cannot burn
 *     the real code or lock the real helper out.
 *   - Every attempt is checked against the live codes first (one hash and a map lookup, no database), so a CORRECT code
 *     is accepted whatever is being thrown at the route, from any address, including the helper's own.
 *   - Wrong attempts are counted per SOURCE ADDRESS in a sliding window that decays (one minute). An address over
 *     `WRONG_PER_MINUTE` wrong tries a minute gets 429 for its further wrong tries and nothing is written for them; this only
 *     bounds the work a flood can cause, it is not what protects the code. At that rate an address makes about 200
 *     guesses in a code's two minutes: odds of 200 / 31^10, about 2.4e-13 for that address.
 * Behind Docker Desktop a member's computer and the helper can share the address 127.0.0.1; that is why the limit
 * never refuses a correct code.
 *
 * NOT IN A DATABASE. The codes live in this process: a restart in the two minutes is a new code, as with the browser
 * pairing codes (`auth/browser-pairings.ts`). Only a hash of a code is held.
 */
import { createHash, randomInt } from "node:crypto";
import { type AuditStore, recordAuditEvent } from "../audit";
import { normalizeCode, showCode } from "../auth/browser-pairings";

/** A code is good once, for this long. */
export const PAIRING_CODE_LIFETIME_MS = 120_000;
/** Letters and digits that cannot be mistaken for each other (the same alphabet as the browser pairing codes). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
/** Wrong tries a minute, per source address, after which that address's further wrong tries get 429. */
export const WRONG_PER_MINUTE = 60;
/** How long a wrong try counts against its address. */
export const WRONG_WINDOW_MS = 60_000;
/** The most addresses remembered at once, so a spread-out flood cannot grow the table. */
const MAX_ADDRESSES = 5_000;
/** The size of the code space, for the comment above and the test that pins it: 31 characters, ten places. */
export const CODE_SPACE = ALPHABET.length ** CODE_LENGTH;
/** The most address entries one request cleans (see `sweepAddresses`); a test pins that no request goes past it. */
export const PAIRING_CLEAN_BUDGET = 8;
/** The most addresses remembered at once (a test pins it). */
export const PAIRING_MAX_ADDRESSES = MAX_ADDRESSES;
/** Codes one person may ask for in a minute. */
export const CODES_PER_MINUTE = 6;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export type MakeCodeOutcome =
  | { ok: true; code: string; expiresAt: number }
  | { ok: false; reason: "off" | "rate_limited" };

export type RedeemOutcome =
  | {
      ok: true;
      actorId: string;
      /** The helper's secret, lower-case hex of 32 bytes. Handed over this once and nowhere else. */
      secret: string;
      /** The server's clock, so the helper can say when its own is too far off to be accepted. */
      serverTime: number;
    }
  | { ok: false; reason: "rate_limited" | "wrong_or_expired" };

export type ProgramsPairing = ReturnType<typeof createProgramsPairing>;

export function createProgramsPairing(options: {
  isOn: (actorId: string) => Promise<boolean>;
  rotateSalt: (actorId: string) => Promise<void>;
  /** The helper's secret of this person under the salt now in force (`broker.helperSecretFor`). */
  secretFor: (actorId: string) => Promise<Buffer | null>;
  audit?: AuditStore;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  /** One live code per person: a new one replaces the last. The key is the hash of the code. */
  const codes = new Map<string, { actorId: string; expires: number }>();
  const asked = new Map<string, number[]>();
  /** Wrong tries per source address, newest last. */
  const wrongBy = new Map<string, number[]>();
  const note = async (actorId: string | undefined, change: string) => {
    if (!options.audit) return;
    await recordAuditEvent(options.audit, {
      eventType: "configuration.changed",
      targetType: "programs",
      ...(actorId ? { actorUserId: actorId } : {}),
      payload: { change },
    }).catch(() => undefined);
  };

  /**
   * Entries looked at so far by the cleaning below, for the test that measures WORK and not wall time: a flood
   * from many addresses must cost a constant amount of cleaning per request, not a pass over every address.
   */
  let visited = 0;
  /**
   * The most entries one request cleans out of the table of addresses. `wrongBy` is kept in the order of each
   * address's LAST wrong try (an address is deleted and put back at the end when it gets another), so the oldest
   * live information is always at the front: the cleaning takes expired entries from the front, stops at the
   * first live one, and never goes past this many. An entry expires once, so the cost is amortised O(1) per
   * wrong try, and the table cannot outgrow `MAX_ADDRESSES` whatever the cleaning has not reached yet.
   */
  const CLEAN_BUDGET = PAIRING_CLEAN_BUDGET;

  function sweepAddresses(at: number) {
    let budget = CLEAN_BUDGET;
    for (const [address, times] of wrongBy) {
      if (budget-- <= 0) break;
      visited++;
      const newest = times[times.length - 1];
      if (newest !== undefined && at - newest < WRONG_WINDOW_MS) break;
      wrongBy.delete(address);
    }
  }

  /** The live codes are at most one per person who asked in the last two minutes; only `makeCode` walks them. */
  function sweepCodes(at: number) {
    for (const [hash, entry] of codes) {
      visited++;
      if (at >= entry.expires) codes.delete(hash);
    }
  }

  return {
    /** Entries the cleaning has looked at since this was made (a test reads it; nothing else does). */
    cleaningWork: () => visited,
    /** How many addresses are remembered now (a test reads it). */
    trackedAddresses: () => wrongBy.size,
    /** A new code for this person, who is at the computer (the route checks that). Replaces the last one. */
    async makeCode(actorId: string): Promise<MakeCodeOutcome> {
      const at = now();
      sweepCodes(at);
      sweepAddresses(at);
      if (!(await options.isOn(actorId))) return { ok: false, reason: "off" };
      const recent = (asked.get(actorId) ?? []).filter((t) => at - t < 60_000);
      if (recent.length >= CODES_PER_MINUTE) {
        asked.set(actorId, recent);
        return { ok: false, reason: "rate_limited" };
      }
      asked.set(actorId, [...recent, at]);
      for (const [hash, entry] of codes)
        if (entry.actorId === actorId) codes.delete(hash);
      let code = "";
      for (let index = 0; index < CODE_LENGTH; index++)
        code += ALPHABET[randomInt(ALPHABET.length)];
      const expiresAt = at + PAIRING_CODE_LIFETIME_MS;
      codes.set(sha256(code), { actorId, expires: expiresAt });
      await note(actorId, "programs_pairing_code_made");
      return { ok: true, code: showCode(code), expiresAt };
    },

    /**
     * The helper's setup, with the code the person typed and the address the request came from. No session: the
     * code is the proof. A correct code is always accepted; see the comment at the top for the guessing.
     */
    async redeem(typed: unknown, source = "unknown"): Promise<RedeemOutcome> {
      const at = now();
      sweepAddresses(at);
      const wrong = (): RedeemOutcome => {
        // Only this address's own list is cut to the window here: the same limit and decay as before.
        const times = (wrongBy.get(source) ?? []).filter(
          (t) => at - t < WRONG_WINDOW_MS,
        );
        if (times.length >= WRONG_PER_MINUTE) {
          // Put back with its live tries only (it may have been cut), and keep the order by last wrong try.
          wrongBy.delete(source);
          wrongBy.set(source, times);
          return { ok: false, reason: "rate_limited" };
        }
        if (!wrongBy.has(source) && wrongBy.size >= MAX_ADDRESSES) {
          const oldest = wrongBy.keys().next().value;
          if (oldest !== undefined) wrongBy.delete(oldest);
        }
        wrongBy.delete(source);
        wrongBy.set(source, [...times, at]);
        return { ok: false, reason: "wrong_or_expired" };
      };
      if (typeof typed !== "string" || typed.length > 64) return wrong();
      const normal = normalizeCode(typed);
      if (normal.length !== CODE_LENGTH) return wrong();
      const hash = sha256(normal);
      const entry = codes.get(hash);
      if (entry && at >= entry.expires) codes.delete(hash);
      if (!entry || at >= entry.expires) return wrong();
      // Spent first: whatever happens next, this code is not good again.
      codes.delete(hash);
      const { actorId } = entry;
      if (!(await options.isOn(actorId))) return wrong();
      await options.rotateSalt(actorId);
      // Checked again after the rotation: a switch turned off in between is not paired (the rotation is harmless:
      // it only retires the old secret).
      if (!(await options.isOn(actorId))) return wrong();
      const secret = await options.secretFor(actorId);
      if (!secret) return wrong();
      await note(actorId, "programs_helper_paired");
      return {
        ok: true,
        actorId,
        secret: secret.toString("hex"),
        serverTime: at,
      };
    },
  };
}
