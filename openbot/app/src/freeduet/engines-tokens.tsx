import { useQuery } from "@tanstack/react-query";
import { DuetCard } from "@/components/duet/kit";
import { PageSection } from "@/components/layout/page-shell";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";
import type { EnginesReading } from "./engines-text";
import {
  TOKENS_ALL_ENGINES,
  TOKENS_COLUMNS,
  TOKENS_DESCRIPTION,
  TOKENS_EMPTY,
  TOKENS_FALLBACK,
  TOKENS_NOTE,
  TOKENS_PROBLEM,
  TOKENS_TITLE,
  TOKENS_UNAVAILABLE,
  type TokenCounts,
  type TokenRow,
  type TokenUsage,
  tokensCell,
} from "./engines-tokens-text";

/**
 * The Tokens section of the Engines page (D102): a table of member by engine with today and the last seven days, as each engine
 * reported its own use, and a total per engine below it. Read-only: it asks `GET /api/freeduet/engines/usage` and holds no
 * choice, no key and no text. An engine that reported nothing says "not reported". Kept in app/src/freeduet/ (docs/UPSTREAM_TOUCHES.md).
 */

const REFRESH_MS = 30_000;

export const tokensKeys = { all: ["freeduet", "engines", "usage"] as const };

export function tokensQueryOptions() {
  return {
    queryKey: tokensKeys.all,
    queryFn: async (): Promise<TokenUsage> => {
      const response = await client("/api/freeduet/engines/usage", {
        fallback: TOKENS_FALLBACK,
      });
      return response.json();
    },
  };
}

function Cell({ counts }: { counts: TokenCounts }) {
  const cell = tokensCell(counts);
  return (
    <td className="px-3 py-3 tabular-nums">
      {cell.text}
      {cell.note ? (
        <span className="type-label block text-duet-ink-2">{cell.note}</span>
      ) : null}
    </td>
  );
}

function Rows({
  rows,
  memberName,
  engineName,
}: {
  rows: TokenRow[];
  memberName: (id: string | null) => string;
  engineName: (id: string) => string;
}) {
  return (
    <>
      {rows.map((row) => (
        <tr
          className="border-duet-hair-2 border-t align-top"
          key={`${row.member}/${row.engine}`}
        >
          <th
            className="whitespace-nowrap px-3 py-3 text-left font-semibold"
            scope="row"
          >
            {memberName(row.member)}
          </th>
          <td className="px-3 py-3">{engineName(row.engine)}</td>
          <Cell counts={row.today} />
          <Cell counts={row.week} />
        </tr>
      ))}
    </>
  );
}

export function EngineTokens({ reading }: { reading: EnginesReading }) {
  const usage = useQuery({
    ...tokensQueryOptions(),
    refetchInterval: REFRESH_MS,
  });
  const agents = useQuery(agentListQueryOptions());
  const engineName = (id: string) =>
    reading.engines.find((engine) => engine.id === id)?.name ?? id;
  const memberName = (id: string | null) =>
    id === null
      ? TOKENS_ALL_ENGINES
      : (agents.data?.find((agent) => agent.id === id)?.name ?? id);
  const data = usage.data;

  return (
    <PageSection description={TOKENS_DESCRIPTION} title={TOKENS_TITLE}>
      {usage.error || data?.reason ? (
        <p className="type-label mt-4 text-duet-ink-2">{TOKENS_UNAVAILABLE}</p>
      ) : null}
      {data?.problem ? (
        <p className="type-label mt-4 text-duet-ink-2">{TOKENS_PROBLEM}</p>
      ) : null}
      {data && !data.reason && data.rows.length === 0 ? (
        <p className="type-label mt-4 text-duet-ink-2">{TOKENS_EMPTY}</p>
      ) : null}
      {data && !data.reason && data.rows.length > 0 ? (
        <DuetCard className="mt-4">
          <section
            aria-label={TOKENS_TITLE}
            className="overflow-x-auto px-4 py-2"
          >
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">{TOKENS_TITLE}</caption>
              <thead>
                <tr className="text-left text-duet-ink-2">
                  <th className="px-3 py-3 font-medium" scope="col">
                    {TOKENS_COLUMNS.member}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {TOKENS_COLUMNS.engine}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {TOKENS_COLUMNS.today}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {TOKENS_COLUMNS.week}
                  </th>
                </tr>
              </thead>
              <tbody>
                <Rows
                  engineName={engineName}
                  memberName={memberName}
                  rows={data.rows}
                />
              </tbody>
              <tbody className="border-duet-hair border-t-2">
                <Rows
                  engineName={engineName}
                  memberName={memberName}
                  rows={data.engines}
                />
              </tbody>
            </table>
          </section>
        </DuetCard>
      ) : null}
      {data && !data.reason && data.rows.length > 0 ? (
        <p className="type-label mt-2 text-duet-ink-2">{TOKENS_NOTE}</p>
      ) : null}
    </PageSection>
  );
}
