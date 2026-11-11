/**
 * Proof 7d of dictation (docs/M1_PLAN.md D25): the whole path in a real browser, from the microphone
 * button to the words in the message box, on a stack that is already running.
 *
 *   bun --env-file=openbot/.env openbot/scripts/freeduet-dictation-e2e.ts --app http://localhost:3010
 *
 * Chrome is started with a fake microphone that plays a recording of a person reading an Italian
 * sentence (a clip of the FLEURS test split, the same cache evals/dictation/wer.ts fills). The script
 * opens a new conversation, presses "Dictate a message", waits for the clip to finish, presses "Stop
 * and transcribe" and reads what lands in the message box. It fails, with the sentence the app showed,
 * when that text is further from the reference than --max-wer allows (default 25 percent over the
 * clips) or when the app shows an error instead. Nothing is sent to a member: the text stays in the
 * draft, and the conversation is left as it is.
 *
 * Options:  --app <url>        the app (default http://localhost:3010)
 *           --clips <n>        how many clips, each in its own browser (default 3)
 *           --max-wer <pct>    default 25
 *           --chromium <path>  a Chrome or Chromium binary; E2E_CHROMIUM does the same. Without
 *                              either, the Google Chrome that is installed is used.
 *           --headed           show the browser
 *
 * Sign-in. Out of the box the app is single-user and asks for nothing. When it asks (OIDC), this script
 * has no sign-in of its own, and no way around one: put the Cookie header of a signed-in browser
 * session in the environment variable E2E_COOKIE. It is read from the environment only, is never
 * printed, and is never written anywhere. Without it the script stops and says so.
 */
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Clip, loadClips } from "../../evals/dictation/fleurs";
import {
  corpusWordErrorRate,
  pcm16Wav,
  readWav,
  wordErrorRate,
} from "../../evals/dictation/metrics";

const require = createRequire(join(import.meta.dir, "../package.json"));
const { chromium } =
  require("playwright-core") as typeof import("playwright-core");

const LEAD_SECONDS = 1;
const TAIL_SECONDS = 1.5;
/** The server gives a recording 60 s; the page may take a little longer to show the answer. */
const ANSWER_TIMEOUT_MS = 75_000;

export type Options = {
  app: string;
  clips: number;
  maxWer: number;
  chromium?: string;
  headed: boolean;
};

export function parseArguments(
  argv: readonly string[],
  environment: Record<string, string | undefined> = process.env,
): Options {
  const options: Options = {
    app: "http://localhost:3010",
    clips: 3,
    maxWer: 0.25,
    ...(environment.E2E_CHROMIUM ? { chromium: environment.E2E_CHROMIUM } : {}),
    headed: false,
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
    if (flag === "--app") {
      const app = value(flag, index++);
      try {
        const url = new URL(app);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        options.app = url.origin;
      } catch {
        throw new Error(
          "--app must be an http(s) address such as http://localhost:3010.",
        );
      }
    } else if (flag === "--clips") {
      const n = Number(value(flag, index++));
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        throw new Error("--clips must be a whole number from 1 to 20.");
      }
      options.clips = n;
    } else if (flag === "--max-wer") {
      const pct = Number(value(flag, index++));
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new Error("--max-wer is a percentage from 0 to 100.");
      }
      options.maxWer = pct / 100;
    } else if (flag === "--chromium") options.chromium = value(flag, index++);
    else if (flag === "--headed") options.headed = true;
    else
      throw new Error(
        `Unknown option ${flag}. See the top of openbot/scripts/freeduet-dictation-e2e.ts.`,
      );
  }
  return options;
}

/** "a=1; b=2" as the cookies a browser context takes, for the app's own address. */
export function parseCookieHeader(
  header: string,
  app: string,
): { name: string; value: string; url: string }[] {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf("=");
      if (at < 1)
        throw new Error("E2E_COOKIE must look like name=value; name2=value2.");
      return { name: part.slice(0, at), value: part.slice(at + 1), url: app };
    });
}

/** The clip with a second of silence before it and after it, so no first word is lost to the start. */
export function paddedWav(wav: Uint8Array): Uint8Array {
  // Whatever the clip is (FLEURS is 32-bit float), what Chrome's fake microphone gets is PCM 16-bit.
  const { sampleRate, samples } = readWav(wav);
  const lead = Math.round(LEAD_SECONDS * sampleRate);
  const tail = Math.round(TAIL_SECONDS * sampleRate);
  const padded = new Int16Array(lead + samples.length + tail);
  padded.set(samples, lead);
  return pcm16Wav(padded, sampleRate);
}

export type Outcome =
  | { kind: "text"; text: string }
  | { kind: "error"; text: string }
  | { kind: "timeout" };

/** The words that land in the message box, or the error the app shows in its place. */
async function waitForOutcome(page: Page, timeoutMs: number): Promise<Outcome> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alert = page.getByRole("alert");
    if ((await alert.count()) > 0) {
      return { kind: "error", text: (await alert.first().innerText()).trim() };
    }
    const box = page.getByRole("textbox", { name: "Message" });
    if ((await box.count()) > 0) {
      const text = (await box.first().innerText()).trim();
      if (text) return { kind: "text", text };
    }
    await page.waitForTimeout(250);
  }
  return { kind: "timeout" };
}

class SignInRequired extends Error {}

async function dictateOnce(
  options: Options,
  clip: Clip,
  directory: string,
  cookie: string | undefined,
): Promise<{ heard: string; transcriptionStatus: number | null }> {
  const wavPath = join(directory, `${clip.id}.wav`);
  await Bun.write(wavPath, paddedWav(await Bun.file(clip.path).bytes()));
  const browser = await chromium.launch({
    ...(options.chromium
      ? { executablePath: options.chromium }
      : { channel: "chrome" }),
    headless: !options.headed,
    args: [
      // As root (a container, WSL as root) Chrome refuses to start without it.
      ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      // %noloop: the clip plays once, then the microphone is silent.
      `--use-file-for-fake-audio-capture=${wavPath}%noloop`,
    ],
  });
  try {
    const context = await browser.newContext();
    if (cookie)
      await context.addCookies(parseCookieHeader(cookie, options.app));
    const page = await context.newPage();
    let transcriptionStatus: number | null = null;
    page.on("response", (response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/audio/transcriptions"
      ) {
        transcriptionStatus = response.status();
      }
    });
    const created = await page.request.post(`${options.app}/api/channels`, {
      headers: { origin: options.app },
      data: { agentIds: ["freeduet"] },
      timeout: 30_000,
    });
    if (created.status() === 401 || created.status() === 403) {
      throw new SignInRequired();
    }
    if (!created.ok()) {
      throw new Error(
        `Creating the conversation answered HTTP ${created.status()}.`,
      );
    }
    const body = (await created.json()) as { channel?: { id?: unknown } };
    if (typeof body.channel?.id !== "string" || !body.channel.id) {
      throw new Error("Creating the conversation returned no channel id.");
    }
    await page.goto(`${options.app}/channel/${body.channel.id}`, {
      waitUntil: "load",
    });
    const mic = page.getByRole("button", { name: "Dictate a message" });
    try {
      await mic.waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      if (/sign[-_ ]?in|login/i.test(new URL(page.url()).pathname)) {
        throw new SignInRequired();
      }
      throw new Error(
        'The page has no "Dictate a message" button. Dictation is not switched on in this app: the server has no TRANSCRIPTION_* settings (for the local Whisper, FREEDUET_DICTATION=local in .env, then start again).',
      );
    }
    await mic.click();
    await page
      .getByRole("button", { name: "Stop and transcribe" })
      .waitFor({ state: "visible", timeout: 20_000 });
    await page.waitForTimeout(
      Math.ceil((LEAD_SECONDS + clip.seconds + 0.75) * 1000),
    );
    await page.getByRole("button", { name: "Stop and transcribe" }).click();
    const outcome = await waitForOutcome(page, ANSWER_TIMEOUT_MS);
    if (outcome.kind === "error") {
      throw new Error(
        `The app showed an error instead of text: "${outcome.text}"`,
      );
    }
    if (outcome.kind === "timeout") {
      throw new Error(
        `No text appeared in the message box within ${ANSWER_TIMEOUT_MS / 1000} s.`,
      );
    }
    return { heard: outcome.text, transcriptionStatus };
  } finally {
    await browser.close();
  }
}

async function main() {
  let options: Options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  const cookie = process.env.E2E_COOKIE?.trim() || undefined;
  try {
    if (cookie) parseCookieHeader(cookie, options.app);
  } catch (error) {
    // Only the sentence: the value of the cookie is never part of a message.
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
  if (options.chromium && !existsSync(options.chromium)) {
    console.error(`${options.chromium} does not exist.`);
    process.exit(2);
  }
  const clips = await loadClips({
    n: options.clips,
    cacheDir: join(import.meta.dir, "../../evals/dictation/.cache"),
    log: (line) => console.error(line),
  });
  const directory = mkdtempSync(join(tmpdir(), "freeduet-dictation-e2e-"));
  const counts = [];
  try {
    for (const clip of clips) {
      const { heard, transcriptionStatus } = await dictateOnce(
        options,
        clip,
        directory,
        cookie,
      );
      const result = wordErrorRate(clip.reference, heard);
      counts.push(result);
      console.log(
        `clip ${clip.id}: ${result.errors} errors in ${result.refWords} words (HTTP ${transcriptionStatus ?? "?"})\n  said:  ${clip.reference}\n  shown: ${heard}`,
      );
    }
  } catch (error) {
    if (error instanceof SignInRequired) {
      console.error(
        "The app asks for sign-in, and this script has no sign-in of its own. Put the Cookie header of a signed-in browser session in the environment variable E2E_COOKIE (it is never printed or stored), or run the stack in single-user mode, which is the default.",
      );
      process.exit(2);
    }
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  const wer = corpusWordErrorRate(counts);
  const passed = wer <= options.maxWer;
  console.log(
    `${passed ? "PASSED" : "FAILED"}: word error rate ${(wer * 100).toFixed(1)}% over ${counts.length} clips (at most ${(options.maxWer * 100).toFixed(0)}% allowed).`,
  );
  process.exit(passed ? 0 : 1);
}

if (import.meta.main) await main();
