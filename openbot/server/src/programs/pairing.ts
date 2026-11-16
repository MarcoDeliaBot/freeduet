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
 * GUESSING. The code is about 49 bits. The route has no session, so the limits are global to the server and not
 * per person: ten tries a minute, and five wrong ones in a row burn every code outstanding (the person simply asks
 * for another). That makes a guess hopeless inside two minutes, at the price that someone who can reach the port can
 * make the person ask again; they learn nothing from it.
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
/** Tries a minute, whatever the outcome, for the whole server. */
export const REDEEMS_PER_MINUTE = 10;
/** Wrong codes in a row after which every outstanding code is burned. */
export const FAILURES_BEFORE_BURN = 5;
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
  const attempts: number[] = [];
  const asked = new Map<string, number[]>();
  let failures = 0;

  const note = async (actorId: string | undefined, change: string) => {
    if (!options.audit) return;
    await recordAuditEvent(options.audit, {
      eventType: "configuration.changed",
      targetType: "programs",
      ...(actorId ? { actorUserId: actorId } : {}),
      payload: { change },
    }).catch(() => undefined);
  };

  function sweep(at: number) {
    for (const [hash, entry] of codes)
      if (at >= entry.expires) codes.delete(hash);
    while (
      attempts.length > 0 &&
      attempts[0] !== undefined &&
      at - attempts[0] >= 60_000
    )
      attempts.shift();
  }

  return {
    /** A new code for this person, who is at the computer (the route checks that). Replaces the last one. */
    async makeCode(actorId: string): Promise<MakeCodeOutcome> {
      const at = now();
      sweep(at);
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

    /** The helper's setup, with the code the person typed. No session: the code is the proof. */
    async redeem(typed: unknown): Promise<RedeemOutcome> {
      const at = now();
      sweep(at);
      if (attempts.length >= REDEEMS_PER_MINUTE)
        return { ok: false, reason: "rate_limited" };
      attempts.push(at);
      const wrong = async (): Promise<RedeemOutcome> => {
        failures += 1;
        if (failures >= FAILURES_BEFORE_BURN) {
          codes.clear();
          failures = 0;
          await note(undefined, "programs_pairing_codes_burned");
        }
        return { ok: false, reason: "wrong_or_expired" };
      };
      if (typeof typed !== "string" || typed.length > 64) return wrong();
      const normal = normalizeCode(typed);
      if (normal.length !== CODE_LENGTH) return wrong();
      const hash = sha256(normal);
      const entry = codes.get(hash);
      if (!entry || at >= entry.expires) return wrong();
      // Spent first: whatever happens next, this code is not good again.
      codes.delete(hash);
      const { actorId } = entry;
      if (!(await options.isOn(actorId))) return wrong();
      await options.rotateSalt(actorId);
      const secret = await options.secretFor(actorId);
      if (!secret) return wrong();
      failures = 0;
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
