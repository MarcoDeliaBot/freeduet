import { queryOptions, useQuery } from "@tanstack/react-query";
import { DuetCard, OutcomePill } from "@/components/duet/kit";
import { PageEmpty, PageShell } from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import { client } from "@/lib/client";
import { EngineMembers } from "./engines-members";
import { EngineProviders } from "./engines-providers";
import { EngineTokens } from "./engines-tokens";
import {
  ASIDE_LABEL,
  ENGINE_STATES_TITLE,
  ENGINES_FALLBACK,
  ENGINES_INTRO,
  ENGINES_TITLE,
  type EngineSummary,
  type EnginesReading,
  enginePill,
  engineReasonText,
  engineStateText,
  KEYS_NOT_BUILT,
  KEYS_TEXT,
  KEYS_TITLE,
  LOAD_FAILED,
  NO_ENGINES,
  SPENDING_TEXT,
  SPENDING_TITLE,
} from "./engines-text";

/**
 * The Engines page, administrators only (docs/ENGINES_PLAN.md section 9.1, slices 6 and 7, and the dashboard of
 * docs/design/engines-dashboard.md): each engine as a card, with one word for its state (the pill) and one sentence
 * below it, the time it waits until in the person's own time zone where it waits. Beside the cards, on a wide screen,
 * the Keys and Spending panels, which hold words only. Below the cards, where the server keeps the person's choices,
 * each member's engines and one choice for what happens when an engine runs out (engines-members.tsx). The provider cards (engines-providers.tsx) are the one place a person switches an engine on and saves its key. Kept in app/src/freeduet/ so the upstream admin page only gains one row and the route
 * file one import (docs/UPSTREAM_TOUCHES.md).
 */

/** How often the page asks again, so a time it shows does not go stale while it stays open. */
const REFRESH_MS = 30_000;

export const enginesKeys = { all: ["freeduet", "engines"] as const };

/** The server's read of agent-freeduet's engines. The token never reaches this page. */
export function enginesQueryOptions() {
  return queryOptions({
    queryKey: enginesKeys.all,
    queryFn: async (): Promise<EnginesReading> => {
      const response = await client("/api/freeduet/engines", {
        fallback: ENGINES_FALLBACK,
      });
      return response.json();
    },
  });
}

/** One engine: its word for the state, its name, and one line of note from the server's words. */
function EngineCard({ engine, now }: { engine: EngineSummary; now: Date }) {
  const pill = enginePill(engine.state);
  return (
    <DuetCard className="flex h-full flex-col gap-3 p-5" data-slot="engine">
      <div>
        <OutcomePill icon={null} tone={pill.tone}>
          {pill.label}
        </OutcomePill>
      </div>
      <h3 className="type-body font-semibold [overflow-wrap:anywhere]">
        {engine.name}
      </h3>
      <p className="type-label mt-auto border-duet-hair-2 border-t pt-3 text-duet-ink-2">
        {engineStateText(engine, now)}
      </p>
    </DuetCard>
  );
}

export function FreeDuetEngines() {
  const engines = useQuery({
    ...enginesQueryOptions(),
    refetchInterval: REFRESH_MS,
  });
  const reading = engines.data;
  // Read at each render: a time that has passed reads as past at the next refresh.
  const now = new Date();

  return (
    <PageShell description={ENGINES_INTRO} title={ENGINES_TITLE} width="wide">
      {engines.error ? (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          {LOAD_FAILED}
        </p>
      ) : null}

      {reading?.reason ? (
        <PageEmpty>{engineReasonText(reading.reason)}</PageEmpty>
      ) : null}

      {reading && !reading.reason ? (
        <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
          <div className="flex min-w-0 flex-col gap-10">
            {reading.engines.length === 0 ? (
              <PageEmpty>{NO_ENGINES}</PageEmpty>
            ) : (
              <section>
                <h2 className="sr-only">{ENGINE_STATES_TITLE}</h2>
                <ul className="grid gap-4 sm:grid-cols-2">
                  {reading.engines.map((engine, index) => (
                    <li className="min-w-0" key={engine.id}>
                      <StaggerItem className="h-full" index={index}>
                        <EngineCard engine={engine} now={now} />
                      </StaggerItem>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <EngineProviders
              onChanged={() => void engines.refetch()}
              reading={reading}
            />

            {(reading.members?.length ?? 0) > 0 ? (
              <EngineMembers
                onChanged={() => engines.refetch()}
                reading={reading}
              />
            ) : null}

            <EngineTokens reading={reading} />
          </div>

          <aside
            aria-label={ASIDE_LABEL}
            className="flex min-w-0 flex-col gap-4"
          >
            <DuetCard className="p-5">
              <h2 className="type-body font-semibold">{KEYS_TITLE}</h2>
              <p className="type-label mt-2 text-duet-ink-2">{KEYS_TEXT}</p>
              <p className="type-label mt-2 text-duet-ink-2">
                {KEYS_NOT_BUILT}
              </p>
            </DuetCard>
            <DuetCard className="p-5">
              <h2 className="type-body font-semibold">{SPENDING_TITLE}</h2>
              <p className="type-label mt-2 text-duet-ink-2">{SPENDING_TEXT}</p>
            </DuetCard>
          </aside>
        </div>
      ) : null}
    </PageShell>
  );
}
