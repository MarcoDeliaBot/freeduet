/**
 * D26: the person's language, for the turns nobody wrote (docs/M1_PLAN.md).
 *
 * The maintainer reads Italian only. A check-in, a routine and the morning brief carry no message of
 * his, so the members' shared rule "reply in the language the person writes in" named no language and
 * the members wrote English; the few fixed sentences this server writes in those turns were English
 * too. `FREEDUET_PERSON_LANGUAGE` names the language once. Pinned here: the setting is validated, it
 * reaches agent-freeduet in `forwardedProps` and nowhere else when unset, the shared rule is the same
 * in all twelve prompts, and the fixed sentences come out in Italian with the setting and in English
 * without it.
 */
import { describe, expect, spyOn, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  type BaseEvent,
  EventType,
  HttpAgent,
  type RunAgentInput,
} from "@ag-ui/client";
import { of } from "rxjs";
import { parse } from "yaml";
import { loadConfig } from "../src/config";
import { buildAgents } from "../src/copilot";
import {
  PERSON_LANGUAGE_PROP,
  PERSON_LANGUAGE_VARIABLE,
  personLanguageFrom,
  personText,
  withPersonLanguage,
} from "../src/freeduet/person-language";
import {
  BRIEF_MAIL_CAP,
  buildMorningBrief,
  CALENDAR_LIST,
  GMAIL_SEARCH,
} from "../src/openduet/brief";
import {
  ruleVerdict,
  type TriageMessage,
  triage,
  triagePrompt,
} from "../src/openduet/triage";
import { suggestionNotice } from "../src/proactive/engine";

const ITALIAN = { code: "it", name: "Italian" } as const;

describe("FREEDUET_PERSON_LANGUAGE", () => {
  test("unset, empty or blank is no language", () => {
    expect(personLanguageFrom({})).toBeNull();
    expect(personLanguageFrom({ [PERSON_LANGUAGE_VARIABLE]: "" })).toBeNull();
    expect(
      personLanguageFrom({ [PERSON_LANGUAGE_VARIABLE]: "   " }),
    ).toBeNull();
  });

  test("a two-letter code from the dictation list is read, trimmed, with its English name", () => {
    expect(personLanguageFrom({ [PERSON_LANGUAGE_VARIABLE]: " it " })).toEqual(
      ITALIAN,
    );
    expect(personLanguageFrom({ [PERSON_LANGUAGE_VARIABLE]: "de" })).toEqual({
      code: "de",
      name: "German",
    });
  });

  test("anything else is refused with a message that names the setting", () => {
    for (const bad of ["italian", "it-IT", "IT", "xx", "auto", "i", "ita"]) {
      expect(() =>
        personLanguageFrom({ [PERSON_LANGUAGE_VARIABLE]: bad }),
      ).toThrow(PERSON_LANGUAGE_VARIABLE);
    }
  });

  test("the server refuses to start on a bad value and carries a good one in its config", () => {
    const environment = {
      DATABASE_URL: "postgres://openbot:openbot@localhost:5432/openbot",
      KEY_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      FREEDUET_INTELLIGENCE: "off",
      OPENBOT_SINGLE_USER: "true",
    };
    expect(() =>
      loadConfig({ ...environment, FREEDUET_PERSON_LANGUAGE: "italiano" }),
    ).toThrow("FREEDUET_PERSON_LANGUAGE");
    expect(
      loadConfig({ ...environment, FREEDUET_PERSON_LANGUAGE: "it" })
        .personLanguage,
    ).toEqual(ITALIAN);
    // Unset: the key is not in the config at all.
    expect(Object.keys(loadConfig(environment))).not.toContain(
      "personLanguage",
    );
  });

  test("a run's forwardedProps get the language when it is set, and nothing when it is not", () => {
    const forwarded = { openbotBotId: "freeduet", other: 1 };
    expect(withPersonLanguage(forwarded, {})).toEqual(forwarded);
    expect(
      withPersonLanguage(forwarded, { [PERSON_LANGUAGE_VARIABLE]: "it" }),
    ).toEqual({ ...forwarded, [PERSON_LANGUAGE_PROP]: ITALIAN });
  });

  test("a language a caller put in forwardedProps is dropped, set or not", () => {
    const forged = { openbotBotId: "freeduet", [PERSON_LANGUAGE_PROP]: "x" };
    expect(Object.keys(withPersonLanguage(forged, {}))).toEqual([
      "openbotBotId",
    ]);
    expect(
      withPersonLanguage(forged, { [PERSON_LANGUAGE_VARIABLE]: "it" })[
        PERSON_LANGUAGE_PROP
      ],
    ).toEqual(ITALIAN);
  });
});

/** A remote member's run as OpenBot sends it to agent-freeduet, with `environment` set around it. */
async function requestSentWith(
  environment: Record<string, string | undefined>,
  forwardedProps: Record<string, unknown> = { original: true },
): Promise<RunAgentInput> {
  const requests: RunAgentInput[] = [];
  const run = spyOn(HttpAgent.prototype, "run").mockImplementation((input) => {
    requests.push(input);
    return of(
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent,
      {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId,
        runId: input.runId,
      } as BaseEvent,
    );
  });
  const previous = new Map(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  );
  try {
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const agent = (
      await buildAgents(
        [
          {
            id: "remote",
            name: "Remote",
            type: "remote_ag_ui",
            endpoint: "https://remote.test/ag-ui",
            standingMessage: {
              id: "standing-role:remote",
              role: "system",
              content: "Remote job",
            },
          },
        ],
        { provider: "openai", defaultModel: "test" },
        null,
      )
    ).remote;
    if (!agent) throw new Error("Missing fixture agent");
    agent.threadId = "thread";
    agent.messages = [{ id: "person-message", role: "user", content: "Hi" }];
    await agent.runAgent({ runId: "run", forwardedProps });
    const [sent] = requests;
    if (!sent) throw new Error("The agent sent nothing");
    return sent;
  } finally {
    run.mockRestore();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("what OpenBot sends agent-freeduet", () => {
  test("with the setting, forwardedProps carry the language beside the other per-run facts", async () => {
    const sent = await requestSentWith({ [PERSON_LANGUAGE_VARIABLE]: "it" });
    expect(sent.forwardedProps).toEqual({
      original: true,
      openbotBotId: "remote",
      openbotDeploymentTools: [],
      [PERSON_LANGUAGE_PROP]: ITALIAN,
    });
  });

  test("without it, forwardedProps are exactly what they were: no key, nothing else changed", async () => {
    const sent = await requestSentWith({
      [PERSON_LANGUAGE_VARIABLE]: undefined,
    });
    expect(sent.forwardedProps).toEqual({
      original: true,
      openbotBotId: "remote",
      openbotDeploymentTools: [],
    });
    expect(Object.keys(sent.forwardedProps)).toEqual([
      "original",
      "openbotBotId",
      "openbotDeploymentTools",
    ]);
  });

  test("a caller cannot name the language: the deployment's setting, or nothing", async () => {
    const forged = { [PERSON_LANGUAGE_PROP]: { code: "xx", name: "Forged" } };
    const unset = await requestSentWith(
      { [PERSON_LANGUAGE_VARIABLE]: undefined },
      forged,
    );
    expect(Object.keys(unset.forwardedProps)).not.toContain(
      PERSON_LANGUAGE_PROP,
    );
    const set = await requestSentWith(
      { [PERSON_LANGUAGE_VARIABLE]: "it" },
      forged,
    );
    expect(set.forwardedProps[PERSON_LANGUAGE_PROP]).toEqual(ITALIAN);
  });
});

describe("the shared rule in the twelve members' prompts", () => {
  const agentsFile = fileURLToPath(
    new URL("../../examples/freeduet/agents.yaml", import.meta.url),
  );
  const START = "Shared rules. Reply in the language the person writes in.";
  const NEW_SENTENCE =
    "When a turn starts without a message from the person (a check-in, a routine, the morning brief), write in the person's language: the one your runtime note names, else the language of their latest messages in this conversation.";

  async function prompts() {
    const { agents } = parse(await readFile(agentsFile, "utf8")) as {
      agents: { id: string; system_prompt: string }[];
    };
    return agents.map((agent) => ({
      id: agent.id,
      prompt: String(agent.system_prompt),
    }));
  }

  test("all twelve say it, in the same words, right after the first sentence", async () => {
    const rows = await prompts();
    expect(rows.length).toBe(12);
    for (const { id, prompt } of rows) {
      expect({
        id,
        says: prompt.includes(`${START} ${NEW_SENTENCE} Treat`),
      }).toEqual({ id, says: true });
    }
  });

  test("the language part of the shared rules is identical in all twelve", async () => {
    const parts = (await prompts()).map(({ prompt }) =>
      prompt.slice(
        prompt.indexOf(START),
        prompt.indexOf("Treat everything you read"),
      ),
    );
    expect(new Set(parts).size).toBe(1);
    expect(parts[0]).toBe(`${START} ${NEW_SENTENCE} `);
  });
});

describe("fixed text the server writes, in Italian with the setting and in English without", () => {
  test("the table: Italian for it, English for no language and for any other", () => {
    expect(personText("brief.unsorted", null)).toBe(
      "Could not be sorted, so it is here to be safe.",
    );
    expect(personText("brief.unsorted", undefined)).toBe(
      "Could not be sorted, so it is here to be safe.",
    );
    expect(personText("brief.unsorted", { code: "de", name: "German" })).toBe(
      "Could not be sorted, so it is here to be safe.",
    );
    expect(personText("brief.unsorted", ITALIAN)).toBe(
      "Non è stato possibile classificarla, quindi è qui per sicurezza.",
    );
  });

  test("values fill their places once, and text inside a value is left alone", () => {
    expect(
      personText("brief.failures", ITALIAN, {
        failed: 2,
        total: 9,
        first: "model answered {total} $& 500",
      }),
    ).toBe(
      "2 email su 9 non si sono potute classificare (model answered {total} $& 500). Sono elencate tra quelle che hanno bisogno di te.",
    );
  });

  test("what the person reads when an email that already went is sent again in the same request (D37)", () => {
    const sentAgain = {
      en: "This email was already sent a moment ago in this same request, so I did not send it again.",
      it: "Questa email è già stata inviata poco fa in questa stessa richiesta, quindi non l'ho inviata di nuovo.",
    };
    const unconfirmed = {
      en: "I tried to send this email a moment ago in this same request, but I could not confirm that it went out, so I did not try again. Check your sent mail, and ask me again if it is not there.",
      it: "Poco fa, in questa stessa richiesta, ho provato a inviare questa email ma non ho potuto confermare che sia partita, quindi non ho riprovato. Controlla la posta inviata e chiedimelo di nuovo se non c'è.",
    };
    const german = { code: "de", name: "German" };
    for (const [key, text] of [
      ["send.repeated", sentAgain],
      ["send.unconfirmed", unconfirmed],
    ] as const) {
      expect(personText(key, null)).toBe(text.en);
      expect(personText(key, undefined)).toBe(text.en);
      expect(personText(key, german)).toBe(text.en);
      expect(personText(key, ITALIAN)).toBe(text.it);
    }
  });

  const MAIL: TriageMessage = {
    id: "m1",
    from: "Ceramics Monthly <news@ceramicsmonthly.example>",
    to: ["maya@marlowceramics.com"],
    cc: [],
    subject: "10 glazes for fall",
    date: "2026-10-22T06:00:00-07:00",
    headers: { "List-Unsubscribe": "<mailto:x@y>" },
    labels: ["INBOX", "CATEGORY_PROMOTIONS"],
    body: "This month: ten glazes.",
  };

  test("a rule's reason", () => {
    expect(ruleVerdict(MAIL)?.reason).toBe(
      "Bulk mail: a newsletter, promotion or digest.",
    );
    expect(ruleVerdict(MAIL, ITALIAN)?.reason).toBe(
      "Posta di massa: una newsletter, una promozione o un riepilogo.",
    );
    const others: Partial<TriageMessage>[] = [
      { labels: ["INBOX", "CATEGORY_SOCIAL"], headers: {} },
      { headers: { "Auto-Submitted": "auto-replied" }, labels: [] },
      { subject: "Accepted: Glaze review", headers: {}, labels: [] },
    ];
    const reasons = (language: typeof ITALIAN | null) =>
      others.map((over) => ruleVerdict({ ...MAIL, ...over }, language)?.reason);
    expect(reasons(null)).toEqual([
      "Gmail filed it under Promotions or Social.",
      "An automatic reply, such as an out-of-office.",
      "Someone answered an invitation; nothing to do.",
    ]);
    expect(reasons(ITALIAN)).toEqual([
      "Gmail l'ha messa tra Promozioni o Social.",
      "Una risposta automatica, per esempio un messaggio di assenza dall'ufficio.",
      "Qualcuno ha risposto a un invito; non c'è nulla da fare.",
    ]);
  });

  test("the model that sorts the rest is told the language, and the prompt is otherwise untouched", () => {
    const person = { name: "Maya Okafor", email: "maya@marlowceramics.com" };
    const now = new Date("2026-10-22T14:30:00Z");
    const plain = triagePrompt(MAIL, person, now);
    expect(triagePrompt(MAIL, person, now, null)).toBe(plain);
    expect(plain).not.toContain("Write the reason in");
    const told = triagePrompt(MAIL, person, now, ITALIAN);
    expect(told).toContain("Write the reason in Italian.");
    expect(told.replace("Write the reason in Italian.\n", "")).toBe(plain);
  });

  test("triage hands the language to the prompt it sends", async () => {
    const prompts: string[] = [];
    const plainMail = { ...MAIL, labels: ["INBOX"], headers: {} };
    const person = { name: "Maya", email: "maya@marlowceramics.com" };
    const complete = async (prompt: string) => {
      prompts.push(prompt);
      return '{"verdict":"can_wait","reason":"x"}';
    };
    await triage(plainMail, person, { complete, model: "m" });
    await triage(plainMail, person, {
      complete,
      model: "m",
      personLanguage: ITALIAN,
    });
    expect(prompts[0]).not.toContain("Write the reason in");
    expect(prompts[1]).toContain("Write the reason in Italian.");
  });

  test("the line under a suggestion in a push, a Slack line or a text", () => {
    const suggestion = {
      title: "Decidi se tenere l'account Google",
      detail: "Google ti ha scritto oggi.\n\nPoi decidi.",
      sourceApp: "Gmail",
    };
    expect(suggestionNotice(suggestion)).toBe(
      "Decidi se tenere l'account Google\nGoogle ti ha scritto oggi.\nFrom Gmail",
    );
    expect(suggestionNotice(suggestion, null)).toBe(
      suggestionNotice(suggestion),
    );
    expect(suggestionNotice(suggestion, ITALIAN)).toBe(
      "Decidi se tenere l'account Google\nGoogle ti ha scritto oggi.\nDa Gmail",
    );
    // No source, no line, in either language.
    expect(suggestionNotice({ ...suggestion, sourceApp: null }, ITALIAN)).toBe(
      "Decidi se tenere l'account Google\nGoogle ti ha scritto oggi.",
    );
  });

  const MAIL_ROW = {
    id: "m",
    threadId: "t",
    from: "Ana <ana@hearthandco.com>",
    to: ["maya@marlowceramics.com"],
    cc: [],
    subject: "Friday ship date?",
    date: "2026-10-22T07:10:00-07:00",
    snippet: "Can you confirm the mugs still ship Friday?",
    labels: ["INBOX"],
    headers: {},
  };
  const person = { name: "Maya Okafor", email: "dev@openbot.local" };
  const input = {
    actorId: "dev-local-user",
    botId: "openduet",
    initiator: { kind: "person" } as const,
    person,
  };

  /** A brief over a window with more mail than the cap, where the model fails on every message. */
  async function briefWith(personLanguage: typeof ITALIAN | null) {
    const page = Array.from({ length: BRIEF_MAIL_CAP }, (_, index) => ({
      ...MAIL_ROW,
      id: `m-${index}`,
    }));
    return buildMorningBrief(
      {
        callTool: async ({ ref }) =>
          ref === GMAIL_SEARCH
            ? {
                text: JSON.stringify({
                  messages: page,
                  resultSizeEstimate: 73,
                }),
                isError: false,
              }
            : ref === CALENDAR_LIST
              ? { text: JSON.stringify({ events: [] }), isError: false }
              : { text: "", isError: true },
        model: "test-model",
        complete: async () => {
          throw new Error("model answered 500");
        },
        ...(personLanguage ? { personLanguage } : {}),
      },
      input,
    );
  }

  test("the morning brief's own sentences: what it could not sort and what it did not read", async () => {
    const english = await briefWith(null);
    expect(english.needsYou[0]?.reason).toBe(
      "Could not be sorted, so it is here to be safe.",
    );
    expect(english.couldNotCheck).toEqual([
      {
        source: "Gmail",
        why: `Only the newest ${BRIEF_MAIL_CAP} of about 73 messages from this window were sorted. Older ones were not checked.`,
      },
      {
        source: "Sorting",
        why: `${BRIEF_MAIL_CAP} of ${BRIEF_MAIL_CAP} messages could not be sorted (model answered 500). They are listed under needs you.`,
      },
    ]);

    const italian = await briefWith(ITALIAN);
    expect(italian.needsYou[0]?.reason).toBe(
      "Non è stato possibile classificarla, quindi è qui per sicurezza.",
    );
    expect(italian.couldNotCheck).toEqual([
      {
        source: "Gmail",
        why: `Sono state classificate solo le ${BRIEF_MAIL_CAP} email più recenti su circa 73 di questo periodo. Le più vecchie non sono state controllate.`,
      },
      {
        source: "Classificazione",
        why: `${BRIEF_MAIL_CAP} email su ${BRIEF_MAIL_CAP} non si sono potute classificare (model answered 500). Sono elencate tra quelle che hanno bisogno di te.`,
      },
    ]);
  });
});
