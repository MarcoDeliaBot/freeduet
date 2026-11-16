import type { MiddlewareHandler } from "hono";
import type { AuthService } from "./guards";
import { browserLabel } from "./browser-pairings";
import type { PairingGate } from "./install-secret";

/**
 * FreeDuet (docs/design/phone-and-remote.md 3.5, decided 14 November 2026): who is REMOTE.
 *
 * A deployment with sign-in AND an installation secret asks one more thing of a signed-in browser: is it
 * paired with the computer this runs on? Since D49 the pairing marker is a token of that one browser, in a
 * cookie, matched against a live pairing of the SAME signed-in person (auth/browser-pairings.ts); the cookie
 * is first set by a pairing link opened on this machine by an administrator (auth/install-secret.ts), or by
 * a one-time code from such a browser. A session in a browser with a live pairing of its own person is AT
 * THE COMPUTER and nothing is limited; a session in any other browser is REMOTE, and may do only what
 * auth/remote-limits.ts lists. The gate is `signInGate(config)`: absent in
 * single-user mode, which keeps D28 as it is, and absent where a sign-in deployment has no secret, which
 * has nothing to tell one browser from another (the boot log says so).
 *
 * WHAT THE ANSWER IS BUILT FROM. Two facts the sender cannot make up:
 *
 *  1. The session, which the server holds and looks up with the very call every guarded route makes
 *     (`createRequireUser`), so "signed in" means the same thing here and there. It says WHO.
 *  2. The cookie, whose value is a random token that no route, no environment a member's computer gets and
 *     no link hands out, and that the database knows only as a hash, with the person it was made for. A
 *     token of person A is no use to a session of person B, and a pairing that was revoked, is past its
 *     end, or was made under another installation secret is no pairing.
 *
 * WHAT IT NEVER READS. A header (`X-Forwarded-For`, `Forwarded`, `User-Agent`, `Origin`, `Host`), the
 * query, or the connection's peer address. A tunnel or a reverse proxy that runs on this machine makes a
 * request from a phone arrive from loopback, with headers the sender chooses, so with sign-in on a
 * loopback peer is never, on its own, "at the computer". Nor does the cookie sign anybody in: a request
 * that holds it and has no session is nobody, and the route's own guard answers it as it always did (401,
 * or its own credential: a member's tool token, the worker's secret, a signature).
 *
 * The Engines page asks "at the computer" too (freeduet/at-the-computer.ts). It is the same question with
 * two conditions of its own on top (loopback, no proxy header), not another notion: it is given this gate.
 */

/**
 * Whether a SIGNED-IN request is remote: this deployment asks (there is a gate) and the browser has no live
 * pairing of THIS person. The only place the cookie is turned into the verdict. With no gate nothing is
 * remote. A lookup that fails is remote: a fault refuses and never lifts.
 */
export async function isRemote(
  gate: PairingGate | undefined,
  request: Request,
  userId: string,
): Promise<boolean> {
  if (!gate) return false;
  try {
    return (await gate.pairings.standing(request, userId)) === null;
  } catch {
    return true;
  }
}

/**
 * Whether the request is a remote SESSION: a signed-in browser that is not paired. A request with no
 * session is nobody's and is not this (it goes on to its own guard), and the cookie does not change that.
 *
 * The session is looked up with the call the guards make, because the pairing is the person's: it is asked of
 * the person the session names. One that cannot be answered counts as a session, so that a failing lookup
 * refuses a request and never lets one through.
 */
export async function isRemoteSession(
  gate: PairingGate | undefined,
  auth: Pick<AuthService, "api"> | undefined,
  request: Request,
): Promise<boolean> {
  if (!gate || !auth) return false;
  try {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    // The guard's own test of "signed in": `if (!session)`.
    if (!session) return false;
    return await isRemote(gate, request, session.user.id);
  } catch {
    return true;
  }
}

/**
 * The question a run's mark asks (`createRequestAgents`, decision H): is the browser that started this run
 * paired with the computer? By the time a run is built the request has been identified, so the person is
 * known and there is no "nobody" to leave to a guard; the question is asked of that person.
 */
export function remoteRunQuestion(
  gate: PairingGate,
): (request: Request, userId: string) => Promise<boolean> {
  return (request, userId) => isRemote(gate, request, userId);
}

/**
 * D49: a browser that still holds the OLD pairing cookie (the installation secret itself) and is signed in
 * is given its own `computer` pairing, once, in silence, and the new cookie in the answer. Mounted in front of
 * the remote limits, so the very request that carries the old cookie is already paired. REMOVE after
 * 16 February 2027 (docs/M1_PLAN.md D49): by then every browser in use has been through it.
 *
 * It asks nothing a stranger could answer: the old cookie is the secret, which only a browser paired before
 * D49 ever held, and the session says who gets the pairing. A request with the old cookie and no session
 * gets nothing, and neither does one whose lookup fails.
 */
export function createLegacyCookieUpgrade(
  gate: PairingGate,
  auth: Pick<AuthService, "api">,
): MiddlewareHandler {
  return async (context, next) => {
    const request = context.req.raw;
    if (!gate.pairings.holdsLegacy(request)) return next();
    let userId: string | undefined;
    try {
      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      });
      userId = session?.user.id;
    } catch {
      userId = undefined;
    }
    if (!userId) return next();
    let headers: string[];
    try {
      ({ headers } = await gate.pairings.adoptLegacy(
        request,
        userId,
        browserLabel(request.headers.get("user-agent"), "on this computer"),
      ));
    } catch {
      return next();
    }
    await next();
    for (const header of headers)
      context.res.headers.append("Set-Cookie", header);
  };
}

/** The code a refusal carries, for the app and for a test to read. */
export const REMOTE_SESSION_LIMITED = "remote_session_limited";

/**
 * What a remote session is told. It says what this browser is, what it may do and how to change it, in the
 * words a person reads on a phone. The app already shows the `error` text of a refused call.
 */
export const REMOTE_SESSION_SENTENCE =
  "This browser is not paired with the computer FreeDuet runs on, so it can read conversations, chat and answer an ordinary request once. This is done at the computer. To pair a browser, sign in to it as the administrator and run on that computer: bash scripts/open.sh";

/*
 * THE LIST (docs/design/phone-and-remote.md 3.5.2). A remote session reaches what is on it and nothing else:
 * a route that is not here is refused, and so is one added tomorrow until somebody lists it. The document
 * holds the reasons and `tests/remote-limits-ledger.test.ts` holds the two to each other.
 *
 * A ROUTE is "METHOD /path": `:name` is one segment, a trailing `*` is any number of segments (none too),
 * and `ALL` is every method. A request is matched against every route and the MOST SPECIFIC wins, position
 * by position: a word beats a `:name`, which beats a `*`. A tie is a refusal. So a family can be refused
 * by its prefix and have its few allowed routes cut out of it, and an allowed `:name` never reopens a word
 * that a refusal names.
 */
export type Verdict = "allow" | "refuse";

export type LedgerEntry = {
  readonly family: string;
  readonly route: string;
  readonly verdict: Verdict;
};

const allowed = (family: string, ...routes: string[]): LedgerEntry[] =>
  routes.map((route) => ({ family, route, verdict: "allow" }));
const refused = (family: string, ...routes: string[]): LedgerEntry[] =>
  routes.map((route) => ({ family, route, verdict: "refuse" }));

/**
 * The one list. The routes of the CopilotKit runtime are exact shapes: the runtime itself routes on the last
 * words of a path (and ignores empty segments), so a prefix match here would open `.../threads/subscribe` or
 * `.../agent/x/suggest` by the back door. It is mounted as a multi-route runtime, so the bare base path
 * answers nothing; a single-route runtime would carry every call in one body, and the day it is switched
 * on, `POST /api/copilotkit` must come off this list's reach.
 */
export const LEDGER: readonly LedgerEntry[] = [
  // The app and the answers that hold no person's data.
  ...allowed("app", "GET /*"),
  ...allowed("health", "GET /health"),
  ...allowed("keys", "GET /.well-known/http-message-signatures-directory"),
  ...allowed("capabilities", "GET /api/capabilities"),
  // Signing a person in and out. Every other call of the sign-in library acts on the account.
  ...allowed(
    "sign-in",
    "GET /api/auth/get-session",
    "POST /api/auth/get-session",
    "POST /api/auth/sign-out",
    "POST /api/auth/sign-in/social",
    "POST /api/auth/sign-in/sso",
    "GET /api/auth/callback/:id",
    "POST /api/auth/callback/:id",
    "GET /api/auth/sso/callback",
    "GET /api/auth/sso/callback/:providerId",
    "GET /api/auth/sso/saml2/sp/acs/:providerId",
    "POST /api/auth/sso/saml2/sp/acs/:providerId",
    "GET /api/auth/error",
    "GET /api/auth/ok",
  ),
  ...refused("sign-in", "ALL /api/auth/*"),
  ...refused(
    "directory",
    "PUT /api/auth/scim/*",
    "PATCH /api/auth/scim/*",
    "DELETE /api/auth/scim/*",
  ),
  ...allowed("pairing", "GET /api/pair"),
  ...refused("pairing", "POST /internal/pairing"),
  // D49. A remote session can see nothing of the pairings and mint nothing. The one thing it may do is
  // redeem a code for ITS OWN person (the route takes the person from the session, never from the body).
  ...allowed("pairings", "POST /api/pairings/redeem"),
  ...refused("pairings", "ALL /api/pairings/*"),
  ...allowed("me", "GET /api/me", "POST /api/me/onboarding"),
  // Reading and chatting.
  ...allowed(
    "conversations",
    "GET /api/channels",
    "GET /api/channels/events",
    "GET /api/channels/:channelId",
    "POST /api/channels",
    "POST /api/channels/first-day",
    "POST /api/channels/morning-brief",
    "POST /api/channels/:channelId/activity",
    "POST /api/channels/:channelId/busy",
    "PUT /api/channels/:channelId/read",
    "POST /api/channels/:channelId/attachments",
  ),
  ...refused(
    "conversations",
    "PUT /api/channels/:channelId/pin",
    "DELETE /api/channels/:channelId",
    "ALL /api/channels/*",
  ),
  ...allowed("attachments", "GET /api/attachments/:id"),
  ...refused(
    "attachments",
    "DELETE /api/attachments/:id",
    "ALL /api/attachments/*",
  ),
  // A group is READ from a remote session and not written to: a post is queued and answered by the
  // members in turns the worker runs, which carry no mark of the session that sent it (channels/group.ts),
  // so a Bot with Full access would act on a stolen phone's words with no card. Reopened when the turn
  // carries the mark (docs/design/phone-and-remote.md 3.5.5).
  ...allowed("groups", "GET /api/groups/:channelId"),
  ...refused(
    "groups",
    "POST /api/groups/:channelId",
    "POST /api/groups",
    "POST /api/groups/:channelId/members",
    "DELETE /api/groups/:channelId/members/:userId",
    "ALL /api/groups/*",
  ),
  ...allowed(
    "chat",
    "GET /api/copilotkit/info",
    "POST /api/copilotkit/agent/:agentId/run",
    "POST /api/copilotkit/agent/:agentId/connect",
    "POST /api/copilotkit/agent/:agentId/stop/:threadId",
    "GET /api/copilotkit/threads",
    "GET /api/copilotkit/threads/:threadId/messages",
    "POST /api/route",
    "POST /api/threads/mint",
    "GET /api/threads/:threadId",
  ),
  ...refused("chat", "ALL /api/copilotkit/*", "ALL /api/threads/*"),
  ...allowed("roster", "GET /api/agents", "GET /api/agents/:agentId"),
  ...refused("roster", "ALL /api/agents/*"),
  ...allowed(
    "bots",
    "GET /api/bots/attention",
    "GET /api/bots/:agentId/activity",
    "POST /api/bots/:agentId/activity/handoffs/stop",
  ),
  ...refused("bots", "ALL /api/bots/*"),
  // Seeing a request and answering an ordinary one once (the answer's own rule is approvals/routes.ts).
  ...allowed(
    "approvals",
    "GET /api/approvals",
    "POST /api/approvals/:id/decision",
    "POST /api/approvals/questions/:id/respond",
  ),
  ...refused(
    "approvals",
    "ALL /api/approvals/full-access/*",
    "ALL /api/approvals/computer/*",
    "ALL /api/approvals/preferences/*",
    "ALL /api/approvals/rules/*",
    "ALL /api/approvals/team/*",
    "ALL /api/approvals/*",
  ),
  ...refused("shared-use", "ALL /api/approvals/shared-use/*"),
  ...allowed("drawer", "GET /api/openduet/channels"),
  ...refused("drawer", "ALL /api/openduet/channels/*"),
  ...allowed("settings", "GET /api/settings/preferences"),
  // Everything that changes how the team works, who can reach it or what it may do.
  ...refused(
    "work",
    "ALL /api/openduet/pages/*",
    "ALL /api/openduet/setup/*",
    "ALL /api/openduet/tasks/*",
    "ALL /api/openduet/*",
  ),
  ...refused("admin", "ALL /api/admin/*"),
  ...refused("engines", "ALL /api/freeduet/engines/*"),
  ...refused("settings", "ALL /api/settings/*", "ALL /api/settings-changes/*"),
  ...refused(
    "accounts",
    "ALL /api/identity/*",
    "ALL /api/plugins/*",
    "ALL /api/components/*",
    "ALL /api/delivery/*",
  ),
  ...refused("secrets", "ALL /api/sign-in-requests/*", "ALL /api/passwords/*"),
  ...refused("computers", "ALL /api/computers/*", "ALL /api/host-access/*"),
  ...refused(
    "automation",
    "ALL /api/routines/*",
    "ALL /api/responsibilities/*",
    "ALL /api/proactive/*",
    "ALL /api/demonstrations/*",
  ),
  ...refused("memory", "ALL /api/memory/*"),
  ...refused("import", "ALL /api/freeduet/import/*"),
  // A team file leaves the installation, so a remote session never asks for one (docs/design/team-file.md, S2).
  ...refused("team-file", "ALL /api/freeduet/team-file/*"),
  ...refused("team", "ALL /api/team-bots/*"),
  ...refused("voice", "ALL /api/audio/*", "ALL /api/voice/*"),
  ...refused("sandboxed", "ALL /api/sandboxed/*"),
  // Doors with a credential of their own. A session is never what opens one.
  ...refused(
    "doors",
    "ALL /api/agent-tools/*",
    "ALL /api/model-provider/*",
    "ALL /api/desktop/*",
    "ALL /api/events/*",
    "ALL /api/delivery/webhooks/*",
    "POST /internal/routines/run",
  ),
  // A route added later: refused until somebody lists it.
  ...refused("rest", "ALL /api/*", "ALL /internal/*"),
];

type Segment = "param" | string;
type Compiled = {
  entry: LedgerEntry;
  method: string;
  fixed: readonly Segment[];
  wildcard: boolean;
};

const WORD = 3;
const PARAM = 2;
const REST = 1;
const END = 4;

function compile(entry: LedgerEntry): Compiled {
  const space = entry.route.indexOf(" ");
  const method = entry.route.slice(0, space);
  const parts = entry.route
    .slice(space + 1)
    .split("/")
    .filter((part) => part !== "");
  const wildcard = parts[parts.length - 1] === "*";
  const fixed = (wildcard ? parts.slice(0, -1) : parts).map((part) =>
    part.startsWith(":") ? "param" : `=${part}`,
  );
  return { entry, method, fixed, wildcard };
}

const COMPILED = LEDGER.map(compile);

/** How the entry meets the path, position by position, or null where it does not match. */
function meets(compiled: Compiled, path: readonly string[]): number[] | null {
  const { fixed, wildcard } = compiled;
  if (wildcard ? path.length < fixed.length : path.length !== fixed.length) {
    return null;
  }
  const ranks: number[] = [];
  for (let index = 0; index < path.length; index++) {
    const segment = fixed[index];
    if (segment === undefined) {
      ranks.push(REST);
    } else if (segment === "param") {
      ranks.push(PARAM);
    } else if (segment === `=${path[index]}`) {
      ranks.push(WORD);
    } else {
      return null;
    }
  }
  // Where the path ends. An entry that ends exactly here is more specific than a `*` that matched nothing.
  ranks.push(wildcard ? REST : END);
  return ranks;
}

/** Positive when `a` is the more specific of two matches, negative when `b` is, zero on a tie. */
function moreSpecific(a: number[], b: number[]): number {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * The entry that decides a request, and `undefined` where none matches (which is a refusal). A tie between
 * entries of different verdicts goes to the refusal.
 */
export function decidingEntry(
  method: string,
  path: readonly string[],
): LedgerEntry | undefined {
  const verb = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  let best: { entry: LedgerEntry; ranks: number[] } | undefined;
  for (const compiled of COMPILED) {
    if (compiled.method !== "ALL" && compiled.method !== verb) continue;
    const ranks = meets(compiled, path);
    if (!ranks) continue;
    const order = best ? moreSpecific(ranks, best.ranks) : 1;
    if (
      order > 0 ||
      (order === 0 && best && compiled.entry.verdict === "refuse")
    ) {
      best = { entry: compiled.entry, ranks };
    }
  }
  return best?.entry;
}

/** A path as segments. Null where it is not one this list can judge: an empty segment in the middle, or a dot segment. */
function segmentsOf(spelling: string): string[] | null {
  if (!spelling.startsWith("/")) return null;
  const trimmed =
    spelling.length > 1 && spelling.endsWith("/")
      ? spelling.slice(0, -1)
      : spelling;
  const parts = trimmed === "/" ? [] : trimmed.slice(1).split("/");
  return parts.some((part) => part === "" || part === "." || part === "..")
    ? null
    : parts;
}

/** The ways the server could read one path: as sent, as the router reads it, and decoded as far as it goes. */
export function spellingsOf(raw: string, routed?: string): string[] {
  const spellings = new Set<string>([raw]);
  if (routed !== undefined) spellings.add(routed);
  let current = raw;
  for (let round = 0; round < 5; round++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      break;
    }
    if (next === current) break;
    spellings.add(next);
    current = next;
  }
  return [...spellings];
}

/** Whether a remote session may make this request: every spelling of the path is on the list. */
export function remoteMayReach(
  method: string,
  raw: string,
  routed?: string,
): boolean {
  return spellingsOf(raw, routed).every((spelling) => {
    const path = segmentsOf(spelling);
    return path !== null && decidingEntry(method, path)?.verdict === "allow";
  });
}

/** The refusal, in one place so the middleware and the live screen say the same sentence. */
export function remoteRefusal() {
  return { error: REMOTE_SESSION_SENTENCE, code: REMOTE_SESSION_LIMITED };
}

/**
 * The middleware, mounted right behind the same-origin guard in `createApp`, in front of every route.
 *
 * Cheapest question first: a request that is on the list goes straight on (the common one, a chat). Then
 * the session, which says who, and that person's pairing. A request with no session is not this
 * middleware's: the route's own guard answers it, or its own credential does. Mounted only where
 * there is a gate, so without sign-in and a secret this is not in the app at all.
 */
export function createRemoteLimits(
  gate: PairingGate,
  auth: Pick<AuthService, "api"> | undefined,
): MiddlewareHandler {
  return async (context, next) => {
    const url = new URL(context.req.url);
    if (remoteMayReach(context.req.method, url.pathname, context.req.path)) {
      return next();
    }
    if (!(await isRemoteSession(gate, auth, context.req.raw))) return next();
    return context.json(remoteRefusal(), 403, { "Cache-Control": "no-store" });
  };
}
