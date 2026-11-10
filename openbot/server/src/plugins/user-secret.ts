import type { MailPreset } from "./mail-presets";

/**
 * One person's pasted credential for a mail and calendar provider: their address, an app password
 * and, optionally, the secret address of their calendar.
 *
 * ALL THREE ARE SECRETS AT REST. The app password gives full access to the mailbox, and the secret
 * calendar link is a credential in its own right: anybody holding it can read the calendar. The
 * address is kept with them rather than in the vault row's plain metadata, so what the database
 * holds in the clear about a connection is that it exists. They are stored as one encrypted JSON
 * value in the credential vault (`mcp_user_secret`) and nowhere else.
 *
 * NEVER LOGGED, NEVER AUDITED, NEVER IN AN ERROR, NEVER RETURNED. Nothing here builds a sentence
 * out of a value it was given: every refusal below is fixed text, and {@link scrubbed} is the last
 * line for the one place that has to carry a library's words.
 */
export type UserSecret = {
  /** The mailbox's address, which is also the login. */
  address: string;
  /** The app password, with the spaces Google shows it with removed. */
  password: string;
  /** The calendar's secret address in iCal format, when the person gave one. */
  calendarUrl?: string;
};

/** Stored with a version so a later shape can be read beside this one. */
const SECRET_VERSION = 1;

export function serializeSecret(secret: UserSecret): string {
  return JSON.stringify({
    v: SECRET_VERSION,
    address: secret.address,
    password: secret.password,
    ...(secret.calendarUrl ? { ical: secret.calendarUrl } : {}),
  });
}

/**
 * The secret a stored value holds, or null when it is not one.
 *
 * Reads exactly three fields. A stored value that carries a `host`, a `port` or anything else is
 * read as if it did not: where this deployment connects is the preset's, and no value a person or a
 * row holds can move it.
 */
export function parseSecret(stored: string | undefined): UserSecret | null {
  if (!stored) return null;
  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== SECRET_VERSION) return null;
  if (typeof record.address !== "string" || !record.address) return null;
  if (typeof record.password !== "string" || !record.password) return null;
  const ical =
    typeof record.ical === "string" && record.ical ? record.ical : "";
  return {
    address: record.address,
    password: record.password,
    ...(ical ? { calendarUrl: ical } : {}),
  };
}

/**
 * A refusal a person can read and act on, with the status the route answers it with.
 *
 * Its message is fixed text written here and in the transport, never a vendor's words and never a
 * value that was pasted. That is what makes it safe to send to the browser and to a model.
 */
export class SecretRefusedError extends Error {
  readonly status: 400 | 422 | 502;

  constructor(message: string, status: 400 | 422 | 502 = 422) {
    super(message);
    this.name = "SecretRefusedError";
    this.status = status;
  }
}

/** What checking a pasted secret came back with. Only fixed sentences ever travel in `message`. */
export type VerifyOutcome =
  | { ok: true; calendar: boolean }
  | { ok: false; message: string; status: 400 | 422 | 502 };

/** Checks a secret against the provider before anything is stored. Injected, so a test needs no Gmail. */
export type VerifyUserSecret = (
  preset: MailPreset,
  secret: UserSecret,
) => Promise<VerifyOutcome>;

const ADDRESS =
  /^[^\s@<>,;"'()[\]\\]+@[^\s@<>,;"'()[\]\\]+\.[^\s@<>,;"'()[\]\\]+$/;
const MAX_ADDRESS = 254;
const MAX_PASSWORD = 128;
const MAX_LINK = 2048;
/** An app password is sixteen characters; a person pasting anything shorter than this has not. */
const MIN_PASSWORD = 8;

/**
 * Why a calendar link is not one this preset will fetch, or null when it is.
 *
 * https only, the preset's host compared whole and exactly, no credentials in the address, no port,
 * and a path under the preset's prefix. The URL parser has already resolved `..` and `%2e%2e` by the
 * time the path is compared, so a path that climbs out of the prefix reads as the place it lands.
 *
 * The refusal never repeats the address it refused: a link that failed this check may still be a
 * working secret link for somebody else's account.
 */
export function calendarLinkRefusal(
  link: string,
  preset: MailPreset,
): string | null {
  if (link.length > MAX_LINK) return "That calendar address is too long.";
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return "That is not a web address. Copy the whole secret address in iCal format.";
  }
  if (url.protocol !== "https:") {
    return "The calendar address has to start with https://.";
  }
  if (url.username || url.password) {
    return "That calendar address carries a login. Use the secret address in iCal format as Google shows it.";
  }
  if (url.hostname !== preset.ical.host || url.port !== "") {
    return `The calendar address has to be on ${preset.ical.host}. Copy the secret address in iCal format from your calendar's settings.`;
  }
  if (!url.pathname.startsWith(preset.ical.pathPrefix)) {
    return "That address is not a calendar's secret address in iCal format. Copy it from your calendar's settings.";
  }
  return null;
}

/**
 * What a person pasted, as a secret, or the refusal to give.
 *
 * Whitespace is taken out of the app password, because Google shows it in four groups of four and
 * people copy the spaces. The calendar link is optional: an empty string is none.
 */
export function readSecretInput(
  body: unknown,
  preset: MailPreset,
): { ok: true; secret: UserSecret } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "Send an email address and an app password." };
  }
  const input = body as Record<string, unknown>;
  const address = typeof input.address === "string" ? input.address.trim() : "";
  if (!address || address.length > MAX_ADDRESS || !ADDRESS.test(address)) {
    return { ok: false, message: "That does not look like an email address." };
  }
  const password =
    typeof input.appPassword === "string"
      ? input.appPassword.replace(/[\s ]+/g, "")
      : "";
  if (
    password.length < MIN_PASSWORD ||
    password.length > MAX_PASSWORD ||
    // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing control characters is the point
    /[\u0000-\u001f\u007f]/.test(password)
  ) {
    return {
      ok: false,
      message: `Paste the ${preset.appPasswordName}: sixteen letters, with or without the spaces.`,
    };
  }
  const link =
    typeof input.calendarUrl === "string" ? input.calendarUrl.trim() : "";
  if (link) {
    const refusal = calendarLinkRefusal(link, preset);
    if (refusal) return { ok: false, message: refusal };
  }
  return {
    ok: true,
    secret: { address, password, ...(link ? { calendarUrl: link } : {}) },
  };
}

/**
 * Text with every value of a secret taken out of it.
 *
 * For the one place a library's own words have to travel: an error that a person or an audit row
 * will read. The usual rule is not to carry them at all, and this is what stands behind it. Each
 * value is removed whole, and the pieces of the link that identify the calendar are removed too.
 */
export function scrubbed(text: string, secret: UserSecret | null): string {
  let out = text;
  if (secret) {
    const values = [secret.password, secret.address, secret.calendarUrl].filter(
      (value): value is string => typeof value === "string" && value !== "",
    );
    if (secret.calendarUrl) {
      try {
        const url = new URL(secret.calendarUrl);
        values.push(
          ...url.pathname.split("/").filter((part) => part.length > 5),
        );
      } catch {
        // Not a URL: the whole value is already in the list.
      }
    }
    for (const value of values.sort((a, b) => b.length - a.length)) {
      out = out.split(value).join("[hidden]");
    }
  }
  return out;
}
