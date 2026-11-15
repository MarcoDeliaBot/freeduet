import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { client } from "@/lib/client";

/*
 * "Download team file" on the Bots roster, for administrators only (docs/design/team-file.md, slice
 * S2). It asks the server for the administrator's own members as one team file and saves it, as the
 * member file card does for a file a member made (member-file-card.tsx): an opaque blob, saved through
 * an anchor, never shown in this app's origin.
 *
 * The server decides who may download: this control only hides itself from people who are not
 * administrators, so a hidden button is never the protection.
 */

const EXPORT_PATH = "/api/freeduet/team-file/export";
const FILE_NAME = "freeduet-team.json";
const OPAQUE = "application/octet-stream";

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

export function TeamFileButton() {
  const me = useQuery(currentUserQueryOptions()).data;
  const [state, setState] = useState<"idle" | "busy" | "started">("idle");
  const [error, setError] = useState<string | null>(null);

  if (me?.role !== "admin") return null;

  async function download() {
    setState("busy");
    setError(null);
    try {
      const response = await client(EXPORT_PATH, {
        fallback: "The team file could not be prepared.",
      });
      save(await response.blob(), FILE_NAME);
      setState("started");
    } catch (failure) {
      // The server's sentence says what is missing or refused (a member with an address, an e-mail
      // address in its text); a network failure has only the browser's, which says nothing useful.
      setError(
        failure instanceof Error && !(failure instanceof TypeError)
          ? failure.message
          : "The team file could not be prepared.",
      );
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        className="min-h-11"
        disabled={state === "busy"}
        onClick={download}
        variant="ghost"
      >
        {state === "busy" ? "Preparing the team file…" : "Download team file"}
      </Button>
      {error ? (
        <p className="type-label text-duet-ink-3" role="alert">
          {error}
        </p>
      ) : null}
      {state === "started" ? (
        <p className="type-label text-duet-ink-3" role="status">
          Saved {FILE_NAME}.
        </p>
      ) : null}
    </div>
  );
}
