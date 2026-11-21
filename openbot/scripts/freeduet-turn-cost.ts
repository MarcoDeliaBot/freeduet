#!/usr/bin/env bun
/**
 * Model calls per member turn (ROADMAP row 93, D123, docs/M1_PLAN.md section 81).
 *
 * Read-only. Reads the stored runs of the last N hours from `freeduet_thread_runs` (one row per turn: agent_id,
 * created_at, finished_at, status, events) inside one `read only` transaction, and prints per member and overall the
 * median and p90 per turn of:
 *   - tool calls      TOOL_CALL_START events
 *   - texts           distinct messages with TEXT_MESSAGE_CONTENT
 *   - notices         such messages whose text is an engine switch or limit notice (engine_notices.py)
 *   - segments        `claude -p` runs in the turn, inferred (see segmentsOf)
 *   - duration s      finished_at - created_at, finished turns only
 *   - events KB       the stored events' size
 * It prints counts only: no message text, no account, no path.
 *
 * Usage (from openbot/, with DATABASE_URL set):
 *   bun scripts/freeduet-turn-cost.ts [--hours 24] [--json]
 * See docs/live-tests/turn-cost.md.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Engine notices. Fixed fragments of agent-freeduet/freeduet/engine_notices.py (English and Italian). A notice is one
// text message whose concatenated deltas contain one of these. The drift guard in the test checks each one is still in
// that file, so a reworded sentence fails the test instead of being counted as zero.
// ---------------------------------------------------------------------------------------------------------------------
export const ENGINE_NOTICE_FRAGMENTS: readonly string[] = [
  // English
  "reached its limit",
  "reached the daily limit",
  "reached the monthly limit",
  "is not signed in",
  "has no key its gateway accepts",
  "is not answering",
  "is held back because",
  "wrote its tool calls as text",
  "ended with a tool call written as text",
  "is rate-limited by its provider",
  "is too long for",
  "asks to wait",
  "I cannot use",
  'Reply "switch"',
  "Understood, I will not switch",
  "is pinned to it",
  "is switched off",
  "Every engine is unavailable right now",
  "I switched engines",
  "is answering instead.",
  "is continuing from where it stopped",
  "is continuing; nothing already done is repeated",
  // Italiano
  "al suo posto.",
  "continua da dove si era fermato",
  "ciò che è già stato fatto non viene ripetuto",
  "ha raggiunto il limite",
  "non ha effettuato l'accesso",
  "non ha una chiave accettata",
  "non risponde",
  "è sospeso perché FreeDuet non sa quanto è costato",
  "ha scritto le chiamate agli strumenti come testo",
  "ha concluso con una chiamata a uno strumento scritta come testo",
  "limitato dal suo fornitore",
  "troppo lunga per",
  "chiede di attendere",
  'Rispondi "passa"',
  "Va bene, non cambio motore",
  "è fissato su di esso",
  "Ora nessun motore è disponibile",
  "ho cambiato motore",
];

export function isEngineNotice(text: string): boolean {
  return (
    text.length > 0 &&
    ENGINE_NOTICE_FRAGMENTS.some((fragment) => text.includes(fragment))
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Counting one turn from its events
// ---------------------------------------------------------------------------------------------------------------------
export interface TurnCounts {
  toolCalls: number;
  texts: number;
  notices: number;
  segments: number;
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/**
 * The events of a stored row. The column is jsonb, which the driver returns parsed; a value that arrives as a string
 * (a double-encoded write) is parsed here. Anything else is no events.
 */
export function asEventArray(events: unknown): unknown[] {
  if (typeof events === "string") {
    try {
      const parsed: unknown = JSON.parse(events);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(events) ? events : [];
}

/**
 * Segments (D4, segment.py). A segment is one fresh `claude -p`, and it ends at the first tool OpenBot has to run
 * itself. Such a call is announced (TOOL_CALL_START) and never answered (no TOOL_CALL_RESULT with its id), and the
 * segment then ends with RUN_FINISHED. A deployment tool is answered, so it does not end the segment; Iris's own
 * tools are never announced. So a turn's segments = calls announced and not answered + 1 (the segment that ends the
 * turn). An inference from events: a run that crashed mid-call also has an unanswered call and counts it.
 */
function segmentsOf(
  starts: readonly string[],
  answered: ReadonlySet<string>,
  eventCount: number,
): number {
  if (eventCount === 0) return 0;
  const handed = starts.filter((id) => !answered.has(id)).length;
  return handed + 1;
}

export function summariseEvents(events: readonly unknown[]): TurnCounts {
  let toolCalls = 0;
  let eventCount = 0;
  const starts: string[] = [];
  const answered = new Set<string>();
  const messages = new Map<string, string>(); // messageId -> its deltas, concatenated in order
  for (const event of events) {
    if (!isObj(event)) continue;
    eventCount++;
    if (event.type === "TOOL_CALL_START") {
      toolCalls++;
      starts.push(str(event.toolCallId) ?? `unnamed-${toolCalls}`);
    } else if (event.type === "TOOL_CALL_RESULT") {
      const id = str(event.toolCallId);
      if (id !== undefined) answered.add(id);
    } else if (event.type === "TEXT_MESSAGE_CONTENT") {
      const id = str(event.messageId) ?? "";
      messages.set(id, (messages.get(id) ?? "") + (str(event.delta) ?? ""));
    }
  }
  let notices = 0;
  for (const text of messages.values()) if (isEngineNotice(text)) notices++;
  return {
    toolCalls,
    texts: messages.size,
    notices,
    segments: segmentsOf(starts, answered, eventCount),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------------------------------------------------
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Nearest-rank percentile: the value at rank ceil(p/100 * n). */
export function percentile(
  values: readonly number[],
  p: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(
    sorted.length,
    Math.max(1, Math.ceil((p / 100) * sorted.length)),
  );
  return sorted[rank - 1];
}

export interface Dist {
  median: number | null;
  p90: number | null;
  n: number;
}

const dist = (values: readonly number[]): Dist => ({
  median: median(values),
  p90: percentile(values, 90),
  n: values.length,
});

// ---------------------------------------------------------------------------------------------------------------------
// Per member and overall
// ---------------------------------------------------------------------------------------------------------------------
export interface TurnRow {
  agentId: string;
  createdAt: number; // epoch milliseconds
  finishedAt: number | null;
  status: string;
  eventBytes: number;
  events: unknown;
}

export interface MemberReport {
  agentId: string;
  turns: number;
  statuses: Record<string, number>;
  metrics: {
    toolCalls: Dist;
    texts: Dist;
    notices: Dist;
    segments: Dist;
    durationSeconds: Dist;
    eventsKb: Dist;
  };
}

export interface TurnCostReport {
  windowHours: number;
  generatedAt: string;
  members: MemberReport[];
  overall: MemberReport;
}

function memberOf(agentId: string, rows: readonly TurnRow[]): MemberReport {
  const counts = rows.map((row) => summariseEvents(asEventArray(row.events)));
  const statuses: Record<string, number> = {};
  for (const row of rows)
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
  const durations = rows
    .filter((row) => row.finishedAt !== null)
    .map((row) => ((row.finishedAt ?? 0) - row.createdAt) / 1000);
  return {
    agentId,
    turns: rows.length,
    statuses,
    metrics: {
      toolCalls: dist(counts.map((c) => c.toolCalls)),
      texts: dist(counts.map((c) => c.texts)),
      notices: dist(counts.map((c) => c.notices)),
      segments: dist(counts.map((c) => c.segments)),
      durationSeconds: dist(durations),
      eventsKb: dist(rows.map((row) => row.eventBytes / 1024)),
    },
  };
}

export function summariseTurns(
  rows: readonly TurnRow[],
  windowHours = 24,
): TurnCostReport {
  const byAgent = new Map<string, TurnRow[]>();
  for (const row of rows) {
    const list = byAgent.get(row.agentId) ?? [];
    list.push(row);
    byAgent.set(row.agentId, list);
  }
  const members = [...byAgent.keys()]
    .sort()
    .map((agentId) => memberOf(agentId, byAgent.get(agentId) ?? []));
  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    members,
    overall: memberOf("all", rows),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------------------------------------------------
const fmt = (value: number | null): string =>
  value === null
    ? "-"
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(1);
const cell = (d: Dist): string =>
  d.n === 0 ? "-" : `${fmt(d.median)} / ${fmt(d.p90)}`;

export function renderTable(report: TurnCostReport): string {
  const header = [
    "member",
    "turns",
    "tool calls",
    "texts",
    "notices",
    "segments",
    "duration s",
    "events KB",
  ];
  const lines = [report.overall, ...report.members].map((m) => [
    m.agentId,
    String(m.turns),
    cell(m.metrics.toolCalls),
    cell(m.metrics.texts),
    cell(m.metrics.notices),
    cell(m.metrics.segments),
    cell(m.metrics.durationSeconds),
    cell(m.metrics.eventsKb),
  ]);
  const table = [header, ...lines];
  const widths = header.map((_, i) =>
    Math.max(...table.map((row) => (row[i] ?? "").length)),
  );
  const render = (row: string[]) =>
    row
      .map((value, i) => value.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    `Turns of the last ${report.windowHours} h, generated ${report.generatedAt}.`,
    "Each cell is median / p90 per turn; '-' means no turn had the value.",
    "",
    render(header),
    ...lines.map(render),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------------------------
// Arguments and the database read
// ---------------------------------------------------------------------------------------------------------------------
export interface Options {
  hours: number;
  json: boolean;
  help: boolean;
}

const MAX_HOURS = 744; // 31 days

export function parseArgs(argv: readonly string[]): Options {
  const options: Options = { hours: 24, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--hours" || arg.startsWith("--hours=")) {
      const raw = arg === "--hours" ? argv[++i] : arg.slice("--hours=".length);
      if (raw === undefined || !/^\d+$/.test(raw))
        throw new Error(
          `--hours needs a whole number of hours, 1 to ${MAX_HOURS}`,
        );
      const hours = Number(raw);
      if (hours < 1 || hours > MAX_HOURS)
        throw new Error(
          `--hours needs a whole number of hours, 1 to ${MAX_HOURS}`,
        );
      options.hours = hours;
    } else {
      throw new Error(`unknown argument: ${arg.length > 40 ? "(long)" : arg}`);
    }
  }
  return options;
}

const USAGE = `Usage: bun scripts/freeduet-turn-cost.ts [--hours N] [--json]
  --hours N   the window in whole hours, 1 to ${MAX_HOURS} (default 24)
  --json      print JSON instead of the table
DATABASE_URL must be set. The script only reads (one read-only transaction).`;

interface DbRow {
  agent_id: string | null;
  created_at: Date | string;
  finished_at: Date | string | null;
  status: string;
  event_bytes: number | string | bigint;
  events: unknown;
}

async function main(argv: readonly string[]): Promise<void> {
  let options: Options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(USAGE);
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    console.error("DATABASE_URL must be set.");
    process.exit(2);
  }
  const sql = new Bun.SQL(url, { max: 1 });
  try {
    const rows = (await sql.begin("read only", async (tx) => {
      return tx`
        select agent_id, created_at, finished_at, status,
               octet_length(events::text) as event_bytes, events
        from freeduet_thread_runs
        where created_at >= now() - (${options.hours}::int * interval '1 hour')
        order by created_at
      `;
    })) as DbRow[];
    const turns: TurnRow[] = rows.map((row) => ({
      agentId: row.agent_id ?? "(none)",
      createdAt: new Date(row.created_at).getTime(),
      finishedAt:
        row.finished_at === null ? null : new Date(row.finished_at).getTime(),
      status: row.status,
      eventBytes: Number(row.event_bytes),
      events: row.events,
    }));
    const report = summariseTurns(turns, options.hours);
    console.log(
      options.json ? JSON.stringify(report, null, 2) : renderTable(report),
    );
  } finally {
    await sql.close();
  }
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
