/**
 * A member hands the person a file it made in its own computer (docs/M1_PLAN.md, D38).
 *
 * WHAT IT IS. One tool, `offer_file`, held by a member that can use its own computer. The member names
 * a path in its workspace; the server looks at that file the way the person's download will, and when
 * it is there and may leave the computer it returns the facts the conversation draws as a card: the
 * name, the size and a Download button (`app/src/freeduet/member-file-card.tsx`, the contract is
 * `shared/member-file.ts`). The same shape as `offer_task` and `make_page`: a server tool whose result
 * is a card.
 *
 * NOTHING LEAVES THE COMPUTER HERE. The tool moves no bytes. It asks the computer gateway for the file
 * (`downloadFile`), reads the size off the answer and cancels the stream. The bytes travel when the
 * person presses Download, on their own session, through `GET /api/computers/:botId/files/download`,
 * which is used as it is: no new route, no table, no link that works for anyone else. So offering is
 * not an account action and asks for nothing. The gateway counts a download as a read
 * (`effect: "read"`), and the person decides by pressing the button.
 *
 * THE CHECK IS THE GATEWAY'S, ON PURPOSE. Going through `downloadFile` and not a check of our own means
 * the offer is judged by exactly what the button will meet later:
 *
 * - the deployment's computer policy (`download_file` has its own intent, so a rule can allow reading
 *   a file and still keep it from leaving), and `cloudComputer`, which the person can switch off;
 * - the audit trail: the attempt is a row whether or not it is allowed, and a refused path is a row
 *   too, which a check made here before the call would have hidden;
 * - the computer's own confinement (`agent-computer/src/workspace.ts`): a path that is absolute,
 *   holds `..`, or leaves the workspace through a link is refused there, because only the computer
 *   can see links; and its size limit, applied before any byte is sent.
 *
 * WHOSE WORKSPACE. The tool is built for one person and one member (`loadToolsForActor`) and its path
 * is relative to that member's workspace. It has no way to name another member's computer, and the
 * card names the member the tool was built for. It is not offered at all where the person cannot use
 * that member's computer (`canUseComputer`: a Team Bot's teammate uses the Bot, not its owner's
 * signed-in computer) or has switched the computer off (`computer/offered.ts`).
 *
 * WHO CAN PRESS IT. Whoever the computer routes already answer for that member: a public member's
 * computer is shared by everyone who can sign in, as `computer-access.ts` says. The card is drawn only
 * in the conversation of the person the run belongs to, and the route is not widened by it.
 */
import {
  OFFER_FILE_TOOL,
  OFFERED_PATH_MAX,
  offeredFileResult,
  savedFileName,
} from "@openbot/shared/member-file";
import type { GrantedTool } from "@openbot/toolkit/granted-tool";
import { z } from "zod";
import { canUseComputer } from "../agents/computer-access";
import type { AgentProfileStore } from "../agents/profile-store";
import type { AgentActor } from "../agents/profile-types";
import type { AuditInitiator } from "../audit";
import {
  ActionRefusedError,
  type ComputerGateway,
  ComputerUnavailableError,
  WorkspaceNotFoundError,
  WorkspaceRefusedError,
  WorkspaceRequestError,
  WorkspaceTooLargeError,
} from "../computer/gateway";
import {
  type CapabilitiesLookup,
  computerToolsOffered,
} from "../computer/offered";
import { REFUSAL_MARKER } from "../plugins/tools";

export { OFFER_FILE_TOOL };

/** How long the look at the file may take. It is a look, not a download: the stream is cancelled. */
const LOOK_TIMEOUT_MS = 30_000;

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this refuses.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

const NOTE =
  "The card with a Download button is on screen. The person presses it to save the file on their own device, and the file stays in your computer. Say in one line what the file is. You have not sent, emailed or uploaded anything, so do not say you did.";

const REFUSED_ARGUMENTS = `${REFUSAL_MARKER} ${OFFER_FILE_TOOL} takes the path of one file in your workspace, relative to it (for example out/final.mp4). It must not hold control characters. Nothing was offered.`;

/** What the member is told when the look at the file did not end in a card. Every one starts with the marker. */
function refusalFor(error: unknown, path: string): string {
  if (error instanceof WorkspaceNotFoundError)
    return `${REFUSAL_MARKER} There is no file at ${path} in your workspace. List the folder to find it, then offer the file again.`;
  if (error instanceof WorkspaceTooLargeError)
    return `${REFUSAL_MARKER} ${error.message} Make the file smaller (a lower resolution or bitrate, a shorter cut, or parts) and offer it again.`;
  if (error instanceof WorkspaceRefusedError)
    return `${REFUSAL_MARKER} ${error.message} Give the path of a file inside your own workspace, relative to it.`;
  if (error instanceof WorkspaceRequestError)
    return `${REFUSAL_MARKER} ${error.message} ${OFFER_FILE_TOOL} takes the path of one file, not a folder.`;
  if (error instanceof ActionRefusedError)
    return `${REFUSAL_MARKER} ${error.message} This deployment does not let that file leave your computer, so tell the person where it is instead.`;
  if (error instanceof ComputerUnavailableError)
    return `${REFUSAL_MARKER} ${error.message} Nothing was offered; try again in a moment.`;
  // Anything else (a rule that asks the person first, a fault of ours): no detail for a model to repeat.
  return `${REFUSAL_MARKER} The file could not be checked just now, so nothing was offered. Try again in a moment, or tell the person where the file is.`;
}

type Dependencies = {
  /** Absent when the deployment has no computer. */
  computerGateway: Pick<ComputerGateway, "downloadFile"> | undefined;
  agentProfileStore: Pick<AgentProfileStore, "get">;
  actorFor: (ownerUserId: string) => Promise<AgentActor>;
  /** The person's capability switches; a computer they switched off is not offered. */
  capabilitiesOf?: CapabilitiesLookup | undefined;
};

/**
 * The person, when this member's computer is theirs to use and switched on; null otherwise.
 *
 * Loading a Bot's tools must never fail a run: no actor, no profile and no switches read all mean the
 * tool is not offered.
 */
async function personWhoMayUse(
  deps: Dependencies,
  ownerUserId: string,
  agentId: string,
): Promise<AgentActor | null> {
  try {
    const actor = await deps.actorFor(ownerUserId);
    const profile = await deps.agentProfileStore.get(actor, agentId);
    if (!canUseComputer(profile, actor)) return null;
    const offered = computerToolsOffered(await deps.capabilitiesOf?.(actor.id));
    return offered.computer ? actor : null;
  } catch {
    return null;
  }
}

export function memberFileTools(deps: Dependencies) {
  return async ({
    ownerUserId,
    agentId,
    initiator,
  }: {
    ownerUserId: string;
    agentId: string;
    initiator: AuditInitiator;
  }): Promise<GrantedTool[]> => {
    const gateway = deps.computerGateway;
    if (!gateway) return [];
    const actor = await personWhoMayUse(deps, ownerUserId, agentId);
    if (!actor) return [];
    const parameters = z
      .object({
        path: z
          .string()
          .trim()
          .min(1)
          .max(OFFERED_PATH_MAX)
          .describe(
            "The path of the file in your workspace, relative to it, for example out/final.mp4. Not an absolute path and not a folder.",
          ),
      })
      .strict();
    return [
      {
        name: OFFER_FILE_TOOL,
        ref: `freeduet/${OFFER_FILE_TOOL}`,
        description: [
          "Hand the person a file you made in your own computer: it appears in this conversation as a card with the file's name, its size and a Download button, and the person saves it on their own device.",
          "Give the path of one finished file in your workspace, relative to it (for example out/final.mp4), after you have checked it.",
          "It sends and publishes nothing and asks for no approval: the file stays in your computer until the person presses Download.",
          "A file that is too large, outside your workspace or not allowed to leave it is refused, and the refusal says what to fix.",
        ].join(" "),
        parameters,
        initiator,
        async execute(args) {
          const parsed = parameters.safeParse(args ?? {});
          if (!parsed.success) return REFUSED_ARGUMENTS;
          const { path } = parsed.data;
          if (CONTROL_CHARACTERS.test(path)) return REFUSED_ARGUMENTS;
          let file: Awaited<ReturnType<ComputerGateway["downloadFile"]>>;
          try {
            file = await gateway.downloadFile(
              agentId,
              { id: actor.id, userId: actor.id, initiator },
              { path },
              AbortSignal.timeout(LOOK_TIMEOUT_MS),
            );
          } catch (error) {
            return refusalFor(error, path);
          }
          // Only the size was wanted: give the connection back without reading the file.
          await file.body.cancel().catch(() => undefined);
          return offeredFileResult(
            {
              botId: agentId,
              path,
              name: savedFileName(file.name),
              bytes: file.bytes,
            },
            NOTE,
          );
        },
      },
    ];
  };
}
