import mascot from "@openbot/shared/mascot.json";
import { cn } from "@/lib/utils";

/**
 * The twelve mascot faces in the app, drawn from the same file as the home page
 * (`openbot/shared/mascot.json`, D55): one round blue water bubble and one accessory each.
 *
 * Which member wears which: the id the member has in `agents.yaml`. A member somebody trained
 * themselves has an id nobody listed, and gets the bubble with the plain face and nothing on it.
 */
export const MEMBER_MASCOT: Readonly<Record<string, string>> = {
  freeduet: "iris",
  creator: "leo",
  inbox: "otto",
  counsel: "portia",
  bookkeeper: "penny",
  concierge: "jules",
  writer: "wren",
  fixer: "gus",
  chef: "basil",
  reviewer: "vera",
  marketer: "mark",
  video: "video",
};

/** The twelve art keys of the file, in the order the home page lists them. */
export const MASCOT_KEYS = Object.keys(mascot.team);

/** The art key for a member id, or `null` for a member nobody drew (one the person trained). */
export function mascotKeyOf(agentId: string): string | null {
  return MEMBER_MASCOT[agentId] ?? null;
}

/**
 * The face is drawn on the whole 220 by 220 canvas of the art plus 10 around it, not cropped to the bubble: the bubble
 * (144 wide, 38 to 182 across and 48 to 192 down) sits in a 148 box at 36, 46, and the accessory (cap,
 * coin, hat, headset, envelope) is drawn past that box, so it has to be INSIDE the picture. Before, the
 * crop was tight and the accessory stuck out through `overflow: visible`, on the symbol and on the
 * svg; a real Chrome clipped it at the edge of the box all the same (the maintainer's screenshot,
 * 16 November 2026). Nothing here relies on an overflow any more: every accessory lies inside the
 * viewBox, and the svg's own margins give back the 40 px the row has always had.
 */
export const ART_BOX = "-10 -10 240 240";
const ART = 240;
/** Where the art's own 0, 0 lies in ART_BOX. */
const ART_ORIGIN = 10;
/** Where the bubble's 148 box starts and how much canvas lies past it, in art units. */
const BUBBLE_BOX = { size: 148, left: 36, top: 46 };

const SYMBOLS = [
  ...Object.entries(mascot.team).map(
    ([key, art]) =>
      `<symbol id="duet-m-${key}" viewBox="${ART_BOX}">${art}</symbol>`,
  ),
  `<symbol id="duet-m-neutral" viewBox="${ART_BOX}"><use href="#bubble"/>${mascot.faces.idle}</symbol>`,
].join("");

/**
 * The paints and the symbols, drawn once for the whole page. It is a real, empty-size SVG and not
 * `display: none`: a gradient inside a hidden SVG paints nothing in some browsers.
 */
export function MascotSprite() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute size-0 overflow-hidden"
      focusable="false"
      // The markup is the file this repository ships, never anything a person or a model wrote.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static, repository-owned art
      dangerouslySetInnerHTML={{
        __html: `${mascot.defs}${SYMBOLS}`,
      }}
    />
  );
}

/** A member's face. Decorative: the name beside it is what a screen reader hears. */
export function MemberFace({
  agentId,
  size = 40,
  className,
}: {
  agentId: string;
  size?: number;
  className?: string;
}) {
  const key = mascotKeyOf(agentId);
  // The bubble is `size` px; the canvas around it is drawn at the same scale and handed back as
  // negative margin, so the row sees a square of `size` and the accessory has the room it needs.
  const scale = size / BUBBLE_BOX.size;
  const canvas = ART * scale;
  const left = (BUBBLE_BOX.left + ART_ORIGIN) * scale;
  const top = (BUBBLE_BOX.top + ART_ORIGIN) * scale;
  return (
    <svg
      aria-hidden="true"
      className={cn("pointer-events-none block max-w-none shrink-0", className)}
      data-face={key ?? "neutral"}
      focusable="false"
      height={canvas}
      style={{
        margin: `${-top}px ${-(canvas - size - left)}px ${-(canvas - size - top)}px ${-left}px`,
      }}
      viewBox={ART_BOX}
      width={canvas}
    >
      <use href={`#duet-m-${key ?? "neutral"}`} />
    </svg>
  );
}
