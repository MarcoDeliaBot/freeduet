import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadCases } from "./checks";
import { renderDates } from "./dates";

const DATES = fileURLToPath(new URL("./dates.ts", import.meta.url));
const CASES = fileURLToPath(new URL("./cases.yaml", import.meta.url));
const EMAILS = fileURLToPath(
  new URL("./fixtures/live/emails-nine.txt", import.meta.url),
);

/** Sunday 8 November 2026, the day the fixture was written. Local midnight. */
const NOV_8 = new Date(2026, 10, 8);

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const WEEKDAYS_SHORT = WEEKDAYS.map((day) => day.slice(0, 3));
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = MONTHS.map((month) => month.slice(0, 3));

/** `+22`, `-13`, as a placeholder writes them. */
const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

/** The weekday a calendar date really falls on, computed without any local time zone. */
const weekdayOf = (year: number, month: number, day: number) =>
  WEEKDAYS[new Date(Date.UTC(year, month, day)).getUTCDay()];

describe("renderDates: every format at a fixed date", () => {
  test("header, full, long, dm, short, weekday and day on Sunday 8 November 2026", () => {
    expect(
      renderDates(
        [
          "{{date:+0:header}}",
          "{{date:+0:full}}",
          "{{date:+2:long}}",
          "{{date:-13:dm}}",
          "{{date:+10:short}}",
          "{{date:+1:weekday}}",
          "{{date:+4:day}}",
        ].join("|"),
        NOV_8,
        "fixed",
      ),
    ).toBe(
      "Sun, 8 Nov 2026|8 November 2026|Tuesday 10 November|26 October|18 Nov|Monday|12th",
    );
  });

  test("the ordinal suffix, including the teens", () => {
    const cases: [number, string][] = [
      [-4, "4th"],
      [23, "1st"],
      [24, "2nd"],
      [25, "3rd"],
      [3, "11th"],
      [4, "12th"],
      [5, "13th"],
      [13, "21st"],
      [14, "22nd"],
      [15, "23rd"],
      [16, "24th"],
      [22, "30th"],
      [53, "31st"],
    ];
    for (const [offset, expected] of cases)
      expect(
        renderDates(`{{date:${signed(offset)}:day}}`, NOV_8, "ordinal"),
      ).toBe(expected);
  });

  test("month and year roll over, forwards and backwards", () => {
    const dec15 = new Date(2026, 11, 15);
    expect(
      renderDates(
        "{{date:+30:full}}|{{date:+30:long}}|{{date:+30:header}}",
        dec15,
        "rollover",
      ),
    ).toBe("14 January 2027|Thursday 14 January|Thu, 14 Jan 2027");
    expect(renderDates("{{date:-20:long}}", dec15, "rollover")).toBe(
      "Wednesday 25 November",
    );
    expect(
      renderDates("{{date:-3:header}}", new Date(2027, 0, 2), "rollover"),
    ).toBe("Wed, 30 Dec 2026");
  });
});

describe("renderDates: calendar days across the European DST changes", () => {
  // The child runs in Europe/Rome, where the clocks change on 29 March and 25 October 2026. A
  // local-time sum would move the day there; the placeholders must not. The child first reports
  // the zone's offsets, so the test fails if it did not really run in that zone.
  test("the day holds on the day the clocks change", async () => {
    const pinned: [string, number, number, number, number, string][] = [
      [
        "a day before the autumn change",
        2026,
        9,
        24,
        0,
        "{{date:+1:weekday}} {{date:+1:dm}}|{{date:+2:weekday}} {{date:+2:dm}}|{{date:+7:header}}",
      ],
      [
        "the morning of the autumn change",
        2026,
        9,
        25,
        0,
        "{{date:+0:full}}|{{date:+1:weekday}}",
      ],
      [
        "the spring gap, 02:30 does not exist",
        2026,
        2,
        29,
        2,
        "{{date:+0:full}}|{{date:-1:long}}",
      ],
      [
        "the spring change, a day before",
        2026,
        2,
        28,
        0,
        "{{date:+1:weekday}} {{date:+1:dm}}|{{date:+2:weekday}}|{{date:+7:header}}",
      ],
    ];
    const code = `(async () => {
      const { renderDates } = await import(${JSON.stringify(DATES)});
      const zone = [
        new Date(2026, 9, 24).getTimezoneOffset(),
        new Date(2026, 9, 26).getTimezoneOffset(),
        new Date(2026, 2, 28).getTimezoneOffset(),
        new Date(2026, 2, 30).getTimezoneOffset(),
      ];
      const pinned = ${JSON.stringify(pinned)};
      const out = pinned.map(([, y, m, d, h, text]) =>
        renderDates(text, new Date(y, m, d, h), "dst"),
      );
      console.log(JSON.stringify({ zone, out }));
    })();`;
    const child = Bun.spawn([process.execPath, "-e", code], {
      env: { ...process.env, TZ: "Europe/Rome" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exit !== 0) throw new Error(`the Europe/Rome child failed: ${stderr}`);
    const { zone, out } = JSON.parse(stdout) as {
      zone: number[];
      out: string[];
    };
    // -120 is CEST (UTC+2) and -60 is CET (UTC+1): the zone changes twice in this window.
    expect(zone).toEqual([-120, -60, -60, -120]);
    expect(out).toEqual([
      "Sunday 25 October|Monday 26 October|Sat, 31 Oct 2026",
      "25 October 2026|Monday",
      "29 March 2026|Saturday 28 March",
      "Sunday 29 March|Monday|Sat, 4 Apr 2026",
    ]);
  });
});

describe("renderDates: errors and plain text", () => {
  test("an unknown format throws an Error that names the source", () => {
    expect(() =>
      renderDates(
        "on {{date:+0:iso}}",
        NOV_8,
        "otto-1: attachment emails-nine.txt",
      ),
    ).toThrow("otto-1: attachment emails-nine.txt");
    expect(() =>
      renderDates(
        "on {{date:+0:iso}}",
        NOV_8,
        "otto-1: attachment emails-nine.txt",
      ),
    ).toThrow('unknown date format "iso"');
    // A format name that is a property of Object.prototype is not a format.
    expect(() =>
      renderDates("{{date:+0:constructor}}", NOV_8, "proto.txt"),
    ).toThrow("proto.txt");
    // An offset no calendar can reach is named with its source too.
    expect(() =>
      renderDates("{{date:+900000000:full}}", NOV_8, "far.txt"),
    ).toThrow("far.txt: {{date:+900000000:full}} is too far from today");
    // Format names are exact: upper case is unknown.
    expect(() => renderDates("{{date:+0:FULL}}", NOV_8, "case.txt")).toThrow(
      'unknown date format "FULL"',
    );
  });

  test("a malformed placeholder throws an Error that names the source", () => {
    const malformed = [
      "{{date:0:full}}",
      "{{date:+0:full}",
      "{{date:+0:full {{date:+1:dm}}",
      "{{date+0full}}",
      "{{ date:+0:full }}",
      "{{}}",
      "{{date:+:full}}",
    ];
    for (const text of malformed)
      expect(() => renderDates(text, NOV_8, "bad.txt")).toThrow(
        "bad.txt: malformed date placeholder",
      );
  });

  test("text with no placeholders comes back unchanged", () => {
    const plain =
      "Plain text, {single braces}, a closing }} and {date:+0:full}.";
    expect(renderDates(plain, NOV_8, "plain.txt")).toBe(plain);
    expect(renderDates("", NOV_8, "empty.txt")).toBe("");
  });
});

describe("emails-nine.txt", () => {
  test("rendered on 2026-11-08 it keeps the key lines of the original file", async () => {
    const text = renderDates(
      await readFile(EMAILS, "utf8"),
      NOV_8,
      "emails-nine.txt",
    );
    expect(text).toContain(
      "pasted from the studio@larkspurstudio.example inbox on 8 November 2026.",
    );
    expect(text).toContain("Date: Sun, 8 Nov 2026 08:14\n");
    expect(text).toContain("Date: Sat, 7 Nov 2026 17:40\n");
    expect(text).toContain("Subject: Please confirm Tuesday's delivery\n");
    expect(text).toContain(
      "Please reply by Monday noon or we will move the delivery to next week.",
    );
  });

  test("rendered on 2026-12-03 (a Thursday) it has no placeholder left and every weekday matches its date", async () => {
    const text = renderDates(
      await readFile(EMAILS, "utf8"),
      new Date(2026, 11, 3),
      "emails-nine.txt",
    );
    expect(text).not.toContain("{{");
    expect(text).toContain(
      "Please reply by Friday noon or we will move the delivery to next week.",
    );
    expect(text).toContain("Subject: Please confirm Saturday's delivery\n");

    // A weekday next to a date, in the long form ("Friday 13 November") or the header form
    // ("Sat, 5 Dec 2026"), must be the weekday that date falls on.
    const long = new RegExp(
      `\\b(${WEEKDAYS.join("|")}) (\\d{1,2}) (${MONTHS.join("|")})(?: (\\d{4}))?\\b`,
      "g",
    );
    const header = new RegExp(
      `\\b(${WEEKDAYS_SHORT.join("|")}), (\\d{1,2}) (${MONTHS_SHORT.join("|")}) (\\d{4})\\b`,
      "g",
    );
    const pairs: {
      weekday: string;
      day: string;
      month: number;
      year: number;
    }[] = [];
    for (const m of text.matchAll(long))
      pairs.push({
        weekday: m[1] ?? "",
        day: m[2] ?? "",
        month: MONTHS.indexOf(m[3] ?? ""),
        year: Number(m[4] ?? 2026),
      });
    for (const m of text.matchAll(header))
      pairs.push({
        weekday: WEEKDAYS[WEEKDAYS_SHORT.indexOf(m[1] ?? "")] ?? "",
        day: m[2] ?? "",
        month: MONTHS_SHORT.indexOf(m[3] ?? ""),
        year: Number(m[4]),
      });
    // Guard against a vacuous pass: the file has these dates, so the check must see them.
    expect(pairs.length).toBeGreaterThanOrEqual(10);
    for (const pair of pairs)
      expect(
        `${pair.weekday} ${pair.day} ${MONTHS[pair.month]} ${pair.year}`,
      ).toBe(
        `${weekdayOf(pair.year, pair.month, Number(pair.day))} ${pair.day} ${MONTHS[pair.month]} ${pair.year}`,
      );
  });

  test("loadCases renders the attachment with the day it is given", async () => {
    const at = async (today: Date) =>
      (await loadCases(CASES, { today })).find((c) => c.id === "otto-1")
        ?.attachments[0]?.text ?? "";
    const onPasteDay = await at(NOV_8);
    expect(onPasteDay).toContain("Please reply by Monday noon");
    expect(onPasteDay).not.toContain("{{");
    expect(await at(new Date(2026, 11, 3))).toContain(
      "Please reply by Friday noon",
    );
    const otto = (await loadCases(CASES, { today: NOV_8 })).find(
      (c) => c.id === "otto-1",
    );
    // The bracket no longer names a day number; the placeholders carry the dates.
    expect(otto?.request).not.toMatch(/\b\d{1,2}(st|nd|rd|th)\b/);
  });
});
