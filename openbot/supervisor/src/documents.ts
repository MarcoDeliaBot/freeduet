import { readdir, stat } from "node:fs/promises";
import { posix } from "node:path";
import { namesFor } from "./names";

/**
 * A folder of the person's documents, mounted read-only into the computers of chosen Bots.
 *
 * Off unless BOTH settings are present and valid, and a Bot gets it only when it is named:
 *
 *  - `FREEDUET_COMPUTER_DOCUMENTS`: the absolute path of the folder on the host.
 *  - `FREEDUET_COMPUTER_DOCUMENTS_BOTS`: the Bot ids that get it, comma separated.
 *
 * It lands at `/workspace/documenti`, under the one directory the computer's file tools are confined
 * to (`agent-computer/src/workspace.ts`), so the Bot reaches it the way it reaches its own files and
 * no path outside the workspace is opened. It is always read-only: a Bot reads the documents and
 * cannot change or delete them.
 *
 * This is the only code that decides it. `hostConfig` in docker.ts asks here and adds nothing of its
 * own, so a mount for a Bot nobody named cannot be written by accident somewhere else.
 */

/** Where the folder appears inside a computer. Under `/workspace`, which is what the file tools reach. */
export const DOCUMENTS_TARGET = "/workspace/documenti";

/**
 * The container label that records which host folder the computer was created with.
 *
 * The recreate rule compares this with what the deployment wants now, rather than reading the mount
 * back from `inspect`. An engine may report a bind's source rewritten (a path translated by a desktop
 * VM, a symlink resolved), and a comparison against that would call every computer stale on every
 * request and replace it each time. What was asked for is compared with what is asked for.
 */
export const DOCUMENTS_LABEL = "openbot.documents";

export type DocumentsMount = {
  /** Absolute, canonical, on the host. Free of `:` and `,`, which a bind string cannot carry. */
  path: string;
  /** The Bot ids that get the folder. Never empty. */
  bots: readonly string[];
};

export type DocumentsSettings =
  | {
      ok: true;
      /** Undefined means the feature is off. */
      documents: DocumentsMount | undefined;
      /** Why it is off, when that is worth a line in the log but is not an error. */
      note?: string;
    }
  | { ok: false; reason: string };

const PATH_NAME = "FREEDUET_COMPUTER_DOCUMENTS";
const BOTS_NAME = "FREEDUET_COMPUTER_DOCUMENTS_BOTS";

/** Control characters, a NUL most of all: nothing a path of documents needs, all of them trouble in a bind string. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this rejects.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function badPath(raw: string): string | undefined {
  if (!raw.startsWith("/")) {
    return "must be an absolute path (it starts with /)";
  }
  // A colon separates the fields of a bind string and a comma the options after it, so a path holding
  // either would be read as something else. Not escaped, because refusing is simpler to get right.
  if (raw.includes(":") || raw.includes(",")) {
    return "must not contain : or ,";
  }
  if (CONTROL_CHARACTERS.test(raw)) {
    return "must not contain control characters";
  }
  // Trailing slashes are only a way of writing the same folder; anything else that normalising would
  // change (`..`, `.`, a doubled slash) is a path that says one thing and means another.
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed === "") {
    return "must not be the root of the file system";
  }
  if (posix.normalize(trimmed) !== trimmed) {
    return "must be written plainly: no .. or . segments and no doubled slashes";
  }
  return undefined;
}

/**
 * Read the two settings.
 *
 * Never throws and never decides to crash the supervisor: a bad value turns the feature off and says
 * why, because refusing to start would take every Bot's computer down over a setting about documents.
 * Fails closed: one bad entry in the list turns the whole feature off rather than granting a part.
 */
export function documentsSettings(
  env: Record<string, string | undefined> = process.env,
): DocumentsSettings {
  const rawPath = env[PATH_NAME]?.trim();
  const rawBots = env[BOTS_NAME]?.trim();

  if (!rawPath) {
    return rawBots
      ? {
          ok: true,
          documents: undefined,
          note: `${BOTS_NAME} is set but ${PATH_NAME} is not, so no computer gets a documents folder.`,
        }
      : { ok: true, documents: undefined };
  }

  const problem = badPath(rawPath);
  if (problem) {
    return {
      ok: false,
      reason: `${PATH_NAME} ${problem} (got ${JSON.stringify(rawPath)}).`,
    };
  }
  const path = rawPath.replace(/\/+$/, "");

  const bots: string[] = [];
  for (const entry of (rawBots ?? "").split(",")) {
    const id = entry.trim();
    if (!id) continue;
    // The same rule the supervisor applies to every Bot id before it becomes a name.
    const named = namesFor(id);
    if (!named.ok) {
      return {
        ok: false,
        reason: `${BOTS_NAME} has an id that is not a Bot id (${JSON.stringify(id)}): ${named.reason}`,
      };
    }
    if (!bots.includes(id)) bots.push(id);
  }
  if (bots.length === 0) {
    return {
      ok: true,
      documents: undefined,
      note: `${PATH_NAME} is set but ${BOTS_NAME} names no Bot, so no computer gets a documents folder.`,
    };
  }

  return { ok: true, documents: { path, bots } };
}

/**
 * Why the folder cannot be used, or undefined when it can.
 *
 * Checked here and not left to Docker. Given a bind whose source is missing, the engine creates it,
 * as an empty directory owned by root, and a typo or an unmounted share then looks like a documents
 * folder that happens to be empty. Asynchronous, so a network share that has stopped answering holds
 * up one request and not the whole supervisor.
 */
export async function documentsFolderProblem(
  path: string,
): Promise<string | undefined> {
  try {
    const info = await stat(path);
    return info.isDirectory() ? undefined : `${path} is not a folder`;
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code === "ENOENT" || code === "ENOTDIR"
      ? `${path} does not exist, or the supervisor cannot see it (docker-compose.yml mounts it into the supervisor at the same path)`
      : `${path} cannot be read (${code ?? String(error)})`;
  }
}

/**
 * Whether the folder has nothing in it.
 *
 * Only worth a line in the log, never a refusal: an empty folder is what a share that was not mounted
 * yet looks like, and the engine creates a missing folder as an empty one, so a typo looks the same.
 */
export async function documentsFolderIsEmpty(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length === 0;
  } catch {
    return false;
  }
}

/**
 * The host folder this Bot's computer should hold at `/workspace/documenti`, or undefined for none.
 *
 * The one place a Bot is checked against the list.
 */
export function documentsSourceFor(
  botId: string,
  documents: DocumentsMount | undefined,
): string | undefined {
  return documents?.bots.includes(botId) ? documents.path : undefined;
}

/** The bind string for a folder. `:ro` is not an option: nothing here ever builds a writable one. */
export function documentsBind(source: string): string {
  return `${source}:${DOCUMENTS_TARGET}:ro`;
}

/**
 * Whether an existing computer holds the folder this deployment wants it to hold now.
 *
 * A computer made before this feature carries no label, which means no folder, which is what it was
 * given. Either side being absent matches the other being absent, so turning the feature off
 * reaches a computer that has the folder, and turning it on reaches one that does not.
 */
export function holdsCurrentDocuments(
  existingLabel: string | undefined,
  wanted: string | undefined,
): boolean {
  return (existingLabel || undefined) === wanted;
}

/**
 * The folder the supervisor may hand out right now, checked each time it is asked.
 *
 * The first call is the check at start, and logs why the folder is unusable. After that a folder that
 * disappears (an unmounted share) turns the mount off at the next request, and one that comes back
 * turns it on, each said once rather than at every request. The computer is then recreated by the
 * recreate rule, so what the Bot sees is true: no folder, rather than a stale or empty one.
 */
export function liveDocuments(
  configured: DocumentsMount | undefined,
  log: Pick<Console, "info" | "warn"> = console,
): () => Promise<DocumentsMount | undefined> {
  let unusable = false;
  return async () => {
    if (!configured) return undefined;
    const problem = await documentsFolderProblem(configured.path);
    if (problem) {
      if (!unusable) {
        log.warn(
          `Documents folder is off: ${problem}. Computers start without it.`,
        );
      }
      unusable = true;
      return undefined;
    }
    if (unusable) {
      log.info(`Documents folder ${configured.path} is available again.`);
    }
    unusable = false;
    return configured;
  };
}
