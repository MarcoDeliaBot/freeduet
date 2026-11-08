/**
 * One model call for a few words. Not a Bot and not a turn: a title is not said to anybody and is
 * not part of the conversation it names, so there is no runtime work and no thread to hold.
 */
import { anthropicMessagesUrl, chatCompletionsUrl } from "../routing/model";
import { oneLine } from "./text";

/** Rules, not an example: a model copies an example's subject as readily as its shape. */
const INSTRUCTION = [
  "You name conversations, like a title in a sidebar.",
  "Answer with three to six words naming what the conversation is about.",
  "No quotation marks, no trailing period, no prefix such as 'Conversation about'.",
  "Name the subject itself, not the fact that somebody asked about it.",
].join(" ");

export type TitlerOptions = {
  /**
   * Whose API the key belongs to, from the tenant package. Unset is OpenAI, as before. An Anthropic
   * key goes to Anthropic's own endpoint: sent to the OpenAI-format URL it was handed to another
   * company's server on every title.
   */
  provider?: "openai" | "anthropic";
  /** The model to ask, from the tenant package. */
  model: string;
  /** Resolved per call, so a rotated credential is picked up without a restart. */
  resolveApiKey: () => Promise<string | null>;
  environment?: Record<string, string | undefined>;
  /** Injectable so a test drives this without a network. */
  fetchImpl?: typeof fetch;
  /** How long one call may take before it is given up on. */
  timeoutMs?: number;
};

/** No key resolves to null and is not retried; a provider error throws, so the queue retries it. */
export function createChannelTitler(options: TitlerOptions) {
  const call = options.fetchImpl ?? fetch;

  return async (excerpt: string): Promise<string | null> => {
    const apiKey = await options.resolveApiKey();
    if (!apiKey) return null;

    if (options.provider === "anthropic") {
      const response = await call(
        anthropicMessagesUrl(options.environment ?? process.env),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: options.model,
            system: INSTRUCTION,
            messages: [{ role: "user", content: excerpt }],
            max_tokens: 512,
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
        },
      );
      if (!response.ok) {
        const detail = oneLine(await response.text().catch(() => ""), 200);
        throw new Error(
          `The model refused to name a conversation: ${response.status} ${detail}`.trim(),
        );
      }
      const body = (await response.json()) as {
        content?: { type?: unknown; text?: unknown }[];
      };
      const text = (body.content ?? [])
        .filter(
          (block) => block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text as string)
        .join("")
        .trim();
      return text.length > 0 ? text : null;
    }

    const response = await call(
      chatCompletionsUrl(options.environment ?? process.env),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: "system", content: INSTRUCTION },
            { role: "user", content: excerpt },
          ],
          // Reasoning tokens come out of this budget, so a cap sized for the answer alone 400s.
          max_completion_tokens: 512,
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      },
    );

    if (!response.ok) {
      // Capped: this lands on the work item's row, and an HTML error page would land there whole.
      const detail = oneLine(await response.text().catch(() => ""), 200);
      throw new Error(
        `The model refused to name a conversation: ${response.status} ${detail}`.trim(),
      );
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;
    const answer = content.trim();
    return answer.length > 0 ? answer : null;
  };
}
