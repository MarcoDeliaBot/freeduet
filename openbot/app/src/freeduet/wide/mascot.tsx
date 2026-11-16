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
 * The viewBox that crops the 220 art tight on the bubble (it is 144 wide, 38 to 182 across and 48 to 192
 * down), so the face is as large as it can be at 40 px. The accessory is drawn past the edge of the box
 * (`overflow: visible`), so the twelve stay tellable apart.
 */
const FACE_BOX = "36 46 148 148";

const SYMBOLS = [
  ...Object.entries(mascot.team).map(
    ([key, art]) =>
      `<symbol id="duet-m-${key}" overflow="visible" viewBox="${FACE_BOX}">${art}</symbol>`,
  ),
  `<symbol id="duet-m-neutral" overflow="visible" viewBox="${FACE_BOX}"><use href="#bubble"/>${mascot.faces.idle}</symbol>`,
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
  return (
    <svg
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", className)}
      data-face={key ?? "neutral"}
      focusable="false"
      height={size}
      viewBox="0 0 148 148"
      width={size}
    >
      <use href={`#duet-m-${key ?? "neutral"}`} />
    </svg>
  );
}
