import { queryOptions } from "@tanstack/react-query";
import { client, tryClient } from "./client";

/**
 * Pairing a phone or another browser with the computer (docs/M1_PLAN.md D49). The server decides everything here
 * (who may see the list, who may make a code); this file only asks and says what it was told.
 */

export type PairingKind = "computer" | "device";

export type BrowserPairing = {
  id: string;
  label: string;
  kind: PairingKind;
  createdAt: string;
  lastSeenAt: string;
  /** This browser's own. */
  current: boolean;
};

export type PairingList = {
  pairings: BrowserPairing[];
  /** This browser may make a code: it is paired as a computer. */
  canPair: boolean;
  /** The app's configured address, when there is one: what a phone can open. */
  appUrl?: string;
};

export type PairingCode = {
  /** As shown and typed, `ABCDE-FGHJK`. */
  code: string;
  expiresInSeconds: number;
  /** The link, when the server knows the app's address. */
  link?: string;
};

export const pairingsKey = ["pairings"] as const;

/** The list, or null where there is nothing to show: this deployment has no pairing, or this browser is not paired. */
export function pairingsQueryOptions() {
  return queryOptions({
    queryKey: pairingsKey,
    queryFn: async (): Promise<PairingList | null> => {
      const response = await tryClient("/api/pairings");
      if (response.status === 403 || response.status === 404) return null;
      if (!response.ok) throw new Error("Could not load your paired browsers.");
      return response.json();
    },
    staleTime: 15_000,
  });
}

export async function makePairingCode(): Promise<PairingCode> {
  const response = await client("/api/pairings/code", {
    method: "POST",
    fallback: "Could not make a code.",
  });
  return response.json();
}

export async function redeemPairingCode(code: string, label: string) {
  await client("/api/pairings/redeem", {
    method: "POST",
    body: { code, ...(label.trim() ? { label: label.trim() } : {}) },
    fallback: "Could not pair this browser.",
  });
}

export async function revokePairing(id: string) {
  await client(`/api/pairings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallback: "Could not revoke that browser.",
  });
}

export async function renamePairing(id: string, label: string) {
  await client(`/api/pairings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { label },
    fallback: "Could not rename that browser.",
  });
}

/** What the page calls the code in the link: the shown form without its dash. */
export const codeForLink = (shown: string) => shown.replace(/[\s-]/g, "");

/**
 * The link a phone opens. The code is in the FRAGMENT, which a browser never sends to a server and never puts in a
 * Referer; the page reads it and removes it from the address bar (`takeCodeFromAddress`). `base` is the app's address.
 */
export function pairingLink(base: string, shownCode: string): string {
  return `${base.replace(/\/+$/, "")}/settings#pair=${codeForLink(shownCode)}`;
}

/** Whether an address only works on the computer it is shown on. */
export function isLocalAddress(address: string): boolean {
  try {
    const host = new URL(address).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

/**
 * The code in the address bar's fragment, taken out of it: the address is rewritten at once, before anything is sent,
 * and the code is returned. Null where there is none.
 */
export function takeCodeFromAddress(win: {
  location: { hash: string; pathname: string; search: string };
  history: {
    replaceState: (state: unknown, title: string, url: string) => void;
  };
}): string | null {
  const found = /^#pair=([A-Za-z0-9-]{4,40})$/.exec(win.location.hash);
  if (!found) return null;
  win.history.replaceState(
    null,
    "",
    `${win.location.pathname}${win.location.search}`,
  );
  return found[1] as string;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", and the date after a month. */
export function whenWords(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  if (seconds < 30 * 86_400) return `${Math.floor(seconds / 86_400)} d ago`;
  return new Date(then).toLocaleDateString();
}
