import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const script = join(import.meta.dir, "threads.sh");

function run(call: string) {
  const result = Bun.spawnSync(["sh", "-c", `. "${script}"; ${call}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString().trim(),
    err: result.stderr.toString().trim(),
  };
}

describe("whisper_threads", () => {
  test("half the hardware threads, at least 4, at most 16", () => {
    const answers = [1, 2, 4, 8, 10, 12, 32, 64].map(
      (cpus) => run(`whisper_threads ${cpus}`).out,
    );
    expect(answers).toEqual(["4", "4", "4", "4", "5", "6", "16", "16"]);
  });

  test("an override wins, even above 16 or below 4", () => {
    expect(run("whisper_threads 32 2").out).toBe("2");
    expect(run("whisper_threads 8 24").out).toBe("24");
  });

  test("an empty override is no override", () => {
    expect(run('whisper_threads 32 ""').out).toBe("16");
  });

  test("an override that is not a whole number of 1 or more is refused in words", () => {
    for (const bad of ["0", "-2", "four", "2.5", "08"]) {
      const result = run(`whisper_threads 32 '${bad}'`);
      expect(result.code).toBe(1);
      expect(result.err).toBe(
        "WHISPER_THREADS must be a whole number of 1 or more.",
      );
      expect(result.out).toBe("");
    }
  });
});

describe("whisper_beam_args", () => {
  test("empty is greedy: no option at all", () => {
    expect(run('whisper_beam_args ""').out).toBe("");
    expect(run("whisper_beam_args").out).toBe("");
  });

  test("2 or more is --beam-size", () => {
    expect(run("whisper_beam_args 5").out).toBe("--beam-size 5");
    expect(run("whisper_beam_args 2").out).toBe("--beam-size 2");
  });

  test("1, 0 and anything else are refused, because the server treats 1 as greedy anyway", () => {
    for (const bad of ["1", "0", "-3", "wide"]) {
      const result = run(`whisper_beam_args '${bad}'`);
      expect(result.code).toBe(1);
      expect(result.err).toContain(
        "WHISPER_BEAM_SIZE must be a whole number of 2 or more",
      );
    }
  });
});

describe("whisper_vad_args", () => {
  test("on, or empty, is --vad with the model; the server's own VAD options are not touched", () => {
    expect(run('whisper_vad_args "" /models/v.bin').out).toBe(
      "--vad --vad-model /models/v.bin",
    );
    expect(run("whisper_vad_args on /models/v.bin").out).toBe(
      "--vad --vad-model /models/v.bin",
    );
  });

  test("off is nothing", () => {
    expect(run("whisper_vad_args off /models/v.bin").out).toBe("");
    expect(run("whisper_vad_args off /models/v.bin").code).toBe(0);
  });

  test("anything else is refused in words", () => {
    for (const bad of ["true", "1", "ON", "yes"]) {
      const result = run(`whisper_vad_args '${bad}' /models/v.bin`);
      expect(result.code).toBe(1);
      expect(result.err).toBe("WHISPER_VAD must be on or off.");
    }
  });
});

describe("entrypoint.sh", () => {
  test("refuses a WHISPER_VAD that is not on or off before it downloads anything", () => {
    const result = Bun.spawnSync(
      ["sh", join(import.meta.dir, "entrypoint.sh")],
      {
        env: { PATH: process.env.PATH ?? "", WHISPER_VAD: "maybe" },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain(
      "WHISPER_VAD must be on or off.",
    );
  });
});
