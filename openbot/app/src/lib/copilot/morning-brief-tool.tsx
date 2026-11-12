import { useRenderTool } from "@copilotkit/react-core/v2";
import { useState } from "react";
import { z } from "zod";
import { useConversationSend } from "@/components/channels/conversation-send";
import { ToolLine } from "@/components/channels/tool-line";
import { BuildInProvider, useArrivedLive } from "@/components/duet/build-in";
import {
  type BriefItem,
  MorningBriefCard,
} from "@/components/duet/morning-brief-card";
import {
  type CardLanguage,
  cardDate,
  cardGreeting,
  cardText,
  cardTextIn,
  cardTime,
} from "@/freeduet/person-language/cards";
import {
  useCardLanguage,
  useCardText,
} from "@/freeduet/person-language/use-card-text";
import { MORNING_BRIEF_TOOL } from "@/lib/channels/morning-brief";
import { readToolName } from "@/lib/plugins/tool-name";

/*
 * Draws the server's `morning_brief` tool as the film's brief card. The tool runs on the server
 * (server/src/openduet/brief.ts), where the sorting is the same sorting evals/triage measures; this
 * only draws what it returned.
 */

const mail = z.object({
  id: z.string(),
  threadId: z.string().default(""),
  from: z.string(),
  subject: z.string().default(""),
  reason: z.string(),
  decidedBy: z.string().default(""),
});
export const briefSchema = z.object({
  at: z.string(),
  name: z.string().nullable().default(null),
  needsYou: z.array(mail).default([]),
  canWait: z.array(mail).default([]),
  calendar: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string(),
        start: z.string(),
        end: z.string().default(""),
        location: z.string().optional(),
      }),
    )
    .default([]),
  couldNotCheck: z
    .array(z.object({ source: z.string(), why: z.string() }))
    .default([]),
});
export type Brief = z.infer<typeof briefSchema>;

/** The tool's result, or null when it is a refusal or not a brief. */
export function readBrief(result: unknown): Brief | null {
  if (typeof result !== "string") return null;
  try {
    let value: unknown = JSON.parse(result);
    // A server tool's text can arrive JSON-encoded once more on the way through the runtime.
    if (typeof value === "string") value = JSON.parse(value);
    const parsed = briefSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * "3:00 PM" for a timed event, "All day" for a date; "15:00" and "Tutto il giorno" in Italian.
 * The language is the deployment's (D26); null is English with the browser's own clock, as it was.
 */
function timeOf(start: string, language: CardLanguage | null): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start))
    return cardText("brief.allDay", {}, language);
  const when = new Date(start);
  return Number.isNaN(when.getTime()) ? start : cardTime(when, language);
}

/**
 * The card's rows. Can wait folds into one row: the film's "I'll handle these", not a second inbox.
 *
 * `language` is the card's table language (null for English, the default, which is today's text).
 * Only the words the app writes change; a row's title, reason and the sender names are the mail's
 * and the member's own.
 */
export function briefCard(
  brief: Brief,
  language: CardLanguage | null = null,
): {
  date: string;
  greeting: string;
  needsYou: BriefItem[];
  canWait: BriefItem[];
  today: BriefItem[];
  notes: BriefItem[];
} {
  const at = new Date(brief.at);
  const t = cardTextIn(language);
  const senders = [...new Set(brief.canWait.map((item) => item.from))];
  const named = senders.slice(0, 3).join(", ");
  const rest = senders.length - 3;
  return {
    date: cardDate(at, language),
    greeting: cardGreeting(at, brief.name, language),
    /*
     * What was sorted as needing the person first, and what could not be sorted after it. Those
     * are only here to be safe, and the card shows its first few rows before "Show more", so they
     * should not take those places from mail that does need the person.
     */
    needsYou: [...brief.needsYou]
      .sort(
        (a, b) =>
          Number(a.decidedBy === "unsorted") -
          Number(b.decidedBy === "unsorted"),
      )
      .map((item) => ({
        id: item.id,
        title: item.subject ? `${item.from} · ${item.subject}` : item.from,
        why: item.reason,
      })),
    canWait: brief.canWait.length
      ? [
          {
            id: "can-wait",
            title: t("brief.canWait", { count: brief.canWait.length }),
            why:
              rest > 0
                ? t("brief.andMore", { names: named, count: rest })
                : named,
          },
        ]
      : [],
    today: brief.calendar.map((event) => ({
      id: event.id,
      title: event.summary,
      why: [timeOf(event.start, language), event.location]
        .filter(Boolean)
        .join(" · "),
    })),
    notes: brief.couldNotCheck.map((gap, index) => ({
      id: `gap-${index}`,
      title: gap.source,
      why: gap.why,
    })),
  };
}

const TOOL = MORNING_BRIEF_TOOL;
const parameters = z.object({ since: z.string().optional() });

export function MorningBriefTool() {
  useRenderTool({
    name: TOOL,
    parameters,
    render: ({ result, status }) => (
      <BriefToolView
        result={result}
        running={status !== "complete" && result === undefined}
      />
    ),
  });
  return null;
}

/**
 * The tool's line while it reads, then the card. One component for both, so it can tell a brief
 * that arrived while the person watched, which builds in row by row, from one read back from
 * history, which is drawn whole (components/duet/build-in.tsx).
 */
function BriefToolView({
  result,
  running,
}: {
  result: unknown;
  running: boolean;
}) {
  const live = useArrivedLive(running);
  const language = useCardLanguage();
  const t = useCardText();
  if (running)
    return (
      <ToolLine label={readToolName(TOOL, true, language).label} running />
    );
  const brief = readBrief(result);
  if (!brief)
    return (
      <ToolLine
        label={t("brief.couldNotMake")}
        detail={typeof result === "string" ? result : undefined}
        refused
      />
    );
  return (
    <BuildInProvider value={live}>
      <StartableBrief brief={brief} />
    </BuildInProvider>
  );
}

/**
 * What Start sends for a row that needs the person: their own words, in the thread, asking the Bot
 * to take it on. A reply that goes out still stops for Allow once like any other.
 */
export function startRequest(
  item: Brief["needsYou"][number],
  language: CardLanguage | null = null,
): string {
  return item.subject
    ? cardText(
        "brief.startRequest",
        { from: item.from, subject: item.subject },
        language,
      )
    : cardText("brief.startRequestNoSubject", { from: item.from }, language);
}

/**
 * The brief with Start on each row that needs the person. Start sends through the conversation it is
 * drawn in, as a typed message would, so it waits its turn behind an answer in flight. Outside a
 * conversation there is nowhere to send, and the rows draw no button.
 */
export function StartableBrief({ brief }: { brief: Brief }) {
  const conversation = useConversationSend();
  const language = useCardLanguage();
  const t = useCardText();
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());
  const card = briefCard(brief, language);
  // By id, not position: the card puts mail that could not be sorted last.
  const mailById = new Map(brief.needsYou.map((item) => [item.id, item]));
  const needsYou = conversation
    ? card.needsYou.map((row) => {
        const item = mailById.get(row.id);
        if (!item) return row;
        return {
          ...row,
          action: {
            label: t("brief.start"),
            name: t("brief.startNamed", { title: row.title }),
            ...(started.has(row.id) ? { done: t("brief.started") } : {}),
            onPress: () => {
              if (conversation.send(startRequest(item, language)))
                setStarted((current) => new Set(current).add(row.id));
            },
          },
        };
      })
    : card.needsYou;
  return <MorningBriefCard {...card} needsYou={needsYou} />;
}
