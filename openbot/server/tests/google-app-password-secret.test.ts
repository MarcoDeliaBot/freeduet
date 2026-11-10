import { describe, expect, test } from "bun:test";
import { createSecretVerifier } from "../src/plugins/google-imap";
import { MAIL_PRESETS } from "../src/plugins/mail-presets";
import {
  calendarLinkRefusal,
  parseSecret,
  readSecretInput,
  scrubbed,
  serializeSecret,
} from "../src/plugins/user-secret";
import { FAKE_SECRET, FakeGmail, secretsOf } from "./support/fake-imap";

/**
 * What is pasted, how it is read, and the one login that checks it before anything is kept.
 *
 * The verifier answers with fixed sentences only: a person is shown them, so they may not repeat the
 * password, the address or the calendar link, and a library's own message (which quotes what it was
 * given) is never carried.
 */

const PRESET = MAIL_PRESETS.gmail;
const CALENDAR = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

function verifier(
  answer: (url: string) => Response | Promise<Response> = () =>
    new Response(CALENDAR),
) {
  const gmail = new FakeGmail();
  const fetched: string[] = [];
  const verify = createSecretVerifier({
    imap: gmail.imap,
    smtp: gmail.smtp,
    fetch: async (url) => {
      fetched.push(url);
      return answer(url);
    },
  });
  return { gmail, fetched, verify };
}

const quoting = (extra: Record<string, unknown> = {}) =>
  Object.assign(
    new Error(
      `LOGIN ${FAKE_SECRET.address} ${FAKE_SECRET.password} ${FAKE_SECRET.calendarUrl}`,
    ),
    { response: FAKE_SECRET.password },
    extra,
  );

describe("the check before anything is kept", () => {
  test("one login to Gmail's pinned IMAP host, and nothing else when there is no calendar", async () => {
    const { gmail, fetched, verify } = verifier();
    const outcome = await verify(PRESET, {
      address: FAKE_SECRET.address,
      password: FAKE_SECRET.password,
    });
    expect(outcome).toEqual({ ok: true, calendar: false });
    expect(gmail.clients).toEqual([
      {
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        user: FAKE_SECRET.address,
        pass: FAKE_SECRET.password,
      },
    ]);
    // It logs in and says goodbye. It opens no mailbox and reads no mail to check a password.
    expect(gmail.methodsCalled()).toEqual(["on", "connect", "logout"]);
    expect(gmail.opened).toEqual([]);
    expect(gmail.smtpClients).toEqual([]);
    expect(fetched).toEqual([]);
  });

  test("with a calendar link it fetches that one address, from Google's host, once", async () => {
    const { fetched, verify } = verifier();
    const outcome = await verify(PRESET, FAKE_SECRET);
    expect(outcome).toEqual({ ok: true, calendar: true });
    expect(fetched).toEqual([FAKE_SECRET.calendarUrl as string]);
  });

  test("a login Gmail refuses is a 422 that tells the person what to check, with nothing of theirs in it", async () => {
    const { gmail, fetched, verify } = verifier();
    gmail.connectError = quoting({
      authenticationFailed: true,
      serverResponseCode: "AUTHENTICATIONFAILED",
    });
    const outcome = await verify(PRESET, FAKE_SECRET);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(422);
    expect(outcome.message).toContain("2-Step Verification");
    expect(outcome.message).toContain("app password");
    for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
      expect(outcome.message).not.toContain(secret);
    }
    // The calendar is not fetched for a login that failed, and the connection is closed.
    expect(fetched).toEqual([]);
    expect(gmail.logouts).toBe(1);
  });

  test("Gmail not being reachable is a 502 and says nothing was saved", async () => {
    const { gmail, verify } = verifier();
    gmail.connectError = quoting({ code: "ECONNREFUSED" });
    const outcome = await verify(PRESET, FAKE_SECRET);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.status).toBe(502);
    expect(outcome.message).toContain("nothing was saved");
    for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
      expect(outcome.message).not.toContain(secret);
    }
  });

  test("a calendar address that does not work is a 422 that says nothing was saved, and does not repeat the address", async () => {
    for (const answer of [
      () => new Response("", { status: 404 }),
      () => new Response("<html></html>"),
      () => {
        throw quoting({ code: "ECONNREFUSED" });
      },
    ]) {
      const { verify } = verifier(answer);
      const outcome = await verify(PRESET, FAKE_SECRET);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.status).toBe(422);
      expect(outcome.message).toContain("Nothing was saved.");
      for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
        expect(outcome.message).not.toContain(secret);
      }
    }
  });

  test("a link that is not Google's is refused without being fetched, even if it reaches the verifier", async () => {
    const { fetched, verify } = verifier();
    const outcome = await verify(PRESET, {
      ...FAKE_SECRET,
      calendarUrl: "https://evil.example/calendar/ical/x/basic.ics",
    });
    expect(outcome.ok).toBe(false);
    expect(fetched).toEqual([]);
  });
});

describe("what a person pastes", () => {
  const input = {
    address: "  maya@example.com ",
    appPassword: "qwer tyui opas  dfgh",
    calendarUrl: ` ${FAKE_SECRET.calendarUrl} `,
  };

  test("is trimmed and the groups Google shows the password in are taken out", () => {
    expect(readSecretInput(input, PRESET)).toEqual({
      ok: true,
      secret: {
        address: "maya@example.com",
        password: "qwertyuiopasdfgh",
        calendarUrl: FAKE_SECRET.calendarUrl as string,
      },
    });
  });

  test("a calendar is optional, and an empty one is none", () => {
    for (const calendarUrl of [undefined, "", "   "]) {
      const read = readSecretInput({ ...input, calendarUrl }, PRESET);
      expect(read.ok).toBe(true);
      if (read.ok) expect(read.secret.calendarUrl).toBeUndefined();
    }
  });

  test("a refusal says what to fix and never repeats the value it refused", () => {
    for (const body of [
      { ...input, address: "not an address" },
      { ...input, appPassword: "short" },
      {
        ...input,
        calendarUrl: "https://evil.example/calendar/ical/leak-me/basic.ics",
      },
      null,
      [],
    ]) {
      const read = readSecretInput(body, PRESET);
      expect(read.ok).toBe(false);
      if (read.ok) return;
      expect(read.message).not.toContain("leak-me");
      expect(read.message).not.toContain("evil.example/calendar");
    }
  });

  test("a calendar link has to be https, on Google's host, with no login, no port and a calendar path", () => {
    expect(
      calendarLinkRefusal(FAKE_SECRET.calendarUrl as string, PRESET),
    ).toBeNull();
    for (const link of [
      "http://calendar.google.com/calendar/ical/x/basic.ics",
      "https://calendar.google.com.evil.example/calendar/ical/x/basic.ics",
      "https://user:pw@calendar.google.com/calendar/ical/x/basic.ics",
      "https://calendar.google.com:8443/calendar/ical/x/basic.ics",
      "https://calendar.google.com/calendar/u/0/r",
      "https://calendar.google.com/calendar/ical/../../r",
      `https://calendar.google.com/calendar/ical/${"a".repeat(3000)}`,
    ]) {
      expect(calendarLinkRefusal(link, PRESET)).not.toBeNull();
    }
  });
});

describe("what is stored", () => {
  test("round-trips the three fields and reads no others", () => {
    expect(parseSecret(serializeSecret(FAKE_SECRET))).toEqual(FAKE_SECRET);
    const hostile = JSON.stringify({
      v: 1,
      address: "a@example.com",
      password: "hunter2hunter2",
      host: "evil.example",
      port: 25,
    });
    expect(parseSecret(hostile)).toEqual({
      address: "a@example.com",
      password: "hunter2hunter2",
    });
  });

  test("anything that is not a secret of this version is nothing", () => {
    for (const stored of [
      undefined,
      "",
      "not json",
      "[]",
      "null",
      JSON.stringify({ v: 2, address: "a@example.com", password: "x" }),
      JSON.stringify({ v: 1, address: "", password: "x" }),
      JSON.stringify({ v: 1, address: "a@example.com" }),
    ]) {
      expect(parseSecret(stored)).toBeNull();
    }
  });

  test("scrubbing takes every value of a secret, and the parts of the link that name the calendar, out of a sentence", () => {
    const text = scrubbed(
      `LOGIN ${FAKE_SECRET.address} ${FAKE_SECRET.password} at ${FAKE_SECRET.calendarUrl} and private-4f9a1c2b7d`,
      FAKE_SECRET,
    );
    for (const secret of [...secretsOf(), FAKE_SECRET.address]) {
      expect(text).not.toContain(secret);
    }
    expect(scrubbed("nothing here", null)).toBe("nothing here");
  });
});
