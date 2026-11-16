import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ApprovalCard } from "@/components/approvals/approval-card";
import { ApprovalLanguageValue } from "@/freeduet/person-language/approval-language";
import {
  approvalOutcome,
  decisionReceipt,
  describeApproval,
} from "@/lib/approval-view";
import type { ApprovalRequest } from "@/lib/approvals";

/**
 * D50: the whole approval card, the part a person reads in order to decide, is drawn in the person's
 * language: title, what happens, the reason and the buttons. English is today's text exactly, and a
 * language with no catalogue reads English.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(() => cleanup());
afterAll(() => GlobalRegistrator.unregister());

const REMOTE =
  "You sent this from a browser that is not paired with the computer FreeDuet runs on, so it always asks you first, whatever Full access or your saved rules say. A browser paired at the computer works as before.";
const ROUTINE =
  "This came from a routine or a trigger running on its own, not from a message you sent, so it always asks you first.";
const PAYMENTS =
  "Paying, purchasing or moving money is always done by the person.";
const ASKED = "You asked to review changes before they happen.";

function request(
  toolRef: string,
  args: Record<string, unknown>,
  policy: { behaviour?: string; source?: string; reason?: string } = {},
  details?: { messages: { from: string; subject: string }[]; missing: number },
): ApprovalRequest {
  return {
    id: "approval-1",
    status: "pending",
    decision: null,
    result: null,
    createdAt: new Date().toISOString(),
    decidedAt: null,
    action: {
      botId: "bot-1",
      toolRef,
      effect: "write",
      scope: "*",
      threadId: "t",
      args,
      target: {},
      ...(details ? { details } : {}),
      policy: {
        behaviour: "ask",
        source: "default",
        reason: ASKED,
        ...policy,
      },
    },
  } as unknown as ApprovalRequest;
}

const IMAP = (tool: string) => `google-imap/${tool}`;
const two = { messages: [{ from: "Ana", subject: "Fattura" }], missing: 0 };

function draw(language: string | null, req: ApprovalRequest) {
  return render(
    <ApprovalLanguageValue language={language}>
      <ApprovalCard onDecide={() => {}} request={req} />
    </ApprovalLanguageValue>,
  ).container.textContent as string;
}

const CASES: {
  name: string;
  make: () => ApprovalRequest;
  en: string[];
  it: string[];
  de: string[];
  fr: string[];
}[] = [
  {
    name: "create label",
    make: () => request(IMAP("gmail_create_label"), { name: "GitHub" }),
    en: [
      "Create the label \u201cGitHub\u201d",
      "A new, empty label is added to your Gmail. No message is changed.",
    ],
    it: [
      "Crea l'etichetta \u201cGitHub\u201d",
      "Viene aggiunta a Gmail una nuova etichetta vuota",
    ],
    de: ["Label \u201cGitHub\u201d erstellen", "leeres Label"],
    fr: ["Créer le libellé \u201cGitHub\u201d", "libellé vide"],
  },
  {
    name: "archive 17",
    make: () =>
      request(IMAP("gmail_archive_messages"), {
        messageIds: Array.from({ length: 17 }, (_, i) => `id${i}`),
      }),
    en: ["Archive 17 messages", "Nothing is deleted."],
    it: ["Archivia 17 messaggi", "Non viene cancellato nulla."],
    de: ["17 Nachrichten archivieren", "Nichts wird gelöscht."],
    fr: ["Archiver 17 messages", "Rien n'est supprimé."],
  },
  {
    name: "spam 1",
    make: () =>
      request(IMAP("gmail_spam_messages"), { messageIds: ["a"] }, {}, two),
    en: [
      "Move 1 message to Spam",
      "Gmail deletes mail in Spam after about 30 days",
    ],
    it: ["Sposta 1 messaggio in Spam", "Gmail cancella la posta in Spam"],
    de: ["1 Nachricht in den Spam verschieben", "Gmail löscht Spam"],
    fr: ["Déplacer 1 message dans les Spams", "Gmail supprime"],
  },
  {
    name: "bin 3",
    make: () =>
      request(IMAP("gmail_bin_messages"), { messageIds: ["a", "b", "c"] }),
    en: ["Move 3 messages to the Bin", "restore them"],
    it: ["Sposta 3 messaggi nel Cestino", "ripristinarli"],
    de: ["3 Nachrichten in den Papierkorb verschieben", "wiederherstellen"],
    fr: ["Déplacer 3 messages dans la Corbeille", "restaurer"],
  },
  {
    name: "create mail rule",
    make: () =>
      request(IMAP("gmail_create_rule"), {
        fromAddress: "news@example.org",
        archive: true,
      }),
    en: [
      "Create a mail rule",
      "From now on, mail from news@example.org: archive.",
      "It is not a Gmail filter.",
    ],
    it: [
      "Crea una regola per la posta",
      "D'ora in poi, la posta da news@example.org: archivia.",
      "Non è un filtro di Gmail.",
    ],
    de: [
      "Mail-Regel erstellen",
      "von news@example.org: archivieren",
      "kein Gmail-Filter",
    ],
    fr: [
      "Créer une règle de messagerie",
      "de news@example.org : archiver",
      "pas un filtre Gmail",
    ],
  },
  {
    name: "a send",
    make: () =>
      request("openbot/share_private_information", {
        audience: "google-imap: ana@example.org",
        to: "ana@example.org",
        subject: "Ciao",
        body: "Testo",
      }),
    en: ["Send email"],
    it: ["Invia un'email"],
    de: ["E-Mail senden"],
    fr: ["Envoyer un e-mail"],
  },
  {
    name: "a payment-class action, handed to the person",
    make: () =>
      request(
        "mcp/shop/place_order",
        { item: "x" },
        { behaviour: "hand_off", source: "safety", reason: PAYMENTS },
      ),
    en: ["Handed to you: Paying, purchasing"],
    it: [
      "Handed to you: Pagare, acquistare o spostare denaro lo fai sempre tu.",
    ],
    de: [
      "Handed to you: Zahlen, Kaufen oder Geld bewegen machst immer du selbst.",
    ],
    fr: ["Handed to you: Payer, acheter ou déplacer de l'argent"],
  },
  {
    name: "the not-paired browser reason",
    make: () =>
      request(
        IMAP("gmail_archive_messages"),
        { messageIds: ["a"] },
        { source: "always_ask", reason: REMOTE },
      ),
    en: [REMOTE],
    it: ["Questo l'hai inviato da un browser non abbinato al computer"],
    de: [
      "Das hast du von einem Browser gesendet, der nicht mit dem Computer gekoppelt ist",
    ],
    fr: [
      "Tu as envoyé ceci depuis un navigateur qui n'est pas associé à l'ordinateur",
    ],
  },
  {
    name: "the routine reason",
    make: () =>
      request(
        IMAP("gmail_archive_messages"),
        { messageIds: ["a"] },
        { source: "always_ask", reason: ROUTINE },
      ),
    en: [ROUTINE],
    it: ["Questa richiesta arriva da una routine o da un trigger"],
    de: ["Das kommt von einer Routine oder einem Trigger"],
    fr: ["Cela vient d'une routine ou d'un déclencheur"],
  },
];

for (const c of CASES) {
  test(`${c.name}: English is today's text; Italian, German and French are theirs`, () => {
    for (const language of ["en", "it", "de", "fr"] as const) {
      const text = draw(language, c.make());
      for (const part of c[language]) expect(text).toContain(part);
    }
    // No provider, null and a language with no catalogue draw exactly the English.
    const english = draw("en", c.make());
    expect(draw(null, c.make())).toBe(english);
    expect(draw("ar", c.make())).toBe(english);
  });
}

test("the app's own words stay English in every language: buttons and labels", () => {
  const req = request(IMAP("gmail_archive_messages"), { messageIds: ["a"] });
  for (const language of ["en", "it", "de", "fr", "ja"]) {
    const text = draw(language, req);
    for (const word of [
      "Refuse",
      "Allow once",
      "Always allow",
      "Details",
      "What happens",
    ])
      expect(text).toContain(word);
  }
  const body = "x".repeat(700);
  const long = request("mcp/gmail/send_email", { to: "a@b.c", body });
  expect(draw("it", long)).toContain("Show all 700 characters");
  const hand = request(
    "mcp/shop/place_order",
    {},
    { behaviour: "hand_off", source: "safety", reason: PAYMENTS },
  );
  const text = draw("de", hand);
  expect(text).toContain("This needs you:");
  expect(text).toContain("I did it myself");
});

test("a reason the reviewer wrote, and a card stored before this existed, are shown as stored", () => {
  const written = "Non c'è nessun testo della richiesta per questa modifica.";
  const reviewer = request(
    IMAP("gmail_archive_messages"),
    { messageIds: ["a"] },
    { reason: written },
  );
  expect(draw("it", reviewer)).toContain(written);
  const old = request(
    IMAP("gmail_archive_messages"),
    { messageIds: ["a"] },
    { reason: "A sentence an older build wrote." },
  );
  expect(draw("it", old)).toContain("A sentence an older build wrote.");
  // No `language` anywhere on a card made before: it still renders, in English.
  expect(draw(null, old)).toContain("Archive 1 message");
});

test("a card made before this existed still renders, and the pill and receipt words stay English", () => {
  const done = {
    ...request(IMAP("gmail_archive_messages"), { messageIds: ["a"] }),
    status: "completed",
    decision: "allow_once",
  } as unknown as ApprovalRequest;
  expect(decisionReceipt(done)).toBe("Allowed once by you");
  expect(approvalOutcome(done)?.label).toBe("Done");
  expect(describeApproval(done, "xx").title).toBe("Archive 1 message");
  expect(describeApproval(done, "it").title).toBe("Archivia 1 messaggio");
});

test("the provider takes the language from the approvals inbox the app already holds", async () => {
  const { QueryClient, QueryClientProvider } = await import(
    "@tanstack/react-query"
  );
  const { ApprovalLanguageProvider } = await import(
    "@/freeduet/person-language/approval-language"
  );
  const seeded = (language?: string) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    queryClient.setQueryData(["approvals"], {
      ...(language ? { language } : {}),
      enabled: true,
      requests: [],
      rules: [],
      teamRules: [],
      questions: [],
    });
    return queryClient;
  };
  const drawn = (language?: string) =>
    render(
      <QueryClientProvider client={seeded(language)}>
        <ApprovalLanguageProvider>
          <ApprovalCard
            onDecide={() => {}}
            request={request(IMAP("gmail_create_label"), { name: "X" })}
          />
        </ApprovalLanguageProvider>
      </QueryClientProvider>,
    ).container.textContent as string;
  expect(drawn("it")).toContain("Crea l'etichetta");
  cleanup();
  expect(drawn("de")).toContain("Label \u201cX\u201d erstellen");
  cleanup();
  expect(drawn()).toContain("Create the label");
});
