/**
 * The proofs of FreeDuet's dictation, run on the maintainer's computer against whatever service the
 * product is set up to use (docs/M1_PLAN.md D25). They are not part of CI: the audio is a public
 * dataset that is downloaded on first use into a folder git ignores, and the service is a real model.
 *
 *   bun --env-file=openbot/.env evals/dictation/wer.ts [options]
 *
 *   (no option)      7a  word error rate on --n Italian clips (default 100)
 *   --formats        7b  five clips as WAV, as webm/opus and as mp4/aac: each compressed form must not
 *                        be worse than the WAV by more than 2 WER points. Needs ffmpeg on the PATH.
 *   --silence        7c  5 s and 30 s of digital silence and of low room noise: every transcript must
 *                        be empty, or the check fails
 *   --wer            run 7a too when --formats or --silence is given
 *   --n <count>      clips for 7a (default 100; the test split has more than 800)
 *   --model-label X  names the report: evals/dictation/reports/<date>-X.{json,md}
 *   --max-wer <pct>  fail when the 7a word error rate is above this percentage
 *
 * Every request goes through createTranscriptionProvider(transcriptionConfig(process.env)), the code
 * the server uses, with the file name and media type the server gives it, so a result here is a result
 * of the product and not of a script of its own. The exit code is 0 only when every proof that ran passed.
 */
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DICTATION_TIMEOUT_MS,
  dictationExtension,
  dictationMediaType,
  MAX_DICTATION_BYTES,
} from "../../openbot/shared/dictation";
import {
  type TranscriptionConfig,
  transcriptionConfig,
} from "../../openbot/server/src/dictation/config";
import {
  createTranscriptionProvider,
  type TranscriptionProvider,
} from "../../openbot/server/src/dictation/provider";
import { type Clip, loadClips } from "./fleurs";
import {
  corpusWordErrorRate,
  median,
  NORMALISATION_SUMMARY,
  percentile,
  pcm16Wav,
  roomNoiseSamples,
  type WordErrors,
  wordErrorRate,
} from "./metrics";

export const DEFAULT_CLIPS = 100;
/** 7b: the most a compressed form may be worse than the WAV, in WER (0.02 is two points). */
export const FORMAT_TOLERANCE = 0.02;
const FORMAT_CLIPS = 5;
const WORST_LINES = 10;
const SAMPLE_RATE = 16000;

/** Sends one recording the way the server does and returns the text, or throws. */
export type Transcribe = (
  audio: Uint8Array,
  declaredType: string,
) => Promise<string>;

/** Turns a 16 kHz WAV into the other forms a browser sends. */
export type Convert = (
  wav: Uint8Array,
  format: "webm" | "mp4",
) => Promise<Uint8Array>;

/**
 * What routes.ts does between the browser and the adapter: the media type is normalised, the file is
 * called recording.<extension>, and a recording over the limit is refused.
 */
export function productTranscribe(provider: TranscriptionProvider): Transcribe {
  return (audio, declaredType) => {
    const mediaType = dictationMediaType(declaredType);
    const extension = dictationExtension(mediaType);
    if (!extension) {
      throw new Error(`${declaredType} is not a format the product accepts.`);
    }
    if (audio.byteLength > MAX_DICTATION_BYTES) {
      throw new Error("This recording is over the product's 10 MiB limit.");
    }
    return provider.transcribe(
      new File([new Uint8Array(audio)], `recording.${extension}`, {
        type: mediaType,
      }),
      AbortSignal.timeout(DICTATION_TIMEOUT_MS),
    );
  };
}

async function timed(
  action: () => Promise<string>,
): Promise<{ text: string; seconds: number; error?: string }> {
  const start = performance.now();
  try {
    const text = await action();
    return { text, seconds: (performance.now() - start) / 1000 };
  } catch (error) {
    return {
      text: "",
      seconds: (performance.now() - start) / 1000,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------------------- 7a

export type Line = {
  id: string;
  reference: string;
  hypothesis: string;
  errors: number;
  refWords: number;
  wer: number;
  /** Seconds the request took. */
  seconds: number;
  audioSeconds: number;
  /** Set when the request itself failed: the line then counts as nothing heard. */
  failure?: string;
};

export type WerResult = {
  clips: number;
  failed: number;
  refWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  wer: number;
  medianSeconds: number;
  p95Seconds: number;
  audioSeconds: number;
  /** Seconds of waiting per second of audio: below 1 is faster than speaking. */
  realTimeFactor: number;
  worst: Line[];
};

export async function measureWer(
  clips: readonly Clip[],
  transcribe: Transcribe,
  readAudio: (clip: Clip) => Promise<Uint8Array> = async (clip) =>
    Bun.file(clip.path).bytes(),
  progress: (done: number, total: number) => void = () => {},
): Promise<WerResult> {
  const lines: Line[] = [];
  const counts: WordErrors[] = [];
  for (const [index, clip] of clips.entries()) {
    const answer = await timed(async () =>
      transcribe(await readAudio(clip), "audio/wav"),
    );
    const result = wordErrorRate(clip.reference, answer.text);
    counts.push(result);
    lines.push({
      id: clip.id,
      reference: clip.reference,
      hypothesis: answer.text,
      errors: result.errors,
      refWords: result.refWords,
      wer: result.wer,
      seconds: answer.seconds,
      audioSeconds: clip.seconds,
      ...(answer.error ? { failure: answer.error } : {}),
    });
    progress(index + 1, clips.length);
  }
  // A failed request has no time that means anything.
  const times = lines
    .filter((line) => !line.failure)
    .map((line) => line.seconds);
  const audioSeconds = lines.reduce((sum, line) => sum + line.audioSeconds, 0);
  const waited = times.reduce((sum, seconds) => sum + seconds, 0);
  const answered = lines
    .filter((line) => !line.failure)
    .reduce((sum, line) => sum + line.audioSeconds, 0);
  return {
    clips: clips.length,
    failed: lines.filter((line) => line.failure).length,
    refWords: counts.reduce((sum, c) => sum + c.refWords, 0),
    substitutions: counts.reduce((sum, c) => sum + c.substitutions, 0),
    deletions: counts.reduce((sum, c) => sum + c.deletions, 0),
    insertions: counts.reduce((sum, c) => sum + c.insertions, 0),
    wer: corpusWordErrorRate(counts),
    medianSeconds: median(times),
    p95Seconds: percentile(times, 95),
    audioSeconds,
    realTimeFactor: answered === 0 ? 0 : waited / answered,
    worst: [...lines]
      .sort((a, b) => b.errors - a.errors || b.wer - a.wer)
      .slice(0, WORST_LINES),
  };
}

// ---------------------------------------------------------------------------------------- 7b

export type FormatName = "wav" | "webm" | "mp4";

export type FormatsResult = {
  clips: number;
  tolerance: number;
  /** Corpus WER over the same clips, per form. */
  wer: Record<FormatName, number>;
  /** WER of the form minus the WER of the WAV: positive is worse. */
  difference: Record<"webm" | "mp4", number>;
  failed: number;
  passed: boolean;
  problems: string[];
};

const DECLARED_TYPE: Record<FormatName, string> = {
  wav: "audio/wav",
  // What MediaRecorder reports in Chrome and Firefox, and in Safari for mp4.
  webm: "audio/webm;codecs=opus",
  mp4: "audio/mp4",
};

export async function measureFormats(
  clips: readonly Clip[],
  transcribe: Transcribe,
  convert: Convert,
  readAudio: (clip: Clip) => Promise<Uint8Array> = async (clip) =>
    Bun.file(clip.path).bytes(),
): Promise<FormatsResult> {
  const counts: Record<FormatName, WordErrors[]> = {
    wav: [],
    webm: [],
    mp4: [],
  };
  let failed = 0;
  const problems: string[] = [];
  for (const clip of clips) {
    const wav = await readAudio(clip);
    const forms: Record<FormatName, Uint8Array> = {
      wav,
      webm: await convert(wav, "webm"),
      mp4: await convert(wav, "mp4"),
    };
    for (const name of ["wav", "webm", "mp4"] as const) {
      const answer = await timed(async () =>
        transcribe(forms[name], DECLARED_TYPE[name]),
      );
      if (answer.error) {
        failed++;
        problems.push(`${clip.id} as ${name}: ${answer.error}`);
      }
      counts[name].push(wordErrorRate(clip.reference, answer.text));
    }
  }
  const wer = {
    wav: corpusWordErrorRate(counts.wav),
    webm: corpusWordErrorRate(counts.webm),
    mp4: corpusWordErrorRate(counts.mp4),
  };
  const difference = { webm: wer.webm - wer.wav, mp4: wer.mp4 - wer.wav };
  for (const name of ["webm", "mp4"] as const) {
    // Rounded to a tenth of a point first, so 2.0 points exactly is not failed by a float's last digit.
    if (Math.round(difference[name] * 1000) / 1000 > FORMAT_TOLERANCE) {
      problems.push(
        `${name} is ${(difference[name] * 100).toFixed(1)} WER points worse than wav; the most allowed is ${FORMAT_TOLERANCE * 100}.`,
      );
    }
  }
  return {
    clips: clips.length,
    tolerance: FORMAT_TOLERANCE,
    wer,
    difference,
    failed,
    passed: problems.length === 0,
    problems,
  };
}

/** ffmpeg as the browsers' MediaRecorder encodes: opus in webm, AAC in a fragmented mp4. */
export const ffmpegConvert: Convert = async (wav, format) => {
  const ffmpeg = Bun.which("ffmpeg");
  if (!ffmpeg) {
    throw new Error(
      "ffmpeg is needed for --formats and is not on the PATH. Install it (winget install ffmpeg, brew install ffmpeg, apt install ffmpeg) and run again.",
    );
  }
  const directory = mkdtempSync(join(tmpdir(), "freeduet-dictation-"));
  try {
    const input = join(directory, "input.wav");
    const output = join(directory, `output.${format}`);
    await Bun.write(input, wav);
    const encode =
      format === "webm"
        ? ["-c:a", "libopus", "-b:a", "32k", "-ar", "48000"]
        : [
            "-c:a",
            "aac",
            "-b:a",
            "64k",
            "-ar",
            "48000",
            "-movflags",
            "frag_keyframe+empty_moov",
          ];
    const child = Bun.spawn(
      [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input,
        "-ac",
        "1",
        ...encode,
        output,
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const [message, code] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0) {
      throw new Error(
        `ffmpeg could not make the ${format}: ${message.trim().slice(0, 300)}`,
      );
    }
    return await Bun.file(output).bytes();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

// ---------------------------------------------------------------------------------------- 7c

export type SilenceCase = {
  name: string;
  seconds: number;
  noise: boolean;
};

export const SILENCE_CASES: readonly SilenceCase[] = [
  { name: "digital silence, 5 s", seconds: 5, noise: false },
  { name: "digital silence, 30 s", seconds: 30, noise: false },
  { name: "low room noise, 5 s", seconds: 5, noise: true },
  { name: "low room noise, 30 s", seconds: 30, noise: true },
];

export type SilenceResult = {
  cases: { name: string; transcript: string; failure?: string }[];
  passed: boolean;
  problems: string[];
};

export function silenceWav(seconds: number, noise: boolean): Uint8Array {
  const length = seconds * SAMPLE_RATE;
  return pcm16Wav(
    noise ? roomNoiseSamples(length) : new Int16Array(length),
    SAMPLE_RATE,
  );
}

export async function measureSilence(
  transcribe: Transcribe,
  cases: readonly SilenceCase[] = SILENCE_CASES,
): Promise<SilenceResult> {
  const results: SilenceResult["cases"] = [];
  const problems: string[] = [];
  for (const item of cases) {
    const answer = await timed(async () =>
      transcribe(silenceWav(item.seconds, item.noise), "audio/wav"),
    );
    const transcript = answer.text;
    results.push({
      name: item.name,
      transcript,
      ...(answer.error ? { failure: answer.error } : {}),
    });
    if (answer.error) {
      problems.push(`${item.name}: the request failed (${answer.error})`);
    } else if (transcript.trim() !== "") {
      problems.push(`${item.name}: heard ${JSON.stringify(transcript)}`);
    }
  }
  return { cases: results, passed: problems.length === 0, problems };
}

// -------------------------------------------------------------------------------------- report

export type Report = {
  date: string;
  label: string;
  service: {
    provider: string;
    /** Whether the service is on this computer. The address itself is not written: it can be a secret. */
    endpoint: "this computer" | "elsewhere";
    model: string;
    language: string | null;
    promptSet: boolean;
    joinSegments: boolean;
  };
  dataset: string;
  wer?: WerResult;
  formats?: FormatsResult;
  silence?: SilenceResult;
  passed: boolean;
  problems: string[];
};

export function describeService(
  config: TranscriptionConfig,
): Report["service"] {
  const host = new URL(config.baseUrl).hostname;
  const local = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(host);
  return {
    provider: config.provider,
    endpoint: local ? "this computer" : "elsewhere",
    model: config.model,
    language: config.language ?? null,
    promptSet: Boolean(config.prompt),
    joinSegments: Boolean(config.joinSegments),
  };
}

export function reportName(
  date: string,
  label: string,
  modes: { wer: boolean; formats: boolean; silence: boolean },
  clips: number,
): string {
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  if (!safe) throw new Error("--model-label needs letters or digits.");
  const only = !modes.formats && !modes.silence && modes.wer;
  const parts = [date, safe];
  if (!only) {
    parts.push(
      [
        modes.wer && "wer",
        modes.formats && "formats",
        modes.silence && "silence",
      ]
        .filter(Boolean)
        .join("-"),
    );
  }
  if (modes.wer && clips !== DEFAULT_CLIPS) parts.push(`n${clips}`);
  return parts.join("-");
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const seconds = (value: number) => `${value.toFixed(2)} s`;
const cell = (text: string) =>
  text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function renderMarkdown(report: Report): string {
  const lines: string[] = [
    `# Dictation proof: ${report.label}`,
    "",
    `- Date: ${report.date}`,
    `- Service: ${report.service.provider}, on ${report.service.endpoint}, model \`${report.service.model}\``,
    `- Language sent: ${report.service.language ?? "none (the service decides)"}; prompt sent: ${report.service.promptSet ? "yes" : "no"}`,
    `- Result: **${report.passed ? "passed" : "FAILED"}**`,
    "",
  ];
  for (const problem of report.problems) lines.push(`- Problem: ${problem}`);
  if (report.problems.length > 0) lines.push("");
  if (report.wer) {
    const w = report.wer;
    lines.push(
      "## 7a. Word error rate",
      "",
      `Data: the Italian test split of Google FLEURS (google/fleurs, CC BY 4.0), ${w.clips} clips picked evenly from its list. One uncounted request is sent first, so the model is loaded. ${NORMALISATION_SUMMARY}`,
      "",
      "| Measure | Value |",
      "|---|---|",
      `| Word error rate | ${percent(w.wer)} (${w.substitutions} substituted, ${w.deletions} deleted, ${w.insertions} inserted, of ${w.refWords} words) |`,
      `| Requests that failed | ${w.failed} |`,
      `| Median time per request | ${seconds(w.medianSeconds)} |`,
      `| 95th percentile | ${seconds(w.p95Seconds)} |`,
      `| Audio sent | ${w.audioSeconds.toFixed(0)} s, waited ${w.realTimeFactor.toFixed(2)} s per second of audio |`,
      "",
      `The ${w.worst.length} worst lines:`,
      "",
      "| Clip | Errors | Reference | Heard |",
      "|---|---|---|---|",
      ...w.worst.map(
        (line) =>
          `| ${line.id} | ${line.errors} of ${line.refWords} | ${cell(line.reference)} | ${cell(line.failure ? `(request failed: ${line.failure})` : line.hypothesis)} |`,
      ),
      "",
    );
  }
  if (report.formats) {
    const f = report.formats;
    lines.push(
      "## 7b. Formats",
      "",
      `${f.clips} clips, each as WAV, as webm/opus (32 kbit/s) and as fragmented mp4/aac (64 kbit/s), made by ffmpeg. A compressed form passes when it is not worse than the WAV by more than ${f.tolerance * 100} WER points.`,
      "",
      "| Form | Word error rate | Against wav |",
      "|---|---|---|",
      `| wav | ${percent(f.wer.wav)} | |`,
      `| webm/opus | ${percent(f.wer.webm)} | ${(f.difference.webm * 100).toFixed(1)} points |`,
      `| mp4/aac | ${percent(f.wer.mp4)} | ${(f.difference.mp4 * 100).toFixed(1)} points |`,
      "",
    );
  }
  if (report.silence) {
    lines.push(
      "## 7c. Silence and room noise",
      "",
      "Digital silence and low room noise (white noise at about -50 dBFS), sent as WAV. Every transcript must be empty.",
      "",
      "| Case | Transcript |",
      "|---|---|",
      ...report.silence.cases.map(
        (item) =>
          `| ${item.name} | ${item.failure ? `request failed: ${cell(item.failure)}` : item.transcript.trim() === "" ? "(empty)" : cell(JSON.stringify(item.transcript))} |`,
      ),
      "",
    );
  }
  return lines.join("\n");
}

// ----------------------------------------------------------------------------------------- CLI

type Options = {
  n: number;
  label?: string;
  wer: boolean;
  formats: boolean;
  silence: boolean;
  maxWer?: number;
};

export function parseArguments(argv: readonly string[]): Options {
  const options: Options = {
    n: DEFAULT_CLIPS,
    wer: false,
    formats: false,
    silence: false,
  };
  const value = (flag: string, index: number) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${flag} needs a value.`);
    }
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index] as string;
    if (flag === "--n") {
      const n = Number(value(flag, index++));
      if (!Number.isInteger(n) || n < 1 || n > 800) {
        throw new Error("--n must be a whole number from 1 to 800.");
      }
      options.n = n;
    } else if (flag === "--model-label") {
      options.label = value(flag, index++);
    } else if (flag === "--max-wer") {
      const pct = Number(value(flag, index++));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new Error("--max-wer is a percentage from 0 to 100.");
      }
      options.maxWer = pct / 100;
    } else if (flag === "--formats") options.formats = true;
    else if (flag === "--silence") options.silence = true;
    else if (flag === "--wer") options.wer = true;
    else
      throw new Error(
        `Unknown option ${flag}. See the top of evals/dictation/wer.ts.`,
      );
  }
  if (!options.formats && !options.silence) options.wer = true;
  return options;
}

async function main() {
  let options: Options;
  let config: TranscriptionConfig | undefined;
  try {
    options = parseArguments(process.argv.slice(2));
    config = transcriptionConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  if (!config) {
    console.error(
      "No transcription service is set up. Run this with the settings dictation uses, for the local Whisper: bun --env-file=openbot/.env evals/dictation/wer.ts",
    );
    process.exit(1);
  }
  const transcribe = productTranscribe(createTranscriptionProvider(config));
  const here = import.meta.dir;

  // One request nobody counts: the service is up, and the model is in memory when the clock starts.
  const warm = await timed(() => transcribe(silenceWav(2, true), "audio/wav"));
  if (warm.error) {
    console.error(`The transcription service did not answer: ${warm.error}`);
    process.exit(1);
  }

  const report: Report = {
    date: new Date().toISOString().slice(0, 10),
    label:
      options.label ??
      process.env.FREEDUET_WHISPER_MODEL?.trim() ??
      config.model,
    service: describeService(config),
    dataset: "google/fleurs, Italian (it_it), test split, CC BY 4.0",
    passed: true,
    problems: [],
  };
  const log = (line: string) => console.error(line);

  if (options.wer || options.formats) {
    const wanted = options.wer ? options.n : FORMAT_CLIPS;
    const clips = await loadClips({
      n: wanted,
      cacheDir: join(here, ".cache"),
      log,
    });
    if (options.wer) {
      report.wer = await measureWer(
        clips,
        transcribe,
        undefined,
        (done, total) => {
          if (done % 10 === 0 || done === total) log(`7a: ${done} of ${total}`);
        },
      );
      if (report.wer.failed > 0) {
        report.problems.push(`${report.wer.failed} requests failed in 7a.`);
      }
      if (options.maxWer !== undefined && report.wer.wer > options.maxWer) {
        report.problems.push(
          `The word error rate ${percent(report.wer.wer)} is above the ${percent(options.maxWer)} asked for.`,
        );
      }
    }
    if (options.formats) {
      const five = pickFive(clips);
      report.formats = await measureFormats(five, transcribe, ffmpegConvert);
      report.problems.push(...report.formats.problems.map((p) => `7b: ${p}`));
    }
  }
  if (options.silence) {
    report.silence = await measureSilence(transcribe);
    report.problems.push(...report.silence.problems.map((p) => `7c: ${p}`));
  }
  report.passed = report.problems.length === 0;

  const name = reportName(
    report.date,
    report.label,
    options,
    report.wer?.clips ?? options.n,
  );
  const reports = join(here, "reports");
  mkdirSync(reports, { recursive: true });
  await Bun.write(
    join(reports, `${name}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await Bun.write(join(reports, `${name}.md`), renderMarkdown(report));
  console.log(renderMarkdown(report));
  console.error(`Written: evals/dictation/reports/${name}.{json,md}`);
  process.exit(report.passed ? 0 : 1);
}

function pickFive(clips: readonly Clip[]): Clip[] {
  const step = clips.length / FORMAT_CLIPS;
  return Array.from(
    { length: Math.min(FORMAT_CLIPS, clips.length) },
    (_, index) => clips[Math.floor(index * step)] as Clip,
  );
}

if (import.meta.main) await main();
