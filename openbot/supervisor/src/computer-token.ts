import { createHmac } from "node:crypto";

/**
 * The token one Bot's computer checks its callers against.
 *
 * Every per-Bot computer used to be given the same `COMPUTER_TOKEN`, and a Bot's computer is where a
 * prompt-injected page or a poisoned file gets to run commands. The shell is a child of the computer
 * process and runs as the same user, so it can read that process's environment (`/proc/<parent>/environ`)
 * even though the environment it is given is filtered. One shared token therefore put the secret that
 * opens every other Bot's computer, with its signed-in browser, its files and its `/exec`, inside the
 * one place an attacker is most likely to be.
 *
 * Each computer now holds a token of its own, and only that one. It is derived rather than made up and
 * stored: an HMAC over the Bot and the deployment, keyed by a secret that stays in this process.
 *
 * - Nothing new is stored. A computer that is replaced (an image upgrade, a changed documents folder,
 *   a reset) is given the same token again, so the server, which learns tokens from this supervisor,
 *   never holds one for a container that no longer exists. A random token would need a place to live
 *   across a supervisor restart, and a copy in a container label is a copy readable by anything that
 *   can read labels.
 * - One computer's token says nothing about another's. HMAC is a pseudo-random function: a computer
 *   that knows its own token, however it learned it, cannot compute a neighbour's without the key.
 * - The key is `SUPERVISOR_TOKEN`, which already is the secret only the API server and this process
 *   hold, and which `environmentFor` never hands to a computer. The one thing that would defeat this
 *   is a key a computer can guess, which is why `index.ts` says so at start when it is short.
 *
 * The prefix names what the value is for, so the same key could never be reused for another purpose by
 * accident; the version lets a future change make different values without colliding with these. The
 * separators are NUL, which neither a namespace nor a Bot id may contain (`names.ts`), so two different
 * pairs cannot produce the same message.
 */
export function computerTokenFor(
  secret: string,
  namespace: string,
  botId: string,
): string {
  return createHmac("sha256", secret)
    .update(`openbot/computer-token/v1\0${namespace}\0${botId}`)
    .digest("hex");
}

/**
 * How many characters of `SUPERVISOR_TOKEN` make it safe to derive from.
 *
 * `scripts/start.sh` makes 64 hex characters. Anything shorter was typed by a person, and a short key
 * can be guessed offline by a computer that holds its own token and so has a value to test guesses
 * against.
 */
export const MIN_DERIVATION_KEY_LENGTH = 32;
