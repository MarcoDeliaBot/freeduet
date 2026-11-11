import { describe, expect, test } from "bun:test";
import { whisperModelNames } from "@openbot/shared/whisper-models";
import { transcriptionConfig } from "../src/dictation/config";
import { createTranscriptionProvider } from "../src/dictation/provider";

const environment = {
  TRANSCRIPTION_PROVIDER: "openai-compatible",
  TRANSCRIPTION_BASE_URL: "https://speech.example/v1/",
  TRANSCRIPTION_MODEL: "speech-model",
};

describe("independent transcription configuration", () => {
  test("chat credentials and endpoints never enable dictation", () => {
    expect(
      transcriptionConfig({
        OPENAI_API_KEY: "chat-key",
        OPENAI_BASE_URL: "https://chat.example/v1",
      }),
    ).toBeUndefined();
  });
  test("requires an explicit provider, endpoint, and model", () => {
    expect(() => transcriptionConfig({ TRANSCRIPTION_API_KEY: "key" })).toThrow(
      "TRANSCRIPTION_PROVIDER",
    );
    expect(() =>
      transcriptionConfig({ TRANSCRIPTION_PROVIDER: "openai-compatible" }),
    ).toThrow("TRANSCRIPTION_BASE_URL");
    expect(() =>
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_BASE_URL: "https://user:password@speech.example/v1",
      }),
    ).toThrow("without credentials");
    expect(() =>
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_BASE_URL: "file:///tmp/audio",
      }),
    ).toThrow("HTTP(S)");
  });
  test("supports explicitly configured local services without a key", () => {
    expect(
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_BASE_URL: "http://localhost:8000/v1",
      }),
    ).toEqual({
      provider: "openai-compatible",
      baseUrl: "http://localhost:8000/v1",
      model: "speech-model",
    });
  });
});

test("sends only audio and the configured model to the independent endpoint", async () => {
  const signal = new AbortController().signal;
  const provider = createTranscriptionProvider(
    {
      provider: "openai-compatible",
      baseUrl: "https://speech.example/v1",
      model: "speech-model",
      apiKey: "speech-key",
    },
    async (url, init) => {
      expect(url).toBe("https://speech.example/v1/audio/transcriptions");
      expect(init.signal).toBe(signal);
      expect(init.redirect).toBe("error");
      expect(new Headers(init.headers).get("authorization")).toBe(
        "Bearer speech-key",
      );
      expect(init.body).toBeInstanceOf(FormData);
      if (!(init.body instanceof FormData))
        throw new Error("Expected multipart");
      expect(init.body.get("model")).toBe("speech-model");
      expect(init.body.get("file")).toBeInstanceOf(File);
      expect([...init.body.keys()].sort()).toEqual(["file", "model"]);
      return Response.json({ text: " Hola mundo. " });
    },
  );
  expect(
    await provider.transcribe(new File(["audio"], "recording.webm"), signal),
  ).toBe("Hola mundo.");
});

test("upstream errors do not leak provider response bodies", async () => {
  const provider = createTranscriptionProvider(
    {
      provider: "openai-compatible",
      baseUrl: "https://speech.example/v1",
      model: "speech-model",
    },
    async () => new Response("secret-key", { status: 401 }),
  );
  await expect(
    provider.transcribe(
      new File(["audio"], "audio.webm"),
      new AbortController().signal,
    ),
  ).rejects.toThrow("Try again, or ask an admin if it keeps happening.");
});

test("malformed success is a visible failure", async () => {
  const provider = createTranscriptionProvider(
    {
      provider: "openai-compatible",
      baseUrl: "https://speech.example/v1",
      model: "speech-model",
    },
    async () => Response.json({ message: "wrong shape" }),
  );
  await expect(
    provider.transcribe(
      new File(["audio"], "audio.webm"),
      new AbortController().signal,
    ),
  ).rejects.toThrow("invalid response");
});

/** The request as it goes over the wire, with the random multipart boundary made constant. */
async function wire(init: RequestInit): Promise<string> {
  if (!(init.body instanceof FormData)) throw new Error("Expected multipart");
  const response = new Response(init.body);
  const boundary = /boundary=(.+)$/.exec(
    response.headers.get("content-type") ?? "",
  )?.[1];
  if (!boundary) throw new Error("Expected a multipart boundary");
  return (await response.text()).replaceAll(boundary, "BOUNDARY");
}

const speechConfig = {
  provider: "openai-compatible",
  baseUrl: "https://speech.example/v1",
  model: "speech-model",
} as const;

describe("language and vocabulary hint", () => {
  test("with neither set the request is byte for byte what it was before they existed", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const provider = createTranscriptionProvider(
      speechConfig,
      async (url, init) => {
        sent = { url, init };
        return Response.json({ text: "ok" });
      },
    );
    const signal = new AbortController().signal;
    await provider.transcribe(
      new File(["audio"], "recording.webm", { type: "audio/webm" }),
      signal,
    );
    if (!sent) throw new Error("Nothing was sent");
    // Recorded from the adapter before this change: the literal below is the old wire format.
    expect(await wire(sent.init)).toBe(
      '--BOUNDARY\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\naudio\r\n--BOUNDARY\r\nContent-Disposition: form-data; name="model"\r\n\r\nspeech-model\r\n--BOUNDARY--\r\n',
    );
    expect(sent.url).toBe("https://speech.example/v1/audio/transcriptions");
    expect(sent.init.headers).toEqual({});
    expect(Object.keys(sent.init).sort()).toEqual([
      "body",
      "headers",
      "method",
      "redirect",
      "signal",
    ]);
  });

  test("a configured language and prompt go as the language and prompt fields, after file and model", async () => {
    let fields: string[] = [];
    let values: Record<string, FormDataEntryValue | null> = {};
    const provider = createTranscriptionProvider(
      { ...speechConfig, language: "it", prompt: "Anna, Roma, FreeDuet" },
      async (_url, init) => {
        if (!(init.body instanceof FormData))
          throw new Error("Expected multipart");
        fields = [...init.body.keys()];
        values = {
          language: init.body.get("language"),
          prompt: init.body.get("prompt"),
          model: init.body.get("model"),
        };
        return Response.json({ text: "ciao" });
      },
    );
    await provider.transcribe(
      new File(["audio"], "recording.webm"),
      new AbortController().signal,
    );
    expect(fields).toEqual(["file", "model", "language", "prompt"]);
    expect(values).toEqual({
      language: "it",
      prompt: "Anna, Roma, FreeDuet",
      model: "speech-model",
    });
  });

  test("each is sent alone when only one is set", async () => {
    const sentFields: string[][] = [];
    const transport = async (_url: string, init: RequestInit) => {
      if (!(init.body instanceof FormData))
        throw new Error("Expected multipart");
      sentFields.push([...init.body.keys()]);
      return Response.json({ text: "ciao" });
    };
    const signal = new AbortController().signal;
    const file = new File(["audio"], "recording.webm");
    await createTranscriptionProvider(
      { ...speechConfig, language: "it" },
      transport,
    ).transcribe(file, signal);
    await createTranscriptionProvider(
      { ...speechConfig, prompt: "Roma" },
      transport,
    ).transcribe(file, signal);
    expect(sentFields).toEqual([
      ["file", "model", "language"],
      ["file", "model", "prompt"],
    ]);
  });
});

describe("what comes back", () => {
  const transcribe = (text: string, joinSegments?: true) =>
    createTranscriptionProvider(
      { ...speechConfig, ...(joinSegments ? { joinSegments } : {}) },
      async () => Response.json({ text }),
    ).transcribe(
      new File(["audio"], "recording.webm"),
      new AbortController().signal,
    );

  test("an empty or whitespace-only transcript comes back as the empty string", async () => {
    expect(await transcribe("")).toBe("");
    expect(await transcribe("  \n\t \n")).toBe("");
  });

  test("whisper.cpp ends every segment with a line break; the local service asks for them to be joined", async () => {
    const raw = " Ciao Marco.\n Come stai oggi?\n Tutto bene.\n";
    expect(await transcribe(raw, true)).toBe(
      "Ciao Marco. Come stai oggi? Tutto bene.",
    );
    // Any other provider's text is left exactly as it sends it, apart from the trim.
    expect(await transcribe(raw)).toBe(
      "Ciao Marco.\n Come stai oggi?\n Tutto bene.",
    );
  });
});

describe("transcription language and prompt settings", () => {
  test("language is a two-letter code Whisper knows, and a prompt is at most 500 characters", () => {
    expect(
      transcriptionConfig({ ...environment, TRANSCRIPTION_LANGUAGE: " it " }),
    ).toMatchObject({ language: "it" });
    expect(
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_PROMPT: "  Roma, Elementor.  ",
      }),
    ).toMatchObject({ prompt: "Roma, Elementor." });
    for (const bad of ["italian", "it-IT", "IT", "xx", "auto", "i"]) {
      expect(() =>
        transcriptionConfig({ ...environment, TRANSCRIPTION_LANGUAGE: bad }),
      ).toThrow("TRANSCRIPTION_LANGUAGE");
    }
    expect(
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_PROMPT: "a".repeat(500),
      }),
    ).toMatchObject({ prompt: "a".repeat(500) });
    expect(() =>
      transcriptionConfig({
        ...environment,
        TRANSCRIPTION_PROMPT: "a".repeat(501),
      }),
    ).toThrow("TRANSCRIPTION_PROMPT");
  });

  test("blank values mean unset, and neither key appears in the config", () => {
    const config = transcriptionConfig({
      ...environment,
      TRANSCRIPTION_LANGUAGE: "  ",
      TRANSCRIPTION_PROMPT: "",
    });
    expect(config).toEqual({
      provider: "openai-compatible",
      baseUrl: "https://speech.example/v1",
      model: "speech-model",
    });
    expect(Object.keys(config ?? {}).sort()).toEqual([
      "baseUrl",
      "model",
      "provider",
    ]);
  });

  test("they alone never switch dictation on", () => {
    expect(
      transcriptionConfig({
        TRANSCRIPTION_LANGUAGE: "it",
        TRANSCRIPTION_PROMPT: "Roma",
      }),
    ).toBeUndefined();
  });
});

describe("FREEDUET_DICTATION=local", () => {
  test("is one of local or unset, and only local asks for the segments to be joined", () => {
    expect(transcriptionConfig(environment)).not.toHaveProperty("joinSegments");
    expect(
      transcriptionConfig({ ...environment, FREEDUET_DICTATION: "" }),
    ).not.toHaveProperty("joinSegments");
    expect(
      transcriptionConfig({ ...environment, FREEDUET_DICTATION: "off" }),
    ).not.toHaveProperty("joinSegments");
    expect(
      transcriptionConfig({ ...environment, FREEDUET_DICTATION: "local" }),
    ).toMatchObject({ joinSegments: true });
    expect(() =>
      transcriptionConfig({ ...environment, FREEDUET_DICTATION: "on" }),
    ).toThrow("FREEDUET_DICTATION must be local");
  });

  test("the model is from the closed list, and a name outside it is refused", () => {
    expect(whisperModelNames()).toEqual([
      "large-v3-turbo-q5_0",
      "large-v3-turbo",
      "small",
      "base",
    ]);
    for (const model of whisperModelNames()) {
      expect(
        transcriptionConfig({
          ...environment,
          FREEDUET_DICTATION: "local",
          FREEDUET_WHISPER_MODEL: model,
        }),
      ).toMatchObject({ joinSegments: true });
    }
    for (const bad of ["large-v3", "tiny", "../small", "small.bin", "Small"]) {
      expect(() =>
        transcriptionConfig({
          ...environment,
          FREEDUET_DICTATION: "local",
          FREEDUET_WHISPER_MODEL: bad,
        }),
      ).toThrow("FREEDUET_WHISPER_MODEL");
    }
    // A name nobody uses is not looked at while the flag is off.
    expect(
      transcriptionConfig({ ...environment, FREEDUET_WHISPER_MODEL: "tiny" }),
    ).toBeDefined();
  });
});

describe("local service: silence is dropped by the service's own no-speech number", () => {
  const local = {
    ...speechConfig,
    joinSegments: true,
    noSpeechThreshold: 0.6,
  } as const;
  const file = () =>
    new File(["audio"], "recording.wav", { type: "audio/wav" });
  const answering = (
    segments: { text: string; no_speech_prob?: number; avg_logprob?: number }[],
    config: Parameters<typeof createTranscriptionProvider>[0] = local,
  ) => {
    const sent: FormData[] = [];
    const provider = createTranscriptionProvider(config, async (_url, init) => {
      sent.push(init.body as FormData);
      return Response.json({ text: "ignored", segments });
    });
    return { provider, sent };
  };
  const signal = () => new AbortController().signal;

  test("asks for the verbose response, without the 60-character wrapping", async () => {
    const { provider, sent } = answering([
      { text: " Ciao", no_speech_prob: 0.01 },
    ]);
    await provider.transcribe(file(), signal());
    expect([...(sent[0] as FormData).keys()]).toEqual([
      "file",
      "model",
      "response_format",
      "token_timestamps",
    ]);
    expect((sent[0] as FormData).get("response_format")).toBe("verbose_json");
    expect((sent[0] as FormData).get("token_timestamps")).toBe("false");
  });

  test("drops a segment above the threshold, keeps one at it, joins the rest with a space", async () => {
    const { provider } = answering([
      { text: " Thank you.", no_speech_prob: 0.93 },
      { text: " Ciao a tutti.", no_speech_prob: 0.6 },
      { text: " Come state?", no_speech_prob: 0.02 },
    ]);
    expect(await provider.transcribe(file(), signal())).toBe(
      "Ciao a tutti. Come state?",
    );
  });

  test("all segments dropped, or none sent, is the empty string", async () => {
    expect(
      await answering([
        { text: " Thank you.", no_speech_prob: 0.99 },
      ]).provider.transcribe(file(), signal()),
    ).toBe("");
    expect(await answering([]).provider.transcribe(file(), signal())).toBe("");
  });

  test("the threshold is the configured one", async () => {
    const segments = [{ text: " Forse.", no_speech_prob: 0.4 }];
    expect(
      await answering(segments, {
        ...local,
        noSpeechThreshold: 0.3,
      }).provider.transcribe(file(), signal()),
    ).toBe("");
    expect(
      await answering(segments, {
        ...local,
        noSpeechThreshold: 0.5,
      }).provider.transcribe(file(), signal()),
    ).toBe("Forse.");
  });

  test("a response without segments is the usual invalid-response error", async () => {
    const provider = createTranscriptionProvider(local, async () =>
      Response.json({ text: "x" }),
    );
    await expect(provider.transcribe(file(), signal())).rejects.toThrow(
      "invalid response",
    );
  });

  test("segments() gives every segment's numbers, dropped or not", async () => {
    const { provider } = answering([
      { text: " Thank you.", no_speech_prob: 0.93, avg_logprob: -0.4 },
      { text: " Ciao.", no_speech_prob: 0.02 },
    ]);
    expect(await provider.segments(file(), signal())).toEqual([
      { text: " Thank you.", noSpeechProb: 0.93, avgLogprob: -0.4 },
      { text: " Ciao.", noSpeechProb: 0.02, avgLogprob: null },
    ]);
  });

  test("without the threshold (any other provider) the request stays the plain one", async () => {
    const sent: FormData[] = [];
    const provider = createTranscriptionProvider(
      speechConfig,
      async (_u, init) => {
        sent.push(init.body as FormData);
        return Response.json({ text: "ok" });
      },
    );
    expect(await provider.transcribe(file(), signal())).toBe("ok");
    expect([...(sent[0] as FormData).keys()]).toEqual(["file", "model"]);
  });
});

describe("WHISPER_NO_SPEECH_THRESHOLD", () => {
  const local = { ...environment, FREEDUET_DICTATION: "local" };

  test("defaults to whisper.cpp's own 0.6 with the flag, and does not exist without it", () => {
    expect(transcriptionConfig(local)).toMatchObject({
      noSpeechThreshold: 0.6,
    });
    expect(transcriptionConfig(environment)).not.toHaveProperty(
      "noSpeechThreshold",
    );
    expect(
      transcriptionConfig({
        ...environment,
        WHISPER_NO_SPEECH_THRESHOLD: "0.1",
      }),
    ).not.toHaveProperty("noSpeechThreshold");
  });

  test("is a number from 0 to 1, blank meaning the default", () => {
    expect(
      transcriptionConfig({ ...local, WHISPER_NO_SPEECH_THRESHOLD: "0.35" }),
    ).toMatchObject({ noSpeechThreshold: 0.35 });
    expect(
      transcriptionConfig({ ...local, WHISPER_NO_SPEECH_THRESHOLD: " " }),
    ).toMatchObject({ noSpeechThreshold: 0.6 });
    for (const bad of ["high", "-0.1", "1.5"]) {
      expect(() =>
        transcriptionConfig({ ...local, WHISPER_NO_SPEECH_THRESHOLD: bad }),
      ).toThrow("WHISPER_NO_SPEECH_THRESHOLD must be a number from 0 to 1.");
    }
  });
});
