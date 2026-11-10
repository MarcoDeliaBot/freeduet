import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { fetchCalendarText } from "../src/plugins/google-ical";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import { callTool as restCallTool } from "../src/plugins/google-workspace-rest";
import { MAIL_PRESETS } from "../src/plugins/mail-presets";
import {
  FAKE_SECRET,
  FakeGmail,
  secretsOf,
  tokenFor,
} from "./support/fake-imap";

/**
 * Google Calendar read from its secret address, asserted without Google.
 *
 * Two things are under test. The address is a credential: it is fetched only from Google's own host,
 * a redirect is checked again and never followed off that host, and no failure repeats it. And the
 * answer is the REST adapter's: the same `{ timeZone, events }` with the same event shapes, with
 * recurring events expanded, so what reads `calendar_list_events` cannot tell which way a person
 * connected.
 */

const PRESET = MAIL_PRESETS.gmail;
const LINK = FAKE_SECRET.calendarUrl as string;

const CALENDAR = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example//Calendar//EN",
  "X-WR-TIMEZONE:America/Los_Angeles",
  "BEGIN:VEVENT",
  "UID:e1@google.com",
  "DTSTART;TZID=America/Los_Angeles:20261022T100000",
  "DTEND;TZID=America/Los_Angeles:20261022T104500",
  "SUMMARY:Glaze test review",
  "LOCATION:Glaze room",
  "STATUS:CONFIRMED",
  "ORGANIZER;CN=Maya:mailto:maya@example.com",
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:maya@example.com",
  "ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:leo@example.com",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:e2@google.com",
  "DTSTART;VALUE=DATE:20261022",
  "DTEND;VALUE=DATE:20261023",
  "STATUS:TENTATIVE",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

const RECURRING = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Example//Calendar//EN",
  "X-WR-TIMEZONE:America/Los_Angeles",
  "BEGIN:VEVENT",
  "UID:weekly@google.com",
  "DTSTART;TZID=America/Los_Angeles:20261001T090000",
  "DTEND;TZID=America/Los_Angeles:20261001T093000",
  "RRULE:FREQ=WEEKLY;BYDAY=TH",
  "EXDATE;TZID=America/Los_Angeles:20261015T090000",
  "SUMMARY:Standup",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:cancelled@google.com",
  "DTSTART;TZID=America/Los_Angeles:20261022T110000",
  "DTEND;TZID=America/Los_Angeles:20261022T113000",
  "STATUS:CANCELLED",
  "SUMMARY:Never happened",
  "END:VEVENT",
  "END:VCALENDAR",
  "",
].join("\r\n");

function transportFor(
  answer: (url: string) => Response | Promise<Response>,
  now = () => new Date("2026-10-22T15:00:00Z"),
) {
  const gmail = new FakeGmail();
  const fetched: { url: string; init: RequestInit }[] = [];
  const transport = createGoogleImapTransport({
    imap: gmail.imap,
    smtp: gmail.smtp,
    fetch: async (url, init) => {
      fetched.push({ url, init });
      return answer(url);
    },
    now,
  });
  return { transport, fetched, gmail };
}

const connection = (actorId = "user_maya", secret = FAKE_SECRET) => ({
  url: "https://imap.gmail.com/",
  token: tokenFor(secret),
  actorId,
  botId: "bot_leo",
});

const events = async (
  transport: ReturnType<typeof transportFor>["transport"],
  args: Record<string, unknown> = {},
  who = connection(),
) => {
  const result = await transport.callTool(who, "calendar_list_events", args);
  return { result, parsed: result.isError ? null : JSON.parse(result.text) };
};

describe("(c) the calendar address is only ever Google's", () => {
  const ok = () => new Response(CALENDAR);

  test("a request goes to the address as given, without redirects followed, cookies or credentials", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const outcome = await fetchCalendarText(LINK, PRESET, async (url, init) => {
      seen.push({ url, init });
      return ok();
    });
    expect(outcome.ok).toBe(true);
    expect(seen.length).toBe(1);
    expect(seen[0]?.url).toBe(LINK);
    expect(seen[0]?.init.method).toBe("GET");
    expect(seen[0]?.init.redirect).toBe("manual");
    // Nothing identifies the person but the address itself: no cookie, no authorization, no referrer.
    const headers = new Headers(seen[0]?.init.headers);
    expect([...headers.keys()]).toEqual(["accept"]);
    expect(seen.map((call) => call.init.credentials ?? null)).toEqual([null]);
    expect(seen[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  test("a redirect that stays on the host and under the prefix is followed, and checked again", async () => {
    const seen: string[] = [];
    const outcome = await fetchCalendarText(LINK, PRESET, async (url) => {
      seen.push(url);
      return seen.length === 1
        ? new Response(null, {
            status: 302,
            headers: {
              location:
                "/calendar/ical/maya%40example.com/private-4f9a1c2b7d/other.ics",
            },
          })
        : ok();
    });
    expect(outcome.ok).toBe(true);
    expect(seen.map((url) => new URL(url).host)).toEqual([
      "calendar.google.com",
      "calendar.google.com",
    ]);
  });

  test("a redirect off the host, to http, or out of the prefix is not followed: the next address is never dialled", async () => {
    for (const location of [
      "https://evil.example/steal",
      "https://calendar.google.com.evil.example/calendar/ical/x",
      "http://calendar.google.com/calendar/ical/x/basic.ics",
      "https://calendar.google.com/accounts/Login",
      "https://calendar.google.com:8443/calendar/ical/x/basic.ics",
      "//evil.example/calendar/ical/x",
      "https://user:pass@calendar.google.com/calendar/ical/x",
      "file:///etc/passwd",
    ]) {
      const seen: string[] = [];
      const outcome = await fetchCalendarText(LINK, PRESET, async (url) => {
        seen.push(url);
        return new Response(null, { status: 302, headers: { location } });
      });
      expect(outcome.ok).toBe(false);
      expect(seen).toEqual([LINK]);
      if (!outcome.ok) {
        expect(outcome.message).not.toContain("evil.example");
        for (const secret of secretsOf()) {
          expect(outcome.message).not.toContain(secret);
        }
      }
    }
  });

  test("a redirect loop ends, and a redirect with no place to go is a sentence", async () => {
    let count = 0;
    const loop = await fetchCalendarText(LINK, PRESET, async () => {
      count += 1;
      return new Response(null, { status: 301, headers: { location: LINK } });
    });
    expect(loop.ok).toBe(false);
    expect(count).toBeLessThanOrEqual(4);

    const nowhere = await fetchCalendarText(
      LINK,
      PRESET,
      async () => new Response(null, { status: 302 }),
    );
    expect(nowhere.ok).toBe(false);
  });

  test("a link that is not Google's is refused without a request", async () => {
    let called = 0;
    for (const link of [
      "http://calendar.google.com/calendar/ical/x/basic.ics",
      "https://evil.example/calendar/ical/x/basic.ics",
      "https://calendar.google.com.evil.example/calendar/ical/x/basic.ics",
      "https://calendar.google.com@evil.example/calendar/ical/x/basic.ics",
      "https://calendar.google.com:444/calendar/ical/x/basic.ics",
      "https://www.google.com/calendar/ical/x/basic.ics",
      "https://calendar.google.com/calendar/u/0/r",
      "not a url",
      "",
    ]) {
      const outcome = await fetchCalendarText(link, PRESET, async () => {
        called += 1;
        return ok();
      });
      expect(outcome.ok).toBe(false);
    }
    expect(called).toBe(0);
  });
});

describe("what comes back is checked before it is believed", () => {
  test("something that is not a calendar is refused", async () => {
    for (const body of ["<html>login</html>", "", "{}"]) {
      const outcome = await fetchCalendarText(
        LINK,
        PRESET,
        async () => new Response(body),
      );
      expect(outcome.ok).toBe(false);
    }
  });

  test("a calendar larger than the cap is refused without being read whole", async () => {
    const big = `BEGIN:VCALENDAR\r\n${"X-PAD:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\r\n".repeat(140_000)}END:VCALENDAR\r\n`;
    const outcome = await fetchCalendarText(
      LINK,
      PRESET,
      async () => new Response(big),
    );
    expect(outcome.ok).toBe(false);
  });

  test("a refusal from Google says the address may have been reset, a failure says it could not be reached", async () => {
    for (const status of [401, 403, 404, 410]) {
      const outcome = await fetchCalendarText(
        LINK,
        PRESET,
        async () => new Response("", { status }),
      );
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain("may have been reset");
    }
    const down = await fetchCalendarText(LINK, PRESET, async () => {
      throw new Error(`connect ECONNREFUSED ${LINK}`);
    });
    expect(down).toEqual({
      ok: false,
      message: "Google Calendar could not be reached.",
    });
  });

  test("a calendar the parser cannot read is a sentence, not a crash", async () => {
    const { transport } = transportFor(
      () =>
        new Response("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:garbage\r\n"),
    );
    const { result } = await events(transport);
    // Either an empty listing or a sentence is acceptable; a thrown error is not.
    expect(typeof result.text).toBe("string");
    for (const secret of secretsOf()) expect(result.text).not.toContain(secret);
  });
});

describe("(g) the same answers as the REST adapter", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    setSystemTime();
  });

  function stubGoogleCalendar(
    timeZone: string,
    items: { start: object; end: object; [key: string]: unknown }[],
  ) {
    globalThis.fetch = (async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/calendar/v3/calendars/primary") {
        return Response.json({ timeZone });
      }
      return Response.json({ items });
    }) as typeof fetch;
  }

  const rest = { url: "https://www.googleapis.com", token: "test-token" };

  test("events come back with the same keys, values and zone as Google's own API gives them", async () => {
    // In start order, as Google orders them: an all-day event starts at the day's first moment.
    stubGoogleCalendar("America/Los_Angeles", [
      {
        id: "e2",
        status: "tentative",
        start: { date: "2026-10-22" },
        end: { date: "2026-10-23" },
      },
      {
        id: "e1",
        summary: "Glaze test review",
        status: "confirmed",
        location: "Glaze room",
        start: { dateTime: "2026-10-22T10:00:00-07:00" },
        end: { dateTime: "2026-10-22T10:45:00-07:00" },
        organizer: { email: "maya@example.com" },
        attendees: [
          { email: "maya@example.com" },
          { email: "leo@example.com" },
        ],
      },
    ]);
    setSystemTime(new Date("2026-10-22T15:00:00Z"));
    const fromRest = await restCallTool(rest, "calendar_list_events", {});
    setSystemTime();

    const { transport } = transportFor(() => new Response(CALENDAR));
    const { parsed } = await events(transport);

    expect(parsed).toEqual(JSON.parse(fromRest.text));
    expect(Object.keys(parsed.events[0])).not.toContain("location");
  });

  test("a given window is read as Google reads it, and no zone is reported", async () => {
    stubGoogleCalendar("America/Los_Angeles", [
      {
        id: "e1",
        summary: "Glaze test review",
        status: "confirmed",
        start: { dateTime: "2026-10-22T10:00:00-07:00" },
        end: { dateTime: "2026-10-22T10:45:00-07:00" },
      },
    ]);
    const args = {
      timeMin: "2026-10-22T00:00:00-07:00",
      timeMax: "2026-10-23T00:00:00-07:00",
    };
    const fromRest = await restCallTool(rest, "calendar_list_events", args);
    const { transport } = transportFor(() => new Response(CALENDAR));
    const { parsed } = await events(transport, args);
    expect(Object.keys(parsed)).toEqual(Object.keys(JSON.parse(fromRest.text)));
    const titled = (listing: { events: Record<string, unknown>[] }) =>
      listing.events.find((event) => event.id === "e1");
    const expected = titled(JSON.parse(fromRest.text));
    // Google's own answer for the same event, but for what the stub left out.
    expect(titled(parsed)).toEqual({
      ...expected,
      attendees: ["maya@example.com", "leo@example.com"],
      location: "Glaze room",
      organizer: "maya@example.com",
    });
  });

  test("an event from another calendar keeps its own UID, and Google's loses only its suffix", async () => {
    const imported = CALENDAR.replace(
      "UID:e1@google.com",
      "UID:abc-123@outlook.example",
    );
    const { transport } = transportFor(() => new Response(imported));
    const { parsed } = await events(transport);
    expect(
      parsed.events.map((event: { id: string }) => event.id).sort(),
    ).toEqual(["abc-123@outlook.example", "e2"]);
  });
});

describe("what a listing does", () => {
  test("with no arguments it asks for now until midnight in the calendar's own zone, in start order", async () => {
    // 08:00 in Los Angeles: the person's day has sixteen hours left and the UTC day has nine.
    const { transport } = transportFor(
      () => new Response(CALENDAR),
      () => new Date("2026-10-22T15:00:00Z"),
    );
    const { parsed } = await events(transport);
    expect(parsed.timeZone).toBe("America/Los_Angeles");
    // The all-day event begins at the day's first moment, so it leads.
    expect(parsed.events.map((event: { id: string }) => event.id)).toEqual([
      "e2",
      "e1",
    ]);
  });

  test("an event that has already ended, and one that starts after midnight, are not in today", async () => {
    const { transport } = transportFor(
      () => new Response(CALENDAR),
      () => new Date("2026-10-22T20:00:00Z"),
    );
    // 13:00 in Los Angeles: the review ended at 10:45, and the all-day event is still under way.
    const { parsed } = await events(transport);
    expect(
      parsed.events.map((event: { summary: string }) => event.summary),
    ).toEqual(["(no title)"]);
  });

  test("a recurring event is expanded, one instance a week, with an exception left out and a cancelled event dropped", async () => {
    const { transport } = transportFor(() => new Response(RECURRING));
    const { parsed } = await events(transport, {
      timeMin: "2026-10-01T00:00:00-07:00",
      timeMax: "2026-10-31T00:00:00-07:00",
    });
    expect(
      parsed.events.map((event: { start: string }) => event.start),
    ).toEqual([
      "2026-10-01T09:00:00-07:00",
      "2026-10-08T09:00:00-07:00",
      // 2026-10-15 is the EXDATE.
      "2026-10-22T09:00:00-07:00",
      "2026-10-29T09:00:00-07:00",
    ]);
    expect(
      parsed.events.some(
        (event: { summary: string }) => event.summary === "Never happened",
      ),
    ).toBe(false);
    expect(parsed.events[2].id).toBe("weekly_20261022T160000Z");
  });

  test("a recurring event stays at its wall-clock time across the clocks changing", async () => {
    const { transport } = transportFor(() => new Response(RECURRING));
    const { parsed } = await events(transport, {
      timeMin: "2026-10-29T00:00:00-07:00",
      timeMax: "2026-11-06T00:00:00-08:00",
    });
    expect(
      parsed.events.map((event: { start: string }) => event.start),
    ).toEqual(["2026-10-29T09:00:00-07:00", "2026-11-05T09:00:00-08:00"]);
  });

  test("maxResults cuts the listing, and is held to fifty", async () => {
    const { transport } = transportFor(() => new Response(RECURRING));
    const window = {
      timeMin: "2026-10-01T00:00:00-07:00",
      timeMax: "2026-12-31T00:00:00-08:00",
    };
    const two = await events(transport, { ...window, maxResults: 2 });
    expect(two.parsed.events.length).toBe(2);
    const many = await events(transport, { ...window, maxResults: 500 });
    expect(many.parsed.events.length).toBeLessThanOrEqual(50);
  });

  test("bounds that do not parse, close before they open, or a count that is not a number are refused before the calendar is fetched", async () => {
    const { transport, fetched } = transportFor(() => new Response(CALENDAR));
    for (const args of [
      { timeMin: "yesterday" },
      { timeMax: "tomorrow-ish" },
      { timeMin: "2026-10-22T10:00:00Z", timeMax: "2026-10-22T09:00:00Z" },
      { maxResults: "many" },
    ]) {
      const { result } = await events(transport, args);
      expect(result.isError).toBe(true);
    }
    expect(fetched.length).toBeLessThanOrEqual(1);
  });

  test("a calendar that names no zone falls back to the UTC day and says so", async () => {
    const without = CALENDAR.replace(
      "X-WR-TIMEZONE:America/Los_Angeles\r\n",
      "",
    );
    const { transport } = transportFor(() => new Response(without));
    const { parsed } = await events(transport);
    expect(parsed.timeZone).toBe("UTC");
    expect(parsed.note).toContain("could not be read");
  });

  test("a person with no calendar connected is told how to add one, and nothing is fetched", async () => {
    const { transport, fetched } = transportFor(() => new Response(CALENDAR));
    const { result } = await events(
      transport,
      {},
      connection("user_maya", {
        address: FAKE_SECRET.address,
        password: FAKE_SECRET.password,
      }),
    );
    expect(result.isError).toBe(true);
    expect(result.text).toContain("No calendar was connected");
    expect(fetched).toEqual([]);
  });

  test("the calendar is fetched once a minute for a person, not once a call", async () => {
    let clock = Date.parse("2026-10-22T15:00:00Z");
    const { transport, fetched } = transportFor(
      () => new Response(CALENDAR),
      () => new Date(clock),
    );
    await events(transport);
    await events(transport);
    expect(fetched.length).toBe(1);
    clock += 61_000;
    await events(transport);
    expect(fetched.length).toBe(2);
  });

  test("one person's calendar is never another's, even when asked inside the same minute", async () => {
    const other = {
      address: "leo@example.com",
      password: "zxcvbnmasdfghjkl",
      calendarUrl:
        "https://calendar.google.com/calendar/ical/leo%40example.com/private-9z8y7x6w5v/basic.ics",
    };
    const answers = new Map<string, string>([
      [LINK, CALENDAR],
      [
        other.calendarUrl,
        CALENDAR.replace("Glaze test review", "Leo's private appointment"),
      ],
    ]);
    const { transport, fetched } = transportFor(
      (url) => new Response(answers.get(url) ?? ""),
    );
    const mine = await events(transport, {}, connection("user_maya"));
    const his = await events(transport, {}, connection("user_leo", other));
    const mineAgain = await events(transport, {}, connection("user_maya"));
    expect(JSON.stringify(mine.parsed)).not.toContain("Leo's private");
    expect(JSON.stringify(his.parsed)).toContain("Leo's private");
    expect(JSON.stringify(mineAgain.parsed)).not.toContain("Leo's private");
    expect(fetched.map((call) => call.url)).toEqual([LINK, other.calendarUrl]);
  });

  test("a changed address is fetched at once, not served from the cache of the old one", async () => {
    const replaced = `https://calendar.google.com/calendar/ical/maya%40example.com/private-newnewnew1/basic.ics`;
    const { transport, fetched } = transportFor(() => new Response(CALENDAR));
    await events(transport);
    await events(
      transport,
      {},
      connection("user_maya", { ...FAKE_SECRET, calendarUrl: replaced }),
    );
    expect(fetched.map((call) => call.url)).toEqual([LINK, replaced]);
  });
});
