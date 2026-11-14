import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { client } from "@/lib/client";
import {
  type EnginesReading,
  engineReasonText,
  engineStateText,
} from "./engines-text";

/**
 * The Engines page, administrators only (docs/ENGINES_PLAN.md section 9.1, slice 6): each engine by name, with
 * one plain sentence for its state and, where it waits, the time it waits until in the person's own time zone.
 * Read-only: no row can be clicked to change anything. Kept in app/src/freeduet/ so the upstream admin page only
 * gains one row and the route file one import (docs/UPSTREAM_TOUCHES.md).
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
        fallback: "The engines could not be listed.",
      });
      return response.json();
    },
  });
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
    <PageShell
      description="The AI engines this installation's members can run on, and whether each one can answer now. This page only shows them: nothing here enables, disables or changes an engine."
      title="Engines"
    >
      {engines.error ? (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          Couldn't load the engines. Reload the page.
        </p>
      ) : null}

      {reading?.reason ? (
        <PageEmpty>{engineReasonText(reading.reason)}</PageEmpty>
      ) : null}

      {reading && !reading.reason && reading.engines.length === 0 ? (
        <PageEmpty>No engines are reported yet.</PageEmpty>
      ) : null}

      {reading && !reading.reason && reading.engines.length > 0 ? (
        <PageSection title="Engines and their state">
          <PageRows>
            {reading.engines.map((engine, index) => (
              <StaggerItem index={index} key={engine.id}>
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>{engine.name}</ItemTitle>
                    <ItemDescription>
                      {engineStateText(engine, now)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
                {index !== reading.engines.length - 1 && <Separator />}
              </StaggerItem>
            ))}
          </PageRows>
        </PageSection>
      ) : null}
    </PageShell>
  );
}
