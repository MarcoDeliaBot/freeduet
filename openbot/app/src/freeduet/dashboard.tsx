import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { botAttentionQueryOptions } from "@/lib/bot-lifecycle/queries";
import { routinesQueryOptions } from "@/lib/routines/queries";
import "./light/tokens.css";
import "./dashboard.css";
import {
  engineLines,
  headline,
  memberTiles,
  memberUsage,
  nextRoutine,
  savedToday,
  tokensToday,
  usageState,
  waitingFor,
} from "./dashboard-model";
import { enginesQueryOptions } from "./engines-section";
import { readCurrency, tokensQueryOptions } from "./engines-tokens";
import { useAppLanguage, useT } from "./i18n/provider";

const REFRESH_MS = 30_000;

function NotAvailable({ children }: { children?: string }) {
  const t = useT();
  return (
    <p className="fd-dash-na" data-testid="not-available">
      {children ?? t("dash.notAvailable")}
    </p>
  );
}

function Kpi({
  label,
  testId,
  wait,
  children,
}: {
  label: string;
  testId: string;
  wait?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fd-dash-card"
      data-testid={testId}
      data-wait={wait ? "true" : undefined}
    >
      <div className="fd-dash-label">{label}</div>
      {children}
    </div>
  );
}

/**
 * The Dashboard (D154, stage 1): what needs the person, today's use, the team and the engines, in one place, with Engines one
 * click away. Every number is read from what the app already asks the server for; a card whose read failed says "not available".
 */
export function FreeDuetDashboard() {
  const { t, language, number } = useAppLanguage();
  const agents = useQuery(agentListQueryOptions());
  const attention = useQuery(botAttentionQueryOptions());
  const usage = useQuery({
    ...tokensQueryOptions(),
    refetchInterval: REFRESH_MS,
  });
  const engines = useQuery({
    ...enginesQueryOptions(),
    refetchInterval: REFRESH_MS,
  });
  const routines = useQuery(routinesQueryOptions());
  const now = new Date();

  const tiles = memberTiles(agents.data, attention.data, t);
  const waiting = waitingFor(attention.data, t);
  const state = usageState(usage.data, usage.isError);
  const usageData =
    state === "ok" || state === "empty" ? usage.data : undefined;
  const lines = engineLines(engines.data, usageData, t);
  // English keeps the day-month order and 24-hour clock it always had; the other languages use their own.
  const dateLocale = language === "en" ? "en-GB" : language;
  const next = nextRoutine(routines.data, agents.data, now, dateLocale);
  const nameOf = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;
  const today = usageData && state === "ok" ? tokensToday(usageData, t) : null;
  const saved =
    usageData && state === "ok"
      ? savedToday(usageData, readCurrency(), t)
      : null;
  const perMember =
    usageData && state === "ok" ? memberUsage(usageData, nameOf) : [];
  const date = new Intl.DateTimeFormat(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const clock = new Intl.DateTimeFormat(dateLocale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const unavailable = state === "unavailable";
  return (
    <PageShell
      className="max-w-[1360px]"
      title={t("dash.title")}
      width="wide"
      header={<h1 className="sr-only">{t("dash.title")}</h1>}
    >
      <div className="fd-dash">
        <div className="fd-dash-inner">
          <div className="fd-dash-head">
            <div>
              <div className="fd-dash-eyebrow d-mono">
                {t("dash.title")} · {date} · {clock}
              </div>
              <p
                className="fd-dash-headline"
                style={{
                  margin: "6px 0 0",
                  fontSize: 28,
                  fontWeight: 700,
                  lineHeight: 1.2,
                }}
              >
                {headline(waiting ? waiting.total : null, t)}
              </p>
            </div>
            {tiles ? (
              <div className="fd-dash-pill" data-testid="members-pill">
                <i />
                {t("dash.members", { count: tiles.length })}
              </div>
            ) : null}
          </div>

          <section aria-label={t("dash.indicators")} className="fd-dash-kpis">
            <Kpi label={t("dash.tokensToday")} testId="card-tokens">
              {today ? (
                <>
                  <div className="fd-dash-big d-mono">
                    {number(today.total)}
                  </div>
                  <div className="fd-dash-sub">{today.note}</div>
                </>
              ) : unavailable ? (
                <NotAvailable>{t("dash.countsUnavailable")}</NotAvailable>
              ) : state === "empty" ? (
                <NotAvailable>{t("dash.tokensNotCounted")}</NotAvailable>
              ) : null}
            </Kpi>
            <Kpi label={t("dash.savedToday")} testId="card-saved">
              {saved ? (
                <>
                  <div
                    className="fd-dash-big d-mono"
                    data-tone={saved.any ? "ok" : undefined}
                  >
                    {saved.amount}
                  </div>
                  <div className="fd-dash-sub">{saved.detail}</div>
                </>
              ) : unavailable ? (
                <NotAvailable>{t("dash.countsUnavailable")}</NotAvailable>
              ) : state === "empty" ? (
                <NotAvailable>{t("dash.tokensNotCounted")}</NotAvailable>
              ) : null}
            </Kpi>
            <Kpi
              label={t("dash.waitingForYou")}
              testId="card-waiting"
              wait={!!waiting && waiting.total > 0}
            >
              {waiting ? (
                <>
                  <div
                    className="fd-dash-big d-mono"
                    data-tone={waiting.total > 0 ? "wait" : undefined}
                  >
                    {waiting.total}
                  </div>
                  <div className="fd-dash-sub">
                    {waiting.lines.length > 0
                      ? waiting.lines.join(" · ")
                      : t("dash.waitingSub")}
                  </div>
                </>
              ) : attention.isError ? (
                <NotAvailable />
              ) : null}
            </Kpi>
            <Kpi label={t("dash.nextRoutine")} testId="card-routine">
              {next && next !== "none" ? (
                <>
                  <div className="fd-dash-big d-mono">{next.time}</div>
                  <div className="fd-dash-sub">{next.detail}</div>
                </>
              ) : next === "none" ? (
                <NotAvailable>{t("dash.noRoutine")}</NotAvailable>
              ) : routines.isError ? (
                <NotAvailable />
              ) : null}
            </Kpi>
          </section>

          <div className="fd-dash-row">
            <section
              aria-label={t("dash.team")}
              className="fd-dash-card d-pad fd-dash-main"
              data-testid="card-team"
            >
              <div className="fd-dash-cardhead">
                <h2>{t("dash.team")}</h2>
                <Link to="/bots">{t("dash.teamLink")}</Link>
              </div>
              {tiles ? (
                <ul className="fd-dash-team">
                  {tiles.map((tile) => (
                    <li className="fd-dash-member" key={tile.id}>
                      <span aria-hidden className="fd-dash-initial">
                        {tile.name.slice(0, 1)}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <b>{tile.name}</b>
                        <small data-tone={tile.tone}>{tile.state}</small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : agents.isError ? (
                <NotAvailable />
              ) : null}
            </section>

            <section
              aria-label={t("dash.engines")}
              className="fd-dash-card d-pad fd-dash-side"
              data-testid="card-engines"
            >
              <div className="fd-dash-cardhead">
                <h2>{t("dash.engines")}</h2>
                <Link data-testid="engines-link" to="/admin/engines">
                  {t("dash.enginesLink")}
                </Link>
              </div>
              {lines ? (
                lines.length > 0 ? (
                  lines.map((line) => (
                    <div className="fd-dash-engine" key={line.id}>
                      <span
                        aria-hidden
                        className="fd-dash-dot"
                        data-tone={line.tone}
                      />
                      <div>
                        <b>{line.name}</b>
                        <small>{line.note}</small>
                      </div>
                      <span
                        className="d-mono"
                        style={{ fontSize: 13, color: "#334155" }}
                      >
                        {line.value}
                      </span>
                    </div>
                  ))
                ) : (
                  <NotAvailable>{t("dash.noEngine")}</NotAvailable>
                )
              ) : engines.isError || engines.data?.reason ? (
                <NotAvailable />
              ) : null}
            </section>
          </div>

          <section
            aria-label={t("dash.perMemberAria")}
            className="fd-dash-card d-pad"
            data-testid="card-usage"
          >
            <div className="fd-dash-cardhead">
              <h2>{t("dash.perMember")}</h2>
            </div>
            {perMember.length > 0 ? (
              perMember.map((row) => (
                <div className="fd-dash-use" key={row.id}>
                  <span>{row.name}</span>
                  <div className="fd-dash-bar">
                    <i style={{ width: `${row.share}%` }} />
                  </div>
                  <span className="d-mono">{row.value}</span>
                </div>
              ))
            ) : unavailable ? (
              <NotAvailable>{t("dash.countsUnavailable")}</NotAvailable>
            ) : state === "ok" || state === "empty" ? (
              <NotAvailable>{t("dash.tokensNotCounted")}</NotAvailable>
            ) : null}
          </section>

          <p className="fd-dash-foot">{t("dash.foot")}</p>
        </div>
      </div>
    </PageShell>
  );
}
