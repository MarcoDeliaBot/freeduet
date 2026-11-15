import { IconX } from "@tabler/icons-react";
import { useState } from "react";

/**
 * FreeDuet (D47): the one calm line a REMOTE session sees above the message box. A signed-in browser that
 * is not paired with the computer FreeDuet runs on has every action held for the person's yes
 * (`auth/remote-limits.ts`, `REMOTE_SESSION_SENTENCE`); without this line the person met a card and no
 * reason. `remote` is what `/api/me` says and the app never decides it. Nothing is rendered when it is
 * not true, which is every paired browser and every single-user installation.
 *
 * Dismissed for the visit only (state in the component, nothing stored): a reload brings it back. The
 * command is the one the server's own sentence names; this line mints no pairing link and holds no button
 * that could, because pairing is done at the computer.
 */
export function RemoteSessionNotice({ remote }: { remote: boolean }) {
  const [dismissed, setDismissed] = useState(false);
  if (!remote || dismissed) return null;
  return (
    <div
      className="flex items-start gap-2 pb-2 text-sm text-muted-foreground"
      role="status"
    >
      <p className="min-w-0 flex-1">
        This browser is not paired with the computer FreeDuet runs on, so every
        action asks you first. To pair it, sign in as the administrator and run{" "}
        <code className="font-mono">bash scripts/open.sh</code> on that
        computer.
      </p>
      <button
        aria-label="Dismiss"
        className="shrink-0 rounded p-0.5 hover:text-foreground"
        onClick={() => setDismissed(true)}
        type="button"
      >
        <IconX aria-hidden className="size-4" />
      </button>
    </div>
  );
}
