/*
 * Dates in the team eval's fixtures, relative to the day the run starts. A fixture file writes
 * `{{date:<offset>:<format>}}` wherever a date would otherwise be fixed: `<offset>` is a signed whole
 * number of calendar days from today (`+0`, `-13`, `+22`) and `<format>` is one of FORMATS below.
 * An email pasted "on 8 November 2026" is written `{{date:+0:full}}`, so the same fixture still
 * reads as a recent email on whatever day the eval runs. checks.ts renders every attachment with
 * this before it is stored.
 */

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

/** A calendar day, read back from UTC so no local offset or DST change can move it. */
type Day = { year: number; month: number; day: number; weekday: number };

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const FORMATS = new Map<string, (day: Day) => string>([
  [
    "header",
    (d) =>
      `${WEEKDAYS_SHORT[d.weekday]}, ${d.day} ${MONTHS_SHORT[d.month]} ${d.year}`,
  ],
  ["full", (d) => `${d.day} ${MONTHS[d.month]} ${d.year}`],
  ["long", (d) => `${WEEKDAYS[d.weekday]} ${d.day} ${MONTHS[d.month]}`],
  ["dm", (d) => `${d.day} ${MONTHS[d.month]}`],
  ["short", (d) => `${d.day} ${MONTHS_SHORT[d.month]}`],
  ["weekday", (d) => WEEKDAYS[d.weekday] ?? ""],
  ["day", (d) => ordinal(d.day)],
]);

const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;
const BODY = /^date:([+-]\d+):([A-Za-z]+)$/;

/**
 * The calendar day `offset` days after `today`'s local year, month and day. Built with Date.UTC and
 * read back with UTC getters, so a DST change between the two dates cannot shift it by an hour.
 */
function dayAt(today: Date, offset: number): Day | undefined {
  const date = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + offset),
  );
  if (Number.isNaN(date.getTime())) return undefined;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

/**
 * Replaces every `{{date:<offset>:<format>}}` in `text` with the date it names, counted from
 * `today`. Text without placeholders comes back unchanged. A malformed placeholder or an unknown
 * format throws an Error that names `source` (the file it came from).
 */
export function renderDates(text: string, today: Date, source: string): string {
  if (!text.includes("{{")) return text;
  const rendered = text.replace(PLACEHOLDER, (placeholder, body: string) => {
    const parts = BODY.exec(body);
    if (!parts)
      throw new Error(
        `${source}: malformed date placeholder ${placeholder}, expected {{date:<offset>:<format>}} with a signed offset such as +0 or -13`,
      );
    const [, offset = "", format = ""] = parts;
    const render = FORMATS.get(format);
    if (!render)
      throw new Error(
        `${source}: unknown date format "${format}" in ${placeholder}, expected one of ${[...FORMATS.keys()].join(", ")}`,
      );
    const day = dayAt(today, Number(offset));
    if (!day)
      throw new Error(
        `${source}: ${placeholder} is too far from today to be a date`,
      );
    return render(day);
  });
  if (rendered.includes("{{"))
    throw new Error(
      `${source}: malformed date placeholder, a "{{" is not closed by "}}"`,
    );
  return rendered;
}
