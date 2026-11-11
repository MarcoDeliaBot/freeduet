import { describe, expect, test } from "bun:test";
import {
  corpusWordErrorRate,
  median,
  normalizeText,
  parseFleursTsv,
  percentile,
  pickEvenly,
  pcm16Wav,
  roomNoiseSamples,
  wavDurationSeconds,
  wordErrorRate,
} from "./metrics";

/** Every expected number below was counted by hand from the words, not taken from the function. */
describe("wordErrorRate", () => {
  test("identical text is 0", () => {
    expect(wordErrorRate("il gatto dorme", "il gatto dorme")).toEqual({
      refWords: 3,
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      errors: 0,
      wer: 0,
    });
  });

  test("one substituted word out of three is 1/3", () => {
    // il gatto dorme / il cane dorme: gatto -> cane
    expect(wordErrorRate("il gatto dorme", "il cane dorme")).toEqual({
      refWords: 3,
      substitutions: 1,
      deletions: 0,
      insertions: 0,
      errors: 1,
      wer: 1 / 3,
    });
  });

  test("one inserted word is 1/3 of a three-word reference", () => {
    expect(wordErrorRate("il gatto dorme", "il gatto dorme qui")).toEqual({
      refWords: 3,
      substitutions: 0,
      deletions: 0,
      insertions: 1,
      errors: 1,
      wer: 1 / 3,
    });
  });

  test("one deleted word is 1/3", () => {
    expect(wordErrorRate("il gatto dorme", "il dorme")).toEqual({
      refWords: 3,
      substitutions: 0,
      deletions: 1,
      insertions: 0,
      errors: 1,
      wer: 1 / 3,
    });
  });

  test("a hypothesis with nothing in it is every word deleted: 1", () => {
    expect(wordErrorRate("uno due tre", "")).toEqual({
      refWords: 3,
      substitutions: 0,
      deletions: 3,
      insertions: 0,
      errors: 3,
      wer: 1,
    });
  });

  test("two empty texts are 0; words against an empty reference count as wholly wrong", () => {
    expect(wordErrorRate("", "").wer).toBe(0);
    expect(wordErrorRate("   ", "...").wer).toBe(0);
    // No reference words means no rate: any insertion is reported as 1, so a transcript invented
    // for silence can never look like a good one.
    expect(wordErrorRate("", "grazie a tutti")).toEqual({
      refWords: 0,
      substitutions: 0,
      deletions: 0,
      insertions: 3,
      errors: 3,
      wer: 1,
    });
  });

  test("a mix of all three: uno due tre quattro / uno tre cinque quattro sei needs 3 edits, 3/4", () => {
    // Best alignment: delete "due", insert "cinque", insert "sei" (or two substitutions and one
    // insertion): three edits either way, and no alignment does it in two.
    const result = wordErrorRate(
      "uno due tre quattro",
      "uno tre cinque quattro sei",
    );
    expect(result.refWords).toBe(4);
    expect(result.errors).toBe(3);
    expect(result.wer).toBe(0.75);
    expect(result.substitutions + result.deletions + result.insertions).toBe(3);
  });

  test("a hypothesis wholly different and longer can exceed 1", () => {
    // a b / x y z: 2 substitutions + 1 insertion = 3 errors over 2 words
    expect(wordErrorRate("a b", "x y z").wer).toBe(1.5);
  });

  test("case, punctuation and typographic apostrophes do not count as errors", () => {
    expect(
      wordErrorRate(
        "L'incidente è avvenuto in alta montagna, e si ritiene sia stato causato da fuoco nemico.",
        "l’incidente è avvenuto in alta montagna e si ritiene sia stato causato da fuoco nemico",
      ).wer,
    ).toBe(0);
  });

  test("a word that really differs is still an error after normalising", () => {
    expect(wordErrorRate("Roma è bella", "Roma e bella").errors).toBe(1);
  });
});

describe("normalizeText", () => {
  test("lower case, no punctuation, apostrophes inside words kept, one space between words", () => {
    expect(normalizeText("  Dell’11 Settembre, «Marco»: “ciao”!  ")).toBe(
      "dell'11 settembre marco ciao",
    );
    expect(normalizeText("auto-mobile 3,5 'quasi'")).toBe(
      "auto mobile 3 5 quasi",
    );
    expect(normalizeText("")).toBe("");
    expect(normalizeText("...")).toBe("");
  });
});

describe("corpusWordErrorRate", () => {
  test("is total errors over total reference words, not the mean of the rates", () => {
    // 1 error in 3 words and 0 errors in 1 word: 1/4, where the mean of 1/3 and 0 would be 1/6.
    expect(
      corpusWordErrorRate([
        wordErrorRate("il gatto dorme", "il cane dorme"),
        wordErrorRate("ciao", "ciao"),
      ]),
    ).toBe(0.25);
    expect(corpusWordErrorRate([])).toBe(0);
  });
});

describe("median and percentile", () => {
  test("median of an odd and of an even list", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  test("percentile is the nearest rank", () => {
    const ten = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];
    expect(percentile(ten, 50)).toBe(5);
    expect(percentile(ten, 95)).toBe(10);
    expect(percentile(ten, 90)).toBe(9);
    expect(percentile(ten, 10)).toBe(1);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("FLEURS rows", () => {
  const tsv = [
    "11\t100.wav\tCiao, Marco.\tciao marco\tc i a o\t1000\tFEMALE",
    "11\t101.wav\tCiao, Marco.\tciao marco\tc i a o\t1000\tMALE",
    "12\t102.wav\tCome stai?\tcome stai\tc o m e\t2000\tFEMALE",
    "",
  ].join("\n");

  test("reads the file name and the human transcript with its punctuation", () => {
    expect(parseFleursTsv(tsv)).toEqual([
      {
        id: "100",
        fileName: "100.wav",
        reference: "Ciao, Marco.",
        samples: 1000,
      },
      {
        id: "101",
        fileName: "101.wav",
        reference: "Ciao, Marco.",
        samples: 1000,
      },
      {
        id: "102",
        fileName: "102.wav",
        reference: "Come stai?",
        samples: 2000,
      },
    ]);
  });

  test("a row with too few columns is an error naming the line, not a silently shorter corpus", () => {
    expect(() => parseFleursTsv("11\t100.wav\n")).toThrow("line 1");
  });

  test("picks n rows spread evenly over the file, the same ones every time", () => {
    const rows = Array.from({ length: 10 }, (_, index) => index);
    expect(pickEvenly(rows, 5)).toEqual([0, 2, 4, 6, 8]);
    expect(pickEvenly(rows, 3)).toEqual([0, 3, 6]);
    expect(pickEvenly(rows, 10)).toEqual(rows);
    expect(pickEvenly(rows, 50)).toEqual(rows);
    expect(pickEvenly(rows, 0)).toEqual([]);
  });
});

describe("generated audio", () => {
  test("a WAV has a 44-byte PCM header that says what the samples are", () => {
    const samples = new Int16Array([0, 1, -1, 32767]);
    const wav = pcm16Wav(samples, 16000);
    expect(wav.length).toBe(44 + 8);
    const text = (from: number, to: number) =>
      new TextDecoder().decode(wav.slice(from, to));
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(text(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(36 + 8);
    expect(text(8, 16)).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000); // bytes per second
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 40)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(1);
    expect(view.getInt16(48, true)).toBe(-1);
    expect(view.getInt16(50, true)).toBe(32767);
  });

  test("its length in seconds is read back from the header", () => {
    expect(wavDurationSeconds(pcm16Wav(new Int16Array(16000 * 5), 16000))).toBe(
      5,
    );
    expect(wavDurationSeconds(pcm16Wav(new Int16Array(24000), 48000))).toBe(
      0.5,
    );
    expect(() => wavDurationSeconds(new Uint8Array(10))).toThrow("WAV");
  });

  test("room noise is quiet, never silent, and the same every time", () => {
    const noise = roomNoiseSamples(16000 * 5);
    expect(noise.length).toBe(16000 * 5);
    let sum = 0;
    for (const sample of noise) sum += (sample / 32768) ** 2;
    const rms = Math.sqrt(sum / noise.length);
    // About -50 dBFS: 0.003 of full scale, within 10%.
    expect(rms).toBeGreaterThan(0.0027);
    expect(rms).toBeLessThan(0.0033);
    expect(Math.max(...noise)).toBeLessThan(0.05 * 32768);
    expect(roomNoiseSamples(100)).toEqual(roomNoiseSamples(100));
  });
});
