import type { Page } from "playwright";
import type { BrowserChallenge } from "../../shared/computer-control";
import type { Control } from "./control";

type Signal = {
  cfMitigated?: string | null;
  text: string;
  visibleChallengeControl: boolean;
};
type Classification = Omit<BrowserChallenge, "requestId">;
/** Generic access denial and score-only blocks offer no actionable human challenge. */
export function classifyChallenge(signal: Signal): Classification | undefined {
  if (signal.cfMitigated?.trim().toLowerCase() === "challenge")
    return {
      kind: "cloudflare",
      reason:
        "This site presented a Cloudflare security challenge. Please complete it in the existing browser, then hand control back.",
    };
  if (
    signal.visibleChallengeControl &&
    /verify (?:that )?you (?:are|'re) (?:a )?human|confirm (?:that )?you (?:are|'re) (?:a )?human|i(?:'|’)m not a robot|complete (?:the|this) (?:captcha|security check)|select all (?:images|squares)|prove (?:that )?you (?:are|'re) (?:a )?human/i.test(
      signal.text,
    )
  ) {
    return {
      kind: "visible-challenge",
      reason:
        "This page has a visible human verification challenge. Please complete it in the existing browser, then hand control back.",
    };
  }
}

/**
 * What the page says about being a challenge, read from the page and nothing more.
 *
 * Split from the decision below so a read that has to be repeated while a page settles can repeat
 * this part freely. It changes nothing: the one thing in challenge detection that does, raising a
 * request for help, happens once in {@link raiseChallenge}, on the page that held still.
 */
export async function readChallengeSignal(
  page: Page,
  options: { cfMitigated?: string | null } = {},
): Promise<Signal> {
  return options.cfMitigated?.trim().toLowerCase() === "challenge"
    ? {
        text: "",
        visibleChallengeControl: false,
        cfMitigated: options.cfMitigated,
      }
    : await page.evaluate(() => {
        const visible = (element: Element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            bounds.width > 0 &&
            bounds.height > 0 &&
            bounds.bottom > 0 &&
            bounds.right > 0 &&
            bounds.top < innerHeight &&
            bounds.left < innerWidth
          );
        };
        const frames = Array.from(document.querySelectorAll("iframe[src]"));
        const challengeFrames = frames.filter((frame) => {
          const src = frame.getAttribute("src") ?? "";
          return (
            /(?:google\.com\/recaptcha|recaptcha\.net\/recaptcha|hcaptcha\.com\/|challenges\.cloudflare\.com\/)/i.test(
              src,
            ) && visible(frame)
          );
        });
        const controls = Array.from(
          document.querySelectorAll(
            'input[type="checkbox"], [role="checkbox"], button',
          ),
        );
        const visibleChallengeControl =
          challengeFrames.length > 0 ||
          controls.some(
            (control) =>
              visible(control) &&
              /human|not a robot|verify|captcha/i.test(
                control.getAttribute("aria-label") ??
                  control.closest("label")?.textContent ??
                  control.textContent ??
                  "",
              ),
          );
        return {
          text: (document.body?.innerText ?? "").slice(0, 20_000),
          visibleChallengeControl,
        };
      });
}

/**
 * Decide from what was read, and ask for help when it is a challenge.
 *
 * This is the part with a side effect: it opens a handoff request, and asking twice would open two.
 * Called once per call.
 */
export function raiseChallenge(
  page: Page,
  control: Control,
  signal: Signal,
  options: { toolCallId?: string } = {},
): BrowserChallenge | undefined {
  const result = classifyChallenge(signal);
  if (!result) return undefined;
  const request = control.requestHelp(
    result.reason,
    options.toolCallId,
    result.kind,
    // The challenge's own address, so a browser that restarts before anyone takes control is sent
    // back to it rather than handing the person a blank page with nothing to solve.
    page.url(),
  ).request;
  if (!request)
    throw new Error("The challenge handoff did not produce a request.");
  return { ...result, requestId: request.id };
}

/** Called only on navigate/read/snapshot. Does not solve, click, or reload a challenge. */
export async function detectChallenge(
  page: Page,
  control: Control,
  options: { cfMitigated?: string | null; toolCallId?: string } = {},
): Promise<BrowserChallenge | undefined> {
  return raiseChallenge(
    page,
    control,
    await readChallengeSignal(page, options),
    options,
  );
}
