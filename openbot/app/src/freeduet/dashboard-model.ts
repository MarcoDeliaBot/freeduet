/**
 * The Dashboard's numbers (D154, stage 1). Pure: it takes what the app's own reads already return and says what each card shows.
 * Nothing here is measured anew and nothing is invented: a card whose source did not answer says so, it never shows a zero in
 * its place. Days are counted in UTC, as the server counts them.
 */

import {
  attentionSummary,
  needsInput,
} from "@/components/bot-profile/attention";
import type { AgentProfile } from "@/lib/agents/queries";
import type { BotAttention } from "@/lib/bot-lifecycle/queries";
import type { RoutinesPage } from "@/lib/routines/queries";
import { type EnginesReading, enginePill } from "./engines-text";
import {
  type Currency,
  compactTokens,
  formatMoney,
  listPriceUsd,
  savedFor,
  savedTimeText,
  savedTokensText,
  type TokenCounts,
  type TokenRow,
  type TokenUsage,
} from "./engines-tokens-text";
import { englishT, type T } from "@/freeduet/i18n/provider";

export const DASHBOARD_TITLE = "Dashboard";
export const NOT_AVAILABLE = "Not available yet";
export const TOKENS_NOT_COUNTED = "No turn has been counted yet today.";
export const COUNTS_UNAVAILABLE = "The token counts are not available now.";
export const ENGINES_LINK = "Manage engines";
export const TEAM_LINK = "All members";

export type DashboardInput = {
  agents: AgentProfile[] | undefined;
  attention: BotAttention[] | undefined;
  usage: TokenUsage | undefined;
  usageFailed: boolean;
  engines: EnginesReading | undefined;
  enginesFailed: boolean;
  routines: RoutinesPage | undefined;
  now: Date;
  currency?: Currency;
};

export type MemberTile = {
  id: string;
  name: string;
  state: string;
  tone: "ready" | "wait" | "idle";
};

export function memberTiles(
  agents: AgentProfile[] | undefined,
  attention: BotAttention[] | undefined,
  t: T = englishT,
): MemberTile[] | null {
  if (!agents) return null;
  const byId = new Map((attention ?? []).map((bot) => [bot.agentId, bot]));
  return agents.map((agent) => {
    const bot = byId.get(agent.id);
    if (bot?.paused)
      return {
        id: agent.id,
        name: agent.name,
        state: t("bots.paused"),
        tone: "idle",
      };
    if (bot && needsInput(bot) > 0)
      return {
        id: agent.id,
        name: agent.name,
        state: t("dash.waitingForYou"),
        tone: "wait",
      };
    return {
      id: agent.id,
      name: agent.name,
      state: t("dash.available"),
      tone: "ready",
    };
  });
}

/** What waits on the person: questions, approvals and stalled hand-offs, as the sidebar badge counts them. */
export function waitingFor(
  attention: BotAttention[] | undefined,
  t: T = englishT,
): {
  total: number;
  lines: string[];
} | null {
  if (!attention) return null;
  const waiting = attention.filter((bot) => needsInput(bot) > 0);
  return {
    total: waiting.reduce((sum, bot) => sum + needsInput(bot), 0),
    lines: waiting.map(
      (bot) => `${bot.name}: ${attentionSummary({ ...bot, unread: 0 }, t)}`,
    ),
  };
}

export function headline(waiting: number | null, t: T = englishT): string {
  if (waiting === null) return t("dash.loading");
  if (waiting === 0) return t("dash.nothingWaits");
  return t("dash.thingsWait", { count: waiting });
}

const tokensOf = (counts: TokenCounts) =>
  counts.inputTokens + counts.outputTokens;

export type UsageState = "ok" | "empty" | "unavailable";

export function usageState(
  usage: TokenUsage | undefined,
  failed: boolean,
): UsageState | null {
  if (failed) return "unavailable";
  if (!usage) return null;
  if (usage.reason) return "unavailable";
  return usage.rows.length === 0 ? "empty" : "ok";
}

/** Today's tokens, every engine, as the engines reported them. Null when no turn reported a count. */
export function tokensToday(
  usage: TokenUsage,
  t: T = englishT,
): {
  total: number;
  note: string | null;
} {
  const rows = usage.engines;
  const total = rows.reduce((sum, row) => sum + tokensOf(row.today), 0);
  const turns = rows.reduce((sum, row) => sum + row.today.turns, 0);
  const reported = rows.reduce((sum, row) => sum + row.today.reportedTurns, 0);
  return {
    total,
    note:
      turns > reported
        ? t("dash.partialCount", { reported, turns })
        : t("dash.inputPlusOutput"),
  };
}

export function savedToday(
  usage: TokenUsage,
  currency: Currency = "eur",
  t: T = englishT,
) {
  const saved = savedFor(usage.rows, "today");
  const tokens = saved.inputTokens + saved.outputTokens;
  return {
    amount: formatMoney(
      listPriceUsd(saved.inputTokens, saved.outputTokens),
      currency,
    ),
    detail:
      savedTokensText(saved) ?? savedTimeText(saved) ?? t("dash.nothingSaved"),
    any: tokens > 0,
  };
}

/** The next enabled routine to fire after `now`. Its text is the person's own instruction, cut short. */
export function nextRoutine(
  page: RoutinesPage | undefined,
  agents: AgentProfile[] | undefined,
  now: Date,
  locale = "en-GB",
): { time: string; detail: string } | "none" | null {
  if (!page) return null;
  const upcoming = page.routines
    .filter(
      (routine) =>
        routine.enabled && Date.parse(routine.nextRunAt) > now.getTime(),
    )
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt))[0];
  if (!upcoming) return "none";
  const at = new Date(upcoming.nextRunAt);
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const sameDay = at.toDateString() === now.toDateString();
  const day = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
  const who = agents?.find((agent) => agent.id === upcoming.agentId)?.name;
  const text = upcoming.instruction.trim().replace(/\s+/g, " ");
  const short = text.length > 48 ? `${text.slice(0, 47)}…` : text;
  return {
    time: sameDay ? clock : `${day}, ${clock}`,
    detail: who ? `${who} · ${short}` : short,
  };
}

export type EngineLine = {
  id: string;
  name: string;
  note: string;
  value: string;
  tone: "ready" | "wait" | "idle";
};

export function engineLines(
  reading: EnginesReading | undefined,
  usage: TokenUsage | undefined,
  t: T = englishT,
): EngineLine[] | null {
  if (!reading || reading.reason) return null;
  return reading.engines.map((engine) => {
    const first = (reading.members ?? []).filter(
      (member) => member.chain[0] === engine.id,
    ).length;
    const pill = enginePill(engine.state);
    const counts = usage?.engines.find(
      (row) => row.member === null && row.engine === engine.id,
    )?.today;
    const value =
      counts && counts.reportedTurns > 0
        ? compactTokens(tokensOf(counts))
        : "—";
    const firstNote =
      first > 0 ? ` · ${t("dash.firstFor", { count: first })}` : "";
    return {
      id: engine.id,
      name: engine.name,
      note: `${pill.label}${firstNote}`,
      value,
      tone:
        engine.state === "ready"
          ? "ready"
          : engine.state === "unknown" || engine.state === "checking"
            ? "idle"
            : "wait",
    };
  });
}

export type MemberUsage = {
  id: string;
  name: string;
  value: string;
  share: number;
};

/** Today's tokens per member, busiest first, at most six; the bar is the share of the busiest. */
export function memberUsage(
  usage: TokenUsage,
  name: (id: string) => string,
): MemberUsage[] {
  const perMember = new Map<string, number>();
  for (const row of usage.rows as TokenRow[]) {
    if (row.member === null) continue;
    perMember.set(
      row.member,
      (perMember.get(row.member) ?? 0) + tokensOf(row.today),
    );
  }
  const sorted = [...perMember.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
  const top = sorted[0]?.[1] ?? 0;
  return sorted.map(([id, value]) => ({
    id,
    name: name(id),
    value: compactTokens(value),
    share: top > 0 ? Math.max(2, Math.round((value / top) * 100)) : 0,
  }));
}
