import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DuetCard } from "@/components/duet/kit";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import { tryClient } from "@/lib/client";
import {
  CARD_WORDS,
  type CheckAnswer,
  type CheckOutcome,
  checkOutcome,
  type ClaudeProblem,
  OUTCOME_WORDS,
} from "./claude-connect";

/*
 * The card under a failed turn when Claude is not connected or not installed (docs/design/first-start.md, slice S5,
 * option (b) of decision D1): it says so in plain words, shows the exact command to copy, and has Check again.
 *
 * NO CODE PASSES THROUGH FREEDUET. There is no input on this card and no request that carries one: the person signs in
 * in a terminal of their own, and Check again asks the server only whether Claude is now installed and signed in.
 *
 * A hosted deployment (`/api/capabilities` says `deployment: "hosted"`) gets no card, and while that answer has not
 * come the sentence stands alone: the card appears only once it is known that this is a person's own installation.
 */

const BUTTON =
  "type-label min-h-11 shrink-0 rounded-full px-4 py-2 font-semibold transition-[filter,transform,opacity] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.98] disabled:opacity-50";

function Plain({ reason }: { reason: string }) {
  return (
    <p
      className="text-destructive text-sm"
      data-testid="transcript-stopped"
      role="alert"
    >
      {reason}
    </p>
  );
}

export function ClaudeConnectCard({
  problem,
  reason,
}: {
  problem: ClaudeProblem;
  reason: string;
}) {
  const capabilities = useQuery(deploymentCapabilitiesQueryOptions());
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [copied, setCopied] = useState(false);

  if (!capabilities.data || capabilities.data.deployment === "hosted")
    return <Plain reason={reason} />;

  const words = CARD_WORDS[problem];

  const checkAgain = async () => {
    setChecking(true);
    try {
      const response = await tryClient("/api/freeduet/engines/claude/check", {
        method: "POST",
      });
      let body: Partial<CheckAnswer> | null = null;
      try {
        body = (await response.json()) as Partial<CheckAnswer>;
      } catch {
        // Not JSON: the outcome below says the engine did not answer.
      }
      setOutcome(checkOutcome(response.status, body));
    } catch {
      setOutcome("no_engine");
    } finally {
      setChecking(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words.command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <DuetCard
      aria-label="Connect your Claude plan"
      className="px-4 py-3"
      data-testid="claude-connect-card"
      role="region"
    >
      <p className="type-row font-semibold">{words.title}</p>
      <p className="type-label mt-1 text-duet-ink-3">{words.body}</p>
      <pre
        className="type-label mt-2 overflow-x-auto rounded-lg bg-duet-black/5 px-3 py-2 [overflow-wrap:anywhere] whitespace-pre-wrap"
        data-testid="claude-connect-command"
      >
        {words.command}
      </pre>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          className={`${BUTTON} bg-duet-black text-duet-on-black hover:brightness-125`}
          disabled={checking}
          onClick={checkAgain}
          type="button"
        >
          {checking ? "Checking" : "Check again"}
        </button>
        <button
          className={`${BUTTON} bg-duet-black/5 text-duet-ink hover:brightness-95`}
          onClick={copy}
          type="button"
        >
          {copied ? "Copied" : "Copy the command"}
        </button>
      </div>
      {outcome ? (
        <p
          className={`type-label mt-2 font-semibold ${outcome === "connected" ? "text-duet-green" : "text-duet-ink-3"}`}
          role="status"
        >
          {OUTCOME_WORDS[outcome]}
        </p>
      ) : null}
    </DuetCard>
  );
}
