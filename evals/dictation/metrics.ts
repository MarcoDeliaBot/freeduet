/**
 * The measuring tools of the dictation proofs (wer.ts and openbot/scripts/freeduet-dictation-e2e.ts),
 * kept free of any network, file or model so metrics.test.ts can check them against numbers counted
 * by hand. Nothing here is a copy of a library: the word error rate is the textbook
 * Levenshtein distance over words, written out.
 */

/** The same rules as normalizeText in one sentence, for the reports a run writes. */
export const NORMALISATION_SUMMARY =
  "Both sides: Unicode NFC, lower case, typographic apostrophes to ', every character that is not a letter, digit or apostrophe becomes a space, apostrophes at the edge of a word dropped. Numbers are not rewritten, so the figure is slightly pessimistic.";

/**
 * How a transcript and its reference are made comparable. The SAME function runs on both sides:
 *  1. Unicode NFC, then lower case;
 *  2. typographic apostrophes (’ ‘ ʼ) become ';
 *  3. every character that is not a letter, a digit or an apostrophe becomes a space, so
 *     punctuation, quotation marks and hyphens separate words instead of joining them;
 *  4. apostrophes at the start or end of a word are dropped (quotation marks), those inside stay:
 *     "l'incidente" is one word on both sides;
 *  5. runs of spaces collapse to one.
 * Numbers are not rewritten: "11" against "undici" is an error, and so is "3,5" against "3.5" only
 * if one side spells them differently. A measured WER is therefore slightly pessimistic.
 */
export function normalizeText(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .split(" ")
    .map((word) => word.replace(/^'+|'+$/g, ""))
    .filter(Boolean)
    .join(" ");
}

export type WordErrors = {
  refWords: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  errors: number;
  wer: number;
};

/**
 * Word error rate: (substitutions + deletions + insertions) / words in the reference, from the
 * cheapest alignment of the two word lists. It can exceed 1.
 *
 * With no reference words there is no rate. Two empty texts are 0; any words against an empty
 * reference are reported as 1, so text invented for silence can never look like a good result.
 */
export function wordErrorRate(
  reference: string,
  hypothesis: string,
): WordErrors {
  const ref = normalizeText(reference).split(" ").filter(Boolean);
  const hyp = normalizeText(hypothesis).split(" ").filter(Boolean);
  const rows = ref.length + 1;
  const columns = hyp.length + 1;
  // cost[i][j]: cheapest way to turn the first i reference words into the first j hypothesis words.
  const cost: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(columns).fill(0),
  );
  for (let i = 0; i < rows; i++) (cost[i] as number[])[0] = i;
  for (let j = 0; j < columns; j++) (cost[0] as number[])[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      const same = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      (cost[i] as number[])[j] = Math.min(
        (cost[i - 1] as number[])[j - 1] + same,
        (cost[i - 1] as number[])[j] + 1,
        (cost[i] as number[])[j - 1] + 1,
      );
    }
  }
  // Walk back to say what kind of edit each was.
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let i = ref.length;
  let j = hyp.length;
  while (i > 0 || j > 0) {
    const here = (cost[i] as number[])[j] as number;
    if (
      i > 0 &&
      j > 0 &&
      here ===
        ((cost[i - 1] as number[])[j - 1] as number) +
          (ref[i - 1] === hyp[j - 1] ? 0 : 1)
    ) {
      if (ref[i - 1] !== hyp[j - 1]) substitutions++;
      i--;
      j--;
    } else if (i > 0 && here === ((cost[i - 1] as number[])[j] as number) + 1) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }
  const errors = substitutions + deletions + insertions;
  const wer = ref.length === 0 ? (errors === 0 ? 0 : 1) : errors / ref.length;
  return {
    refWords: ref.length,
    substitutions,
    deletions,
    insertions,
    errors,
    wer,
  };
}

/** Total errors over total reference words: a long sentence counts for more than a short one. */
export function corpusWordErrorRate(results: readonly WordErrors[]): number {
  let errors = 0;
  let words = 0;
  for (const result of results) {
    errors += result.errors;
    words += result.refWords;
  }
  return words === 0 ? 0 : errors / words;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

/** Nearest rank: the smallest value with at least p percent of the values at or below it. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1] as number;
}

export type FleursRow = {
  id: string;
  fileName: string;
  reference: string;
  /** Samples in the recording, at 16 kHz; 0 when the row does not say. */
  samples: number;
};

/**
 * `data/<language>/<split>.tsv` of google/fleurs: tab separated, one row per recording, with the
 * sentence id, the audio file name, the sentence as a person wrote it (case and punctuation), then
 * Google's own normalised form, its characters, the sample count and the speaker's gender. Only the
 * first three are used. The audio file name stands for the row, as it is unique where the sentence id
 * is not (several people read the same sentence).
 */
export function parseFleursTsv(text: string): FleursRow[] {
  const rows: FleursRow[] = [];
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    const columns = line.replace(/\r$/, "").split("\t");
    const fileName = columns[1];
    const reference = columns[2];
    if (columns.length < 4 || !fileName || !reference) {
      throw new Error(
        `FLEURS test.tsv line ${index + 1} does not have the expected columns (id, file name, transcript, ...). The dataset's layout may have changed.`,
      );
    }
    rows.push({
      id: fileName.replace(/\.wav$/, ""),
      fileName,
      reference,
      samples: Number(columns[5]) || 0,
    });
  }
  return rows;
}

/** n items spread evenly over the list, from its first, the same ones every time. */
export function pickEvenly<T>(items: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  if (n >= items.length) return [...items];
  return Array.from(
    { length: n },
    (_, index) => items[Math.floor((index * items.length) / n)] as T,
  );
}

/** 16-bit mono PCM samples as a WAV file. */
export function pcm16Wav(samples: Int16Array, sampleRate: number): Uint8Array {
  const data = samples.length * 2;
  const wav = new Uint8Array(44 + data);
  const view = new DataView(wav.buffer);
  const write = (at: number, text: string) => {
    for (let index = 0; index < text.length; index++)
      wav[at + index] = text.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + data, true);
  write(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, data, true);
  for (const [index, sample] of samples.entries())
    view.setInt16(44 + index * 2, sample, true);
  return wav;
}

export const WAV_SAMPLE_RATE = 16000;

/**
 * Reads a WAV file by walking its chunks, the way the format is laid out, and gives its samples as
 * 16-bit integers. It takes mono, 16 kHz, as PCM 16-bit (format 1) or IEEE float 32-bit (format 3,
 * which is what the FLEURS clips are: an 18-byte `fmt ` chunk and a `fact` chunk before `data`; floats
 * are clamped to -1..1). Chunks it does not know (`fact`, `LIST`, ...) are skipped, odd-sized ones
 * include their padding byte, and the `data` chunk's own size is honoured. Anything else is refused
 * with a sentence naming what the file is, because a wrong guess here makes noise out of speech.
 */
export function readWav(
  wav: Uint8Array,
  options: { anyRate?: boolean } = {},
): {
  sampleRate: number;
  samples: Int16Array;
} {
  const text = (at: number) => new TextDecoder().decode(wav.slice(at, at + 4));
  if (wav.length < 12 || text(0) !== "RIFF" || text(8) !== "WAVE") {
    throw new Error("Not a WAV file.");
  }
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  let format:
    | { tag: number; channels: number; rate: number; bits: number }
    | undefined;
  let at = 12;
  while (at + 8 <= wav.length) {
    const id = text(at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > wav.length) {
        throw new Error("The WAV file's fmt chunk is cut short.");
      }
      format = {
        tag: view.getUint16(body, true),
        channels: view.getUint16(body + 2, true),
        rate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (!format) throw new Error("The WAV file has data before its format.");
      if (body + size > wav.length) {
        throw new Error(
          `The WAV file is cut short: its data chunk says ${size} bytes and ${wav.length - body} are there.`,
        );
      }
      const name = `${format.tag === 3 ? "IEEE float" : format.tag === 1 ? "PCM" : `format ${format.tag}`}, ${format.bits}-bit, ${format.channels} channel${format.channels === 1 ? "" : "s"}, ${format.rate} Hz`;
      const pcm16 = format.tag === 1 && format.bits === 16;
      const float32 = format.tag === 3 && format.bits === 32;
      if (!pcm16 && !float32) {
        throw new Error(
          `A WAV of ${name} is not supported: only PCM 16-bit and IEEE float 32-bit.`,
        );
      }
      if (format.channels !== 1) {
        throw new Error(`A WAV of ${name} is not supported: only mono.`);
      }
      if (!options.anyRate && format.rate !== WAV_SAMPLE_RATE) {
        throw new Error(
          `A WAV of ${name} is not supported: only ${WAV_SAMPLE_RATE} Hz.`,
        );
      }
      const bytes = pcm16 ? 2 : 4;
      const samples = new Int16Array(Math.floor(size / bytes));
      for (let index = 0; index < samples.length; index++) {
        if (pcm16) {
          samples[index] = view.getInt16(body + index * 2, true);
        } else {
          const value = Math.max(
            -1,
            Math.min(1, view.getFloat32(body + index * 4, true)),
          );
          samples[index] = Math.round(value * 32767);
        }
      }
      return { sampleRate: format.rate, samples };
    }
    // Chunks are padded to an even size.
    at = body + size + (size % 2);
  }
  throw new Error(
    format
      ? "The WAV file has no data chunk."
      : "The WAV file has no fmt chunk.",
  );
}

/** Seconds of audio in a WAV that readWav accepts, at any sample rate. */
export function wavDurationSeconds(wav: Uint8Array): number {
  const { sampleRate, samples } = readWav(wav, { anyRate: true });
  return samples.length / sampleRate;
}

/**
 * Low room noise: Gaussian white noise at about -50 dBFS (RMS 0.003 of full scale), from a fixed
 * seed so a failure can be run again. Quiet enough to be a room with nobody speaking, never the
 * digital zero that a file of silence is.
 */
export function roomNoiseSamples(length: number, rms = 0.003): Int16Array {
  // mulberry32, and Box-Muller on top of it.
  let state = 0x2f6e2b1;
  const uniform = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw = new Float64Array(length);
  let power = 0;
  for (let index = 0; index < length; index++) {
    const radius = Math.sqrt(-2 * Math.log(1 - uniform()));
    raw[index] = radius * Math.cos(2 * Math.PI * uniform());
    power += (raw[index] as number) ** 2;
  }
  const scale = length === 0 ? 0 : (rms * 32768) / Math.sqrt(power / length);
  return Int16Array.from(raw, (value) => Math.round(value * scale));
}
