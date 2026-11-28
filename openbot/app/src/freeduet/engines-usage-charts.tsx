import { Component, type ReactNode, useState } from "react";
import { DuetCard } from "@/components/duet/kit";
import { SERIES_COLOURS } from "@/components/gallery/palette";
import { type EngineSummary, engineStateText } from "./engines-text";
import { englishT, type T, useAppLanguage, useT } from "./i18n/provider";
import {
  breakdownLabels,
  type Breakdown,
  compactTokens,
  dayLabel,
  metricLabels,
  type Metric,
  metricText,
  niceMax,
  percentText,
  REST_KEY,
  type TokenDay,
  type UsageView,
  usageView,
} from "./engines-tokens-text";

/**
 * D134: the usage charts of the Tokens section. A card for the engines that are held back by a limit (read from the same engine
 * state the cards above show; no percentage of a weekly limit is drawn, because the subscription does not report one), a card
 * with a toggle between "By source" and "By member", one stacked bar with its legend, and seven stacked days. Plain SVG, no
 * library. Every number is also in text: the legend, the table for screen readers and each segment's title. A colour is never the
 * only way to tell two parts apart.
 */

/** Grey: "Other members" and the days counted before sources were kept are not a series of their own. */
const REST_COLOUR = "#9ca3af";

/** A part keeps one colour in the bar, the legend and the chart; "Other members" is grey. */
function colourOf(view: UsageView, key: string): string {
  if (key === REST_KEY || key === "unknown") return REST_COLOUR;
  const index = view.keys.findIndex((part) => part.key === key);
  return SERIES_COLOURS[index % SERIES_COLOURS.length] as string;
}

/** The engines that are held until a time or out of credit, in the engine cards' own words. */
export function heldEngines(
  engines: Pick<EngineSummary, "id" | "name" | "state" | "until">[],
  now: Date = new Date(),
  t: T = englishT,
  language = "en",
): { id: string; text: string }[] {
  return engines
    .filter(
      (engine) =>
        engine.state === "limited" || engine.state === "out_of_credit",
    )
    .map((engine) => ({
      id: engine.id,
      text: `${engine.name}: ${engineStateText(engine, now, undefined, t, language)}`,
    }));
}

function LimitCard({ engines }: { engines: EngineSummary[] }) {
  const { t, language } = useAppLanguage();
  const held = heldEngines(engines, new Date(), t, language);
  return (
    <DuetCard className="mt-4">
      <section
        aria-label={t("engines.usage.limitTitle")}
        className="px-4 py-4"
        data-testid="usage-limits"
      >
        <h3 className="font-semibold text-sm">
          {t("engines.usage.limitTitle")}
        </h3>
        {held.length === 0 ? (
          <p className="mt-2 text-sm">{t("engines.usage.limitNone")}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {held.map((item) => (
              <li data-testid="usage-held" key={item.id}>
                {item.text}
              </li>
            ))}
          </ul>
        )}
        <p className="type-label mt-2 text-duet-ink-2">
          {t("engines.usage.limitNote")}
        </p>
      </section>
    </DuetCard>
  );
}

function Segmented<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <fieldset className="m-0 inline-flex min-w-0 rounded-lg border border-duet-hair p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          aria-pressed={value === option}
          className={`rounded-md px-3 py-1 text-sm ${
            value === option
              ? "bg-duet-accent font-semibold text-duet-on-accent"
              : "text-duet-ink-2"
          }`}
          key={option}
          onClick={() => onChange(option)}
          type="button"
        >
          {labels[option]}
        </button>
      ))}
    </fieldset>
  );
}

function StackedBar({ view, metric }: { view: UsageView; metric: Metric }) {
  const { t, language } = useAppLanguage();
  return (
    <>
      <div
        aria-label={view.parts
          .filter((part) => part.value > 0)
          .map(
            (part) => `${part.label} ${percentText(part.share, t, language)}`,
          )
          .join(", ")}
        className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-duet-tile"
        data-testid="usage-bar"
        role="img"
      >
        {view.parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <div
              key={part.key}
              style={{
                width: `${part.share}%`,
                background: colourOf(view, part.key),
                borderRight: "2px solid var(--duet-card)",
              }}
              title={`${part.label}: ${percentText(part.share, t, language)}, ${metricText(part.value, metric, t, language)}`}
            />
          ))}
      </div>
      <ul
        className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2"
        data-testid="usage-legend"
      >
        {view.parts.map((part) => (
          <li className="flex items-center gap-2" key={part.key}>
            <span
              aria-hidden="true"
              className="inline-block size-3 shrink-0 rounded-sm"
              style={{ background: colourOf(view, part.key) }}
            />
            <span className="font-medium">{part.label}</span>
            <span className="ml-auto whitespace-nowrap tabular-nums">
              {percentText(part.share, t, language)}
              <span className="text-duet-ink-2">
                {" · "}
                {metricText(part.value, metric, t, language)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

const WIDTH = 560;
const HEIGHT = 190;
const LEFT = 62;
const TOP = 10;
const BOTTOM = 26;

function DailyChart({ view, metric }: { view: UsageView; metric: Metric }) {
  const { t, language } = useAppLanguage();
  const metricName = metricLabels(t)[metric];
  const peak = Math.max(0, ...view.days.map((day) => day.total));
  // Time is scaled in whole minutes, so the gridlines read "50 min", not "47 min".
  const top =
    metric === "time" ? niceMax(Math.ceil(peak / 60)) * 60 : niceMax(peak);
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = (WIDTH - LEFT) / Math.max(1, view.days.length);
  const barWidth = Math.min(46, slot * 0.62);
  const scale = (value: number) => (value / top) * plotHeight;
  const axis = (value: number) =>
    metric === "tokens"
      ? compactTokens(value, language)
      : metricText(value, "time", t, language);
  const ticks = [0, top / 2, top];
  return (
    <div className="mt-5">
      <svg
        aria-label={t("engines.usage.perDay", {
          title: t("engines.usage.title"),
          metric: metricName,
        })}
        className="h-auto w-full text-duet-ink-2"
        data-testid="usage-chart"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {ticks.map((tick) => {
          const y = TOP + plotHeight - scale(tick);
          return (
            <g key={tick}>
              <line
                stroke="currentColor"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
                strokeOpacity={tick === 0 ? 0.5 : 0.25}
                x1={LEFT}
                x2={WIDTH}
                y1={y}
                y2={y}
              />
              <text
                fill="currentColor"
                fontSize="11"
                textAnchor="end"
                x={LEFT - 6}
                y={y + 4}
              >
                {axis(tick)}
              </text>
            </g>
          );
        })}
        {view.days.map((day, index) => {
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          let used = 0;
          return (
            <g data-testid="usage-day" key={day.day}>
              {view.keys.map((part) => {
                const value = day.values[part.key] ?? 0;
                if (value <= 0) return null;
                const height = scale(value);
                const y = TOP + plotHeight - scale(used) - height;
                used += value;
                return (
                  <rect
                    fill={colourOf(view, part.key)}
                    height={Math.max(1, height)}
                    key={part.key}
                    rx={1.5}
                    stroke="var(--duet-card)"
                    strokeWidth={1}
                    width={barWidth}
                    x={x}
                    y={y}
                  >
                    <title>{`${dayLabel(day.day, index === view.days.length - 1, t, language)}, ${part.label}: ${metricText(value, metric, t, language)}`}</title>
                  </rect>
                );
              })}
              <text
                fill="currentColor"
                fontSize="11"
                textAnchor="middle"
                x={x + barWidth / 2}
                y={HEIGHT - 8}
              >
                {dayLabel(day.day, index === view.days.length - 1, t, language)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>
          {t("engines.usage.perDayUtc", {
            title: t("engines.usage.title"),
            metric: metricName,
          })}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("engines.usage.day")}</th>
            {view.keys.map((part) => (
              <th key={part.key} scope="col">
                {part.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {view.days.map((day, index) => (
            <tr key={day.day}>
              <th scope="row">
                {dayLabel(day.day, index === view.days.length - 1, t, language)}
              </th>
              {view.keys.map((part) => (
                <td key={part.key}>
                  {metricText(day.values[part.key] ?? 0, metric, t, language)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartsFailed() {
  const t = useT();
  return (
    <p
      className="type-label mt-4 text-duet-ink-2"
      data-testid="usage-charts-failed"
    >
      {t("engines.usage.chartsFailed")}
    </p>
  );
}

/** The charts are extra: if drawing them ever throws, the table below stays and the page does not go down. */
class ChartsBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <ChartsFailed /> : this.props.children;
  }
}

export function UsageCharts(props: {
  daily: TokenDay[];
  engines: EngineSummary[];
  memberName: (id: string | null) => string;
}) {
  return (
    <ChartsBoundary>
      <UsageChartsInner {...props} />
    </ChartsBoundary>
  );
}

function UsageChartsInner({
  daily,
  engines,
  memberName,
}: {
  daily: TokenDay[];
  engines: EngineSummary[];
  memberName: (id: string | null) => string;
}) {
  const { t, language } = useAppLanguage();
  const [breakdown, setBreakdown] = useState<Breakdown>("source");
  const [metric, setMetric] = useState<Metric>("tokens");
  const view = usageView(daily, breakdown, metric, (id) => memberName(id), t);
  if (daily.length === 0) return <LimitCard engines={engines} />;
  const first = daily[0]?.day;
  const last = daily[daily.length - 1]?.day;
  return (
    <>
      <LimitCard engines={engines} />
      <DuetCard className="mt-4">
        <section
          aria-label={t("engines.usage.title")}
          className="px-4 py-4"
          data-testid="usage-charts"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm">
                {t("engines.usage.title")}
              </h3>
              {first && last ? (
                <p className="type-label text-duet-ink-2">
                  {t("engines.usage.range", {
                    from: dayLabel(first, false, t, language),
                    to: dayLabel(last, true, t, language).toLowerCase(),
                  })}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Segmented
                label={t("engines.usage.splitBy")}
                labels={breakdownLabels(t)}
                onChange={setBreakdown}
                options={["source", "member"] as const}
                value={breakdown}
              />
              <Segmented
                label={t("engines.usage.measure")}
                labels={metricLabels(t)}
                onChange={setMetric}
                options={["tokens", "time"] as const}
                value={metric}
              />
            </div>
          </div>
          {view.total <= 0 ? (
            <p className="mt-4 text-sm">{t("engines.usage.nothing")}</p>
          ) : (
            <>
              <StackedBar metric={metric} view={view} />
              <DailyChart metric={metric} view={view} />
            </>
          )}
          <p className="type-label mt-3 text-duet-ink-2">
            {t("engines.usage.note")}
          </p>
        </section>
      </DuetCard>
    </>
  );
}
