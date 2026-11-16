import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import { type AuditStore, recordAuditEvent } from "../audit";
import type { Database } from "../db/client";
import { browserPairings } from "../db/schema";

/**
 * FreeDuet (docs/M1_PLAN.md D49, docs/design/phone-and-remote.md 3.5): what marks a browser as paired with the
 * computer FreeDuet runs on, in a deployment with sign-in.
 *
 * Until D49 the mark was the installation secret itself, in a cookie, for 400 days, tied to no one. Now each
 * paired browser has its own random token. The cookie holds the token; the database holds only its hash, with
 * the person it belongs to, a name, a kind, and when it was made and last seen. A browser is AT THE COMPUTER
 * when its token matches a LIVE pairing of the SAME signed-in person: not revoked, not past its end, and made
 * under the installation secret now in force (a tag of it is in the row, so changing the secret ends every
 * pairing at once).
 *
 * Two kinds. `computer`: paired by the link that `scripts/open.sh` hands out, on the machine, by an
 * administrator. `device`: a phone or another browser, paired with a one-time code that a `computer` pairing
 * made. A `device` cannot make codes.
 *
 * THE OLD COOKIE. A browser that still holds the old cookie (the secret itself) is upgraded once, in silence,
 * to its own `computer` pairing for the person signed in in it, and handed the new cookie in the same answer.
 * That path (`adoptLegacy`) exists only so nobody has to pair again; REMOVE IT after 16 February 2027, three
 * months after this ships, by which time every browser in use has been through it (D49 says so too).
 *
 * WHAT NOTHING HERE WRITES TO A LOG, THE TRAIL OR AN ANSWER: the token, the code, the secret. The audit trail
 * gets the pairing's id, its kind and how it came about.
 */

export type PairingKind = "computer" | "device";

/** One pairing as the person sees it. No token and no hash. */
export type PairingView = {
  id: string;
  label: string;
  kind: PairingKind;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
};

export type NewPairing = PairingView & {
  userId: string;
  tokenHash: string;
  secretTag: string;
};

/** Where pairings are kept. A Postgres table in the server, a map in a test. */
export type PairingStore = {
  insert(row: NewPairing): Promise<void>;
  /** The live pairing of THIS person with this token under this secret, or null. */
  findLive(input: {
    userId: string;
    tokenHash: string;
    secretTag: string;
    now: Date;
  }): Promise<PairingView | null>;
  touch(id: string, now: Date): Promise<void>;
  /** Live pairings of one person, oldest first. */
  list(userId: string, secretTag: string, now: Date): Promise<PairingView[]>;
  /** Ends one live pairing of this person. False where there is none. */
  revoke(userId: string, id: string, now: Date): Promise<boolean>;
  rename(
    userId: string,
    id: string,
    label: string,
    now: Date,
  ): Promise<boolean>;
  /** Ends every pairing made under another secret. The count. */
  revokeOtherSecrets(secretTag: string, now: Date): Promise<number>;
};

export function createPgPairingStore(database: Database): PairingStore {
  const live = (userId: string, secretTag: string, now: Date) =>
    and(
      eq(browserPairings.userId, userId),
      eq(browserPairings.secretTag, secretTag),
      isNull(browserPairings.revokedAt),
      gt(browserPairings.expiresAt, now),
    );
  const view = {
    id: browserPairings.id,
    label: browserPairings.label,
    kind: browserPairings.kind,
    createdAt: browserPairings.createdAt,
    lastSeenAt: browserPairings.lastSeenAt,
    expiresAt: browserPairings.expiresAt,
  };
  return {
    async insert(row) {
      await database.insert(browserPairings).values(row);
    },
    async findLive({ userId, tokenHash, secretTag, now }) {
      const [row] = await database
        .select(view)
        .from(browserPairings)
        .where(
          and(
            live(userId, secretTag, now),
            eq(browserPairings.tokenHash, tokenHash),
          ),
        )
        .limit(1);
      return row ?? null;
    },
    async touch(id, now) {
      await database
        .update(browserPairings)
        .set({ lastSeenAt: now })
        .where(eq(browserPairings.id, id));
    },
    list: (userId, secretTag, now) =>
      database
        .select(view)
        .from(browserPairings)
        .where(live(userId, secretTag, now))
        .orderBy(asc(browserPairings.createdAt), asc(browserPairings.id)),
    async revoke(userId, id, now) {
      const rows = await database
        .update(browserPairings)
        .set({ revokedAt: now })
        .where(
          and(
            eq(browserPairings.id, id),
            eq(browserPairings.userId, userId),
            isNull(browserPairings.revokedAt),
          ),
        )
        .returning({ id: browserPairings.id });
      return rows.length > 0;
    },
    async rename(userId, id, label, now) {
      const rows = await database
        .update(browserPairings)
        .set({ label })
        .where(
          and(
            eq(browserPairings.id, id),
            eq(browserPairings.userId, userId),
            isNull(browserPairings.revokedAt),
            gt(browserPairings.expiresAt, now),
          ),
        )
        .returning({ id: browserPairings.id });
      return rows.length > 0;
    },
    async revokeOtherSecrets(secretTag, now) {
      const rows = await database
        .update(browserPairings)
        .set({ revokedAt: now })
        .where(
          and(
            ne(browserPairings.secretTag, secretTag),
            isNull(browserPairings.revokedAt),
          ),
        )
        .returning({ id: browserPairings.id });
      return rows.length;
    },
  };
}

/** The same behaviour in memory, for tests and for a deployment with no database. Not shared between processes. */
export function createMemoryPairingStore(): PairingStore & {
  rows: Map<string, NewPairing & { revokedAt: Date | null }>;
} {
  const rows = new Map<string, NewPairing & { revokedAt: Date | null }>();
  const toView = (row: NewPairing): PairingView => ({
    id: row.id,
    label: row.label,
    kind: row.kind,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  });
  const isLive = (
    row: NewPairing & { revokedAt: Date | null },
    secretTag: string,
    now: Date,
  ) =>
    row.revokedAt === null &&
    row.secretTag === secretTag &&
    row.expiresAt.getTime() > now.getTime();
  return {
    rows,
    async insert(row) {
      rows.set(row.id, { ...row, revokedAt: null });
    },
    async findLive({ userId, tokenHash, secretTag, now }) {
      for (const row of rows.values())
        if (
          row.userId === userId &&
          row.tokenHash === tokenHash &&
          isLive(row, secretTag, now)
        )
          return toView(row);
      return null;
    },
    async touch(id, now) {
      const row = rows.get(id);
      if (row) row.lastSeenAt = now;
    },
    async list(userId, secretTag, now) {
      return [...rows.values()]
        .filter((row) => row.userId === userId && isLive(row, secretTag, now))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(toView);
    },
    async revoke(userId, id, now) {
      const row = rows.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return false;
      row.revokedAt = now;
      return true;
    },
    async rename(userId, id, label, now) {
      const row = rows.get(id);
      if (
        !row ||
        row.userId !== userId ||
        row.revokedAt ||
        row.expiresAt.getTime() <= now.getTime()
      )
        return false;
      row.label = label;
      return true;
    },
    async revokeOtherSecrets(secretTag, now) {
      let count = 0;
      for (const row of rows.values())
        if (row.secretTag !== secretTag && !row.revokedAt) {
          row.revokedAt = now;
          count += 1;
        }
      return count;
    },
  };
}

/** 400 days, the longest lifetime Chrome keeps whatever a cookie asks for. A pairing ends with its cookie. */
const COOKIE_MAX_AGE_SECONDS = 34_560_000;
/** A code is good once, for this long. */
export const CODE_LIFETIME_MS = 120_000;
/** Letters and digits that cannot be mistaken for each other when read off a screen and typed on a phone. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;
/** Wrong codes in a row, for one person, after which the outstanding code is burned. */
const FAILURES_BEFORE_BURN = 5;
/** Redeem attempts in a minute, per person and per address, whatever the outcome. */
const PER_USER_PER_MINUTE = 10;
const PER_ADDRESS_PER_MINUTE = 30;
/** Concurrent requests of one browser that holds the old cookie share one upgrade for this long. */
const LEGACY_SHARE_MS = 15_000;
/** `last seen` is written at most this often per pairing. */
const TOUCH_EVERY_MS = 60_000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;
export const LABEL_MAX = 60;

export function pairCookieName(port: number): string {
  return `freeduet_pair_${port}`;
}

/** The old cookie's name, read only to upgrade it (auth/install-secret.ts `installCookieName`). */
function legacyCookieName(port: number): string {
  return `freeduet_install_${port}`;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const sha256Bytes = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/** A tag of the secret, not the secret. Different secret, different tag: that is all it is for. */
export function secretTagOf(secret: string): string {
  return sha256(`freeduet-pairing-epoch\0${secret}`).slice(0, 32);
}

/** `ABCDE-FGHJK`, the way a code is shown. */
export function showCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** A code as typed: any case, with or without the dash and spaces. */
export function normalizeCode(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

/** What the person calls a browser by default: its kind and make, from the one header that says. A name only. */
export function browserLabel(userAgent: string | null, where: string): string {
  const agent = userAgent ?? "";
  const make = /Edg\//.test(agent)
    ? "Edge"
    : /OPR\/|Opera/.test(agent)
      ? "Opera"
      : /Firefox\//.test(agent)
        ? "Firefox"
        : /Chrome\/|CriOS\//.test(agent)
          ? "Chrome"
          : /Safari\//.test(agent)
            ? "Safari"
            : "Browser";
  return `${make} ${where}`;
}

export function cleanLabel(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const label = raw
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return label ? label.slice(0, LABEL_MAX) : fallback;
}

function cookieValues(request: Request, name: string): string[] {
  const header = request.headers.get("cookie");
  if (!header) return [];
  const found: string[] = [];
  for (const part of header.split(";")) {
    const equals = part.indexOf("=");
    if (equals >= 0 && part.slice(0, equals).trim() === name)
      found.push(part.slice(equals + 1).trim());
  }
  return found;
}

export type PairingOptions = {
  store: PairingStore;
  /** The installation secret. Used only to tag pairings and to recognise the old cookie; never stored or sent. */
  secret: string;
  port: number;
  /** Whether the app's configured address is https, which makes the cookie Secure. */
  secure?: boolean;
  audit?: AuditStore;
  now?: () => number;
};

export type Standing = { id: string; kind: PairingKind; label: string };

/** The result of trying a code. */
export type RedeemOutcome =
  | { ok: true }
  | { ok: false; reason: "rate_limited" | "wrong_or_expired" };

export function createBrowserPairings(options: PairingOptions) {
  const { store, secret, port, audit } = options;
  const now = options.now ?? Date.now;
  const tag = secretTagOf(secret);
  const cookie = pairCookieName(port);
  const legacy = legacyCookieName(port);
  const secure = options.secure === true;

  // A token adopted during this very request (the old cookie, upgraded), read before the cookie.
  const adopted = new WeakMap<Request, string>();
  const lastTouched = new Map<string, number>();
  // One live code per person, so a new one replaces the last. Held in memory: a code outlives two minutes
  // nowhere, and a restart in between is simply a new code.
  const codes = new Map<string, { hash: string; expires: number }>();
  const failures = new Map<string, number>();
  const attempts = new Map<string, number[]>();
  // The upgrade in flight or just done, per person, as a promise: set before anything is awaited, so
  // requests that arrive together find it and share it.
  const upgrades = new Map<
    string,
    { made: Promise<{ token: string }>; expires: number }
  >();

  const record = async (
    eventType:
      | "pairing.minted"
      | "pairing.redeemed"
      | "pairing.redeem_failed"
      | "pairing.revoked",
    userId: string | undefined,
    targetId: string | undefined,
    payload: Record<string, unknown>,
  ) => {
    if (!audit) return;
    await recordAuditEvent(audit, {
      eventType,
      targetType: "browser_pairing",
      ...(targetId ? { targetId } : {}),
      ...(userId ? { actorUserId: userId } : {}),
      payload,
    });
  };

  const sweep = () => {
    const current = now();
    for (const [key, value] of codes)
      if (value.expires <= current) codes.delete(key);
    for (const [key, value] of upgrades)
      if (value.expires <= current) upgrades.delete(key);
    for (const [key, hits] of attempts) {
      const recent = hits.filter((at) => current - at < 60_000);
      if (recent.length === 0) attempts.delete(key);
      else attempts.set(key, recent);
    }
  };

  /** True when this attempt may go on; counts it either way. */
  const mayAttempt = (key: string, limit: number) => {
    const current = now();
    const hits = (attempts.get(key) ?? []).filter(
      (at) => current - at < 60_000,
    );
    hits.push(current);
    attempts.set(key, hits);
    return hits.length <= limit;
  };

  const cookieHeader = (token: string) =>
    `${cookie}=${token}; Path=/api; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
  const expiredHeader = (name: string) =>
    `${name}=; Path=/api; Max-Age=0; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;

  async function create(
    userId: string,
    kind: PairingKind,
    label: string,
  ): Promise<{ id: string; token: string; setCookie: string }> {
    const token = randomBytes(32).toString("base64url");
    const id = `pair_${randomBytes(9).toString("base64url")}`;
    const at = new Date(now());
    await store.insert({
      id,
      userId,
      label,
      kind,
      tokenHash: sha256(token),
      secretTag: tag,
      createdAt: at,
      lastSeenAt: at,
      expiresAt: new Date(at.getTime() + COOKIE_MAX_AGE_SECONDS * 1000),
    });
    return { id, token, setCookie: cookieHeader(token) };
  }

  return {
    cookieName: cookie,

    /**
     * The live pairing of THIS person that the request's cookie names, or null. Asked of the person the SESSION
     * says, never of whoever owns the token: a token of person A never makes person B at the computer.
     * A store that fails throws, and every caller counts that as remote.
     */
    async standing(request: Request, userId: string): Promise<Standing | null> {
      const tokens = [
        ...(adopted.has(request) ? [adopted.get(request) as string] : []),
        ...cookieValues(request, cookie),
      ].filter((value) => TOKEN_SHAPE.test(value));
      for (const token of tokens) {
        const row = await store.findLive({
          userId,
          tokenHash: sha256(token),
          secretTag: tag,
          now: new Date(now()),
        });
        if (!row) continue;
        const last = lastTouched.get(row.id) ?? 0;
        if (now() - last >= TOUCH_EVERY_MS) {
          lastTouched.set(row.id, now());
          await store.touch(row.id, new Date(now())).catch(() => {});
        }
        return { id: row.id, kind: row.kind, label: row.label };
      }
      return null;
    },

    /** A new pairing for this person, and the header that sets its cookie. */
    async issue(
      userId: string,
      kind: PairingKind,
      label: string,
      via: "link" | "code" | "legacy_cookie",
    ) {
      const made = await create(userId, kind, label);
      await record("pairing.redeemed", userId, made.id, { kind, via });
      return made;
    },

    clearHeaders(): string[] {
      return [expiredHeader(cookie), expiredHeader(legacy)];
    },

    /** Whether the request holds the OLD cookie: the secret itself. Only to be upgraded (see the top). */
    holdsLegacy(request: Request): boolean {
      const offered = cookieValues(request, legacy);
      return offered.some((value) =>
        timingSafeEqual(sha256Bytes(value), sha256Bytes(secret)),
      );
    },

    /**
     * The upgrade of the old cookie for a signed-in person: their own `computer` pairing, and the headers that
     * set the new cookie and clear the old. A browser sends several requests at once, so requests of one person
     * within a few seconds share the first upgrade instead of each making a pairing.
     */
    async adoptLegacy(request: Request, userId: string, label: string) {
      sweep();
      let shared = upgrades.get(userId);
      if (!shared) {
        const made = (async () => {
          const pairing = await create(userId, "computer", label);
          await record("pairing.redeemed", userId, pairing.id, {
            kind: "computer",
            via: "legacy_cookie",
          });
          return { token: pairing.token };
        })();
        shared = { made, expires: now() + LEGACY_SHARE_MS };
        upgrades.set(userId, shared);
        // A failed upgrade is not kept: the next request tries again.
        made.catch(() => upgrades.delete(userId));
      }
      const { token } = await shared.made;
      adopted.set(request, token);
      return { headers: [cookieHeader(token), expiredHeader(legacy)] };
    },

    /** A one-time code for a phone or another browser, for this person. The caller has checked it may. */
    async mintCode(userId: string, pairingId: string) {
      sweep();
      let code = "";
      for (let index = 0; index < CODE_LENGTH; index += 1)
        code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      // Written to the trail first: a code that cannot be accounted for is not made.
      await record("pairing.minted", userId, pairingId, {
        by: pairingId,
        lifetimeSeconds: CODE_LIFETIME_MS / 1000,
      });
      codes.set(userId, {
        hash: sha256(code),
        expires: now() + CODE_LIFETIME_MS,
      });
      failures.delete(userId);
      return { code, expiresInSeconds: CODE_LIFETIME_MS / 1000 };
    },

    /**
     * Whether this person's code is the one typed. Used up on the first success, never accepted after its
     * time, matched only against the code THIS person made, and limited per person and per address.
     */
    async checkCode(
      userId: string,
      address: string | null,
      typed: string,
    ): Promise<RedeemOutcome> {
      sweep();
      const refuse = async (reason: "rate_limited" | "wrong_or_expired") => {
        await record("pairing.redeem_failed", userId, undefined, {
          reason,
        }).catch(() => {});
        return { ok: false, reason } as const;
      };
      if (
        !mayAttempt(`user:${userId}`, PER_USER_PER_MINUTE) ||
        !mayAttempt(`address:${address ?? "unknown"}`, PER_ADDRESS_PER_MINUTE)
      )
        return refuse("rate_limited");
      const held = codes.get(userId);
      const offered = sha256Bytes(normalizeCode(typed));
      if (
        !held ||
        held.expires <= now() ||
        !timingSafeEqual(offered, Buffer.from(held.hash, "hex"))
      ) {
        const count = (failures.get(userId) ?? 0) + 1;
        failures.set(userId, count);
        if (count >= FAILURES_BEFORE_BURN) codes.delete(userId);
        return refuse("wrong_or_expired");
      }
      codes.delete(userId);
      failures.delete(userId);
      return { ok: true };
    },

    list: (userId: string) => store.list(userId, tag, new Date(now())),

    async revoke(userId: string, id: string, by: string): Promise<boolean> {
      const done = await store.revoke(userId, id, new Date(now()));
      if (done) await record("pairing.revoked", userId, id, { by });
      return done;
    },

    rename: (userId: string, id: string, label: string) =>
      store.rename(userId, id, label, new Date(now())),

    /** At boot: ends every pairing made under another secret, and says so in the trail. */
    async sweepStale(): Promise<number> {
      const count = await store.revokeOtherSecrets(tag, new Date(now()));
      if (count > 0)
        await record("pairing.revoked", undefined, undefined, {
          by: "installation_secret_changed",
          count,
        });
      return count;
    },
  };
}

export type BrowserPairings = ReturnType<typeof createBrowserPairings>;
