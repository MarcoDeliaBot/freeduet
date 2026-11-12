import { describe, expect, test } from "bun:test";
import { safetyRequirement } from "../src/approvals/policy";
import { accessFor } from "../src/plugins/access";
import {
  CATALOGUE,
  catalogueEntry,
  classifyTool,
  GOOGLE_APP_PASSWORD,
  GOOGLE_WORKSPACE,
  resolveServerUrl,
} from "../src/plugins/catalogue";
import { listTools as imapListTools } from "../src/plugins/google-imap";
import { listTools as restListTools } from "../src/plugins/google-workspace-rest";
import { MAIL_PRESETS } from "../src/plugins/mail-presets";
import { transportFor } from "../src/plugins/transport";

/**
 * The second way to connect Gmail and Calendar, as the catalogue and the approval gate see it.
 *
 * Two groups of tests live here, both pure. (a) The entry is listed, it is a different entry from
 * the OAuth one, and it resolves to the transport and the credential source that make it a
 * per-person pasted secret. (b) The approval gate treats `gmail_send_reply` as a write on this
 * entry exactly as it does on the OAuth one, and nothing can talk it down: an app password opens
 * the whole mailbox, so the entry's lists are the only limit.
 */

const entry = catalogueEntry(GOOGLE_APP_PASSWORD);
const oauth = catalogueEntry(GOOGLE_WORKSPACE);

describe("(a) the catalogue lists the app-password entry", () => {
  test("it is in the catalogue under its own key, with its own title", () => {
    expect(GOOGLE_APP_PASSWORD).toBe("google-imap");
    expect(entry).not.toBeNull();
    expect(CATALOGUE.map((candidate) => candidate.key)).toContain(
      "google-imap",
    );
    expect(entry?.title).toBe("Gmail and Google Calendar (app password)");
    expect(entry?.vendor).toBe("Google");
  });

  test("it is a pasted per-person secret over the IMAP transport, for Gmail only", () => {
    expect(entry?.transport).toBe("google-imap");
    expect(entry?.auth).toEqual({ kind: "user-secret", preset: "gmail" });
    // No OAuth fields can be carried by it: nothing here is a client, a scope or a consent screen.
    expect(Object.keys(entry?.auth ?? {}).sort()).toEqual(["kind", "preset"]);
  });

  test("the OAuth entry is exactly what it was", () => {
    expect(oauth?.transport).toBe("google-workspace-rest");
    expect(oauth?.auth.kind).toBe("user-oauth");
    expect(oauth?.host).toBe("https://www.googleapis.com");
  });

  test("it resolves to a row address and the row's access is the asker's own pasted secret", () => {
    const resolved = resolveServerUrl(GOOGLE_APP_PASSWORD);
    expect(resolved?.entry.key).toBe(GOOGLE_APP_PASSWORD);
    const access = accessFor(
      {
        id: GOOGLE_APP_PASSWORD,
        url: resolved?.url ?? "",
        provenance: "first-party",
        authScheme: null,
      } as never,
      entry,
    );
    expect(access.credential).toBe("person-secret");
    expect(access.reachedAs).toBe("person");
    expect(access.transport).toBe("google-imap");
    expect(access.toolkit).toBeNull();
  });

  test("the registry routes the entry to the IMAP transport and not the REST one", () => {
    const transport = transportFor("google-imap");
    expect(transport).not.toBe(transportFor("google-workspace-rest"));
    expect(transport.listNeedsCredential).toBe(false);
  });

  test("the only provider is Gmail, and its hosts are pinned over implicit TLS", () => {
    expect(Object.keys(MAIL_PRESETS)).toEqual(["gmail"]);
    expect(MAIL_PRESETS.gmail.imap).toEqual({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
    });
    expect(MAIL_PRESETS.gmail.smtp).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
    });
    expect(MAIL_PRESETS.gmail.ical).toEqual({
      host: "calendar.google.com",
      pathPrefix: "/calendar/ical/",
    });
  });
});

describe("(b) the approval gate treats sending an email, a reply or a new one, as a write", () => {
  const READS = [
    "gmail_search_messages",
    "gmail_read_message",
    "calendar_list_events",
  ];

  test("its lists are the OAuth entry's, name for name", () => {
    expect(entry?.readTools).toEqual(oauth?.readTools);
    expect(entry?.writeTools).toEqual(oauth?.writeTools);
    expect(entry?.readTools).toEqual(READS);
    expect(entry?.writeTools).toEqual([
      "gmail_send_reply",
      "gmail_send_message",
    ]);
  });

  test("gmail_send_reply is a write, and a recorded read cannot narrow it", () => {
    expect(classifyTool(entry, "gmail_send_reply", true)).toBe("write");
    expect(classifyTool(entry, "gmail_send_reply", true, "read")).toBe("write");
    expect(classifyTool(entry, "gmail_send_reply", true, null)).toBe("write");
    expect(classifyTool(entry, "gmail_send_reply", true, "")).toBe("write");
  });

  test("gmail_send_message is a write on both entries, and a recorded read cannot narrow it", () => {
    for (const candidate of [entry, oauth]) {
      expect(classifyTool(candidate, "gmail_send_message", true)).toBe("write");
      expect(classifyTool(candidate, "gmail_send_message", true, "read")).toBe(
        "write",
      );
      expect(classifyTool(candidate, "gmail_send_message", true, null)).toBe(
        "write",
      );
      expect(classifyTool(candidate, "gmail_send_message", true, "")).toBe(
        "write",
      );
      expect(classifyTool(candidate, "gmail_send_message", false)).toBe(
        "write",
      );
    }
  });

  test("the three reads are reads, and a tool nobody listed is a write however it is advertised", () => {
    for (const name of READS) {
      expect(classifyTool(entry, name, true)).toBe("read");
    }
    // The tools an app password could do and this connector does not: a model naming one is a
    // write, never a read, and nothing implements it anyway.
    for (const name of [
      "gmail_delete_message",
      "gmail_move_message",
      "gmail_mark_read",
      "gmail_add_label",
      "gmail_forward_message",
      "calendar_create_event",
    ]) {
      expect(classifyTool(entry, name, true)).toBe("write");
      expect(classifyTool(entry, name, false)).toBe("write");
      // Not even a vendor-recorded read can rescue a name the entry's list does not hold.
      expect(classifyTool(entry, name, true, "read")).toBe("write");
    }
    expect(classifyTool(entry, "gmail_search_messages", false)).toBe("write");
  });

  test("the transport offers the same five tools the OAuth adapter does, and no sixth", async () => {
    const imap = await imapListTools();
    const rest = await restListTools({ url: "" });
    expect(imap.map((tool) => tool.name)).toEqual(
      rest.map((tool) => tool.name),
    );
    expect(imap).toEqual(rest);
    expect(imap.map((tool) => tool.name).sort()).toEqual(
      [...READS, "gmail_send_reply", "gmail_send_message"].sort(),
    );
    // Every tool it offers is on one of the entry's two lists, so none can classify by default.
    const named = new Set([
      ...(entry?.readTools ?? []),
      ...(entry?.writeTools ?? []),
    ]);
    for (const tool of imap) expect(named.has(tool.name)).toBe(true);
    const writes = imap
      .filter((tool) => classifyTool(entry, tool.name, true) === "write")
      .map((tool) => tool.name);
    expect(writes.sort()).toEqual(["gmail_send_message", "gmail_send_reply"]);
  });

  test("the gate's built-in safety words do not read the entry's own key as a credential change, so a reply can be approved", () => {
    const asked = (key: string) => ({
      actorId: "user_maya",
      botId: "bot_leo",
      toolRef: `${key}/gmail_send_reply`,
      effect: "write",
      scope: key,
      args: {
        threadId: "18f3a0c2d4e5b600",
        inReplyTo: "18f3a0c2d4e5b601",
        to: ["ana@example.com"],
        subject: "Friday",
        body: "Yes, Friday works.",
      },
      target: {
        serverId: key,
        toolName: "gmail_send_reply",
        url: "https://imap.gmail.com/",
        effect: "write",
      },
    });
    expect(safetyRequirement(asked(GOOGLE_APP_PASSWORD))).toBeUndefined();
    // The reason the key is not `google-app-password`: under that name the same send is handed to
    // the person to do themselves, and nothing in the chat could ever approve it.
    expect(safetyRequirement(asked("google-app-password"))?.id).toBe(
      "credentials",
    );
  });
});
