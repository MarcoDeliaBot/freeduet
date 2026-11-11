import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { createTranscriptionProvider } from "../../openbot/server/src/dictation/provider";
import { transcriptionConfig } from "../../openbot/server/src/dictation/config";
import type { Clip } from "./fleurs";
import {
  DEFAULT_CLIPS,
  describeService,
  ffmpegConvert,
  ffmpegInvocation,
  measureFormats,
  measureSilence,
  measureWer,
  parseArguments,
  productTranscribe,
  renderMarkdown,
  reportName,
  type Report,
  SILENCE_CASES,
  silenceWav,
  speechThenSilenceWav,
} from "./wer";
import { pcm16Wav, wavDurationSeconds } from "./metrics";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A clip whose "audio" is its own transcript, so a fake service can answer from the bytes. */
function textClip(id: string, reference: string): Clip {
  return { id, fileName: `${id}.wav`, path: id, reference, seconds: 4 };
}
const bytesOf = async (clip: Clip) => encoder.encode(clip.reference);

describe("parseArguments", () => {
  test("nothing asked is the word error rate on 100 clips", () => {
    expect(parseArguments([])).toEqual({
      n: DEFAULT_CLIPS,
      wer: true,
      formats: false,
      silence: false,
    });
  });

  test("--formats or --silence alone leave the word error rate out, --wer puts it back", () => {
    expect(parseArguments(["--formats"])).toEqual({
      n: 100,
      wer: false,
      formats: true,
      silence: false,
    });
    expect(parseArguments(["--silence", "--wer"])).toEqual({
      n: 100,
      wer: true,
      formats: false,
      silence: true,
    });
  });

  test("takes values, as a percentage for --max-wer", () => {
    const options = parseArguments([
      "--n",
      "25",
      "--model-label",
      "turbo",
      "--max-wer",
      "12.5",
    ]);
    expect(options.n).toBe(25);
    expect(options.label).toBe("turbo");
    expect(options.maxWer).toBe(0.125);
  });

  test("refuses what it cannot use, in words", () => {
    expect(() => parseArguments(["--n", "0"])).toThrow(
      "--n must be a whole number from 1 to 800.",
    );
    expect(() => parseArguments(["--n", "2.5"])).toThrow(
      "--n must be a whole number from 1 to 800.",
    );
    expect(() => parseArguments(["--n"])).toThrow("--n needs a value.");
    expect(() => parseArguments(["--max-wer", "120"])).toThrow(
      "--max-wer is a percentage from 0 to 100.",
    );
    expect(() => parseArguments(["--whatever"])).toThrow(
      "Unknown option --whatever.",
    );
  });
});

describe("reportName", () => {
  const all = { wer: true, formats: false, silence: false };

  test("the plain run is date and label; any other run says what it was", () => {
    expect(reportName("2026-11-11", "large-v3-turbo-q5_0", all, 100)).toBe(
      "2026-11-11-large-v3-turbo-q5_0",
    );
    expect(
      reportName(
        "2026-11-11",
        "base",
        { ...all, wer: false, formats: true },
        100,
      ),
    ).toBe("2026-11-11-base-formats");
    expect(
      reportName(
        "2026-11-11",
        "base",
        { wer: true, formats: false, silence: true },
        100,
      ),
    ).toBe("2026-11-11-base-wer-silence");
  });

  test("a run on a different number of clips cannot overwrite the full one", () => {
    expect(reportName("2026-11-11", "base", all, 20)).toBe(
      "2026-11-11-base-n20",
    );
  });

  test("the label cannot leave the reports folder", () => {
    expect(reportName("2026-11-11", "../../Odd Label!", all, 100)).toBe(
      "2026-11-11-odd-label",
    );
    expect(() => reportName("2026-11-11", "///", all, 100)).toThrow(
      "--model-label needs letters or digits.",
    );
  });
});

describe("measureWer", () => {
  test("counts the corpus by hand: two errors in seven words, the failure as nothing heard", async () => {
    const clips = [
      textClip("a", "Il gatto dorme."),
      textClip("b", "Uno due tre quattro"),
      textClip("c", "Mai più"),
    ];
    const heard: Record<string, string> = {
      "Il gatto dorme.": "il gatto dorme",
      // "due" missing, "cinque" added: one deletion and one insertion.
      "Uno due tre quattro": "uno tre quattro cinque",
    };
    const result = await measureWer(
      clips,
      async (audio) => {
        const text = decoder.decode(audio);
        const answer = heard[text];
        if (answer === undefined) throw new Error("The service is down.");
        return answer;
      },
      bytesOf,
    );
    expect(result.clips).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.refWords).toBe(9);
    expect(result.deletions).toBe(1 + 2);
    expect(result.insertions).toBe(1);
    expect(result.substitutions).toBe(0);
    // 4 errors of 9 words.
    expect(result.wer).toBeCloseTo(4 / 9, 10);
    expect(result.worst.map((line) => line.id)).toEqual(["c", "b", "a"]);
    expect(result.worst[2]?.errors).toBe(0);
    expect(result.worst[0]?.failure).toBe("The service is down.");
    expect(result.audioSeconds).toBe(12);
  });

  test("times only the requests that were answered, and keeps the ten worst", async () => {
    const clips = Array.from({ length: 12 }, (_, index) =>
      textClip(`c${index}`, "uno due tre"),
    );
    const result = await measureWer(clips, async () => "uno due tre", bytesOf);
    expect(result.wer).toBe(0);
    expect(result.worst).toHaveLength(10);
    expect(result.p95Seconds).toBeGreaterThanOrEqual(result.medianSeconds);
    expect(result.medianSeconds).toBeGreaterThanOrEqual(0);
    expect(result.realTimeFactor).toBeLessThan(1);
  });
});

describe("measureFormats", () => {
  const sentence = (words: number) =>
    Array.from({ length: words }, (_, index) => `parola${index}`).join(" ");

  /** The "conversion" keeps the text and drops the last `lost` words for the form it is asked for. */
  const convertLosing =
    (lost: Record<"webm" | "mp4", number>) =>
    async (wav: Uint8Array, format: "webm" | "mp4") => {
      const words = decoder.decode(wav).split(" ");
      return encoder.encode(
        words.slice(0, words.length - lost[format]).join(" "),
      );
    };
  const echo = async (audio: Uint8Array) => decoder.decode(audio);

  test("passes when the compressed forms hear what the wav does", async () => {
    const result = await measureFormats(
      [textClip("a", sentence(100))],
      echo,
      convertLosing({ webm: 0, mp4: 0 }),
      bytesOf,
    );
    expect(result.passed).toBe(true);
    expect(result.wer).toEqual({ wav: 0, webm: 0, mp4: 0 });
  });

  test("exactly two points worse passes, three points worse fails and names the form", async () => {
    const clips = [textClip("a", sentence(100))];
    const atLimit = await measureFormats(
      clips,
      echo,
      convertLosing({ webm: 2, mp4: 0 }),
      bytesOf,
    );
    expect(atLimit.passed).toBe(true);
    expect(atLimit.difference.webm).toBeCloseTo(0.02, 10);

    const over = await measureFormats(
      clips,
      echo,
      convertLosing({ webm: 0, mp4: 3 }),
      bytesOf,
    );
    expect(over.passed).toBe(false);
    expect(over.problems).toEqual([
      "mp4 is 3.0 WER points worse than wav; the most allowed is 2.",
    ]);
  });

  test("a failed request is a problem of its own, not a quiet loss of words", async () => {
    const result = await measureFormats(
      [textClip("a", sentence(10))],
      async (audio) => {
        if (audio.byteLength < 10) throw new Error("boom");
        return decoder.decode(audio);
      },
      async () => encoder.encode("x"),
      bytesOf,
    );
    expect(result.failed).toBe(2);
    expect(result.passed).toBe(false);
    expect(result.problems[0]).toBe("a as webm: boom");
  });

  test("sends the declared types a browser reports", async () => {
    const seen: string[] = [];
    await measureFormats(
      [textClip("a", "uno")],
      async (_audio, type) => {
        seen.push(type);
        return "uno";
      },
      async () => encoder.encode("x"),
      bytesOf,
    );
    expect(seen).toEqual(["audio/wav", "audio/webm;codecs=opus", "audio/mp4"]);
  });
});

describe("measureSilence", () => {
  test("passes when every transcript is empty, whitespace included", async () => {
    let call = 0;
    const result = await measureSilence(async () =>
      call++ === 1 ? " \n" : "",
    );
    expect(result.passed).toBe(true);
    expect(result.cases.map((item) => item.name)).toEqual([
      "digital silence, 5 s",
      "digital silence, 30 s",
      "low room noise, 5 s",
      "low room noise, 30 s",
    ]);
  });

  test("fails on any invented text, and names the case and the words", async () => {
    const result = await measureSilence(async (audio) =>
      audio.byteLength > 44 + 16000 * 2 * 5 ? "Grazie a tutti." : "",
    );
    expect(result.passed).toBe(false);
    expect(result.problems).toEqual([
      'digital silence, 30 s: heard "Grazie a tutti."',
      'low room noise, 30 s: heard "Grazie a tutti."',
    ]);
  });

  test("a request that failed is not an empty transcript", async () => {
    const result = await measureSilence(async () => {
      throw new Error("refused");
    });
    expect(result.passed).toBe(false);
    expect(result.problems[0]).toBe(
      "digital silence, 5 s: the request failed (refused)",
    );
  });

  test("silenceWav is the length asked, zero for silence and not zero for noise", () => {
    const silence = silenceWav(5, false);
    const noise = silenceWav(5, true);
    expect(wavDurationSeconds(silence)).toBe(5);
    expect(wavDurationSeconds(noise)).toBe(5);
    expect(silence.slice(44).every((byte) => byte === 0)).toBe(true);
    expect(noise.slice(44).some((byte) => byte !== 0)).toBe(true);
  });
});

describe("productTranscribe", () => {
  function sent() {
    const seen: { file: File; fields: string[]; url: string }[] = [];
    const provider = createTranscriptionProvider(
      transcriptionConfig({
        TRANSCRIPTION_PROVIDER: "openai-compatible",
        TRANSCRIPTION_BASE_URL: "http://127.0.0.1:4240/v1",
        TRANSCRIPTION_MODEL: "local-whisper",
        FREEDUET_DICTATION: "local",
      }) as NonNullable<ReturnType<typeof transcriptionConfig>>,
      async (url, init) => {
        const body = init.body as FormData;
        seen.push({
          file: body.get("file") as File,
          fields: [...body.keys()],
          url,
        });
        return Response.json({
          segments: [
            { text: " uno due", no_speech_prob: 0.01 },
            { text: " tre", no_speech_prob: 0.02 },
          ],
        });
      },
    );
    return { seen, transcribe: productTranscribe(provider) };
  }

  test("gives the adapter the file name and media type the server gives it", async () => {
    const { seen, transcribe } = sent();
    const text = await transcribe(
      new Uint8Array([1, 2, 3]),
      "audio/webm;codecs=opus",
    );
    expect(text).toBe("uno due tre");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.file.name).toBe("recording.webm");
    expect(seen[0]?.file.type).toBe("audio/webm");
    expect(seen[0]?.fields).toEqual([
      "file",
      "model",
      "response_format",
      "token_timestamps",
    ]);
    expect(seen[0]?.url).toBe("http://127.0.0.1:4240/v1/audio/transcriptions");
  });

  test("refuses what the product refuses", async () => {
    const { seen, transcribe } = sent();
    expect(() => transcribe(new Uint8Array([1]), "audio/ogg")).toThrow(
      "audio/ogg is not a format the product accepts.",
    );
    expect(() =>
      transcribe(new Uint8Array(10 * 1024 * 1024 + 1), "audio/wav"),
    ).toThrow("This recording is over the product's 10 MiB limit.");
    expect(seen).toHaveLength(0);
  });
});

describe("describeService and the report", () => {
  const config = (baseUrl: string) =>
    transcriptionConfig({
      TRANSCRIPTION_PROVIDER: "openai-compatible",
      TRANSCRIPTION_BASE_URL: baseUrl,
      TRANSCRIPTION_MODEL: "whisper-1",
      TRANSCRIPTION_API_KEY: "sk-must-not-appear",
      TRANSCRIPTION_LANGUAGE: "it",
      TRANSCRIPTION_PROMPT: "Anna, FreeDuet",
    }) as NonNullable<ReturnType<typeof transcriptionConfig>>;

  test("says whether the service is on this computer and writes no address and no key", () => {
    const local = describeService(config("http://127.0.0.1:4240/v1"));
    expect(local.endpoint).toBe("this computer");
    const remote = describeService(config("https://secret-host.example/v1"));
    expect(remote.endpoint).toBe("elsewhere");
    expect(remote.language).toBe("it");
    expect(remote.promptSet).toBe(true);
    const written = JSON.stringify(remote);
    expect(written.includes("secret-host")).toBe(false);
    expect(written.includes("sk-must-not-appear")).toBe(false);
    expect(written.includes("Anna")).toBe(false);
  });

  test("the markdown carries the verdict, the problems, and escapes a pipe in a transcript", () => {
    const report: Report = {
      date: "2026-11-11",
      label: "base",
      service: describeService(config("http://127.0.0.1:4240/v1")),
      dataset: "google/fleurs",
      silence: {
        cases: [
          { name: "digital silence, 5 s", transcript: "a | b" },
          { name: "low room noise, 5 s", transcript: "" },
        ],
        passed: false,
        problems: ['digital silence, 5 s: heard "a | b"'],
      },
      passed: false,
      problems: ['7c: digital silence, 5 s: heard "a | b"'],
    };
    const markdown = renderMarkdown(report);
    expect(markdown).toContain("**FAILED**");
    expect(markdown).toContain(
      '- Problem: 7c: digital silence, 5 s: heard "a | b"',
    );
    expect(markdown).toContain('| digital silence, 5 s | "a \\| b" |');
    expect(markdown).toContain("| low room noise, 5 s | (empty) |");
  });
});

describe("ffmpegConvert", () => {
  const hasFfmpeg = Boolean(Bun.which("ffmpeg"));
  const tone = () => {
    const samples = new Int16Array(16000);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.round(
        8000 * Math.sin((2 * Math.PI * 440 * index) / 16000),
      );
    }
    return pcm16Wav(samples, 16000);
  };

  test.skipIf(!hasFfmpeg)(
    "makes a real webm (EBML header) and a real mp4 (ftyp box)",
    async () => {
      const webm = await ffmpegConvert(tone(), "webm");
      expect([...webm.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
      const mp4 = await ffmpegConvert(tone(), "mp4");
      expect(decoder.decode(mp4.slice(4, 8))).toBe("ftyp");
    },
  );

  test.skipIf(!hasFfmpeg)("leaves no temporary folder behind", async () => {
    const before = new Set(
      await Array.fromAsync(
        new Bun.Glob("freeduet-dictation-*").scan({
          cwd: "/tmp",
          onlyFiles: false,
        }),
      ),
    );
    await ffmpegConvert(tone(), "webm");
    const after = await Array.fromAsync(
      new Bun.Glob("freeduet-dictation-*").scan({
        cwd: "/tmp",
        onlyFiles: false,
      }),
    );
    expect(after.filter((name) => !before.has(name))).toEqual([]);
    for (const name of before)
      rmSync(`/tmp/${name}`, { recursive: true, force: true });
  });
});

describe("ffmpegInvocation", () => {
  const base = { directory: "/tmp/x", format: "webm" as const };

  test("the ffmpeg on the PATH comes first, even when Docker is there too", () => {
    const command = ffmpegInvocation({
      ...base,
      ffmpeg: "/usr/bin/ffmpeg",
      docker: "/usr/bin/docker",
    });
    expect(command[0]).toBe("/usr/bin/ffmpeg");
    expect(command).toContain("/tmp/x/input.wav");
    expect(command.at(-1)).toBe("/tmp/x/output.webm");
    expect(command).not.toContain("run");
  });

  test("without one, the whisper image's ffmpeg: no network, no capabilities, our user, only the folder mounted", () => {
    const command = ffmpegInvocation({
      ...base,
      format: "mp4",
      ffmpeg: null,
      docker: "/usr/bin/docker",
      user: "1000:1000",
    });
    expect(command.slice(0, 13)).toEqual([
      "/usr/bin/docker",
      "run",
      "--rm",
      "--network",
      "none",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--user",
      "1000:1000",
      "-v",
      "/tmp/x:/work",
    ]);
    expect(command.filter((word) => word === "-v")).toHaveLength(1);
    expect(command.slice(13, 16)).toEqual([
      "--entrypoint",
      "ffmpeg",
      "freeduet-whisper:latest",
    ]);
    expect(command).toContain("/work/input.wav");
    expect(command.at(-1)).toBe("/work/output.mp4");
    expect(command).toContain("frag_keyframe+empty_moov");
  });

  test("the image can be named, and neither ffmpeg nor Docker is a sentence that says what to do", () => {
    expect(
      ffmpegInvocation({
        ...base,
        ffmpeg: null,
        docker: "docker",
        image: "mine:1",
      }),
    ).toContain("mine:1");
    expect(() =>
      ffmpegInvocation({ ...base, ffmpeg: null, docker: null }),
    ).toThrow("on neither the PATH nor in Docker");
  });
});

describe("7c extras", () => {
  const toneWav = () => {
    const samples = new Int16Array(16000 * 5).fill(1000);
    return pcm16Wav(samples, 16000);
  };

  test("speechThenSilenceWav is 2 s of the clip then 10 s of zeros", () => {
    const wav = speechThenSilenceWav(toneWav());
    expect(wavDurationSeconds(wav)).toBe(12);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44 + 31999 * 2, true)).toBe(1000);
    expect(view.getInt16(44 + 32000 * 2, true)).toBe(0);
  });

  test("the speech case passes when words of the sentence come back", async () => {
    const result = await measureSilence(
      async (audio) => (audio.byteLength === 44 + 12 * 32000 ? "il gatto" : ""),
      [],
      {
        speech: { wav: toneWav(), reference: "Il gatto dorme." },
      },
    );
    expect(result.passed).toBe(true);
    expect(result.cases.map((item) => item.name)).toEqual([
      "2 s of speech, then 10 s of silence",
    ]);
  });

  test("dropped speech and invented words are each a problem of their own", async () => {
    const speech = { wav: toneWav(), reference: "Il gatto dorme." };
    const dropped = await measureSilence(async () => "", [], { speech });
    expect(dropped.problems).toEqual([
      "2 s of speech, then 10 s of silence: the speech was dropped, nothing came back",
    ]);
    const invented = await measureSilence(async () => "Thank you.", [], {
      speech,
    });
    expect(invented.problems[0]).toContain(
      "none of the words heard are in the sentence",
    );
  });

  test("the service's numbers are kept per case, and a failing inspector costs only the numbers", async () => {
    const result = await measureSilence(
      async () => "",
      SILENCE_CASES.slice(0, 2),
      {
        inspect: async (audio) =>
          audio.byteLength > 200000
            ? (() => {
                throw new Error("no");
              })()
            : [{ text: " Thank you.", noSpeechProb: 0.93, avgLogprob: -0.41 }],
      },
    );
    expect(result.passed).toBe(true);
    expect(result.cases[0]?.segments).toEqual([
      { text: " Thank you.", noSpeechProb: 0.93, avgLogprob: -0.41 },
    ]);
    expect(result.cases[1]?.segments).toBeUndefined();
    const report = renderMarkdown({
      date: "2026-11-11",
      label: "x",
      service: describeService({
        provider: "openai-compatible",
        baseUrl: "http://127.0.0.1:1/v1",
        model: "m",
      }),
      dataset: "d",
      silence: result,
      passed: true,
      problems: [],
    });
    expect(report).toContain(
      '"Thank you." no_speech_prob 0.930, avg_logprob -0.410',
    );
  });
});
