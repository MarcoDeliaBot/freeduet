/**
 * A colleague's finished file reaches the person and the Bot that asked (docs/M1_PLAN.md, D177).
 *
 * THE GAP. A member working on a hand-off runs in a scratch thread of its own that nobody is shown, so
 * the `offer_file` card (D38) it raised there was never drawn anywhere the person looks, and the Bot that
 * asked (Iris) could not open the file either, because it is in the colleague's computer. Live, 27
 * November 2026: Kai built a game in `/workspace/out/`, the person asked Iris for the folder, and she
 * could not see it.
 *
 * WHAT THIS DOES, AND ONLY THIS. When a forward hop ends, the delivery hands this the files its member
 * offered (read from the `offer_file` results that went past in the run, never from what the model
 * said). For each one, in this order:
 *
 * 1. The file is looked at again through the computer gateway as the person, exactly as the tool and the
 *    Download button do (policy, audit row, confinement, size). A file that does not pass is not recorded.
 * 2. One row says "this person, this conversation, this member, this path" (`handoff_file_offers`). The
 *    app draws it under that hand-off's line as the SAME card as `offer_file`
 *    (`app/src/freeduet/member-file-card.tsx`): nothing leaves the computer until the person presses
 *    Download, and that route decides again who may use that Bot's computer.
 * 3. A copy for the Bot that asked, written into ITS OWN workspace at `in/<member>/<name>` through the
 *    same gateway (`writeFile`: policy and audit apply). Only the file that was offered, only text (the
 *    computer's write takes text), only up to the computer's write limit, and never a script: a script
 *    written to a computer meets the reviewer at the approval gate (D77), and a server copy must not be a
 *    way around that, so the same test (`isCommandOrScriptWrite`) is used here. The asker is given NO read
 *    of the colleague's workspace: it reads its own copy.
 *
 * NOTHING IS SENT. No mail, no upload, no link. A failure anywhere here ends in a sentence about the
 * file, never in a failed hop: the turn happened, and the answer still goes back.
 */
import { randomUUID } from "node:crypto";
import { type OfferedFile, savedFileName } from "@openbot/shared/member-file";
import { and, asc, eq } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { isCommandOrScriptWrite } from "../approvals/policy";
import type { HandoffWork } from "../agents/handoff-runner";
import { handoffInitiator } from "../audit";
import type { AppVariables } from "../auth/guards";
import type { ComputerGateway } from "../computer/gateway";
import type { Database } from "../db/client";
import { handoffFileOffers } from "../db/schema";
import { type Dependencies, personWhoMayUse } from "./member-files";

/**
 * The most bytes copied to the asker: the computer's own write limit (`DEFAULT_WORKSPACE_LIMITS.writeBytes`
 * in `agent-computer/src/workspace.ts`), which refuses more anyway. Said here so a larger file is not
 * even read.
 */
export const COPY_MAX_BYTES = 1_000_000;

/** How long looking at or reading one file may take. */
const FILE_TIMEOUT_MS = 30_000;

export type HandoffFileRow = {
  id: string;
  askerBotId: string;
  memberBotId: string;
  path: string;
  name: string;
  bytes: number;
  copyPath: string | null;
  copyNote: string | null;
  createdAt: string;
};

export function createHandoffFileStore(database: Database) {
  return {
    /** Idempotent for one hop, one member and one path: a retried hop records it once. */
    async record(input: {
      ownerUserId: string;
      threadId: string;
      hopRunId: string;
      askerBotId: string;
      memberBotId: string;
      path: string;
      name: string;
      bytes: number;
      copyPath: string | null;
      copyNote: string | null;
    }): Promise<void> {
      await database
        .insert(handoffFileOffers)
        .values({ id: randomUUID(), ...input })
        .onConflictDoUpdate({
          target: [
            handoffFileOffers.ownerUserId,
            handoffFileOffers.threadId,
            handoffFileOffers.hopRunId,
            handoffFileOffers.memberBotId,
            handoffFileOffers.path,
          ],
          set: {
            name: input.name,
            bytes: input.bytes,
            copyPath: input.copyPath,
            copyNote: input.copyNote,
          },
        });
    },
    /** One person's offers in one conversation, oldest first. Nobody else's, whatever the thread id. */
    async list(
      ownerUserId: string,
      threadId: string,
    ): Promise<HandoffFileRow[]> {
      const rows = await database
        .select()
        .from(handoffFileOffers)
        .where(
          and(
            eq(handoffFileOffers.ownerUserId, ownerUserId),
            eq(handoffFileOffers.threadId, threadId),
          ),
        )
        .orderBy(asc(handoffFileOffers.createdAt))
        .limit(100);
      return rows.map((row) => ({
        id: row.id,
        askerBotId: row.askerBotId,
        memberBotId: row.memberBotId,
        path: row.path,
        name: row.name,
        bytes: row.bytes,
        copyPath: row.copyPath,
        copyNote: row.copyNote,
        createdAt: row.createdAt.toISOString(),
      }));
    },
  };
}

export type HandoffFileStore = ReturnType<typeof createHandoffFileStore>;

/** A folder name made of safe characters only: a Bot id is a label, never a path. */
export function folderNameOf(botId: string): string {
  const cleaned = botId.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned === "" ? "colleague" : cleaned.slice(0, 80);
}

/** Where the asker's copy goes, inside its own workspace. The name is already safe to save. */
export function copyPathFor(memberBotId: string, name: string): string {
  return `in/${folderNameOf(memberBotId)}/${savedFileName(name)}`;
}

/** Reads a stream to the end, stopping (and cancelling) as soon as it is over the limit. Null when over. */
async function readUpTo(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return joined;
}

type Gateway = Pick<ComputerGateway, "downloadFile" | "writeFile">;

export type HandoffFileDependencies = Omit<Dependencies, "computerGateway"> & {
  computerGateway: Gateway | undefined;
  store: Pick<HandoffFileStore, "record">;
};

export type RecordedOffer = {
  name: string;
  bytes: number;
  copyPath: string | null;
  copyNote: string | null;
};

/**
 * Records one offered file of a forward hop. Returns null when nothing was recorded (the file did not
 * pass the look, the computer is not this person's to use). Never throws for a file's sake.
 */
export function handoffFileRecorder(deps: HandoffFileDependencies) {
  return async (input: {
    work: Pick<
      HandoffWork,
      "fromBotId" | "toBotId" | "actorId" | "threadId" | "runId" | "initiator"
    >;
    file: OfferedFile;
  }): Promise<RecordedOffer | null> => {
    const { work, file } = input;
    const gateway = deps.computerGateway;
    if (!gateway) return null;
    // The tool is built for one member; a result that names another computer is not this hop's.
    if (file.botId !== work.toBotId) return null;
    const person = await personWhoMayUse(deps, work.actorId, work.toBotId);
    if (!person) return null;
    const initiator = handoffInitiator(work.fromBotId, work.initiator);
    const actor = { id: person.id, userId: person.id, initiator };

    // 1. The look, as the Download button will meet it. Kept open: the copy reads it.
    let download: Awaited<ReturnType<Gateway["downloadFile"]>>;
    try {
      download = await gateway.downloadFile(
        work.toBotId,
        actor,
        { path: file.path },
        AbortSignal.timeout(FILE_TIMEOUT_MS),
      );
    } catch {
      return null;
    }
    const name = savedFileName(download.name);
    const bytes = download.bytes;

    // 3. The copy for the asker (decided before the row, so the row can say what happened).
    let copyPath: string | null = null;
    let copyNote: string | null = null;
    try {
      const asker = await personWhoMayUse(deps, work.actorId, work.fromBotId);
      const target = copyPathFor(work.toBotId, name);
      if (!asker) {
        copyNote = "your computer is not available for a copy";
      } else if (bytes > COPY_MAX_BYTES) {
        copyNote = `the file is over ${COPY_MAX_BYTES} bytes, which a copy cannot carry`;
      } else {
        const raw = await readUpTo(download.body, COPY_MAX_BYTES);
        let text: string | null = null;
        if (raw) {
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
          } catch {
            text = null;
          }
        }
        if (text === null || text.includes("\u0000")) {
          copyNote = "the file is not text, so no copy was made";
        } else if (
          isCommandOrScriptWrite({
            actorId: person.id,
            botId: work.fromBotId,
            toolRef: "computer_write_file",
            effect: "write",
            scope: "computer",
            args: { path: target, contents: text },
          })
        ) {
          copyNote =
            "the file is a script, which is never copied without the person's approval";
        } else {
          await gateway.writeFile(work.fromBotId, actor, {
            path: target,
            contents: text,
          });
          copyPath = target;
        }
      }
    } catch {
      copyNote = "the copy could not be written just now";
    } finally {
      await download.body.cancel().catch(() => undefined);
    }

    // 2. The row the card is drawn from.
    try {
      await deps.store.record({
        ownerUserId: work.actorId,
        threadId: work.threadId,
        hopRunId: work.runId,
        askerBotId: work.fromBotId,
        memberBotId: work.toBotId,
        path: file.path,
        name,
        bytes,
        copyPath,
        copyNote,
      });
    } catch {
      return null;
    }
    return { name, bytes, copyPath, copyNote };
  };
}

/**
 * The note put in front of the answer the asking Bot is told, said by the server and not by the
 * colleague. It names where the card is and where the copy is, and nothing the colleague wrote.
 */
export function offeredNote(
  memberName: string,
  offers: readonly RecordedOffer[],
): string {
  const lines = offers.map((offer) =>
    offer.copyPath
      ? `- ${offer.name} (${offer.bytes} bytes): a read-only copy is in your own computer at ${offer.copyPath}. Open it there to check it. Do not edit it.`
      : `- ${offer.name} (${offer.bytes} bytes): no copy in your computer, because ${offer.copyNote ?? "it could not be copied"}.`,
  );
  return [
    `Server note: ${memberName} offered ${offers.length === 1 ? "this file" : "these files"} to the person. The person has a Download button for ${offers.length === 1 ? "it" : "each"} right under your hand-off line in this conversation; you need not send anything.`,
    ...lines,
  ].join("\n");
}

export function createHandoffFileRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  store: Pick<HandoffFileStore, "list">,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);
  /** The signed-in person's offers in one conversation. Another person's conversation is an empty list. */
  routes.get("/", async (context) => {
    const thread = context.req.query("thread")?.trim() ?? "";
    context.header("Cache-Control", "private, no-store");
    if (thread === "" || thread.length > 200) return context.json({ files: [] });
    return context.json({
      files: await store.list(context.var.actor.id, thread),
    });
  });
  return routes;
}
