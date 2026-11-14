/*
 * Which engine a team eval run certifies (docs/ENGINES_PLAN.md section 9.1, slice 4).
 *
 *   --engine <name>, else FREEDUET_EVAL_ENGINE, else claude-code. Every live run asks the eval stack's agent
 *   (GET /engines, with the token the eval settings hold) before anything is created, the default run too. A
 *   chosen name the stack does not run, or runs but cannot run now, is refused in plain words. The default is
 *   refused only when the stack does not list claude-code at all: a Claude Code that is limited runs as it
 *   always did, and its cases show the limit. A stack that does not answer leaves the check not done.
 *
 * Which engine answered each case. agent-freeduet's run events name no engine, so the runner works it out
 * from the stack's own list (attributeAnswers). With ONE engine listed, that engine ran every turn: a member
 * with one engine and no pin runs no router (docs/M1_PLAN.md, D34 point 1), and a pin can name only an engine
 * the service runs. Each case records that engine. With two or more listed, or a list that cannot be read,
 * each case records UNKNOWN_ENGINE: a member's chain and pin decide which engine runs a turn, and the list
 * shows neither. The thresholds of a run are for the one engine it certifies, and a certification never
 * carries over to another engine.
 *
 * What the runner does not do: set the engine a member's chain uses on the stack. That needs agent-freeduet
 * and the server to honour a per-run choice, which is not built here (README.md, "Which engine").
 */

/** How a case's answering engine is recorded when the stack does not say which engine answered it. */
export const UNKNOWN_ENGINE = "unknown";

/** The engine of a run that names none: Claude Code, the label every report has always carried. */
export const DEFAULT_ENGINE = "claude-code";

/** Names the runner keeps for itself: `unknown` for an answer no engine is named for, `fake` for the recorded replays. */
const RESERVED = new Set([UNKNOWN_ENGINE, "fake"]);

/** An engine name as a report's file name and label carry it: letters, digits, dots, dashes and underscores. */
export const ENGINE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** The header agent-freeduet's token check reads (openbot/agent-freeduet/freeduet/app.py, TOKEN_HEADER). */
export const AGENT_TOKEN_HEADER = "x-openbot-agent-token";

/** How long the stack may take to say which engines it has. */
export const ENGINE_CHECK_MS = 10_000;

/** Where a chosen engine name came from. `default` is not a choice. */
export type EngineSource = "flag" | "env" | "default";

export type EngineChoice = { name: string; from: EngineSource };

/**
 * A name given on the command line or in the environment, checked. Throws a plain message when the
 * name cannot be used: empty, one a report's file name cannot carry, or one the runner keeps for
 * itself.
 */
export function engineNamed(raw: string, source: string): string {
  const name = raw.trim();
  if (name === "") throw new Error(`${source} needs an engine name, such as ${DEFAULT_ENGINE}.`);
  if (!ENGINE_NAME.test(name) || RESERVED.has(name))
    throw new Error(
      `${source} "${name}" is not an engine the runner can certify: use letters, digits, dots, dashes and underscores, starting with a letter or a digit, and not ${[...RESERVED].join(" or ")}, which the runner keeps for itself.`,
    );
  return name;
}

/**
 * The engine a live run certifies: --engine, else FREEDUET_EVAL_ENGINE, else Claude Code. An empty
 * --engine is refused: it used to fall through to the environment without a word.
 */
export function chooseEngine(input: { flag?: string; env?: string }): EngineChoice {
  if (input.flag !== undefined)
    return { name: engineNamed(input.flag, "--engine"), from: "flag" };
  if (input.env !== undefined && input.env.trim() !== "")
    return { name: engineNamed(input.env, "FREEDUET_EVAL_ENGINE"), from: "env" };
  return { name: DEFAULT_ENGINE, from: "default" };
}

/** One engine as the stack's GET /engines answers it (openbot/agent-freeduet/freeduet/engine_state.py, EngineRow). */
export type StackEngine = {
  id: string;
  state: string;
  available: boolean;
  limited_until?: string | null;
  installed?: boolean | null;
  probe_problem?: string | null;
};

/** What the stack said about its engines, or why it said nothing. */
export type StackAnswer = { engines: StackEngine[] } | { problem: string };

const isStackEngine = (value: unknown): value is StackEngine =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as StackEngine).id === "string" &&
  (value as StackEngine).id !== "" &&
  typeof (value as StackEngine).state === "string" &&
  typeof (value as StackEngine).available === "boolean";

/**
 * Asks the eval stack's agent-freeduet which engines it runs. Never throws: a stack that cannot be
 * reached, answers with an error, or answers something else gives a problem, and the check is then
 * not done. The token is sent to that address only, and no message here quotes it.
 */
export async function askTheStack(options: {
  agentUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<StackAnswer> {
  let url: URL;
  try {
    url = new URL(options.agentUrl);
  } catch {
    return { problem: "the agent address in the settings is not a URL" };
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/engines`;
  url.search = "";
  url.hash = "";
  const send = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await send(url, {
      headers: {
        accept: "application/json",
        [AGENT_TOKEN_HEADER]: options.token,
      },
      // A redirect is not followed: the token goes to the address the settings name, and nowhere else.
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeoutMs ?? ENGINE_CHECK_MS),
    });
  } catch (error) {
    return {
      problem: `the agent did not answer (${error instanceof Error ? error.message : String(error)})`,
    };
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { problem: `the agent answered HTTP ${response.status}` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { problem: "the agent's answer was not JSON" };
  }
  const engines = (body as { engines?: unknown } | null)?.engines;
  if (!Array.isArray(engines) || !engines.every(isStackEngine))
    return { problem: "the agent's answer had no engine list" };
  return { engines };
}

/** What the check decided about the chosen engine. */
export type EngineVerdict =
  | { verdict: "available"; engine: StackEngine }
  | { verdict: "absent"; engines: string[] }
  | { verdict: "unavailable"; engine: StackEngine; why: string }
  | { verdict: "unchecked"; why: string };

/** Why an engine the stack runs cannot take a turn now, in words for the person. */
function whyUnavailable(engine: StackEngine): string {
  const probe = engine.probe_problem ? ` (${engine.probe_problem})` : "";
  if (engine.installed === false) return `it is not installed on the stack${probe}`;
  if (engine.state === "signed_out") return `it is signed out on the eval stack${probe}`;
  if (engine.state === "open")
    return engine.limited_until
      ? `it has hit its limit until ${engine.limited_until}`
      : "it has hit its limit";
  return `its state is ${engine.state}`;
}

/** The verdict on one engine name, from the stack's answer. */
export function engineVerdict(name: string, answer: StackAnswer): EngineVerdict {
  if ("problem" in answer) return { verdict: "unchecked", why: answer.problem };
  const engine = answer.engines.find((candidate) => candidate.id === name);
  if (engine === undefined)
    return { verdict: "absent", engines: answer.engines.map((candidate) => candidate.id) };
  if (engine.available) return { verdict: "available", engine };
  return { verdict: "unavailable", engine, why: whyUnavailable(engine) };
}

/**
 * The refusal a verdict makes for a chosen engine, or undefined when the run may go on. It is raised before
 * the run creates anything: before the deployment guard, the memories and the first conversation.
 */
export function engineRefusal(
  name: string,
  verdict: EngineVerdict,
  source: string,
): string | undefined {
  if (verdict.verdict === "absent")
    return `The eval stack has no engine "${name}", named by ${source}: ${verdict.engines.length ? `its engines are ${verdict.engines.join(", ")}` : "it reports no engines"}. Nothing was created. Name one of its engines, or leave ${source} out to certify ${DEFAULT_ENGINE}.`;
  if (verdict.verdict === "unavailable")
    return `"${name}" is not available on the eval stack: ${verdict.why}. Nothing was created. Make it available there, or name another engine.`;
  return undefined;
}

/**
 * The refusal for the default engine. It is made only when the stack does not list Claude Code at all: a limited
 * Claude Code runs as it always did, and a stack without it cannot have its cases certified as Claude Code's.
 */
function defaultRefusal(verdict: EngineVerdict): string | undefined {
  if (verdict.verdict !== "absent") return undefined;
  return `The eval stack has no engine "${DEFAULT_ENGINE}", which a run without --engine or FREEDUET_EVAL_ENGINE certifies: ${verdict.engines.length ? `its engines are ${verdict.engines.join(", ")}` : "it reports no engines"}. Nothing was created. Name one of its engines with --engine or FREEDUET_EVAL_ENGINE.`;
}

/** The sentence the console and the report keep about a check that did not refuse. */
export function engineCheckText(name: string, verdict: EngineVerdict): string {
  switch (verdict.verdict) {
    case "available":
      return `${name} is available on the eval stack (state ${verdict.engine.state}).`;
    case "unchecked":
      return `${name} was not checked against the eval stack: ${verdict.why}.`;
    case "absent":
      return `${name} is not an engine of the eval stack.`;
    case "unavailable":
      return `${name} is not available on the eval stack: ${verdict.why}.`;
  }
}

/**
 * Which engine ran the turns of a run, from the stack's own list. The list holds the engines the service has a
 * breaker for: the one it registers at start-up, and any a turn has been asked about. One engine listed: it ran
 * every turn, so each case records it (docs/M1_PLAN.md, D34 point 1). Two or more: the list does not say which
 * one a member's turn used, so each case records UNKNOWN_ENGINE. A list that cannot be read is unknown too.
 * `alone` says the list held exactly one engine.
 */
export function attributeAnswers(answer: StackAnswer): {
  answeredBy: string;
  alone: boolean;
  note: string;
} {
  if ("problem" in answer)
    return {
      answeredBy: UNKNOWN_ENGINE,
      alone: false,
      note: "The stack's list of engines could not be read, so each case records its answering engine as unknown.",
    };
  const ids = answer.engines.map((engine) => engine.id);
  const [only] = ids;
  if (ids.length === 1 && only !== undefined)
    return {
      answeredBy: only,
      alone: true,
      note: `The stack lists ${only} alone, so it ran every turn (docs/M1_PLAN.md, D34 point 1), and each case records it.`,
    };
  if (ids.length === 0)
    return {
      answeredBy: UNKNOWN_ENGINE,
      alone: false,
      note: "The stack lists no engine, so no answer is attributed.",
    };
  return {
    answeredBy: UNKNOWN_ENGINE,
    alone: false,
    note: `The stack lists ${ids.length} engines (${ids.join(", ")}). A member's chain and pin decide which one runs a turn, and the list shows neither, so each case records its answering engine as unknown.`,
  };
}

/**
 * A regrade calls no member and keeps the engine its report was run on. A chosen engine that is not
 * that one is refused, so a regraded report never changes whose certification it is.
 */
export function regradeClash(input: {
  report: string;
  ran: string;
  chosen: EngineChoice | undefined;
}): string | undefined {
  if (input.chosen === undefined || input.chosen.name === input.ran) return undefined;
  const source = input.chosen.from === "env" ? "FREEDUET_EVAL_ENGINE" : "--engine";
  return `${input.report} was run on ${input.ran}. A regrade keeps that engine, so ${source} ${input.chosen.name} cannot apply: leave it out, or name ${input.ran}.`;
}

/** What a live run's check keeps: the sentences its report shows, and the engine each case records. */
export type EngineCheck = {
  /** What the check said about the chosen engine, and what the stack's list says about the answers. */
  text: string;
  /** The engine each case records as answering it: the one engine the stack lists alone, else UNKNOWN_ENGINE. */
  answeredBy: string;
  /**
   * A default run on a stack that lists Claude Code alone: its console, its report and its Engine line are
   * exactly main's, so nothing of the check is shown (the cases still record claude-code).
   */
  unchangedFromMain: boolean;
};

/**
 * Checks the chosen engine against the eval stack's report before anything is created, and returns what the
 * report keeps. It throws the refusal when the stack does not run the chosen engine, or cannot run it now; for
 * the default, only when the stack does not list it at all. The address and the token are the eval stack's own
 * settings (MANAGED_AGENT_AG_UI_URL and MANAGED_AGENT_TOKEN, written by openbot/scripts/freeduet-eval-stack.sh);
 * the token goes to that agent only.
 */
export async function checkEngine(
  choice: EngineChoice,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
): Promise<EngineCheck> {
  const agentUrl = env.MANAGED_AGENT_AG_UI_URL?.trim();
  const token = env.MANAGED_AGENT_TOKEN?.trim();
  const answer: StackAnswer = !agentUrl
    ? { problem: "the settings name no agent address (MANAGED_AGENT_AG_UI_URL)" }
    : !token
      ? { problem: "the settings hold no agent token (MANAGED_AGENT_TOKEN)" }
      : await askTheStack({ agentUrl, token, fetchImpl });
  const verdict = engineVerdict(choice.name, answer);
  const source = choice.from === "env" ? "FREEDUET_EVAL_ENGINE" : "--engine";
  const refusal =
    choice.from === "default"
      ? defaultRefusal(verdict)
      : engineRefusal(choice.name, verdict, source);
  if (refusal !== undefined) throw new Error(refusal);
  const attribution = attributeAnswers(answer);
  return {
    text: `${engineCheckText(choice.name, verdict)} ${attribution.note}`,
    answeredBy: attribution.answeredBy,
    unchangedFromMain: choice.from === "default" && attribution.alone,
  };
}

/**
 * The Engine line of a live run, in the console and in the report, or of a regrade. A regrade calls no member
 * and keeps the text its saved report recorded: the stack is not asked again.
 */
export function engineNote(input: {
  engine: string;
  text: string;
  regraded: boolean;
}): string {
  if (input.regraded)
    return `Engine: ${input.engine}. ${input.text} A regrade calls no member, so the stack was not asked again.`;
  return `Engine: ${input.engine}. ${input.text} The thresholds are for ${input.engine}, the engine this run certifies, and say nothing about any other engine.`;
}
