/**
 * Where a person's own mail and calendar are reached when they paste an app password instead of
 * consenting through OAuth.
 *
 * A PRESET IS A REVIEWED SOURCE CONTRACT, exactly as a catalogue host is. These addresses are where
 * this deployment sends somebody's app password and where it fetches their secret calendar link
 * from, so they are written here, once, and never taken from a person, a Bot or a stored row. A
 * stored secret that carries a `host` of its own is ignored: nothing reads one.
 *
 * ONE PRESET TODAY, AND THE SHAPE IS WHAT A SECOND WOULD NEED. Gmail is the only provider here. A
 * second (a Microsoft or a Fastmail account, say) is one more entry in {@link MAIL_PRESETS} and one
 * more catalogue entry naming it, plus whatever that provider needs for search and threading, which
 * Gmail's `X-GM-*` extensions give for free and a generic IMAP server does not. Nothing in this file
 * can be used to reach a host that is not listed, and nothing lists one on request.
 *
 * Kept free of imports so the catalogue can name a preset without a cycle.
 */

export type MailPresetKey = "gmail";

export type MailPreset = {
  /** What the provider calls the credential, for the sentences a person reads. */
  appPasswordName: string;
  /** Where the person makes one, shown beside the form. */
  appPasswordUrl: string;
  /** Where the calendar's secret address is found, shown beside the form. */
  calendarHelpUrl: string;
  /** IMAP, implicit TLS. `secure: true` is the whole of the transport security, so it is not optional. */
  imap: { host: string; port: number; secure: true };
  /** SMTP submission, implicit TLS, for the same reason. */
  smtp: { host: string; port: number; secure: true };
  /**
   * The only place the secret calendar link may point.
   *
   * `host` is compared whole and exactly, `pathPrefix` is a prefix of the link's path, and the
   * scheme is always https. A redirect is followed only while it stays on this host and under this
   * prefix.
   */
  ical: { host: string; pathPrefix: string };
};

export const MAIL_PRESETS: Readonly<Record<MailPresetKey, MailPreset>> =
  Object.freeze({
    gmail: Object.freeze({
      appPasswordName: "app password",
      appPasswordUrl: "https://myaccount.google.com/apppasswords",
      calendarHelpUrl: "https://support.google.com/calendar/answer/37111",
      imap: Object.freeze({
        host: "imap.gmail.com",
        port: 993,
        secure: true as const,
      }),
      smtp: Object.freeze({
        host: "smtp.gmail.com",
        port: 465,
        secure: true as const,
      }),
      ical: Object.freeze({
        host: "calendar.google.com",
        pathPrefix: "/calendar/ical/",
      }),
    }),
  });

/** The preset a key names. Throws for a key that is not one, which only a code change can produce. */
export function mailPreset(key: MailPresetKey): MailPreset {
  const preset = MAIL_PRESETS[key];
  if (!preset) throw new Error(`Unknown mail preset ${String(key)}.`);
  return preset;
}
