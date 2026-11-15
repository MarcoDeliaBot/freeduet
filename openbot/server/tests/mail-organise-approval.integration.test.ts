import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Message } from "@ag-ui/client";
import {
  type ApprovalContinuation,
  withApprovalContext,
} from "@openbot/toolkit/continuation";
import { HeadlessToolSuspension } from "@openbot/toolkit/headless-tools";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  type FakeGoogle,
  startFakeGoogle,
} from "../../scripts/fake-google/server";
import { createApprovalService } from "../src/approvals/service";
import { createApprovalStore } from "../src/approvals/store";
import { ApprovalRefusedError } from "../src/approvals/types";
import {
  type AuditInitiator,
  createAuditStore,
  handoffInitiator,
} from "../src/audit";
import { createCredentialStore, encryptSecret } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  agentProfiles,
  agents,
  approvalPreferences,
  approvalRequests,
  approvalRules,
  auditEvents,
  credentials,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  pluginGrants,
  users,
} from "../src/db/schema";
import { createFullAccess, withFullAccess } from "../src/freeduet/full-access";
import { hubGrants } from "../src/freeduet/hub-grants";
import {
  GOOGLE_APP_PASSWORD,
  GOOGLE_WORKSPACE,
} from "../src/plugins/catalogue";
import { createGoogleImapTransport } from "../src/plugins/google-imap";
import {
  callTool as callGoogle,
  describeCall as describeGoogle,
} from "../src/plugins/google-workspace-rest";
import {
  ARCHIVE_MESSAGES,
  CREATE_LABEL,
  LABEL_MESSAGES,
  LIST_LABELS,
  MARK_MESSAGES,
  missingMessages,
  ORGANISE_REFUSALS,
  shownMessage,
} from "../src/plugins/mail-organise";
import {
  createPluginStore,
  PluginRefusedError,
  type PluginStoreOptions,
} from "../src/plugins/store";
import {
  createPrivateShareCheck,
  PRIVATE_SHARE_TOOL_REF,
} from "../src/proactive/private-share";
import { loadTenantPackage } from "../src/tenant-package";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { decimalOf, FakeMailbox, HEX } from "./support/fake-mail-organiser";

/**
 * ORGANISING A MAILBOX, through the real approval gate, on both ways of connecting Gmail
 * (docs/design/mail-organise.md).
 *
 * `gmail_create_label`, `gmail_label_messages`, `gmail_archive_messages` and `gmail_mark_messages` change
 * a mailbox, so each of them asks the person exactly as any other write does: not pre-approved, not a
 * new email (D27 is for sending one and nothing else), not given by a hand-off or by an approval
 * with no names, and held to a card every time when a routine or a trigger made the call. This file
 * drives the real plugin store, approval store and service on a real database, with the vendor behind
 * each connection: the fake Google over HTTP for the OAuth one, the fake mailbox behind the transport's
 * two factories for the app-password one. "Nothing changed" is read from the vendor, never from the
 * store's own answer.
 *
 * The card's list of messages is read by the server (`describeVendor`), so what is asserted on it is
 * what the mailbox holds, in the order the call named.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_organise_${suite}`;
// Otto, who holds the tools; a member holding only reads; Iris, who hands work on; and a peer who holds
// what Otto holds (a test-only grant) but is not the member the person gave Full access to.
const botId = `agent_organise_${suite}`;
const readerId = `agent_organise_reader_${suite}`;
const irisId = `agent_organise_iris_${suite}`;
const peerId = `agent_organise_peer_${suite}`;
const READS = [
  "gmail_search_messages",
  "gmail_read_message",
  "calendar_list_events",
  LIST_LABELS,
];
const WRITES = [CREATE_LABEL, LABEL_MESSAGES, ARCHIVE_MESSAGES, MARK_MESSAGES];
const TOOLS = [...READS, ...WRITES];
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const CLIENT = { clientId: "fake-client", clientSecret: "fake-secret" };
const PERSON: AuditInitiator = { kind: "person" };
const ROUTINE: AuditInitiator = { kind: "routine", id: "routine-organise" };
const TRIGGER: AuditInitiator = {
  kind: "responsibility",
  id: "responsibility-organise",
};
const REMOTE: AuditInitiator = { kind: "remote" };

/** What the auto-review model answers; "proceed" unless a test says otherwise. */
let reviewer: { verdict: "proceed" | "needs_approval"; preApproved: boolean } =
  { verdict: "proceed", preApproved: true };

const approvals = createApprovalStore(database);
const review = async () =>
  JSON.stringify({ ...reviewer, safety: "none", reason: "Test reviewer." });
const service = createApprovalService(approvals, undefined, undefined, {
  review,
});
const privateShareCheck = createPrivateShareCheck({ approvals });

let fake: FakeGoogle;
let refreshToken = "";
const realFetch = globalThis.fetch;
/** Every request the adapter made to the fake Gmail, as "METHOD /path", oldest first. */
let gmailRequests: string[] = [];

/** The app-password mailbox, replaced by `reset` so a test that changes it starts from a clean one. */
let box = new FakeMailbox();
const imapTransport = createGoogleImapTransport({
  imap: (options) => box.imap(options),
  organiser: (options) => box.organiser(options),
  fetch: async () => new Response("BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"),
  now: () => new Date("2026-10-22T20:00:00Z"),
});

const sharedOptions = {
  brokerProvider: "composio" as const,
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => ({ mode: "enforce" as const, deny: [], allow: ["true"] }),
  approvalGate: (candidate: Parameters<typeof service.gate>[0]) =>
    service.gate(candidate),
  privateShareCheck,
};

const exchangeRefreshToken: NonNullable<
  PluginStoreOptions["exchangeRefreshToken"]
> = async ({ refreshToken: presented }) => {
  const response = await realFetch(`${fake.url}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: presented,
      client_id: CLIENT.clientId,
      client_secret: CLIENT.clientSecret,
    }),
  });
  const body = (await response.json()) as { access_token: string };
  return { accessToken: body.access_token };
};

const oauthOptions = {
  ...sharedOptions,
  exchangeRefreshToken,
  callVendor: (connection, toolName, args) =>
    callGoogle(
      { url: fake.url, token: connection.token ?? "" },
      toolName,
      args,
    ),
  describeVendor: (connection, toolName, args) =>
    describeGoogle(
      { url: fake.url, token: connection.token ?? "" },
      toolName,
      args,
    ),
} satisfies PluginStoreOptions;

const appPasswordOptions = {
  ...sharedOptions,
  verifyUserSecret: async () => ({ ok: true, calendar: false }),
  callVendor: (connection, toolName, args) =>
    imapTransport.callTool(connection, toolName, args),
  describeVendor: (connection, toolName, args) =>
    imapTransport.describeCall(connection, toolName, args),
} satisfies PluginStoreOptions;

/** One message as the mailbox shows it: its id, who it is from and its subject. */
type Seen = { id: string; from: string; subject: string };

type Backend = {
  key: string;
  store: ReturnType<typeof createPluginStore>;
  /** The options the store was made with, so a variant of it can be built. */
  options: PluginStoreOptions;
  /** Messages in the inbox, as the mailbox itself shows them, newest first. */
  seen: () => Promise<Seen[]>;
  /** Everything a change would show in, for the messages `seen` returned. */
  snapshot: () => unknown;
  /** How many requests or commands that change a mailbox have reached the vendor. */
  changes: () => number;
  /** How many operations of any kind have reached the vendor. */
  touched: () => number;
  inInbox: (id: string) => boolean;
  unread: (id: string) => boolean;
  labelled: (id: string, label: string) => boolean;
  /** Makes sure a label of the person's own exists, directly at the vendor (not through the gate). */
  ensureLabel: (name: string) => Promise<void>;
  reset: () => void;
};

const oauthStore = createPluginStore(oauthOptions);
const appPasswordStore = createPluginStore(appPasswordOptions);

let oauthIds: string[] = [];

async function accessToken(): Promise<string> {
  return (await exchangeRefreshToken({ refreshToken } as never)).accessToken;
}

async function gmailGet<T>(path: string): Promise<T> {
  const response = await realFetch(`${fake.url}/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${await accessToken()}` },
  });
  return (await response.json()) as T;
}

const OAUTH: Backend = {
  key: GOOGLE_WORKSPACE,
  store: oauthStore,
  options: oauthOptions,
  seen: async () => {
    const listed = await gmailGet<{ messages?: { id: string }[] }>(
      "messages?q=in%3Ainbox&maxResults=10",
    );
    const found: Seen[] = [];
    for (const { id } of listed.messages ?? []) {
      const message = await gmailGet<{
        labelIds?: string[];
        payload?: { headers?: { name: string; value: string }[] };
      }>(
        `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      );
      if (!message.labelIds?.includes("INBOX")) continue;
      const header = (name: string) =>
        message.payload?.headers?.find((entry) => entry.name === name)
          ?.value ?? "";
      const shown = { from: header("From"), subject: header("Subject") };
      // The fixture is plain text, which a card shows unchanged: an expectation below can be literal.
      expect(shownMessage(shown.from, shown.subject)).toEqual(shown);
      found.push({ id, ...shown });
      if (found.length === 3) break;
    }
    oauthIds = found.map((message) => message.id);
    return found;
  },
  snapshot: () => ({
    labels: Object.fromEntries(
      oauthIds.map((id) => [id, fake.labelsOf(id)]),
    ),
    own: fake.userLabels(),
    modified: fake.modified(),
  }),
  changes: () =>
    gmailRequests.filter(
      (request) => request.startsWith("POST ") && !request.endsWith("/send"),
    ).length,
  touched: () => gmailRequests.length,
  inInbox: (id) => fake.labelsOf(id)?.includes("INBOX") === true,
  unread: (id) => fake.labelsOf(id)?.includes("UNREAD") === true,
  labelled: (id, label) => {
    const at = fake.userLabels().indexOf(label);
    return at >= 0 && fake.labelsOf(id)?.includes(`Label_${at + 1}`) === true;
  },
  ensureLabel: async (name) => {
    if (fake.userLabels().includes(name)) return;
    const created = await callGoogle(
      { url: fake.url, token: await accessToken() },
      CREATE_LABEL,
      { name },
    );
    expect(created.isError).toBe(false);
  },
  reset: () => {
    fake.reset();
    gmailRequests = [];
  },
};

const IMAP: Backend = {
  key: GOOGLE_APP_PASSWORD,
  store: appPasswordStore,
  options: appPasswordOptions,
  seen: async () => [
    {
      id: HEX.a,
      from: "Ana <ana@example.com>",
      subject: "Invoice 42",
    },
    {
      id: HEX.b,
      from: "News <news@example.org>",
      subject: "Weekly digest",
    },
    {
      id: HEX.c,
      from: "Bob <bob@example.net>",
      subject: "Already filed",
    },
  ],
  snapshot: () => JSON.parse(JSON.stringify(box.messages)),
  changes: () =>
    box.calls.filter((call) =>
      ["mailboxCreate", "messageFlagsAdd", "messageFlagsRemove"].includes(
        call.method,
      ),
    ).length,
  touched: () => box.calls.length,
  inInbox: (id) =>
    box.message(decimalOf(id))?.labels.includes("\\Inbox") === true,
  unread: (id) =>
    box.message(decimalOf(id))?.flags.includes("\\Seen") === false,
  labelled: (id, label) =>
    box.message(decimalOf(id))?.labels.includes(label) === true,
  ensureLabel: async () => undefined,
  reset: () => {
    box = new FakeMailbox();
  },
};

const BACKENDS = [OAUTH, IMAP];

/** Consent and redeem a code with PKCE for a real refresh token, as the other Gmail tests do. */
async function signIn(): Promise<string> {
  const verifier = randomBytes(32).toString("base64url");
  const consent = new URL(`${fake.url}/o/oauth2/v2/auth`);
  consent.search = new URLSearchParams({
    client_id: CLIENT.clientId,
    redirect_uri: "http://127.0.0.1:3001/api/plugins/oauth/callback",
    response_type: "code",
    state: "state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  }).toString();
  const back = new URL(
    (await fetch(consent, { redirect: "manual" })).headers.get("location") ??
      "",
  );
  const tokens = (await (
    await fetch(`${fake.url}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: back.searchParams.get("code") ?? "",
        redirect_uri: "http://127.0.0.1:3001/api/plugins/oauth/callback",
        client_id: CLIENT.clientId,
        client_secret: CLIENT.clientSecret,
        code_verifier: verifier,
      }),
    })
  ).json()) as { refresh_token: string };
  return tokens.refresh_token;
}

/** A message the person typed, as a run's history holds it. */
const typed = (content: string, id = `msg-${randomUUID()}`): Message => ({
  id,
  role: "user",
  content,
});

type Turn = {
  messages: Message[];
  /** The initiator the run carries. Absent is the person's own live chat turn. */
  initiator?: AuditInitiator;
  threadId?: string;
  /** The run and tool call a card is opened for. The run an answer resumes makes the same call again. */
  runId?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
};

/** A call inside a run that can wait for the person, as a Bot's turn makes it. */
function inTurn<T>(turn: Turn, run: () => Promise<T>) {
  const context: ApprovalContinuation = {
    runId: turn.runId ?? randomUUID(),
    threadId: turn.threadId ?? `thread-${randomUUID()}`,
    toolCallId: turn.toolCallId ?? randomUUID(),
    toolName: turn.toolName ?? ARCHIVE_MESSAGES,
    args: turn.args ?? {},
    messages: turn.messages,
    state: {},
    context: [],
    forwardedProps: {},
    ...(turn.initiator ? { initiator: turn.initiator } : {}),
  };
  return withApprovalContext(context, run);
}

type Call = {
  initiator?: AuditInitiator;
  member?: string;
  store?: ReturnType<typeof createPluginStore>;
};

const call = (
  backend: Backend,
  tool: string,
  args: Record<string, unknown>,
  options: Call = {},
) =>
  (options.store ?? backend.store).callTool({
    ref: `${backend.key}/${tool}`,
    args,
    botId: options.member ?? botId,
    actorId: owner,
    initiator: options.initiator ?? PERSON,
  });

/** The ids that make a call the same call when the run an answer resumes makes it again. */
const freshRun = () => ({
  threadId: `thread-${randomUUID()}`,
  runId: randomUUID(),
  toolCallId: randomUUID(),
});

const ownTurn = (
  tool: string,
  args: Record<string, unknown>,
  text = "Tidy my inbox, please",
): Turn => ({ messages: [typed(text)], toolName: tool, args });

const pending = async () =>
  (await approvals.list(owner)).filter(
    (request) => request.status === "pending",
  );

/** Refuse whatever is waiting, so one test's question never answers the next one's. */
async function clearPending() {
  for (const request of await pending())
    await approvals.decide(owner, request.id, "deny");
}

/** The ask-before-changes switch, which is the person's own and defaults to off. */
async function setAsking(on: boolean) {
  if (!approvals.policy) throw new Error("no policy store");
  await approvals.policy.setPreferences(owner, { enabled: on });
}

/** The call asked the person instead of running: a suspension, one card, nothing at the vendor. */
async function expectAsks(
  backend: Backend,
  tool: string,
  args: Record<string, unknown>,
  options: Call & { turn?: Partial<Turn> } = {},
) {
  await clearPending();
  const before = backend.snapshot();
  const changesBefore = backend.changes();
  const outcome = await inTurn(
    { ...ownTurn(tool, args), ...options.turn },
    () => call(backend, tool, args, options),
  ).catch((error: unknown) => error);
  expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
  // Not a single change has reached the vendor, and the mailbox reads as it did.
  expect(backend.changes()).toBe(changesBefore);
  expect(backend.snapshot()).toEqual(before);
  const asked = await pending();
  expect(asked).toHaveLength(1);
  const [card] = asked;
  if (!card) throw new Error("nothing was waiting");
  return card;
}

/** The call ran: no card, and the result is the vendor's own. */
async function expectRuns(
  backend: Backend,
  tool: string,
  args: Record<string, unknown>,
  options: Call & { turn?: Partial<Turn> } = {},
) {
  await clearPending();
  const result = await inTurn({ ...ownTurn(tool, args), ...options.turn }, () =>
    call(backend, tool, args, options),
  );
  expect(result.isError).toBe(false);
  expect(await pending()).toEqual([]);
  return JSON.parse(result.text) as Record<string, unknown>;
}

const serverRows: Record<string, boolean> = {};
let clientBefore: string | null = null;
const credentialIds: string[] = [];
const insertedTools: { serverId: string; name: string }[] = [];

beforeAll(async () => {
  fake = startFakeGoogle();
  refreshToken = await signIn();
  // Every request the adapter makes to the fake Gmail is written down, so "nothing was sent" is read
  // from what reached it and not from what the adapter says.
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.origin === new URL(fake.url).origin && url.pathname.startsWith("/gmail/")) {
      const method =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      gmailRequests.push(`${method} ${url.pathname}`);
    }
    return realFetch(input, init);
  }) as typeof fetch;

  for (const [id, name] of [
    [botId, botId],
    [readerId, readerId],
    [irisId, irisId],
    [peerId, peerId],
  ] as const) {
    await database
      .insert(agents)
      .values({ id, name, type: "remote_ag_ui", configuration: {} })
      .onConflictDoNothing();
    await database
      .insert(agentProfiles)
      .values({
        agentId: id,
        title: "",
        roleDescription: "",
        avatarSeed: id,
        visibility: "public",
      })
      .onConflictDoNothing();
  }
  await database
    .insert(users)
    .values({
      id: owner,
      email: `${owner}@organise.test`,
      name: "Maya Okafor",
      emailVerified: false,
    })
    .onConflictDoNothing();

  // The OAuth connection, set up as the send test sets it up.
  const [existing] = await database
    .select({ credentialId: mcpServers.credentialId })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_WORKSPACE));
  serverRows[GOOGLE_WORKSPACE] = existing !== undefined;
  clientBefore = existing?.credentialId ?? null;
  await database
    .insert(mcpServers)
    .values({
      id: GOOGLE_WORKSPACE,
      title: "Gmail and Google Calendar",
      vendor: "Google",
      url: "https://www.googleapis.com/",
      provenance: "first-party",
    })
    .onConflictDoNothing();
  const knownTools = new Set(
    (
      await database
        .select({ name: mcpTools.name })
        .from(mcpTools)
        .where(eq(mcpTools.serverId, GOOGLE_WORKSPACE))
    ).map((tool) => tool.name),
  );
  for (const name of TOOLS) {
    if (knownTools.has(name)) continue;
    await database.insert(mcpTools).values({
      serverId: GOOGLE_WORKSPACE,
      name,
      vendorName: name,
      description: name,
    });
    insertedTools.push({ serverId: GOOGLE_WORKSPACE, name });
  }
  const [client] = await database
    .insert(credentials)
    .values({
      kind: "mcp_oauth_client",
      provider: GOOGLE_WORKSPACE,
      keyId: `oauth-client-${suite}`,
      metadata: { clientId: CLIENT.clientId },
      encryptedValue: await encryptSecret(
        ENCRYPTION_KEY,
        JSON.stringify(CLIENT),
      ),
    })
    .returning({ id: credentials.id });
  if (!client) throw new Error("client was not stored");
  credentialIds.push(client.id);
  await database
    .update(mcpServers)
    .set({ credentialId: client.id })
    .where(eq(mcpServers.id, GOOGLE_WORKSPACE));
  const [token] = await database
    .insert(credentials)
    .values({
      kind: "mcp_user_token",
      provider: GOOGLE_WORKSPACE,
      keyId: owner,
      metadata: {},
      encryptedValue: await encryptSecret(ENCRYPTION_KEY, refreshToken),
    })
    .returning({ id: credentials.id });
  if (!token) throw new Error("token was not stored");
  credentialIds.push(token.id);
  await database.insert(mcpUserCredentials).values({
    serverId: GOOGLE_WORKSPACE,
    userId: owner,
    credentialId: token.id,
    scope: "https://www.googleapis.com/auth/gmail.modify",
  });

  // The app-password connection: the person pasted an app password and nothing else.
  const [existingImap] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  serverRows[GOOGLE_APP_PASSWORD] = existingImap !== undefined;
  await appPasswordStore.addServer({ key: GOOGLE_APP_PASSWORD, by: owner });
  await appPasswordStore.connectUserSecret({
    serverId: GOOGLE_APP_PASSWORD,
    userId: owner,
    body: { address: "maya@example.com", appPassword: "qwertyuiopasdfgh" },
  });

  // Otto holds every tool; the reader holds the reads only, which is what an approval with no names
  // gives, and the four writes are never part of that.
  for (const backend of BACKENDS)
    for (const [member, names] of [
      [botId, TOOLS],
      [peerId, TOOLS],
      [readerId, READS],
    ] as const)
      for (const name of names)
        await database
          .insert(pluginGrants)
          .values({
            kind: "mcp",
            ref: `${backend.key}/${name}`,
            agentId: member,
          })
          .onConflictDoNothing();
  await OAUTH.seen();
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await database
    .delete(approvalRequests)
    .where(eq(approvalRequests.ownerUserId, owner));
  await database
    .delete(approvalRules)
    .where(eq(approvalRules.ownerUserId, owner));
  await database
    .delete(approvalPreferences)
    .where(eq(approvalPreferences.ownerUserId, owner));
  await database.delete(pluginGrants).where(
    and(
      inArray(pluginGrants.agentId, [botId, readerId, peerId]),
      inArray(
        pluginGrants.ref,
        BACKENDS.flatMap((backend) =>
          TOOLS.map((name) => `${backend.key}/${name}`),
        ),
      ),
    ),
  );
  await database
    .delete(mcpUserCredentials)
    .where(eq(mcpUserCredentials.userId, owner));
  await database
    .delete(credentials)
    .where(
      and(
        eq(credentials.keyId, owner),
        eq(credentials.provider, GOOGLE_APP_PASSWORD),
      ),
    );
  await database
    .update(mcpServers)
    .set({ credentialId: clientBefore })
    .where(eq(mcpServers.id, GOOGLE_WORKSPACE));
  for (const id of credentialIds)
    await database.delete(credentials).where(eq(credentials.id, id));
  for (const tool of insertedTools)
    await database
      .delete(mcpTools)
      .where(
        and(eq(mcpTools.serverId, tool.serverId), eq(mcpTools.name, tool.name)),
      );
  if (!serverRows[GOOGLE_WORKSPACE])
    await database
      .delete(mcpServers)
      .where(
        and(
          eq(mcpServers.id, GOOGLE_WORKSPACE),
          isNull(mcpServers.credentialId),
        ),
      );
  if (!serverRows[GOOGLE_APP_PASSWORD]) {
    await database
      .delete(mcpTools)
      .where(eq(mcpTools.serverId, GOOGLE_APP_PASSWORD));
    await database
      .delete(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  }
  await database
    .delete(agentProfiles)
    .where(
      inArray(agentProfiles.agentId, [irisId, botId, readerId, peerId]),
    );
  await database.delete(users).where(eq(users.id, owner));
  await database
    .delete(agents)
    .where(inArray(agents.id, [botId, readerId, irisId, peerId]));
  await fake.stop();
  await database.$client.close();
});

/** The calls each write is tested with: what the Bot would send, and whether the card lists messages. */
function writeCalls(messages: Seen[]) {
  const [first, second] = messages;
  if (!first || !second) throw new Error("the mailbox has too few messages");
  return [
    {
      tool: CREATE_LABEL,
      args: { name: "Receipts 2026" },
      lists: [] as Seen[],
    },
    {
      tool: LABEL_MESSAGES,
      args: {
        messageIds: [first.id, second.id],
        addLabels: ["FreeDuet"],
      },
      lists: [first, second],
    },
    {
      tool: ARCHIVE_MESSAGES,
      args: { messageIds: [first.id, second.id] },
      lists: [first, second],
    },
    {
      tool: MARK_MESSAGES,
      args: { messageIds: [second.id], state: "read" },
      lists: [second],
    },
  ];
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: each of the four writes asks, as any write does`, () => {
    beforeAll(async () => {
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      await setAsking(true);
    });
    afterAll(async () => {
      await setAsking(false);
      await clearPending();
    });

    for (const [index, name] of WRITES.entries()) {
      test(`${name} asks: one card of its own, the messages read by the server, nothing changed`, async () => {
        const messages = await backend.seen();
        const wanted = writeCalls(messages)[index];
        if (!wanted) throw new Error("no call for this tool");
        expect(wanted.tool).toBe(name);
        const card = await expectAsks(backend, wanted.tool, wanted.args);

        // The tool's own card, not the card of a new email: no "send" check stands in for it.
        expect(card.action.toolRef).toBe(`${backend.key}/${name}`);
        expect(card.action.toolRef).not.toBe(PRIVATE_SHARE_TOOL_REF);
        expect(card.action.effect).toBe("write");
        expect(card.action.args).toEqual(wanted.args);
        // The person's own switch is what asked, so the card can be allowed once or always.
        expect(card.action.policy?.source).toBe("default");

        // What the card lists is what the SERVER read from the mailbox, in the order the call named.
        if (wanted.lists.length === 0) {
          expect(card.action.details).toBeUndefined();
        } else {
          expect(card.action.details).toEqual({
            messages: wanted.lists.map(({ from, subject }) => ({
              from,
              subject,
            })),
            missing: 0,
          });
        }
        // And the app is shown the same, through the public shape of the inbox.
        const shown = (await service.inbox(owner)).requests.find(
          (request) => request.id === card.id,
        );
        if (!shown) throw new Error("the card is not in the inbox");
        expect(shown.action.toolRef).toBe(`${backend.key}/${name}`);
        if (wanted.lists.length === 0)
          expect(shown.action.details).toBeUndefined();
        else
          expect(shown.action.details).toEqual(card.action.details as object);
        await clearPending();
      });
    }

    test("the card reads the messages with a connection that cannot change anything, and only once the person is to be asked", async () => {
      backend.reset();
      const messages = await backend.seen();
      const [first, second] = messages;
      if (!first || !second) throw new Error("too few messages");
      const touched = backend.touched();
      const changes = backend.changes();
      await expectAsks(backend, ARCHIVE_MESSAGES, {
        messageIds: [first.id, second.id],
      });
      // Looking the messages up reached the vendor (that is how the card is drawn) ...
      expect(backend.touched()).toBeGreaterThan(touched);
      // ... but only by reading: no request or command that changes a mailbox.
      expect(backend.changes()).toBe(changes);
      if (backend.key === GOOGLE_APP_PASSWORD) {
        // The only connection made was the one that cannot change a mailbox.
        expect(box.writeConnections).toEqual([]);
        expect(box.violations).toEqual([]);
      }
      await clearPending();
    });

    test("a message that is not in the mailbox is counted on the card, and the call is refused whole if it is allowed", async () => {
      await clearPending();
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const absent = "7fffffffffffff01";
      const args = { messageIds: [first.id, absent] };
      const run = freshRun();
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        turn: run,
      });
      expect(card.action.details).toEqual({
        messages: [{ from: first.from, subject: first.subject }],
        missing: 1,
      });
      await approvals.decide(owner, card.id, "allow_once");
      const before = backend.snapshot();
      const changes = backend.changes();
      const result = await inTurn({ ...ownTurn(ARCHIVE_MESSAGES, args), ...run }, () =>
        call(backend, ARCHIVE_MESSAGES, args),
      );
      // The person allowed it and the vendor refused it whole: not one of the messages was archived.
      expect(result.isError).toBe(true);
      expect(result.text).toContain(missingMessages(1, 2));
      expect(backend.snapshot()).toEqual(before);
      expect(backend.changes()).toBe(changes);
      expect(backend.inInbox(first.id)).toBe(true);
    });

    test("when the mailbox cannot be read for the card, the person is asked all the same, with the count and the label only", async () => {
      await clearPending();
      const messages = await backend.seen();
      const [first, second] = messages;
      if (!first || !second) throw new Error("too few messages");
      const blind = createPluginStore({
        ...backend.options,
        describeVendor: async () => {
          throw new Error("the mailbox could not be read");
        },
      });
      const args = { messageIds: [first.id, second.id] };
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        store: blind,
      });
      expect(card.action.details).toBeUndefined();
      expect(card.action.args).toEqual(args);
      await clearPending();
    });

    test("a vendor stood in for with no way to read the card is asked about all the same", async () => {
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const {
        describeVendor: _unused,
        ...withoutDescribe
      } = backend.options;
      const silent = createPluginStore(withoutDescribe);
      const touched = backend.touched();
      const card = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [first.id] },
        { store: silent },
      );
      // Nothing was dialled for the card: with a vendor injected and no reader, no message is read.
      expect(backend.touched()).toBe(touched);
      expect(card.action.details).toBeUndefined();
      await clearPending();
    });

    test("a typed address in the person's own message does not turn an archive into a new email", async () => {
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const args = { messageIds: [first.id] };
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        turn: {
          messages: [
            typed("Archive everything from ana@example.com in my inbox"),
          ],
        },
      });
      // D27 is for sending a new email and nothing else: this is an ordinary write, on its own tool.
      expect(card.action.toolRef).toBe(`${backend.key}/${ARCHIVE_MESSAGES}`);
      expect(card.action.policy?.source).toBe("default");
      await clearPending();
    });

    test("a hand-off from Iris, in the person's own turn, is not pre-approved: Otto's write still asks", async () => {
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const hop = handoffInitiator(irisId, PERSON);
      const args = { messageIds: [first.id] };
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        initiator: hop,
        turn: {
          initiator: hop,
          messages: [
            typed("Archive the invoice notifications"),
            {
              id: `handoff-${randomUUID()}`,
              role: "user",
              content: "Iris asks you to archive the invoice notifications.",
            },
          ],
        },
      });
      expect(card.action.toolRef).toBe(`${backend.key}/${ARCHIVE_MESSAGES}`);
      await clearPending();
    });

    test("an Allow once is spent on the call it was given for: replayed, it changes nothing twice, and a new call asks again", async () => {
      backend.reset();
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const args = { messageIds: [first.id] };
      const run = freshRun();
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        turn: run,
      });
      await approvals.decide(owner, card.id, "allow_once");
      const resumed = { ...ownTurn(ARCHIVE_MESSAGES, args), ...run };
      const done = await inTurn(resumed, () =>
        call(backend, ARCHIVE_MESSAGES, args),
      );
      expect(done.isError).toBe(false);
      expect(JSON.parse(done.text)).toEqual({
        archived: 1,
        alreadyOutOfInbox: 0,
      });
      expect(backend.inInbox(first.id)).toBe(false);
      // The run is resumed once more, as a run that is retried is: the answer it gets is the first one,
      // and the mailbox is not asked to change again.
      const changes = backend.changes();
      const replayed = await inTurn(resumed, () =>
        call(backend, ARCHIVE_MESSAGES, args),
      );
      expect(JSON.parse(replayed.text)).toEqual({
        archived: 1,
        alreadyOutOfInbox: 0,
      });
      expect(backend.changes()).toBe(changes);
      // A new call, even for another message in the same conversation, is a new question.
      const next = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [second.id] },
        { turn: { threadId: run.threadId } },
      );
      expect(next.id).not.toBe(card.id);
      await clearPending();
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: what the person allows is what is done`, () => {
    beforeAll(async () => {
      await setAsking(true);
    });
    afterAll(async () => {
      await setAsking(false);
      await clearPending();
    });

    /** Asks, allows once, and runs the same call again in the same conversation. */
    async function allowOnce(tool: string, args: Record<string, unknown>) {
      const run = freshRun();
      const card = await expectAsks(backend, tool, args, { turn: run });
      await approvals.decide(owner, card.id, "allow_once");
      const result = await inTurn({ ...ownTurn(tool, args), ...run }, () =>
        call(backend, tool, args),
      );
      expect(result.isError).toBe(false);
      return JSON.parse(result.text) as Record<string, unknown>;
    }

    test("archive: the named messages leave the Inbox and nothing else changes", async () => {
      backend.reset();
      const [first, second, third] = await backend.seen();
      if (!first || !second || !third) throw new Error("too few messages");
      const answer = await allowOnce(ARCHIVE_MESSAGES, {
        messageIds: [first.id, second.id],
      });
      expect(answer).toEqual({ archived: 2, alreadyOutOfInbox: 0 });
      expect(backend.inInbox(first.id)).toBe(false);
      expect(backend.inInbox(second.id)).toBe(false);
      // A message that was not named stays where it was.
      if (backend.key === GOOGLE_WORKSPACE)
        expect(backend.inInbox(third.id)).toBe(true);
    });

    test("mark: read and unread are what changes, on the named message only", async () => {
      backend.reset();
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const unreadBefore = backend.unread(second.id);
      const answer = await allowOnce(MARK_MESSAGES, {
        messageIds: [first.id],
        state: unreadBefore ? "read" : "unread",
      });
      expect(answer).toEqual({
        marked: 1,
        as: unreadBefore ? "read" : "unread",
      });
      expect(backend.unread(first.id)).toBe(!unreadBefore);
      expect(backend.unread(second.id)).toBe(unreadBefore);
    });

    test("label: the label is added to the named message and the Inbox is left alone", async () => {
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const answer = await allowOnce(LABEL_MESSAGES, {
        messageIds: [first.id],
        addLabels: ["FreeDuet"],
      });
      expect(answer).toEqual({
        labeled: 1,
        added: ["FreeDuet"],
        removed: [],
      });
      expect(backend.labelled(first.id, "FreeDuet")).toBe(true);
      expect(backend.labelled(second.id, "FreeDuet")).toBe(false);
      expect(backend.inInbox(first.id)).toBe(true);
    });

    test("create label: the label exists afterwards, and creating it again is a success that says nothing was created", async () => {
      backend.reset();
      const first = await allowOnce(CREATE_LABEL, { name: "Receipts 2026" });
      expect(first).toEqual({ label: "Receipts 2026", created: true });
      if (backend.key === GOOGLE_WORKSPACE)
        expect(fake.userLabels()).toEqual(["Receipts 2026"]);
      // Gmail says a label with that name is there (the fake Gmail does it for itself; the fake mailbox
      // is told to), and the person is asked again, because this is a new call.
      box.createdAnswer = { created: false };
      const again = await allowOnce(CREATE_LABEL, { name: "Receipts 2026" });
      expect(again).toMatchObject({ label: "Receipts 2026", created: false });
      expect(typeof again.note).toBe("string");
      if (backend.key === GOOGLE_WORKSPACE)
        expect(fake.userLabels()).toEqual(["Receipts 2026"]);
    });

    test("Refuse never changes the mailbox, and the Bot trying again only asks again", async () => {
      backend.reset();
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const args = { messageIds: [first.id] };
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, args, {
        turn: { threadId: freshRun().threadId },
      });
      await approvals.decide(owner, card.id, "deny");
      expect(backend.inInbox(first.id)).toBe(true);
      // The Bot tries again in the same conversation, as a new call, before the person has said anything.
      const retried = await inTurn(
        { ...ownTurn(ARCHIVE_MESSAGES, args), threadId: card.action.threadId },
        () => call(backend, ARCHIVE_MESSAGES, args),
      ).catch((error: unknown) => error);
      expect(retried).toBeInstanceOf(ApprovalRefusedError);
      expect(backend.inInbox(first.id)).toBe(true);
      expect(backend.changes()).toBe(0);
    });

    test("an Allow once for some messages does not let a different list through", async () => {
      backend.reset();
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const run = freshRun();
      const card = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [first.id] },
        { turn: run },
      );
      await approvals.decide(owner, card.id, "allow_once");
      // The Bot asks for one more message than the person saw, as the same call: that is a different
      // action, and the answer given for the first does not cover it.
      const widened = { messageIds: [first.id, second.id] };
      const outcome = await inTurn(
        { ...ownTurn(ARCHIVE_MESSAGES, widened), ...run },
        () => call(backend, ARCHIVE_MESSAGES, widened),
      ).catch((error: unknown) => error);
      // Refused outright: what was approved is the action as the person saw it, and this is another.
      expect(outcome).toBeInstanceOf(ApprovalRefusedError);
      expect((outcome as ApprovalRefusedError).message).toContain(
        "The approved action has changed.",
      );
      expect(backend.inInbox(first.id)).toBe(true);
      expect(backend.inInbox(second.id)).toBe(true);
      expect(backend.changes()).toBe(0);
      await clearPending();
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: reading the labels is not a change`, () => {
    beforeAll(async () => {
      await setAsking(true);
    });
    afterAll(async () => {
      await setAsking(false);
      reviewer = { verdict: "proceed", preApproved: true };
    });

    test("gmail_list_labels runs with no card, though the person asks before changes and the reviewer would stop a write", async () => {
      backend.reset();
      reviewer = { verdict: "needs_approval", preApproved: false };
      const answer = await expectRuns(backend, LIST_LABELS, {});
      expect(Array.isArray(answer.labels)).toBe(true);
      expect(backend.changes()).toBe(0);
    });

    test("and in a routine too, because it is a read", async () => {
      await expectRuns(
        backend,
        LIST_LABELS,
        {},
        {
          initiator: ROUTINE,
          turn: { initiator: ROUTINE, messages: [typed("every morning")] },
        },
      );
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: with the auto-review as the only thing that asks`, () => {
    beforeAll(async () => {
      await setAsking(false);
      reviewer = { verdict: "needs_approval", preApproved: false };
    });
    afterAll(async () => {
      reviewer = { verdict: "proceed", preApproved: true };
      await clearPending();
    });

    test("every one of the four asks when the reviewer says it needs the person", async () => {
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      for (const wanted of writeCalls(await backend.seen())) {
        const card = await expectAsks(backend, wanted.tool, wanted.args);
        expect(card.action.policy?.source).toBe("auto_review");
        expect(card.action.toolRef).toBe(`${backend.key}/${wanted.tool}`);
      }
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: a call that cannot be carried out asks nobody`, () => {
    beforeAll(async () => {
      backend.reset();
      await setAsking(true);
    });
    afterAll(async () => {
      await setAsking(false);
      await clearPending();
    });

    const refused = async (
      tool: string,
      args: Record<string, unknown>,
      sentence: string,
    ) => {
      await clearPending();
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const touched = backend.touched();
      const before = backend.snapshot();
      const outcome = await inTurn(ownTurn(tool, args), () =>
        call(backend, tool, args),
      ).catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(PluginRefusedError);
      expect((outcome as PluginRefusedError).message).toBe(sentence);
      // Nobody was asked, nothing was read from or sent to the vendor, and the mailbox is as it was.
      expect(await pending()).toEqual([]);
      expect(backend.touched()).toBe(touched);
      expect(backend.snapshot()).toEqual(before);
      const rows = await database
        .select({ payload: auditEvents.payload })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.eventType, "mcp.call_rejected"),
            eq(auditEvents.targetId, `${backend.key}/${tool}`),
            sql`${auditEvents.payload}->>'actor' = ${owner}`,
            sql`${auditEvents.payload}->>'refusal' = 'mail_organise_call_invalid'`,
          ),
        );
      expect(rows.length).toBeGreaterThan(0);
    };

    test("Trash as a label is refused before the person is asked", async () => {
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      await refused(
        LABEL_MESSAGES,
        { messageIds: [first.id], addLabels: ["TRASH"] },
        ORGANISE_REFUSALS.hidesMail,
      );
    });

    test("more than a hundred messages are refused before the person is asked", async () => {
      await refused(
        ARCHIVE_MESSAGES,
        {
          messageIds: Array.from({ length: 101 }, (_, i) =>
            (i + 1).toString(16).padStart(16, "0"),
          ),
        },
        ORGANISE_REFUSALS.tooManyIds,
      );
    });

    test("a field that would act on everything a search matches is refused before the person is asked", async () => {
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      await refused(
        ARCHIVE_MESSAGES,
        { messageIds: [first.id], query: "in:inbox" },
        ORGANISE_REFUSALS.extra,
      );
    });

    test("a label name with a control character is refused before the person is asked", async () => {
      await refused(
        CREATE_LABEL,
        { name: "Receipts‮gnp.exe" },
        ORGANISE_REFUSALS.labelName,
      );
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: nobody is trusted to have asked for it already`, () => {
    afterAll(async () => {
      await clearPending();
    });

    for (const initiator of [ROUTINE, TRIGGER, REMOTE]) {
      test(`a call made by a run started by a ${initiator.kind} asks, whatever the person's settings and the reviewer say`, async () => {
        await setAsking(false);
        reviewer = { verdict: "proceed", preApproved: true };
        backend.reset();
        await backend.ensureLabel("FreeDuet");
        for (const wanted of writeCalls(await backend.seen())) {
          const card = await expectAsks(backend, wanted.tool, wanted.args, {
            initiator,
            turn: { initiator, messages: [typed("every morning")] },
          });
          expect(card.action.policy?.source).toBe("always_ask");
          // Asked about every time: the card can be allowed once or refused, never remembered.
          await expect(
            approvals.decide(owner, card.id, "allow_always"),
          ).rejects.toBeInstanceOf(ApprovalRefusedError);
          await clearPending();
        }
      });
    }

    test("a hand-off that began in a routine asks too", async () => {
      await setAsking(false);
      const [first] = await backend.seen();
      if (!first) throw new Error("no message");
      const hop = handoffInitiator(irisId, ROUTINE);
      const card = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [first.id] },
        { initiator: hop, turn: { initiator: hop } },
      );
      expect(card.action.policy?.source).toBe("always_ask");
      await clearPending();
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: Always allow is the person's, and is for one tool`, () => {
    beforeAll(async () => {
      await setAsking(true);
    });
    afterAll(async () => {
      await setAsking(false);
      await database
        .delete(approvalRules)
        .where(eq(approvalRules.ownerUserId, owner));
      await clearPending();
    });

    test("after Always allow on archive, the next archive needs no card, and the other three still ask", async () => {
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const card = await expectAsks(backend, ARCHIVE_MESSAGES, {
        messageIds: [first.id],
      });
      await approvals.decide(owner, card.id, "allow_always");
      // This is how a standing rule works for every write; it is what makes the choice the person's.
      const archived = await expectRuns(backend, ARCHIVE_MESSAGES, {
        messageIds: [second.id],
      });
      expect(archived).toMatchObject({ archived: 1 });
      expect(backend.inInbox(second.id)).toBe(false);
      for (const wanted of writeCalls(await backend.seen()).filter(
        (each) => each.tool !== ARCHIVE_MESSAGES,
      ))
        await expectAsks(backend, wanted.tool, wanted.args);
      // And a routine still asks about archiving, rule or no rule.
      const [third] = await backend.seen();
      if (!third) throw new Error("no message");
      const unattended = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [third.id] },
        { initiator: ROUTINE, turn: { initiator: ROUTINE } },
      );
      expect(unattended.action.policy?.source).toBe("always_ask");
      await clearPending();
    });
  });
}

for (const backend of BACKENDS) {
  describe(`${backend.key}: nothing here is given by being allowed to read mail`, () => {
    test("a member that holds the reads is refused every one of the four writes, and nobody is asked", async () => {
      await clearPending();
      await setAsking(true);
      try {
        const calls = writeCalls(await backend.seen());
        const touched = backend.touched();
        const changes = backend.changes();
        for (const wanted of calls) {
          const outcome = await inTurn(ownTurn(wanted.tool, wanted.args), () =>
            call(backend, wanted.tool, wanted.args, { member: readerId }),
          ).catch((error: unknown) => error);
          expect(outcome).toBeInstanceOf(PluginRefusedError);
        }
        // Nobody was asked, and nothing reached the vendor.
        expect(await pending()).toEqual([]);
        expect(backend.touched()).toBe(touched);
        expect(backend.changes()).toBe(changes);
      } finally {
        await setAsking(false);
      }
    });

    test("the reads are classified as reads and the four writes as writes, as the app lists them", async () => {
      const server = (await backend.store.listServers()).find(
        (each) => each.id === backend.key,
      );
      if (!server) throw new Error("the connection is not listed");
      const effects = Object.fromEntries(
        server.tools.map((tool) => [tool.name, tool.effect]),
      );
      expect(effects).toMatchObject({
        gmail_search_messages: "read",
        gmail_read_message: "read",
        calendar_list_events: "read",
        [LIST_LABELS]: "read",
        [CREATE_LABEL]: "write",
        [LABEL_MESSAGES]: "write",
        [ARCHIVE_MESSAGES]: "write",
        [MARK_MESSAGES]: "write",
      });
    });

    test("an approval that names nothing gives the reads and never one of the four writes", async () => {
      // The route gives, to a member who asked, the tools this list marks `read` and not `settingsOnly`.
      const tools = await backend.store.appTools(backend.key);
      const given = tools
        .filter((tool) => tool.read && !tool.settingsOnly)
        .map((tool) => tool.name);
      for (const name of WRITES) expect(given).not.toContain(name);
      // The new read is treated as the older reads are: given when they are.
      const search = tools.find((tool) => tool.name === "gmail_search_messages");
      const labels = tools.find((tool) => tool.name === LIST_LABELS);
      expect(search).toBeDefined();
      expect(labels).toBeDefined();
      expect(labels?.read).toBe(search?.read === true);
      for (const name of WRITES) {
        const tool = tools.find((each) => each.name === name);
        expect(tool?.read).toBe(false);
        // Not one of the sends either: those are the person's own choice in settings and these are not sends.
        expect(tool?.settingsOnly).toBeNull();
      }
    });
  });
}

describe("the package grants no mailbox tool to anybody", () => {
  test("hub grants are between members, and none is a tool", async () => {
    const packageDirectory = fileURLToPath(
      new URL("../../examples/freeduet", import.meta.url),
    );
    const previous = process.env.FREEDUET_MEMBER_TYPE;
    process.env.FREEDUET_MEMBER_TYPE = "built-in";
    try {
      const tenantPackage = await loadTenantPackage(packageDirectory);
      const members = tenantPackage.agents.map((agent) => agent.id);
      const grants = hubGrants(tenantPackage);
      expect(grants.length).toBeGreaterThan(0);
      for (const grant of grants) {
        expect(members).toContain(grant.ref);
        expect(grant.ref).not.toContain("/");
        for (const name of WRITES) expect(grant.ref).not.toContain(name);
      }
    } finally {
      if (previous === undefined) delete process.env.FREEDUET_MEMBER_TYPE;
      else process.env.FREEDUET_MEMBER_TYPE = previous;
    }
  });
});

/*
 * THE WORDS THE SAFETY FLOOR READS. The floor matches words in the arguments of any write, so a label
 * called "Payments" is handed to the person, as every write that names a payment is. Pinned here so the
 * behaviour is known and does not change unseen: it is the floor's, not this feature's.
 */
describe("the safety floor reads a label's name like any other argument", () => {
  test("creating a label called Payments is handed to the person, not asked about", async () => {
    await clearPending();
    await setAsking(false);
    const outcome = await inTurn(
      ownTurn(CREATE_LABEL, { name: "Payments" }),
      () => call(OAUTH, CREATE_LABEL, { name: "Payments" }),
    ).catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(HeadlessToolSuspension);
    const [card] = await pending();
    expect(card?.action.policy).toMatchObject({
      behaviour: "hand_off",
      source: "safety",
    });
    expect(fake.userLabels()).not.toContain("Payments");
    await clearPending();
  });
});

/*
 * FULL ACCESS (docs/FULL_ACCESS.md) is the person's, and these tools are neither lifted by it nor held
 * back from it: with it on for Otto, in the person's own turn, they go through as any write does; a
 * routine's run, a member the person did not switch on, and a call the person's turn did not make
 * still ask.
 */
const fullAccess = createFullAccess({
  database,
  known: async () => true,
  handedRequest: async () => undefined,
  audit: createAuditStore(database),
});
const fullService = createApprovalService(approvals, undefined, undefined, {
  review,
  fullAccess,
});
const fullApprovalGate = (candidate: Parameters<typeof service.gate>[0]) =>
  fullService.gate(candidate);
const fullStores = new Map<string, ReturnType<typeof createPluginStore>>();
for (const backend of BACKENDS)
  fullStores.set(
    backend.key,
    createPluginStore({
      ...backend.options,
      approvalGate: fullApprovalGate,
      privateShareCheck: withFullAccess(privateShareCheck, fullAccess),
    }),
  );

for (const backend of BACKENDS) {
  describe(`${backend.key}: Full access is not special-cased for these tools`, () => {
    const store = fullStores.get(backend.key);
    if (!store) throw new Error("no store");
    beforeAll(async () => {
      await setAsking(true);
      reviewer = { verdict: "proceed", preApproved: true };
    });
    afterAll(async () => {
      await fullAccess.set(owner, botId, false);
      await setAsking(false);
      await clearPending();
    });

    test("off, every one of the four asks", async () => {
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      for (const wanted of writeCalls(await backend.seen()))
        await expectAsks(backend, wanted.tool, wanted.args, { store });
    });

    test("on for Otto, in the person's own turn, they go through with no card, as any write does", async () => {
      await fullAccess.set(owner, botId, true);
      backend.reset();
      await backend.ensureLabel("FreeDuet");
      const [first, second] = await backend.seen();
      if (!first || !second) throw new Error("too few messages");
      const archived = await expectRuns(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [first.id] },
        { store },
      );
      expect(archived).toMatchObject({ archived: 1 });
      expect(backend.inInbox(first.id)).toBe(false);
      await expectRuns(
        backend,
        MARK_MESSAGES,
        { messageIds: [second.id], state: "read" },
        { store },
      );
    });

    test("on for Otto, a routine's run still asks", async () => {
      await fullAccess.set(owner, botId, true);
      const [, second] = await backend.seen();
      if (!second) throw new Error("no message");
      const card = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [second.id] },
        { store, initiator: ROUTINE, turn: { initiator: ROUTINE } },
      );
      expect(card.action.policy?.source).toBe("always_ask");
      await clearPending();
    });

    test("on for Otto, a member the person did not switch on still asks", async () => {
      await fullAccess.set(owner, botId, true);
      const [, second] = await backend.seen();
      if (!second) throw new Error("no message");
      const card = await expectAsks(
        backend,
        ARCHIVE_MESSAGES,
        { messageIds: [second.id] },
        { store, member: peerId },
      );
      expect(card.action.botId).toBe(peerId);
      expect(card.action.policy?.source).toBe("default");
      await clearPending();
    });
  });
}

describe("the trail", () => {
  test("a write that ran after the person allowed it carries no mark of a new email's rule", async () => {
    const rows = await database
      .select({ payload: auditEvents.payload })
      .from(auditEvents)
      .where(
        and(
          sql`${auditEvents.eventType} in ('mcp.call_succeeded', 'mcp.call_failed')`,
          sql`${auditEvents.targetId} in (${sql.join(
            WRITES.flatMap((name) =>
              BACKENDS.map((backend) => sql`${`${backend.key}/${name}`}`),
            ),
            sql`, `,
          )})`,
          sql`${auditEvents.payload}->>'actor' = ${owner}`,
        ),
      );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows)
      expect(
        (row.payload as Record<string, unknown>).approvedBy,
      ).toBeUndefined();
  });
});
