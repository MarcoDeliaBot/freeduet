import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createAuditStore } from "../src/audit";
import { createCredentialStore } from "../src/credentials";
import { createDatabase } from "../src/db/client";
import {
  auditEvents,
  credentials,
  mailRuleApplied,
  mailRules,
  mcpServers,
  mcpTools,
  mcpUserCredentials,
  users,
} from "../src/db/schema";
import { GOOGLE_APP_PASSWORD } from "../src/plugins/catalogue";
import { CREATE_RULE } from "../src/plugins/mail-rules";
import {
  JOB_TOOLS,
  SCAN_PAGE,
  SCAN_PAGES,
} from "../src/plugins/plugin-store/mail-rules";
import { createPluginStore } from "../src/plugins/store";
import { TEST_POOL, testDatabaseUrl } from "./support/database";
import { FakeRuleMailbox } from "./support/fake-rule-mailbox";

/**
 * THE JOB THAT APPLIES MAIL RULES (docs/design/mail-rules.md, D46), on a real database and an in-memory
 * mailbox that answers the tools in the shape the two transports do. No model, no gate, no card: the
 * person ordered each rule through the gate when it was made. What is pinned here is what the job may do,
 * what it reads, that it does each thing once, and that it reports rather than hides a failure.
 */

const database = createDatabase(testDatabaseUrl(), TEST_POOL);
const suite = randomUUID().slice(0, 8);
const owner = `user_rules_${suite}`;
const other = `user_rules_other_${suite}`;
const ENCRYPTION_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

let box = new FakeRuleMailbox();
const store = createPluginStore({
  brokerProvider: "composio",
  database,
  auditStore: createAuditStore(database),
  credentials: createCredentialStore(database),
  encryptionKey: ENCRYPTION_KEY,
  policy: () => ({ mode: "enforce", deny: [], allow: ["true"] }),
  verifyUserSecret: async () => ({ ok: true, calendar: false }),
  callVendor: (connection, name, args) => box.call(connection, name, args),
});

let serverExisted = true;

const rule = async (args: Record<string, unknown>, userId = owner) => {
  const done = await store.handleRuleTool({
    serverId: GOOGLE_APP_PASSWORD,
    toolName: CREATE_RULE,
    args,
    userId,
  });
  expect(done.isError).toBe(false);
  return (JSON.parse(done.text) as { ruleId: string }).ruleId;
};
const row = async (id: string) => {
  const [found] = await database
    .select()
    .from(mailRules)
    .where(eq(mailRules.id, id));
  if (!found) throw new Error("no such rule");
  return found;
};
const reset = async () => {
  box = new FakeRuleMailbox();
  await database
    .delete(mailRules)
    .where(inArray(mailRules.userId, [owner, other]));
};
const audits = async (type: string, id: string) =>
  database
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.eventType, type as never),
        eq(auditEvents.targetId, id),
      ),
    );
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);

beforeAll(async () => {
  await database.insert(users).values([
    {
      id: owner,
      email: `${owner}@rules.test`,
      name: "Maya",
      emailVerified: false,
    },
    {
      id: other,
      email: `${other}@rules.test`,
      name: "Noor",
      emailVerified: false,
    },
  ]);
  const [existing] = await database
    .select({ id: mcpServers.id })
    .from(mcpServers)
    .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  serverExisted = existing !== undefined;
  await store.addServer({ key: GOOGLE_APP_PASSWORD, by: owner });
  await store.connectUserSecret({
    serverId: GOOGLE_APP_PASSWORD,
    userId: owner,
    body: { address: "maya@example.com", appPassword: "qwertyuiopasdfgh" },
  });
});

afterAll(async () => {
  await database
    .delete(mailRules)
    .where(inArray(mailRules.userId, [owner, other]));
  await database
    .delete(mcpUserCredentials)
    .where(eq(mcpUserCredentials.userId, owner));
  await database.delete(credentials).where(eq(credentials.keyId, owner));
  if (!serverExisted) {
    await database
      .delete(mcpTools)
      .where(eq(mcpTools.serverId, GOOGLE_APP_PASSWORD));
    await database
      .delete(mcpServers)
      .where(eq(mcpServers.id, GOOGLE_APP_PASSWORD));
  }
  await database.delete(users).where(inArray(users.id, [owner, other]));
  await database.$client.close();
});

describe("the job applies a rule to new mail, once", () => {
  test("labels (creating the label) and archives the mail that matches, and nothing else", async () => {
    await reset();
    const id = await rule({
      fromDomain: "github.com",
      addLabels: ["GitHub"],
      archive: true,
    });
    const hit = box.add({
      from: "GitHub <notifications@github.com>",
      subject: "PR merged",
    });
    const miss = box.add({
      from: "Ana <ana@example.com>",
      subject: "Invoice 42",
    });
    const report = await store.runMailRules({ now: later(5) });
    expect(report.applied).toBe(1);
    expect(hit.where).toBe("archive");
    expect(hit.labels).toEqual(["GitHub"]);
    expect(box.userLabels).toEqual(["GitHub"]);
    expect(miss.where).toBe("inbox");
    expect(miss.labels).toEqual([]);
    const stored = await row(id);
    expect(stored.lastApplied).toBe(1);
    expect(stored.totalApplied).toBe(1);
    expect(stored.lastError).toBeNull();
    expect(stored.lastRunAt).not.toBeNull();
    expect(stored.leasedUntil).toBeNull();
  });

  test("a second pass over the same mail does nothing, and asks the mailbox to change nothing", async () => {
    await reset();
    const id = await rule({
      fromDomain: "github.com",
      addLabels: ["GitHub"],
      markRead: true,
    });
    // A rule that only labels leaves the mail in the Inbox, so the next search shows it again.
    box.add({ from: "x@github.com", subject: "one" });
    await store.runMailRules({ now: later(5) });
    const first = box.changes().length;
    expect(first).toBeGreaterThan(0);
    const again = await store.runMailRules({ now: later(10) });
    expect(again.applied).toBe(0);
    expect(box.changes().length).toBe(first);
    expect((await row(id)).totalApplied).toBe(1);
    expect(
      await database
        .select()
        .from(mailRuleApplied)
        .where(eq(mailRuleApplied.ruleId, id)),
    ).toHaveLength(1);
  });

  test("it reads headers only: the snippet and any body text decide nothing", async () => {
    await reset();
    await rule({ words: "prize", fromDomain: "example.net", bin: true });
    await rule({ listId: "deals.example.net", spam: true });
    const body = box.add({
      from: "x@example.net",
      subject: "Hello",
      snippet: "you won a prize, claim your prize",
    });
    const list = box.add({
      from: "y@example.org",
      subject: "Weekly",
      listId: "<deals.example.net>",
      snippet: "nothing",
    });
    await store.runMailRules({ now: later(5) });
    expect(body.where).toBe("inbox");
    expect(list.where).toBe("spam");
  });

  test("it never calls a tool outside its list, and never one that sends or deletes for good", async () => {
    await reset();
    await rule({
      fromDomain: "a.example.com",
      addLabels: ["A"],
      archive: true,
      markRead: true,
    });
    await rule({ fromDomain: "b.example.com", spam: true });
    await rule({ fromDomain: "c.example.com", bin: true });
    for (const d of ["a", "b", "c"])
      box.add({ from: `x@${d}.example.com`, subject: d });
    await store.runMailRules({ now: later(5) });
    const names = new Set(box.calls.map((call) => call.name));
    for (const name of names) expect(JOB_TOOLS).toContain(name);
    expect(
      [...names].filter((name) =>
        /send|reply|forward|delete|expunge/.test(name),
      ),
    ).toEqual([]);
    expect(
      JOB_TOOLS.filter((name) =>
        /send|reply|forward|delete|expunge/.test(name),
      ),
    ).toEqual([]);
    // Each call carries the person's own mailbox and the job's name, never a member's.
    for (const call of box.calls) {
      expect(call.actorId).toBe(owner);
      expect(call.botId).toBe("freeduet-mail-rules");
    }
  });

  test("a hundred and fifty matches go in calls of at most a hundred, and all are handled", async () => {
    await reset();
    await rule({ fromDomain: "bulk.example.com", archive: true });
    for (let i = 0; i < 150; i++)
      box.add({
        from: "x@bulk.example.com",
        subject: `n${i}`,
        arrivedAt: Date.now() + 60_000 + i * 1000,
      });
    const report = await store.runMailRules({ now: later(5) });
    expect(report.applied).toBe(150);
    const sizes = box
      .named("gmail_archive_messages")
      .map((call) => (call.args.messageIds as string[]).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(100);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(150);
    expect(box.messages.every((m) => m.where === "archive")).toBe(true);
  });

  test("more new mail than a pass can look at is said in the rule's note, and the rest is not hidden", async () => {
    await reset();
    const id = await rule({ fromDomain: "flood.example.com", archive: true });
    const total = SCAN_PAGE * SCAN_PAGES + 30;
    for (let i = 0; i < total; i++)
      box.add({
        from: "x@flood.example.com",
        subject: `n${i}`,
        arrivedAt: Date.now() + 60_000 + i * 1000,
      });
    await store.runMailRules({ now: later(5) });
    const stored = await row(id);
    // Each page after the first repeats the second its predecessor ended on, so a pass handles a little under 250.
    expect(stored.lastApplied).toBeGreaterThan(SCAN_PAGE * SCAN_PAGES - 15);
    expect(stored.lastApplied).toBeLessThanOrEqual(SCAN_PAGE * SCAN_PAGES);
    expect(stored.lastError).toContain("were not looked at");
  });

  test("mail that arrived before the rule was made is left alone, and so is mail dated long before it", async () => {
    await reset();
    await rule({ fromDomain: "github.com", archive: true });
    const early = box.add({
      from: "x@github.com",
      subject: "old",
      arrivedAt: Date.now() - 3_600_000,
    });
    const backdated = box.add({
      from: "x@github.com",
      subject: "dated in 2019",
      dateHeader: Date.now() - 5 * 24 * 3_600_000,
    });
    const fresh = box.add({ from: "x@github.com", subject: "new" });
    await store.runMailRules({ now: later(5) });
    expect(early.where).toBe("inbox");
    expect(backdated.where).toBe("inbox");
    expect(fresh.where).toBe("archive");
    // And the search itself was asked only for mail after the rule's own time.
    const query = String(box.named("gmail_search_messages")[0]?.args.query);
    expect(query).toMatch(/^in:inbox after:\d{10}$/);
  });

  test("the rule's own watermark moves on after a clean pass, so a later pass asks for newer mail only", async () => {
    await reset();
    const id = await rule({ fromDomain: "github.com", archive: true });
    const before = (await row(id)).watermarkAt.getTime();
    box.add({ from: "x@github.com", subject: "new" });
    await store.runMailRules({ now: later(30) });
    const after = (await row(id)).watermarkAt.getTime();
    expect(after).toBeGreaterThan(before);
  });
});

describe("a rule that is off, or somebody else's, is never applied to this mailbox", () => {
  test("a disabled rule is not applied; switched on again it looks at mail from then on only", async () => {
    await reset();
    const id = await rule({ fromDomain: "github.com", archive: true });
    await Bun.sleep(1700);
    expect(await store.changeMailRule(owner, id, "disable")).toBe(true);
    const waiting = box.add({
      from: "x@github.com",
      subject: "while off",
      arrivedAt: Date.now() - 1500,
    });
    const report = await store.runMailRules({ now: later(5) });
    expect(report.rules).toBe(0);
    expect(waiting.where).toBe("inbox");
    expect(box.calls).toHaveLength(0);
    await store.changeMailRule(owner, id, "enable");
    const fresh = box.add({
      from: "x@github.com",
      subject: "after it came back on",
    });
    await store.runMailRules({ now: later(10) });
    // It arrived while the rule was off, before it was switched on: not new mail for it.
    expect(waiting.where).toBe("inbox");
    expect(fresh.where).toBe("archive");
  });

  test("another person's rule is carried out on their own connection only, and fails alone when they have none", async () => {
    await reset();
    const mine = await rule({ fromDomain: "github.com", archive: true });
    const theirs = await rule(
      { fromDomain: "example.net", archive: true },
      other,
    );
    const ours = box.add({ from: "x@github.com", subject: "mine" });
    const bystander = box.add({
      from: "x@example.net",
      subject: "matches their rule only",
    });
    await store.runMailRules({ now: later(5) });
    // Maya's mailbox: her rule ran; Noor's rule never touched it, and Noor has no connection.
    expect(ours.where).toBe("archive");
    expect(bystander.where).toBe("inbox");
    for (const call of box.calls) expect(call.actorId).toBe(owner);
    expect((await row(mine)).lastError).toBeNull();
    expect((await row(theirs)).lastError).not.toBeNull();
    expect((await row(theirs)).totalApplied).toBe(0);
  });

  test("a rule is listed, switched and deleted only by the person it belongs to", async () => {
    await reset();
    const id = await rule({ fromDomain: "github.com", archive: true });
    expect(await store.listMailRules(other)).toEqual([]);
    expect(await store.changeMailRule(other, id, "disable")).toBe(false);
    expect(await store.changeMailRule(other, id, "delete")).toBe(false);
    expect((await row(id)).enabled).toBe(true);
    const listed = await store.handleRuleTool({
      serverId: GOOGLE_APP_PASSWORD,
      toolName: "gmail_list_rules",
      args: {},
      userId: other,
    });
    expect(JSON.parse(listed.text).rules).toEqual([]);
    const stolen = await store.handleRuleTool({
      serverId: GOOGLE_APP_PASSWORD,
      toolName: "gmail_disable_rule",
      args: { ruleId: id, change: "delete" },
      userId: other,
    });
    expect(stolen.isError).toBe(true);
    expect((await row(id)).enabled).toBe(true);
  });
});

describe("a failure is reported, never hidden, and disables nothing", () => {
  test("a Bin or Spam move the mailbox could not confirm shows as the rule's last error, and is tried again", async () => {
    await reset();
    const id = await rule({ fromDomain: "spam.example.com", spam: true });
    const msg = box.add({ from: "x@spam.example.com", subject: "buy" });
    box.failing.set(
      "gmail_spam_messages",
      "Gmail accepted the copy to Spam, but 1 message is still in the mailbox, so the move is not confirmed for it. 0 were confirmed moved. Look in Gmail before asking again.",
    );
    const report = await store.runMailRules({ now: later(5) });
    expect(report.applied).toBe(0);
    const failed = await row(id);
    expect(failed.lastError).toContain("not confirmed");
    expect(failed.enabled).toBe(true);
    expect(failed.totalApplied).toBe(0);
    expect(await audits("mail_rule.failed", id)).toHaveLength(1);
    expect(await audits("mail_rule.applied", id)).toHaveLength(0);
    expect(msg.where).toBe("inbox");
    // Fixed: the next pass applies it, once.
    box.failing.clear();
    const again = await store.runMailRules({ now: later(30) });
    expect(again.applied).toBe(1);
    expect(msg.where).toBe("spam");
    expect((await row(id)).lastError).toBeNull();
  });

  test("a mailbox that cannot be searched is the rule's error, with no change made", async () => {
    await reset();
    const id = await rule({ fromDomain: "github.com", archive: true });
    box.add({ from: "x@github.com", subject: "new" });
    box.failing.set(
      "gmail_search_messages",
      "Gmail could not be reached. Try again later.",
    );
    await store.runMailRules({ now: later(5) });
    expect((await row(id)).lastError).toContain("could not be reached");
    expect(box.changes()).toEqual([]);
    expect((await row(id)).enabled).toBe(true);
  });
});

describe("what the job leaves in the trail", () => {
  test("an application is one audit row from the deployment: counts and action names, no address, subject or label", async () => {
    await reset();
    const id = await rule({
      fromAddress: "secret.person@example.com",
      addLabels: ["Private label"],
      archive: true,
    });
    box.add({ from: "secret.person@example.com", subject: "private subject" });
    await store.runMailRules({ now: later(5) });
    const rows = await audits("mail_rule.applied", id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorUserId).toBe(owner);
    const text = JSON.stringify(rows[0]);
    expect(text).toContain('"applied":1');
    expect(text).toContain("archive");
    for (const secret of ["secret.person", "private subject", "Private label"])
      expect(text).not.toContain(secret);
    expect(rows[0]?.initiatorKind).toBe("deployment");
  });

  test("creating, switching and deleting a rule each leave a row", async () => {
    await reset();
    const id = await rule({ fromDomain: "github.com", archive: true });
    await store.changeMailRule(owner, id, "disable");
    await store.changeMailRule(owner, id, "delete");
    expect(await audits("mail_rule.created", id)).toHaveLength(1);
    expect(await audits("mail_rule.changed", id)).toHaveLength(1);
    expect(await audits("mail_rule.deleted", id)).toHaveLength(1);
  });
});

describe("two passes at once, and two rules on one message", () => {
  test("the lease keeps two replicas from applying one rule twice", async () => {
    await reset();
    await rule({ fromDomain: "github.com", archive: true });
    for (let i = 0; i < 5; i++)
      box.add({ from: "x@github.com", subject: `n${i}` });
    const [a, b] = await Promise.all([
      store.runMailRules({ now: later(5) }),
      store.runMailRules({ now: later(5) }),
    ]);
    expect(a.applied + b.applied).toBe(5);
    expect(box.named("gmail_archive_messages")).toHaveLength(1);
  });

  test("a message a rule moved to the Bin is left alone by the rules after it", async () => {
    await reset();
    await rule({ fromAddress: "x@news.example.com", bin: true });
    await rule({ fromDomain: "news.example.com", addLabels: ["News"] });
    const msg = box.add({ from: "x@news.example.com", subject: "n" });
    await store.runMailRules({ now: later(5) });
    expect(msg.where).toBe("bin");
    expect(msg.labels).toEqual([]);
  });
});

describe("applyToExisting: one explicit pass over the Inbox as it is", () => {
  test("a rule made with it also takes the matching mail already there, once; one made without it does not", async () => {
    await reset();
    const withIt = await rule({
      fromDomain: "github.com",
      archive: true,
      applyToExisting: true,
    });
    const waiting = box.add({
      from: "x@github.com",
      subject: "already here",
      arrivedAt: Date.now() - 86_400_000 * 3,
    });
    await store.runMailRules({ now: later(5) });
    expect(waiting.where).toBe("archive");
    expect((await row(withIt)).backfillPending).toBe(false);
    const firstQuery = String(
      box.named("gmail_search_messages")[0]?.args.query,
    );
    expect(firstQuery).toBe("in:inbox");
    // The second pass is an ordinary one: asks for newer mail only.
    box.calls.length = 0;
    await store.runMailRules({ now: later(10) });
    expect(String(box.named("gmail_search_messages")[0]?.args.query)).toMatch(
      /after:\d{10}/,
    );

    await reset();
    await rule({ fromDomain: "github.com", archive: true });
    const stays = box.add({
      from: "x@github.com",
      subject: "already here",
      arrivedAt: Date.now() - 86_400_000 * 3,
    });
    await store.runMailRules({ now: later(5) });
    expect(stays.where).toBe("inbox");
  });

  test("a backfill that failed is tried again", async () => {
    await reset();
    const id = await rule({
      fromDomain: "github.com",
      archive: true,
      applyToExisting: true,
    });
    box.add({
      from: "x@github.com",
      subject: "here",
      arrivedAt: Date.now() - 86_400_000,
    });
    box.failing.set(
      "gmail_archive_messages",
      "Gmail refused. Nothing was changed.",
    );
    await store.runMailRules({ now: later(5) });
    expect((await row(id)).backfillPending).toBe(true);
  });
});

describe("the limits of the list", () => {
  test("a mailbox keeps at most twenty rules", async () => {
    await reset();
    for (let i = 0; i < 20; i++)
      await rule({ fromDomain: `d${i}.example.com`, archive: true });
    const over = await store.handleRuleTool({
      serverId: GOOGLE_APP_PASSWORD,
      toolName: CREATE_RULE,
      args: { fromDomain: "one-more.example.com", archive: true },
      userId: owner,
    });
    expect(over.isError).toBe(true);
    expect(await store.listMailRules(owner)).toHaveLength(20);
  });

  test("a rule that cannot be expressed is refused by the store too, and stores nothing", async () => {
    await reset();
    const refused = await store.handleRuleTool({
      serverId: GOOGLE_APP_PASSWORD,
      toolName: CREATE_RULE,
      args: {
        fromDomain: "example.com",
        archive: true,
        forwardTo: "x@example.org",
      },
      userId: owner,
    });
    expect(refused.isError).toBe(true);
    expect(await store.listMailRules(owner)).toEqual([]);
  });
});

describe("a mailbox that keeps failing is not hammered, and is not an audit row every pass", () => {
  const searches = () =>
    box.calls.filter((c) => c.name === "gmail_search_messages").length;

  test("one failed search skips the rest of that connection's rules, waits twice as long each time, writes one row per outage, and says so when it recovers", async () => {
    await reset();
    const a = await rule({ fromDomain: "github.com", archive: true });
    const b = await rule({ fromDomain: "gitlab.com", archive: true });
    box.add({ from: "x@github.com", subject: "new" });
    box.failing.set(
      "gmail_search_messages",
      "Gmail could not be reached. Try again later.",
    );
    // First pass: one search only, both rules show the error.
    await store.runMailRules({ now: later(5) });
    expect(searches()).toBe(1);
    for (const id of [a, b]) {
      const r = await row(id);
      expect(r.lastError).toContain("could not be reached");
      expect(r.failures).toBe(1);
      expect(r.enabled).toBe(true);
      expect(await audits("mail_rule.failed", id)).toHaveLength(1);
    }
    // Inside the wait: nothing is asked of the mailbox.
    await store.runMailRules({ now: later(8) });
    expect(searches()).toBe(1);
    // After it: one more search, a second failure, and still one audit row each.
    await store.runMailRules({ now: later(30) });
    expect(searches()).toBe(2);
    expect((await row(a)).failures).toBe(2);
    expect(await audits("mail_rule.failed", a)).toHaveLength(1);
    // The wait doubles and stops growing at four hours.
    const wait = async (id: string, from: number) =>
      ((await row(id)).leasedUntil?.getTime() ?? 0) -
      (Date.now() + from * 60_000);
    expect(await wait(a, 30)).toBeGreaterThan(19 * 60_000);
    expect(await wait(a, 30)).toBeLessThanOrEqual(20 * 60_000);
    let at = 100;
    for (let i = 0; i < 12; i++) {
      await store.runMailRules({ now: later(at) });
      at += 600;
    }
    expect(await wait(a, at - 600)).toBeLessThanOrEqual(4 * 3_600_000);
    expect(await audits("mail_rule.failed", a)).toHaveLength(1);
    // Fixed: it recovers, applies, and the recovery is one row.
    box.failing.clear();
    await store.runMailRules({ now: later(at + 600) });
    const after = await row(a);
    expect(after.lastError).toBeNull();
    expect(after.failures).toBe(0);
    expect(await audits("mail_rule.applied", a)).toHaveLength(1);
    expect(await audits("mail_rule.applied", b)).toHaveLength(1);
  });

  test("a rule's own failed move does not stop the other rules of the connection", async () => {
    await reset();
    const a = await rule({ fromDomain: "spam.example.com", spam: true });
    const b = await rule({ fromDomain: "github.com", archive: true });
    box.add({ from: "x@spam.example.com", subject: "buy" });
    const hub = box.add({ from: "x@github.com", subject: "new" });
    box.failing.set("gmail_spam_messages", "not confirmed");
    await store.runMailRules({ now: later(5) });
    expect((await row(a)).lastError).toContain("not confirmed");
    expect(hub.where).not.toBe("inbox");
    expect((await row(b)).lastError).toBeNull();
  });
});

describe("switching a rule on again", () => {
  test("never starts a backfill nobody ordered, and forgets an old failure", async () => {
    await reset();
    const id = await rule({
      fromDomain: "github.com",
      archive: true,
      applyToExisting: true,
    });
    expect((await row(id)).backfillPending).toBe(true);
    await store.changeMailRule(owner, id, "disable");
    await store.changeMailRule(owner, id, "enable");
    const r = await row(id);
    expect(r.backfillPending).toBe(false);
    expect(r.failures).toBe(0);
    box.add({
      from: "old@github.com",
      subject: "old",
      arrivedAt: Date.now() - 3 * 86_400_000,
    });
    await store.runMailRules({ now: later(5) });
    expect(box.changes()).toEqual([]);
  });
});
