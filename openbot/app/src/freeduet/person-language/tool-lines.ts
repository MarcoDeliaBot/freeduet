import { type CardLanguage, type CardTextId, cardText } from "./cards";

/**
 * The running and finished lines of the two FreeDuet tools that announce a card, in the person's
 * language (docs/M1_PLAN.md D26 amendment): the morning brief ("Reading your mail and calendar")
 * and the task offer ("Adding a task").
 *
 * ONE LOOKUP, READ BY BOTH PLACES THAT SAY THESE WORDS. `lib/plugins/tool-name.ts` keeps the shared
 * vocabulary, and both the tool's own line (`readToolName`) and the pill under the header's orb
 * (`stepPhrase`) read an own tool's words through `ownToolLabel`, which asks here first. So the line
 * and the pill are translated at the same place and cannot say different things.
 *
 * ONLY THESE TWO TOOLS. The rest of that vocabulary (the mail, the web, memory, the other own tools,
 * "Thinking it through") belongs to the interface translation the D26 amendment leaves for later,
 * and a name that is not listed here, or no language, answers null: the caller keeps its own English
 * words, exactly as before.
 */
const OWN_TOOL_LINES = {
  morning_brief: {
    running: "tool.morningBrief.running",
    done: "tool.morningBrief.done",
  },
  offer_task: {
    running: "tool.offerTask.running",
    done: "tool.offerTask.done",
  },
} as const satisfies Record<string, { running: CardTextId; done: CardTextId }>;

/** The tools of this file, for the tests that compare them with the shared vocabulary. */
export const TRANSLATED_OWN_TOOLS = Object.keys(
  OWN_TOOL_LINES,
) as (keyof typeof OWN_TOOL_LINES)[];

/**
 * `name`'s line in `language`, while it runs or once it is done; null when the language is none
 * (English, today's rendering) or the tool is not one of the two above.
 */
export function ownToolLineIn(
  name: string,
  running: boolean,
  language: CardLanguage | null,
): string | null {
  if (language === null || !Object.hasOwn(OWN_TOOL_LINES, name)) return null;
  const ids = OWN_TOOL_LINES[name as keyof typeof OWN_TOOL_LINES];
  return cardText(running ? ids.running : ids.done, {}, language);
}

/** The ids of a tool's two lines, so a test can read the English the table holds for it. */
export function ownToolLineIds(name: (typeof TRANSLATED_OWN_TOOLS)[number]): {
  running: CardTextId;
  done: CardTextId;
} {
  return OWN_TOOL_LINES[name];
}
