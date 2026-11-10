import ical, { type EventInstance, type VEvent } from "node-ical";
import {
  type CalendarEvent,
  DEFAULT_MAX_RESULTS,
  endOfDayIn,
  eventOf,
  wallClockIn,
} from "./google-workspace-rest";
import type { MailPreset } from "./mail-presets";
import { calendarLinkRefusal } from "./user-secret";

/**
 * A calendar read from its secret address in iCal format, answered in the shape the REST adapter
 * answers `calendar_list_events` in.
 *
 * WHY A LINK AND NOT AN API. The link is the one thing a person can copy out of Google Calendar
 * without a Cloud project, a client or a consent screen. It is read-only by construction, and it
 * carries the whole of the access in its path, which is why it is treated as a credential
 * everywhere: stored encrypted, fetched only from the host the preset names, and never written into
 * a sentence.
 *
 * ONLY GOOGLE'S HOST, AND A REDIRECT IS CHECKED AGAIN. `fetch` is told not to follow redirects, and
 * each `Location` is held to the same rule as the link itself, so a redirect off the host, to http,
 * or to a path outside the calendar prefix ends the request and the next address is never dialled.
 */

/** Long enough for a large calendar, short enough that a Bot's turn is not held open on it. */
const REQUEST_TIMEOUT_MS = 30_000;
/** A calendar of years of daily events is a few megabytes; past this it is not a calendar. */
const MAX_ICS_BYTES = 8 * 1024 * 1024;
/** How many redirects are followed, each one re-checked. Google's feed answers directly. */
const MAX_HOPS = 3;
/** Recurrence rules can produce a great deal; a listing never needs more than this before it is cut. */
const MAX_INSTANCES = 5_000;

export type IcsFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type IcsOutcome =
  | { ok: true; text: string }
  | { ok: false; message: string };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/**
 * The calendar's text, fetched from the person's secret address.
 *
 * Every refusal is fixed text. A transport error's own message is never carried, because the
 * address is in it.
 */
export async function fetchCalendarText(
  link: string,
  preset: MailPreset,
  fetcher: IcsFetcher,
): Promise<IcsOutcome> {
  let target = link;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (calendarLinkRefusal(target, preset) !== null) {
      return {
        ok: false,
        message:
          hop === 0
            ? "The calendar address is not one this app will fetch. Copy the secret address in iCal format again."
            : "The calendar address redirected somewhere other than Google Calendar, so it was not followed.",
      };
    }

    let response: Response;
    try {
      response = await fetcher(target, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/calendar, text/plain;q=0.8, */*;q=0.5" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && error.name === "TimeoutError"
            ? "Google Calendar did not answer in time."
            : "Google Calendar could not be reached.",
      };
    }

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) {
        return {
          ok: false,
          message:
            "Google Calendar answered with a redirect that went nowhere.",
        };
      }
      try {
        target = new URL(location, target).toString();
      } catch {
        return {
          ok: false,
          message:
            "Google Calendar answered with a redirect that went nowhere.",
        };
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const moved = [401, 403, 404, 410].includes(response.status);
      return {
        ok: false,
        message: moved
          ? "Google Calendar did not accept the secret address. It may have been reset: copy the new one from your calendar's settings and connect again."
          : `Google Calendar refused the request (${response.status}).`,
      };
    }

    const text = await readCapped(response);
    if (text === null) {
      return {
        ok: false,
        message: "The calendar is larger than this app reads.",
      };
    }
    if (!/^\s*BEGIN:VCALENDAR/i.test(text.replace(/^﻿/, ""))) {
      return { ok: false, message: "That address did not return a calendar." };
    }
    return { ok: true, text };
  }
  return {
    ok: false,
    message: "The calendar address redirected too many times.",
  };
}

/** The body as text, or null when it is longer than {@link MAX_ICS_BYTES}. */
async function readCapped(response: Response): Promise<string | null> {
  if (!response.body) {
    const text = await response.text();
    return text.length > MAX_ICS_BYTES ? null : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_ICS_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export type ParsedCalendar = {
  /** The calendar's own time zone (`X-WR-TIMEZONE`) when it names one this runtime knows. */
  timeZone: string | null;
  /** Why the zone could not be read, for the note a result carries. */
  zoneNote: string | null;
  events: VEvent[];
};

export function parseCalendar(text: string): ParsedCalendar {
  const data = ical.sync.parseICS(text);
  const events: VEvent[] = [];
  let named: unknown;
  for (const item of Object.values(data)) {
    if (!item || typeof item !== "object") continue;
    if (item.type === "VEVENT") events.push(item as VEvent);
    else if (item.type === "VCALENDAR") {
      named = (item as unknown as Record<string, unknown>)["WR-TIMEZONE"];
    }
  }
  const zone = typeof named === "string" ? named.trim() : "";
  if (!zone) {
    return {
      timeZone: null,
      zoneNote: "The calendar did not name one.",
      events,
    };
  }
  try {
    wallClockIn(zone);
  } catch {
    return {
      timeZone: null,
      zoneNote: `"${zone.slice(0, 100)}" is not a time zone this server knows.`,
      events,
    };
  }
  return { timeZone: zone, zoneNote: null, events };
}

const text = (value: unknown): string | undefined => {
  if (typeof value === "string") return value || undefined;
  if (value && typeof value === "object" && "val" in value) {
    const inner = (value as { val?: unknown }).val;
    return typeof inner === "string" && inner ? inner : undefined;
  }
  return undefined;
};

/** `mailto:ana@example.com` as the address; anything else is not an address. */
function emailOf(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const match = /^mailto:(.+)$/i.exec(raw.trim());
  return match?.[1]?.trim() || undefined;
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/** A date-only value as `YYYY-MM-DD`, read in the zone the parser created it in: the runtime's. */
function dateOnly(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * An instant as the calendar's own clocks show it, with the offset: `2026-10-22T09:00:00+02:00`.
 * The form Google's API answers in, so a reader that shows the time shows the person's own.
 */
function zonedIso(date: Date, timeZone: string): string {
  const at = date.getTime();
  const wall = wallClockIn(timeZone)(at);
  const offsetMinutes = Math.round(
    (wall - Math.floor(at / 1000) * 1000) / 60_000,
  );
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${new Date(wall).toISOString().slice(0, 19)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/**
 * Google's own id for an event. Its iCal feed spells a UID as the API's id followed by `@google.com`,
 * so the suffix comes off and a reader holding an id from either way holds the same one. A UID from
 * anywhere else (an event imported from another calendar) is kept whole.
 */
function eventId(uid: string): string {
  return uid.replace(/@google\.com$/i, "");
}

/** Google's ids for an instance of a series: the series id and the instance's start, in UTC. */
function instanceId(uid: string, start: Date): string {
  return `${eventId(uid)}_${start
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")}`;
}

function calendarEventOf(
  instance: EventInstance,
  timeZone: string,
): CalendarEvent {
  const event = instance.event;
  const start = instance.start;
  const end = instance.end ?? start;
  const organizer = (event as { organizer?: unknown }).organizer;
  const attendee = (event as { attendee?: unknown }).attendee;
  const attendees = (
    Array.isArray(attendee) ? attendee : attendee ? [attendee] : []
  )
    .map(emailOf)
    .filter((email): email is string => email !== undefined);
  const name =
    organizer && typeof organizer === "object"
      ? text((organizer as { params?: { CN?: unknown } }).params?.CN)
      : undefined;
  const status =
    typeof event.status === "string" ? event.status.toLowerCase() : undefined;
  const location = text(event.location);
  const orgEmail = emailOf(organizer);
  return {
    id: instance.isRecurring
      ? instanceId(event.uid, start)
      : eventId(event.uid),
    summary: text(instance.summary),
    ...(status ? { status } : {}),
    ...(location ? { location } : {}),
    start: instance.isFullDay
      ? { date: dateOnly(start) }
      : { dateTime: zonedIso(start, timeZone) },
    end: instance.isFullDay
      ? { date: dateOnly(end) }
      : { dateTime: zonedIso(end, timeZone) },
    ...(orgEmail || name
      ? {
          organizer: {
            ...(orgEmail ? { email: orgEmail } : {}),
            ...(name ? { displayName: name } : {}),
          },
        }
      : {}),
    attendees: attendees.map((email) => ({ email })),
  };
}

/**
 * The calendar's events between two instants, as the REST adapter's `events` list reads: recurring
 * events expanded, in start order, nothing cancelled, cut at `limit`.
 *
 * `timeMin` is the earliest END to include and `timeMax` the latest START, as Google's API reads
 * them, so an event already under way is in and one starting at `timeMax` is out.
 */
export function listEvents(
  parsed: ParsedCalendar,
  window: { timeMin: Date; timeMax: Date },
  limit: number | null,
  timeZone: string,
) {
  const found: { at: number; instance: EventInstance }[] = [];
  for (const event of parsed.events) {
    let instances: EventInstance[];
    try {
      instances = ical.expandRecurringEvent(event, {
        from: window.timeMin,
        to: window.timeMax,
        expandOngoing: true,
      });
    } catch {
      // A rule this library gives up on is one event lost, not a calendar lost.
      continue;
    }
    for (const instance of instances) {
      if (instance.event.status === "CANCELLED") continue;
      const start = instance.start.getTime();
      const end = (instance.end ?? instance.start).getTime();
      const overlaps =
        start < window.timeMax.getTime() &&
        (end > window.timeMin.getTime() ||
          (end === start && start >= window.timeMin.getTime()));
      if (!overlaps) continue;
      found.push({ at: start, instance });
      if (found.length >= MAX_INSTANCES) break;
    }
    if (found.length >= MAX_INSTANCES) break;
  }
  found.sort((left, right) => left.at - right.at);
  return found
    .slice(0, limit ?? DEFAULT_MAX_RESULTS)
    .map(({ instance }) => eventOf(calendarEventOf(instance, timeZone)));
}

/** The default end of a window, as the REST adapter reads it: midnight in the calendar's zone. */
export function defaultWindowEnd(timeMin: Date, timeZone: string): Date {
  return endOfDayIn(timeMin, timeZone);
}
