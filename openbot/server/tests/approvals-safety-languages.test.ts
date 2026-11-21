import { describe, expect, test } from "bun:test";
import {
  decideAction,
  safetyRequirement,
  toolNameHitsSafetyWords,
} from "../src/approvals/policy";
import type { ApprovalCandidate } from "../src/approvals/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderPythonMirror } from "../src/approvals/safety-words";
import fixture from "./fixtures/approval-languages.json";

/**
 * D131: the fixed rule for payments, credentials and security settings reads the ten site languages
 * added after English and Italian. Every phrase is in `fixtures/approval-languages.json` (also read by the
 * agent-freeduet test of the cannot guard's mirror). Each one is driven through the REAL gate, `decideAction`,
 * with no rule, no review and no Full access: the answer must be a hand-off to the person from the safety
 * floor. The `ordinary` phrases of every language must pass through the gate of every language.
 */

type Group = "payments" | "credentials" | "security";
const GROUPS: readonly [Group, string][] = [
  ["credentials", "credentials"],
  ["security", "security_settings"],
  ["payments", "payments"],
];
const langs = Object.keys(fixture).filter((key) => key !== "_");
const data = fixture as unknown as Record<
  string,
  Record<Group | "ordinary", string[]>
>;

const nothing = {
  team: [],
  personal: [],
  customRulesEnabled: false,
  autoReview: false,
  askBeforeChanges: false,
};

/** A label on a page, as the computer gateway hands it to the gate: only the label can stop it. */
const onPage = (label: string): ApprovalCandidate => ({
  actorId: "owner",
  botId: "bot",
  toolRef: "computer_click",
  effect: "write",
  scope: "shop.example",
  args: { ref: "e7" },
  target: {
    pageUrl: "https://shop.example/page",
    element: { role: "button", name: label },
  },
});
const writeTool = (text: string): ApprovalCandidate => ({
  actorId: "owner",
  botId: "bot",
  toolRef: "mcp/docs/update_document",
  effect: "write",
  scope: "docs",
  args: { title: text, body: text },
});

describe("the real gate hands each language's phrases to the person", () => {
  for (const code of langs) {
    for (const [group, id] of GROUPS) {
      for (const phrase of data[code]?.[group] ?? []) {
        test(`${code} ${group}: "${phrase}"`, async () => {
          for (const candidate of [onPage(phrase), writeTool(phrase)]) {
            expect(safetyRequirement(candidate)?.id).toBe(id);
            const outcome = await decideAction({ ...nothing, candidate });
            expect(outcome).toMatchObject({
              behaviour: "hand_off",
              source: "safety",
            });
          }
        });
      }
    }
  }
  test("every site language has at least one phrase in each group", () => {
    expect(langs.sort()).toEqual(
      ["de", "es", "fr", "ja", "ko", "pl", "pt", "ru", "tr", "zh"].sort(),
    );
    for (const code of langs)
      for (const [group] of GROUPS)
        expect((data[code]?.[group] ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("ordinary sentences of every language are not stopped by the gate of any language", () => {
  const ordinary = langs.flatMap((code) =>
    (data[code]?.ordinary ?? []).map((phrase) => [code, phrase] as const),
  );
  for (const [code, phrase] of ordinary) {
    test(`${code}: "${phrase}"`, async () => {
      for (const candidate of [onPage(phrase), writeTool(phrase)]) {
        expect(safetyRequirement(candidate)).toBeUndefined();
        const outcome = await decideAction({ ...nothing, candidate });
        expect(outcome.behaviour).toBe("allow");
      }
    });
  }
  test("each language has at least ten", () => {
    for (const code of langs)
      expect((data[code]?.ordinary ?? []).length).toBeGreaterThanOrEqual(9);
  });
});

describe("accents, case and Unicode forms", () => {
  const cases: [string, string][] = [
    ["ÜBERWEISUNG TÄTIGEN", "payments"],
    ["Uberweisung", "payments"],
    ["Überweisung", "payments"],
    ["KREDİ KARTI", "payments"],
    ["kredi kartı", "payments"],
    ["ŞİFRE DEĞİŞTİR", "credentials"],
    ["Płátność", "payments"],
    ["PŁATNOŚĆ", "payments"],
    ["PAGO SEGURO", "payments"],
    ["Contrasena nueva", "credentials"],
    ["пароль", "credentials"],
    ["ПАРОЛЬ", "credentials"],
    ["оплатить", "payments"],
    ["ＰＡＳＳＷＯＲＤ", "credentials"],
    ["パスワード", "credentials"],
    ["ﾊﾟｽﾜｰﾄﾞ", "credentials"],
    ["pass\u200bwort", "credentials"],
    ["Zahlung\u00adsmethode", "payments"],
    ["l’achat", "payments"],
    ["Facturación", "payments"],
  ];
  for (const [text, id] of cases)
    test(`"${text.replace(/[\u200b\u00ad]/g, "?")}" is ${id}`, () => {
      expect(safetyRequirement(writeTool(text))?.id).toBe(id);
    });
});

describe("what did not change", () => {
  test("a read is never stopped, in any language", () => {
    for (const phrase of ["Jetzt bezahlen", "支払いを確定", "Сменить пароль"])
      expect(
        safetyRequirement({ ...onPage(phrase), effect: "read" }),
      ).toBeUndefined();
  });
  test("a hand-off to another member is not an account action", () => {
    expect(
      safetyRequirement({
        ...writeTool("Zahlungserinnerung für Northwind schreiben"),
        toolRef: "bot/message_bot",
        effect: "delegate",
      }),
    ).toBeUndefined();
  });
  test("the Bot's own workspace is not an account", () => {
    expect(
      safetyRequirement({
        ...writeTool("Passwort und Kreditkarte"),
        toolRef: "computer_write_file",
        scope: "workspace",
      }),
    ).toBeUndefined();
  });
  test("a tool name with these words is not taken for a read (catalogue)", () => {
    for (const name of [
      "ueberweisung_ausfuehren",
      "passwort_aendern",
      "contrasena_nueva",
      "suscripcion_crear",
      "carte_cadeau",
      "pagamento_pix",
      "przelew",
    ])
      expect(toolNameHitsSafetyWords(name)).toBe(true);
    for (const name of ["list_files", "seite_laden", "get_calendar"])
      expect(toolNameHitsSafetyWords(name)).toBe(false);
  });
  test("a money tool is known by its name in other languages", () => {
    for (const name of ["banking/ueberweisung", "shop/abonnement_erstellen"]) {
      const candidate: ApprovalCandidate = {
        ...writeTool("x"),
        toolRef: name,
        args: {},
      };
      expect(safetyRequirement(candidate)?.id).toBe("payments");
    }
  });
});

describe("the cannot guard's Python mirror", () => {
  test("safety_words_gen.py is what scripts/generate-safety-words-py.ts writes", () => {
    const file = join(
      import.meta.dir,
      "../../agent-freeduet/freeduet/safety_words_gen.py",
    );
    expect(readFileSync(file, "utf-8")).toBe(renderPythonMirror());
  });
});
