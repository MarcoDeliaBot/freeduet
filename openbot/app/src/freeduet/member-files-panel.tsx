import { offeredFileUrl, savedFileName } from "@openbot/shared/member-file";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DuetCard, Tile } from "@/components/duet/kit";
import { client } from "@/lib/client";
import { useAppLanguage } from "./i18n/provider";
import { fileSizeText, save } from "./member-file-card";
import "./light/tokens.css";

/*
 * The Files panel of one member (docs/M1_PLAN.md, D194): the finished work in that member's `out`
 * folder, read only, with Download for each file, so the person never needs a path in a computer
 * they cannot reach.
 *
 * WHAT IT ASKS. `GET /api/computers/:botId/files/finished`: names, sizes and times, no content.
 * That route answers only the person who may use that Bot's computer, under the same decision and
 * audit as a download. The bytes are fetched when Download is pressed, through the download route as
 * it is, and handed to the browser as a file to save, never opened here (as the file card does).
 * A path that is not under `out/` or holds `..` is drawn with no Download at all.
 */

export type FinishedFile = {
  path: string;
  name: string;
  bytes: number;
  modifiedMs: number;
};

type Finished = { files: FinishedFile[]; truncated: boolean };

/** The only paths the panel offers a Download for: inside the out folder, no `..`, no hidden part. */
export function isFinishedPath(path: string): boolean {
  if (!path.startsWith("out/")) return false;
  return !path.split("/").some((part) => part === ".." || part === "");
}

export const finishedFilesQueryKey = (botId: string) =>
  ["member-finished-files", botId] as const;

export function finishedFilesQueryOptions(botId: string) {
  return {
    queryKey: finishedFilesQueryKey(botId),
    queryFn: async (): Promise<Finished> => {
      const response = await client(
        `/api/computers/${encodeURIComponent(botId)}/files/finished`,
      );
      const body = (await response.json()) as Partial<Finished>;
      return {
        files: Array.isArray(body.files) ? body.files : [],
        truncated: body.truncated === true,
      };
    },
  };
}

function FileRow({ botId, file }: { botId: string; file: FinishedFile }) {
  const { t, language, date } = useAppLanguage();
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [error, setError] = useState<string | null>(null);
  const offerable = isFinishedPath(file.path);

  async function download() {
    setState("busy");
    setError(null);
    try {
      const response = await client(
        offeredFileUrl({ botId, path: file.path }),
        { fallback: t("files.downloadError") },
      );
      save(await response.blob(), savedFileName(file.name));
    } catch (failure) {
      setError(
        failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : t("files.downloadError"),
      );
    }
    setState("idle");
  }

  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <Tile icon="file" />
        <div className="min-w-0 flex-1">
          <p className="type-row font-semibold [overflow-wrap:anywhere]">
            {file.name}
          </p>
          <p className="type-label text-duet-ink-3">
            {t("files.size", { size: fileSizeText(file.bytes, language) })}
            {" · "}
            {t("files.modified", {
              when: date(new Date(file.modifiedMs), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </p>
        </div>
        {offerable ? (
          <button
            className="type-label min-h-11 shrink-0 rounded-full bg-duet-black px-4 py-2 font-semibold text-duet-on-black transition-[filter,transform,opacity] hover:brightness-125 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.98] disabled:opacity-50"
            disabled={state === "busy"}
            onClick={download}
            type="button"
          >
            {state === "busy" ? t("files.downloading") : t("files.download")}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="type-label mt-2 text-duet-red" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
}

/** The panel for one member: `botId` is its agent id, `name` the name the words use. */
export function MemberFilesPanel({
  botId,
  name,
}: {
  botId: string;
  name: string;
}) {
  const { t, number } = useAppLanguage();
  const files = useQuery(finishedFilesQueryOptions(botId));
  return (
    <div className="mt-6 flex flex-col gap-4" data-testid="member-files">
      <div className="flex items-center justify-between gap-3">
        <p className="type-sub text-duet-ink-2">{t("files.lead", { name })}</p>
        <button
          className="type-label min-h-11 shrink-0 rounded-full px-4 py-2 font-semibold text-duet-ink outline-none shadow-[inset_0_0_0_1px_var(--duet-hair)] transition-colors hover:bg-duet-card focus-visible:ring-3 focus-visible:ring-duet-violet/40 disabled:opacity-50"
          disabled={files.isFetching}
          onClick={() => void files.refetch()}
          type="button"
        >
          {files.isFetching ? t("files.refreshing") : t("files.refresh")}
        </button>
      </div>
      {files.isPending ? (
        <p className="type-sub text-duet-ink-3" role="status">
          {t("files.loading")}
        </p>
      ) : files.error ? (
        <p className="type-sub text-duet-red" role="alert">
          {files.error instanceof Error && !(files.error instanceof TypeError)
            ? files.error.message
            : t("files.loadError")}
        </p>
      ) : files.data.files.length === 0 ? (
        <DuetCard className="px-4 py-4" role="status">
          <p className="type-sub text-duet-ink-2">
            {t("files.empty", { name })}
          </p>
        </DuetCard>
      ) : (
        <DuetCard className="px-4 py-2">
          <ul className="divide-y divide-duet-hair">
            {files.data.files.map((file) => (
              <FileRow botId={botId} file={file} key={file.path} />
            ))}
          </ul>
          {files.data.truncated ? (
            <p className="type-label py-2 text-duet-ink-3">
              {t("files.more", { count: number(files.data.files.length) })}
            </p>
          ) : null}
        </DuetCard>
      )}
    </div>
  );
}
