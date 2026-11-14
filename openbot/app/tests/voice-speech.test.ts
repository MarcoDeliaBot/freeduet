import { describe, expect, test } from "bun:test";
import {
  italianLocalVoice,
  pickVoice,
  READ_ALOUD_KEY,
  readAloudEnabled,
  type SpeechVoiceLike,
  setReadAloudEnabled,
  speechPlan,
  speechText,
} from "@/lib/voice/speech";

/**
 * Read aloud, docs/design/voice.md slice S1. Pure functions and a stored switch only: no browser
 * speech engine is touched, so "nothing is spoken without the switch" is decided here, where it is
 * tested. The browser's speak call is one line in `speakPlan`, and the Settings switch is one
 * component; both are checked by reading, and are not run in a browser by this suite.
 */

const itLocal: SpeechVoiceLike = {
  name: "Riccardo",
  lang: "it-IT",
  localService: true,
};
const itNetwork: SpeechVoiceLike = {
  name: "Google italiano",
  lang: "it-IT",
  localService: false,
};
const enLocal: SpeechVoiceLike = {
  name: "Samantha",
  lang: "en-US",
  localService: true,
};

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("the voice filter", () => {
  test("only a local Italian voice may read", () => {
    expect(italianLocalVoice(itLocal)).toBe(true);
    expect(italianLocalVoice({ ...itLocal, lang: "it" })).toBe(true);
    expect(italianLocalVoice({ ...itLocal, lang: "it_IT" })).toBe(true);
    // A network voice sends the text to a remote service, however Italian it is.
    expect(italianLocalVoice(itNetwork)).toBe(false);
    // An English voice is not read with, even when it is local.
    expect(italianLocalVoice(enLocal)).toBe(false);
    // A language that only starts with the same letters is not Italian.
    expect(italianLocalVoice({ ...itLocal, lang: "itx-XX" })).toBe(false);
  });

  test("the first usable voice is chosen, and no voice means none", () => {
    expect(pickVoice([enLocal, itNetwork, itLocal])).toEqual(itLocal);
    expect(pickVoice([enLocal, itNetwork])).toBeNull();
    expect(pickVoice([])).toBeNull();
  });
});

describe("the text read aloud", () => {
  test("code blocks and table rows are not read", () => {
    const reply = [
      "Ecco il comando:",
      "```bash",
      "rm -rf /tmp/x",
      "```",
      "| colonna | valore |",
      "|---|---|",
      "| a | 1 |",
      "Fatto.",
    ].join("\n");
    expect(speechText(reply)).toBe("Ecco il comando: Fatto.");
  });

  test("a code block still open while the reply streams is cut at its end", () => {
    expect(speechText("Attendi\n```ts\nconst x = 1")).toBe("Attendi");
  });

  test("a link reads as its text and a bare address is dropped", () => {
    expect(
      speechText(
        "Vedi [la guida](https://example.test/a) o https://example.test/b.",
      ),
    ).toBe("Vedi la guida o .");
  });

  test("markdown marks are removed and the words kept", () => {
    expect(
      speechText("## Titolo\n- **Primo** punto\n- usa `npm test`\n> nota"),
    ).toBe("Titolo Primo punto usa npm test nota");
  });
});

describe("what is spoken", () => {
  const voices = [itLocal];

  test("nothing is spoken while the switch is off, whatever the voice and the reply", () => {
    expect(
      speechPlan({ enabled: false, voices, reply: "Ciao, ecco la risposta." }),
    ).toBeNull();
  });

  test("nothing is spoken without a local Italian voice, even with the switch on", () => {
    expect(
      speechPlan({
        enabled: true,
        voices: [itNetwork, enLocal],
        reply: "Ciao.",
      }),
    ).toBeNull();
  });

  test("a reply with nothing left to read is not spoken", () => {
    expect(
      speechPlan({ enabled: true, voices, reply: "```\nsolo codice\n```" }),
    ).toBeNull();
  });

  test("with the switch on and a local Italian voice, the cleaned reply is spoken in that voice", () => {
    expect(
      speechPlan({ enabled: true, voices, reply: "Ciao **mondo**." }),
    ).toEqual({ text: "Ciao mondo.", voice: itLocal });
  });
});

describe("the switch, kept in this browser", () => {
  test("off by default, and off when storage is missing or refuses", () => {
    expect(readAloudEnabled(memoryStorage())).toBe(false);
    expect(readAloudEnabled(null)).toBe(false);
    expect(
      readAloudEnabled({
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      }),
    ).toBe(false);
  });

  test("turning it on is kept, and turning it off forgets it", () => {
    const storage = memoryStorage();
    setReadAloudEnabled(true, storage);
    expect(storage.getItem(READ_ALOUD_KEY)).toBe("on");
    expect(readAloudEnabled(storage)).toBe(true);
    setReadAloudEnabled(false, storage);
    expect(storage.getItem(READ_ALOUD_KEY)).toBeNull();
    expect(readAloudEnabled(storage)).toBe(false);
  });

  test("a stored value that is not the switch's own is not believed", () => {
    expect(readAloudEnabled(memoryStorage({ [READ_ALOUD_KEY]: "true" }))).toBe(
      false,
    );
  });
});
