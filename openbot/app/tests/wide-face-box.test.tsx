import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import mascot from "@openbot/shared/mascot.json";
import { cleanup, render } from "@testing-library/react";
import { ART_BOX, MascotSprite, MemberFace } from "@/freeduet/wide/mascot";
import { settleReactWork } from "./settle-react-work";

/**
 * The accessories (cap, coin, hat, headset, envelope) are drawn past the bubble. A real Chrome clipped
 * them at the edge of the 40 px box (16 November 2026, "the hats cannot be seen") although the svg and
 * the symbol both said `overflow: visible`, so no face may depend on an overflow: every accessory has
 * to lie INSIDE the viewBox it is drawn in, and the box the row sees stays 40 px.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

/**
 * Each art's drawn extent on the 220 canvas, [left, top, right, bottom], measured with `getBBox()` of the
 * art's own group in Chromium 153 (strokes not included, so STROKE is added). To measure again after the
 * art changes: put `mascot.defs` and the art in one svg and read `getBBox()` of each `<g>`.
 */
const EXTENT: Record<string, [number, number, number, number]> = {
  iris: [20, 40, 200, 210],
  leo: [38, 48, 194.2, 210],
  otto: [21.2, 28, 182, 210],
  portia: [38, 48, 202, 210],
  penny: [38, 11.5, 182, 210],
  jules: [38, 11.8, 207, 210],
  wren: [38, 35, 195.6, 210],
  gus: [38, 28, 182, 210],
  basil: [38, 11, 182, 210],
  vera: [38, 48, 182, 210],
  mark: [38, 48, 220, 210],
  video: [38, 48, 198, 210],
};
const STROKE = 3;
/** The whole art, so that a changed drawing makes the table above be measured again. */
const ART_SHA1 = "3a5b8870fe3131e724f8a3a4c4d86870f4be4494";

test("the art is the one the extents were measured on", () => {
  expect(Object.keys(EXTENT).sort()).toEqual(Object.keys(mascot.team).sort());
  expect(
    createHash("sha1").update(JSON.stringify(mascot.team)).digest("hex"),
  ).toBe(ART_SHA1);
});

test("every accessory lies inside the viewBox its symbol is drawn in, so no overflow is needed", () => {
  const view = render(<MascotSprite />);
  const [vx, vy, vw, vh] = ART_BOX.split(" ").map(Number);
  for (const [key, [l, t, r, b]] of Object.entries(EXTENT)) {
    const symbol = view.container.querySelector(`symbol#duet-m-${key}`);
    expect(symbol?.getAttribute("viewBox")).toBe(ART_BOX);
    expect(l - STROKE).toBeGreaterThanOrEqual(vx);
    expect(t - STROKE).toBeGreaterThanOrEqual(vy);
    expect(r + STROKE).toBeLessThanOrEqual(vx + vw);
    expect(b + STROKE).toBeLessThanOrEqual(vy + vh);
  }
  // The plain face is the bubble alone, inside the same box.
  expect(
    view.container
      .querySelector("symbol#duet-m-neutral")
      ?.getAttribute("viewBox"),
  ).toBe(ART_BOX);
  // Nothing in the sprite or in a face leans on `overflow: visible`.
  expect(view.container.innerHTML).not.toContain('overflow="visible"');
});

/** The four margins of an element, whichever way the style serializes the shorthand (1 to 4 values). */
function marginOf(element: Element): [number, number, number, number] {
  const match = /margin:\s*([^;]+)/.exec(element.getAttribute("style") ?? "");
  const v = (match?.[1] ?? "").split(/\s+/).map((x) => Number.parseFloat(x));
  const [t = 0, r = t, b = t, l = r] = v;
  return [t, r, b, l];
}

test("the face draws the whole canvas but takes the 40 px square it always took", () => {
  for (const size of [40, 48]) {
    const view = render(<MemberFace agentId="inbox" size={size} />);
    const svg = view.container.querySelector("svg") as SVGSVGElement;
    expect(svg.getAttribute("viewBox")).toBe(ART_BOX);
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    const [top, right, bottom, left] = marginOf(svg);
    // The row sees `size` by `size`, and the bubble (36, 46 on the art, 10 more on this canvas) stays where it was.
    expect(width + left + right).toBeCloseTo(size, 4);
    expect(height + top + bottom).toBeCloseTo(size, 4);
    expect(-left).toBeCloseTo(((36 + 10) * size) / 148, 4);
    expect(-top).toBeCloseTo(((46 + 10) * size) / 148, 4);
    expect(svg.classList.contains("overflow-visible")).toBe(false);
    view.unmount();
  }
});
