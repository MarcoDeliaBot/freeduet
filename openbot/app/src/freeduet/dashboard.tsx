import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/page-shell";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { botAttentionQueryOptions } from "@/lib/bot-lifecycle/queries";
import { routinesQueryOptions } from "@/lib/routines/queries";
import "./dashboard.css";
import {
  COUNTS_UNAVAILABLE,
  DASHBOARD_TITLE,
  ENGINES_LINK,
  engineLines,
  headline,
  memberTiles,
  memberUsage,
  NOT_AVAILABLE,
  nextRoutine,
  savedToday,
  TEAM_LINK,
  TOKENS_NOT_COUNTED,
  tokensToday,
  usageState,
  waitingFor,
} from "./dashboard-model";
import { enginesQueryOptions } from "./engines-section";
import { readCurrency, tokensQueryOptions } from "./engines-tokens";

const REFRESH_MS = 30_000;

function NotAvailable({ children = NOT_AVAILABLE }: { children?: string }) {
  return (
    <p className="fd-dash-na" data-testid="not-available">
      {children}
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

  const tiles = memberTiles(agents.data, attention.data);
  const waiting = waitingFor(attention.data);
  const state = usageState(usage.data, usage.isError);
  const usageData =
    state === "ok" || state === "empty" ? usage.data : undefined;
  const lines = engineLines(engines.data, usageData);
  const next = nextRoutine(routines.data, agents.data, now);
  const nameOf = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;
  const today = usageData && state === "ok" ? tokensToday(usageData) : null;
  const saved =
    usageData && state === "ok" ? savedToday(usageData, readCurrency()) : null;
  const perMember =
    usageData && state === "ok" ? memberUsage(usageData, nameOf) : [];
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const clock = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);

  const unavailable = state === "unavailable";
  return (
    <PageShell
      className="max-w-[1360px]"
      title={DASHBOARD_TITLE}
      width="wide"
      header={<h1 className="sr-only">{DASHBOARD_TITLE}</h1>}
    >
      <div className="fd-dash">
        <div className="fd-dash-inner">
          <div className="fd-dash-head">
            <div>
              <div className="fd-dash-eyebrow d-mono">
                {DASHBOARD_TITLE} · {date} · {clock}
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
                {headline(waiting ? waiting.total : null)}
              </p>
            </div>
            {tiles ? (
              <div className="fd-dash-pill" data-testid="members-pill">
                <i />
                {tiles.length === 1 ? "1 member" : `${tiles.length} members`}
              </div>
            ) : null}
          </div>

          <section aria-label="Indicators" className="fd-dash-kpis">
            <Kpi label="Tokens today" testId="card-tokens">
              {today ? (
                <>
                  <div className="fd-dash-big d-mono">
                    {today.total.toLocaleString("en-GB")}
                  </div>
                  <div className="fd-dash-sub">{today.note}</div>
                </>
              ) : unavailable ? (
                <NotAvailable>{COUNTS_UNAVAILABLE}</NotAvailable>
              ) : state === "empty" ? (
                <NotAvailable>{TOKENS_NOT_COUNTED}</NotAvailable>
              ) : null}
            </Kpi>
            <Kpi label="Saved with free engines today" testId="card-saved">
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
                <NotAvailable>{COUNTS_UNAVAILABLE}</NotAvailable>
              ) : state === "empty" ? (
                <NotAvailable>{TOKENS_NOT_COUNTED}</NotAvailable>
              ) : null}
            </Kpi>
            <Kpi
              label="Waiting for you"
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
                      : "Questions, approvals and stalled hand-offs"}
                  </div>
                </>
              ) : attention.isError ? (
                <NotAvailable />
              ) : null}
            </Kpi>
            <Kpi label="Next routine" testId="card-routine">
              {next && next !== "none" ? (
                <>
                  <div className="fd-dash-big d-mono">{next.time}</div>
                  <div className="fd-dash-sub">{next.detail}</div>
                </>
              ) : next === "none" ? (
                <NotAvailable>No routine is scheduled.</NotAvailable>
              ) : routines.isError ? (
                <NotAvailable />
              ) : null}
            </Kpi>
          </section>

          <div className="fd-dash-row">
            <section
              aria-label="Team"
              className="fd-dash-card d-pad fd-dash-main"
              data-testid="card-team"
            >
              <div className="fd-dash-cardhead">
                <h2>Team</h2>
                <Link to="/bots">{TEAM_LINK}</Link>
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
              aria-label="Engines"
              className="fd-dash-card d-pad fd-dash-side"
              data-testid="card-engines"
            >
              <div className="fd-dash-cardhead">
                <h2>Engines</h2>
                <Link data-testid="engines-link" to="/admin/engines">
                  {ENGINES_LINK}
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
                  <NotAvailable>No engine is set up yet.</NotAvailable>
                )
              ) : engines.isError || engines.data?.reason ? (
                <NotAvailable />
              ) : null}
            </section>
          </div>

          <section
            aria-label="Tokens per member"
            className="fd-dash-card d-pad"
            data-testid="card-usage"
          >
            <div className="fd-dash-cardhead">
              <h2>Tokens per member, today</h2>
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
              <NotAvailable>{COUNTS_UNAVAILABLE}</NotAvailable>
            ) : state === "ok" || state === "empty" ? (
              <NotAvailable>{TOKENS_NOT_COUNTED}</NotAvailable>
            ) : null}
          </section>

          <p className="fd-dash-foot">
            Counts are what each engine reported, in UTC days. A recent-activity
            log and a plan-limit gauge are not available yet.
          </p>
        </div>
      </div>
    </PageShell>
  );
}
