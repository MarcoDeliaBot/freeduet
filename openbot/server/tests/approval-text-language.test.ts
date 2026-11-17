import { describe, expect, test } from "bun:test";
import {
  APPROVAL_TEXT_EN,
  APPROVAL_TEXT_IDS,
  type ApprovalTextId,
  approvalText,
  hasApprovalText,
  localizedReason,
} from "@openbot/shared/approval-text";
import {
  decideAction,
  MAILBOX_NOT_ASKED_REASON,
  MAILBOX_REVIEW_LINES,
  reasonLanguageLines,
  reviewAction,
  safetyRequirement,
} from "../src/approvals/policy";
import { REMOTE_ANSWER_SENTENCE } from "../src/approvals/remote-answer";
import type { ApprovalCandidate } from "../src/approvals/types";
import {
  AUTOMATION_CHANGE_REASON,
  REMOTE_WRITE_REASON,
  SETTING_CHANGE_REASON,
  UNATTENDED_WRITE_REASON,
} from "../src/freeduet/always-ask";
import { ASK_EVERY_TIME } from "../src/proactive/private-share";

/**
 * D50: what a person reads in order to approve or refuse is in the person's language. The catalogue
 * (shared/approval-text.ts) holds the fixed sentences; the server keeps their English form for the
 * audit trail and for the models, and the app draws the person's language from the same ids.
 */

const SITE_LANGUAGES = [
  "de",
  "es",
  "fr",
  "it",
  "ja",
  "ko",
  "pl",
  "pt",
  "ru",
  "tr",
  "zh",
] as const;

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
const forms = (id: ApprovalTextId) => {
  const entry = APPROVAL_TEXT_EN[id];
  return typeof entry === "string" ? [entry] : Object.values(entry);
};

describe("the catalogue", () => {
  test("every language of the public site has every id, with the same placeholders as English", () => {
    for (const language of SITE_LANGUAGES) {
      expect(hasApprovalText(language)).toBe(true);
      for (const id of APPROVAL_TEXT_IDS) {
        const english = placeholders(forms(id).join(" "));
        // A plural is asked with several counts; both forms must carry the placeholders of English.
        for (const count of [0, 1, 2, 5, 21]) {
          const text = approvalText(id, language, {
            count,
            name: "NAME",
            labels: 3,
            total: 9,
            value: "VALUE",
            names: "NAMES",
            when: "WHEN",
            done: "DONE",
            title: "TITLE",
            reason: "REASON",
            error: "ERROR",
          });
          expect(text.length).toBeGreaterThan(0);
          // No placeholder is left unfilled, and the values that English uses appear.
          expect(text).not.toMatch(/\{\w+\}/);
          for (const name of new Set(english)) {
            const token = {
              count: String(count),
              name: "NAME",
              labels: "3",
              total: "9",
              value: "VALUE",
              names: "NAMES",
              when: "WHEN",
              done: "DONE",
              title: "TITLE",
              reason: "REASON",
              error: "ERROR",
            }[name as string];
            if (name === "count" && id.endsWith(".title") === false) continue;
            expect(`${language}/${id}: ${text}`).toContain(token as string);
          }
        }
      }
    }
  });

  test("English is today's text, word for word, for the sentences the server stores", () => {
    expect(approvalText("reason.payments", "en")).toBe(
      "Paying, purchasing or moving money is always done by the person.",
    );
    expect(approvalText("reason.noRule", null)).toBe(
      "No rule or preference asks about this.",
    );
    expect(REMOTE_WRITE_REASON).toBe(
      "You sent this from a browser that is not paired with the computer FreeDuet runs on, so it always asks you first, whatever Full access or your saved rules say. A browser paired at the computer works as before.",
    );
    expect(UNATTENDED_WRITE_REASON).toBe(
      "This came from a routine or a trigger running on its own, not from a message you sent, so it always asks you first.",
    );
    expect(AUTOMATION_CHANGE_REASON).toBe(
      "Routines and triggers act later without you, so setting one up, changing it or deleting it always asks you first.",
    );
    expect(SETTING_CHANGE_REASON).toBe(
      "A Bot changing one of your settings from chat always asks you first, with Full access on or off.",
    );
    expect(MAILBOX_NOT_ASKED_REASON).toBe(
      "You did not ask for this change to your mailbox in your own message, so it asks you first.",
    );
    expect(ASK_EVERY_TIME.reason).toBe(
      "A new email is asked about every time. Check who it goes to and what it says, then allow this one or refuse it.",
    );
    expect(REMOTE_ANSWER_SENTENCE).toBe(
      "A browser that is not paired with the computer FreeDuet runs on can allow an ordinary request once or deny it. This one is answered at the computer, where you can read it in full. It is still waiting there.",
    );
    const credentials = safetyRequirement({
      actorId: "a",
      botId: "b",
      toolRef: "mcp/x/change_password",
      effect: "write",
      scope: "x",
      args: {},
    });
    expect(credentials?.reason).toBe(
      "Changing a password, passcode, two-factor setting, recovery code or other credential is always done by the person.",
    );
  });

  test("a language with no catalogue, and no language at all, read English", () => {
    for (const language of ["ar", "xx", "", null, undefined, "en", "EN"]) {
      expect(approvalText("label.title", language)).toBe("Create a label");
      expect(approvalText("archive.title", language, { count: 12 })).toBe(
        "Archive 12 messages",
      );
      expect(hasApprovalText(language)).toBe(false);
    }
    expect(localizedReason(REMOTE_WRITE_REASON, "ar")).toBe(
      REMOTE_WRITE_REASON,
    );
    // A region tag reads its language.
    expect(approvalText("label.title", "it-IT")).toBe("Crea un'etichetta");
  });

  test("Italian, German and French read as the maintainer's wording asks", () => {
    expect(approvalText("label.title", "it")).toBe("Crea un'etichetta");
    expect(approvalText("archive.title", "it", { count: 17 })).toBe(
      "Archivia 17 messaggi",
    );
    expect(approvalText("label.title", "de")).toBe("Label erstellen");
    expect(approvalText("archive.title", "de", { count: 17 })).toBe(
      "17 Nachrichten archivieren",
    );
    expect(approvalText("label.title", "fr")).toBe("Créer un libellé");
    expect(approvalText("archive.title", "fr", { count: 17 })).toBe(
      "Archiver 17 messages",
    );
  });

  test("plural forms follow the language", () => {
    expect(approvalText("archive.title", "it", { count: 1 })).toBe(
      "Archivia 1 messaggio",
    );
    expect(approvalText("archive.title", "it", { count: 12 })).toBe(
      "Archivia 12 messaggi",
    );
    expect(approvalText("archive.title", "ru", { count: 2 })).toBe(
      "Архивировать: 2 сообщения",
    );
    expect(approvalText("archive.title", "ru", { count: 5 })).toBe(
      "Архивировать: 5 сообщений",
    );
    expect(approvalText("archive.title", "pl", { count: 3 })).toContain("3");
  });
});

describe("a stored reason on a card", () => {
  const stored = [
    ["reason.payments", {}],
    ["reason.remoteWrite", {}],
    ["reason.unattended", {}],
    ["reason.tooLongToReview", {}],
    ["reason.mailboxNotAsked", {}],
    ["reason.reviewerUnreachable", { error: "timeout 15000ms" }],
  ] as const;

  test("a fixed reason stored in English is shown in the person's language, and only then", () => {
    for (const [id, values] of stored) {
      const english = approvalText(id, "en", values);
      for (const language of SITE_LANGUAGES) {
        const shown = localizedReason(english, language);
        expect(shown).toBe(approvalText(id, language, values));
        expect(shown).not.toBe(english);
      }
      expect(localizedReason(english, null)).toBe(english);
    }
    expect(
      localizedReason(
        approvalText("reason.reviewerUnreachable", "en", { error: "x" }),
        "it",
      ),
    ).toContain("(x)");
  });

  test("any other text is shown exactly as it was stored: a reviewer's own words, an older wording", () => {
    for (const text of [
      "No request text was available, so nothing establishes that the person asked to archive these 17 messages.",
      "Non c'è nessun testo della richiesta.",
      "An older sentence this build no longer writes.",
    ])
      expect(localizedReason(text, "it")).toBe(text);
  });
});

describe("the reviewer writes its reason in the person's language", () => {
  const candidate: ApprovalCandidate = {
    actorId: "person",
    botId: "bot",
    toolRef: "mcp/gmail/gmail_archive_messages",
    effect: "write",
    scope: "gmail",
    args: { messageIds: ["a"] },
  };
  const capture = async (
    language: { code: string; name: string } | null | undefined,
    mailbox = false,
  ) => {
    let prompt = "";
    const verdict = await reviewAction({
      model: async (text) => {
        prompt = text;
        return '{"verdict":"needs_approval","preApproved":false,"safety":"none","reason":"x"}';
      },
      candidate,
      request: "archivia",
      ...(mailbox ? { mailbox: true } : {}),
      ...(language !== undefined ? { language } : {}),
    });
    return { prompt, verdict };
  };

  test("the prompt names the language for the reason, in any language", async () => {
    for (const [code, name] of [
      ["it", "Italian"],
      ["de", "German"],
      ["fr", "French"],
      ["ar", "Arabic"],
    ] as const) {
      const { prompt } = await capture({ code, name });
      expect(prompt).toContain(`Write "reason" in ${name}`);
      expect(prompt).toContain(`${name} (${code})`);
    }
  });

  test("with no language, or English, the prompt is exactly what it was", async () => {
    const plain = (await capture(undefined)).prompt;
    expect((await capture(null)).prompt).toBe(plain);
    expect((await capture({ code: "en", name: "English" })).prompt).toBe(plain);
    expect(plain).not.toContain('Write "reason" in');
    expect(reasonLanguageLines(null)).toEqual([]);
  });

  test("the deciding lines and the verdict fields are not touched", async () => {
    const { prompt, verdict } = await capture(
      { code: "it", name: "Italian" },
      true,
    );
    for (const line of MAILBOX_REVIEW_LINES) expect(prompt).toContain(line);
    expect(prompt).toContain(
      '{"verdict": "proceed" | "needs_approval" | "hand_off", "preApproved": boolean, "safety": "none" | "credentials" | "security_settings" | "payments", "reason": string}',
    );
    expect(verdict).toEqual({
      verdict: "needs_approval",
      preApproved: false,
      safety: "none",
      reason: "x",
    });
  });

  test("decideAction hands the language to the reviewer and decides as before", async () => {
    const seen: string[] = [];
    const run = (language?: { code: string; name: string }) =>
      decideAction({
        candidate,
        team: [],
        personal: [],
        customRulesEnabled: true,
        autoReview: true,
        askBeforeChanges: false,
        ...(language ? { language } : {}),
        model: async (prompt) => {
          seen.push(prompt);
          return '{"verdict":"needs_approval","preApproved":false,"safety":"none","reason":"Perché sì."}';
        },
      });
    const withLanguage = await run({ code: "it", name: "Italian" });
    const without = await run();
    expect(seen[0]).toContain('Write "reason" in Italian');
    expect(seen[1]).not.toContain('Write "reason" in');
    expect(withLanguage.behaviour).toBe(without.behaviour);
    expect(withLanguage.source).toBe(without.source);
    expect(withLanguage.reason).toBe("Perché sì.");
  });
});
