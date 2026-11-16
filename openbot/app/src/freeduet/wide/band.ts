import { createContext, useContext, useSyncExternalStore } from "react";

/**
 * How much of the screen the app uses (D55).
 *
 * - `full`: 1280 px and wider. Your team is a column on the left, with names and what each is doing.
 * - `faces`: 1024 to 1279 px. The same column, folded to faces and icons.
 * - `off`: below 1024 px. The phone and tablet layout, untouched: nothing in this folder draws.
 */
export type WideBand = "off" | "faces" | "full";

export const FULL_MIN_PX = 1280;
export const FACES_MIN_PX = 1024;

/** The band a width falls in. Pure, so the three ranges are proven without a browser. */
export function bandForWidth(width: number): WideBand {
  if (width >= FULL_MIN_PX) return "full";
  if (width >= FACES_MIN_PX) return "faces";
  return "off";
}

const FULL_QUERY = `(min-width: ${FULL_MIN_PX}px)`;
const FACES_QUERY = `(min-width: ${FACES_MIN_PX}px)`;

function snapshot(): WideBand {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "off";
  if (window.matchMedia(FULL_QUERY).matches) return "full";
  if (window.matchMedia(FACES_QUERY).matches) return "faces";
  return "off";
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => {};
  const lists = [FULL_QUERY, FACES_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const list of lists) list.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener("change", onChange);
  };
}

/** The band the window is in now, and again whenever it crosses 1024 or 1280. */
export function useWideBandOfWindow(): WideBand {
  return useSyncExternalStore(subscribe, snapshot, () => "off");
}

const WideContext = createContext<WideBand>("off");

export const WideProvider = WideContext.Provider;

/**
 * The band the shell chose, for whatever it drew. Outside the wide frame it is `off`, so a card or
 * a conversation drawn anywhere else (a test, the phone) is exactly what it was.
 */
export function useWideBand(): WideBand {
  return useContext(WideContext);
}
