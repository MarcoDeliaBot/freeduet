import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DuetCard } from "@/components/duet/kit";
import { PageSection } from "@/components/layout/page-shell";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";
import type { EnginesReading } from "./engines-text";
import {
  CURRENCY_STORAGE_KEY,
  type Currency,
  DEFAULT_CURRENCY,
  formatMoney,
  listPriceUsd,
  referenceLine,
  type Saved,
  savedFor,
  savedTimeText,
  savedTokensText,
  type TokenCounts,
  type TokenRow,
  type TokenUsage,
  tokensCell,
} from "./engines-tokens-text";
import { UsageCharts } from "./engines-usage-charts";
import { englishT, type T, useAppLanguage } from "./i18n/provider";

/**
 * The Tokens section of the Engines page (D102): a table of member by engine with today and the last seven days, as each engine
 * reported its own use, and a total per engine below it. Read-only: it asks `GET /api/freeduet/engines/usage` and holds no
 * choice, no key and no text. An engine that reported nothing says "not reported". Kept in app/src/freeduet/ (docs/UPSTREAM_TOUCHES.md).
 */

const REFRESH_MS = 30_000;

/** The person's choice of euros or dollars, kept in this browser only. A browser that refuses storage still works: the choice
 * then lasts until the page is closed. */
export function readCurrency(): Currency {
  try {
    const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return stored === "usd" || stored === "eur" ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

function writeCurrency(currency: Currency): void {
  try {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

function SavedPart({
  saved,
  currency,
  onToggle,
}: {
  saved: Saved;
  currency: Currency;
  onToggle: () => void;
}) {
  const { t, language } = useAppLanguage();
  const tokens = savedTokensText(saved, t, language);
  const time = savedTimeText(saved, t);
  if (!tokens && !time) return <>{t("engines.tokens.nothingYet")}</>;
  const amount = formatMoney(
    listPriceUsd(saved.inputTokens, saved.outputTokens),
    currency,
    t,
    language,
  );
  return (
    <>
      {tokens ? (
        <>
          {tokens} ≈{" "}
          <button
            aria-label={t(
              currency === "eur"
                ? "engines.tokens.toDollars"
                : "engines.tokens.toEuros",
              { amount },
            )}
            className="font-semibold underline decoration-dotted underline-offset-2"
            onClick={onToggle}
            type="button"
          >
            {amount}
          </button>
        </>
      ) : null}
      {tokens && time ? ", " : null}
      {time ? <>{tokens ? t("engines.tokens.plus", { time }) : time}</> : null}
    </>
  );
}

function SavedLine({ rows }: { rows: TokenRow[] }) {
  const { t, language } = useAppLanguage();
  const [currency, setCurrency] = useState<Currency>(readCurrency);
  const toggle = () => {
    const next: Currency = currency === "eur" ? "usd" : "eur";
    setCurrency(next);
    writeCurrency(next);
  };
  return (
    <div className="mt-3 text-sm" data-testid="tokens-saved">
      <p>
        <span className="font-semibold">{t("engines.tokens.savedWeek")}:</span>{" "}
        <SavedPart
          currency={currency}
          onToggle={toggle}
          saved={savedFor(rows, "week")}
        />
        {". "}
        <span className="text-duet-ink-2">{t("engines.today")}:</span>{" "}
        <SavedPart
          currency={currency}
          onToggle={toggle}
          saved={savedFor(rows, "today")}
        />
        {"."}
      </p>
      <p className="type-label mt-1 text-duet-ink-2">
        {referenceLine(t, language)} {t("engines.tokens.currencyHelp")}
      </p>
      <p className="type-label mt-1 text-duet-ink-2">
        {t("engines.tokens.savedNote")}
      </p>
    </div>
  );
}

export const tokensKeys = { all: ["freeduet", "engines", "usage"] as const };

export function tokensQueryOptions(t: T = englishT) {
  return {
    queryKey: tokensKeys.all,
    queryFn: async (): Promise<TokenUsage> => {
      const response = await client("/api/freeduet/engines/usage", {
        fallback: t("engines.tokens.fallback"),
      });
      return response.json();
    },
  };
}

function Cell({ counts }: { counts: TokenCounts }) {
  const { t, language } = useAppLanguage();
  const cell = tokensCell(counts, t, language);
  return (
    <td className="px-3 py-3 tabular-nums">
      <span className="whitespace-nowrap">{cell.text}</span>
      {cell.time ? (
        <span className="type-label block text-duet-ink-2">{cell.time}</span>
      ) : null}
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
  const { t } = useAppLanguage();
  const usage = useQuery({
    ...tokensQueryOptions(t),
    refetchInterval: REFRESH_MS,
  });
  const agents = useQuery(agentListQueryOptions());
  const engineName = (id: string) =>
    reading.engines.find((engine) => engine.id === id)?.name ?? id;
  const memberName = (id: string | null) =>
    id === null
      ? t("engines.tokens.allMembers")
      : (agents.data?.find((agent) => agent.id === id)?.name ?? id);
  const data = usage.data;

  return (
    <PageSection
      description={t("engines.tokens.description")}
      title={t("engines.tokens.title")}
    >
      {usage.error || data?.reason ? (
        <p className="type-label mt-4 text-duet-ink-2">
          {t("engines.tokens.unavailable")}
        </p>
      ) : null}
      {data?.problem ? (
        <p className="type-label mt-4 text-duet-ink-2">
          {t("engines.tokens.problem")}
        </p>
      ) : null}
      {data && !data.reason && data.rows.length === 0 ? (
        <p className="type-label mt-4 text-duet-ink-2">
          {t("engines.tokens.empty")}
        </p>
      ) : null}
      {data && !data.reason && data.rows.length > 0 ? (
        <UsageCharts
          daily={data.daily ?? []}
          engines={reading.engines}
          memberName={memberName}
        />
      ) : null}
      {data && !data.reason && data.rows.length > 0 ? (
        <DuetCard className="mt-4">
          <section
            aria-label={t("engines.tokens.title")}
            className="overflow-x-auto px-4 py-2"
          >
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <caption className="sr-only">{t("engines.tokens.title")}</caption>
              <thead>
                <tr className="text-left text-duet-ink-2">
                  <th className="px-3 py-3 font-medium" scope="col">
                    {t("engines.members.col.member")}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {t("engines.tokens.col.engine")}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {t("engines.today")}
                  </th>
                  <th className="px-3 py-3 font-medium" scope="col">
                    {t("engines.tokens.col.week")}
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
        <SavedLine rows={data.rows} />
      ) : null}
      {data && !data.reason && data.rows.length > 0 ? (
        <p className="type-label mt-2 text-duet-ink-2">
          {t("engines.tokens.note")}
        </p>
      ) : null}
    </PageSection>
  );
}
