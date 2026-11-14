import { useRenderTool } from "@copilotkit/react-core/v2";
import {
  OFFER_FILE_TOOL,
  type OfferedFile,
  offeredFileUrl,
  readOfferedFile,
  savedFileName,
} from "@openbot/shared/member-file";
import { useState } from "react";
import { z } from "zod";
import { ToolLine } from "@/components/channels/tool-line";
import { DuetCard, Tile } from "@/components/duet/kit";
import { client } from "@/lib/client";
import type { CardLanguage } from "./person-language/cards";
import { useCardLanguage, useCardText } from "./person-language/use-card-text";

/*
 * Draws the server's `offer_file` tool (server/src/freeduet/member-files.ts) as the card a member
 * leaves under its words when it has made a file on its own computer: the file's name, its size and a
 * Download button (docs/M1_PLAN.md, D38). The contract with the tool is shared/member-file.ts.
 *
 * THE FILE IS FETCHED WHEN THE BUTTON IS PRESSED, and only then. The card holds the member, the path
 * and the size, never the bytes and never a link: the request goes to the computer download route
 * (`GET /api/computers/:botId/files/download`) as the signed-in person, and that route decides again
 * who may use that Bot's computer, what the deployment's policy allows and where the path lands.
 *
 * AND IT IS SAVED, NEVER SHOWN. The answer is read as a blob whose type is forced to opaque bytes
 * whatever the server said, and handed to the browser as a download under a name made safe to save.
 * A page, a script or a drawing a member made is a file on the person's device, never a document
 * opened in this app's origin: the card has no link to follow and no frame to open it in.
 */

const parameters = z.object({ path: z.string().optional() });

const OPAQUE = "application/octet-stream";

/** "512 B", "1.2 MB", "340 KB": one decimal below ten of a unit, none above, in the language's own digits. */
export function fileSizeText(
  bytes: number,
  language: CardLanguage | null,
): string {
  const number = (value: number) =>
    new Intl.NumberFormat(language ?? undefined, {
      maximumFractionDigits: value < 10 ? 1 : 0,
    }).format(value);
  if (bytes < 1024) return `${number(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  // 1023.6 KB is shown as 1 MB, not as "1,024 KB".
  while (Math.round(value) >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${number(value)} ${units[unit]}`;
}

/** Hands the bytes to the browser as a file to save, and nothing else: no link, no tab, no frame. */
function save(bytes: Blob, name: string) {
  const url = URL.createObjectURL(bytes.slice(0, bytes.size, OPAQUE));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** The card for one offered file. */
export function MemberFileCard({ file }: { file: OfferedFile }) {
  const t = useCardText();
  const language = useCardLanguage();
  const [state, setState] = useState<"idle" | "busy" | "started">("idle");
  const [error, setError] = useState<string | null>(null);
  const name = savedFileName(file.name);

  async function download() {
    setState("busy");
    setError(null);
    try {
      const response = await client(offeredFileUrl(file), {
        fallback: t("file.couldNot"),
      });
      save(await response.blob(), name);
      setState("started");
    } catch (failure) {
      // The route's own sentence says what is wrong (a file that is gone, a computer that is not
      // running); a network failure has only the browser's, which says nothing to this person.
      setError(
        failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : t("file.couldNot"),
      );
      setState("idle");
    }
  }

  return (
    <DuetCard aria-label={name} className="px-4 py-3" role="region">
      <div className="flex items-center gap-3">
        <Tile icon="file" />
        <div className="min-w-0 flex-1">
          <p className="type-row font-semibold [overflow-wrap:anywhere]">
            {name}
          </p>
          <p className="type-label text-duet-ink-3">
            {fileSizeText(file.bytes, language)}
          </p>
        </div>
        <button
          className="type-label min-h-11 shrink-0 rounded-full bg-duet-black px-4 py-2 font-semibold text-duet-on-black transition-[filter,transform,opacity] hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.98] disabled:opacity-50"
          disabled={state === "busy"}
          onClick={download}
          type="button"
        >
          {state === "busy" ? t("file.downloading") : t("file.download")}
        </button>
      </div>
      {error ? (
        <p className="type-label mt-2 text-duet-red" role="alert">
          {error}
        </p>
      ) : null}
      {state === "started" ? (
        <p
          className="type-label mt-2 font-semibold text-duet-green"
          role="status"
        >
          {t("file.started")}
        </p>
      ) : null}
    </DuetCard>
  );
}

/** The tool's line while the server looks at the file: its own component, so it can read the card language. */
function GettingFileLine() {
  const t = useCardText();
  return <ToolLine label={t("file.running")} running />;
}

export function MemberFileTool() {
  useRenderTool({
    name: OFFER_FILE_TOOL,
    parameters,
    render: ({ result, status }) => {
      if (status !== "complete" && result === undefined)
        return <GettingFileLine />;
      const file = readOfferedFile(result);
      // Nothing for a refusal: the member is told what to fix and says so in its own words.
      return file ? <MemberFileCard file={file} /> : null;
    },
  });
  return null;
}
