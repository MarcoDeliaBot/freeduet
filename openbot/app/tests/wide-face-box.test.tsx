import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { ART_BOX, MascotSprite, MemberFace } from "@/freeduet/wide/mascot";
import drawn from "@/freeduet/wide/mascot-drawn.json";
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
 * Each face's drawn extent on the 220 canvas, [left, top, right, bottom]: the box of each drawn child, moved by
 * its own transform, in headless Chromium (strokes not included, so STROKE is added). A rotated child is taken
 * by the corners of its box, so the figures are a bound. The water group is left out: its two half-rectangles
 * are clipped to the bubble, and getBBox() does not apply a clip. To measure again after the drawings change,
 * render each face in its own svg on the 220 canvas and take the same boxes.
 */
const EXTENT: Record<string, [number, number, number, number]> = {
  iris: [31.06, 14, 188.94, 209],
  leo: [31.06, 14, 188.94, 209],
  otto: [31.06, 14, 188.94, 209],
  portia: [31.06, 14, 188.94, 209],
  penny: [31.06, 14, 188.94, 209],
  jules: [31.06, 14, 188.94, 209],
  wren: [31.06, 14, 188.94, 209],
  gus: [31.06, 14, 188.94, 209],
  basil: [31.06, 14, 188.94, 209],
  vera: [31.06, 14, 188.94, 209],
  mark: [31.06, 14, 188.94, 209],
  video: [31.06, 14, 188.94, 209],
};
const STROKE = 3;
/** The drawings, so that a changed drawing makes the table above be measured again. */
const ART_SHA1 = "b51ecacc1c4df92d9ba9012180d6ff643cc9e9d7";

test("the art is the one the extents were measured on", () => {
  expect(Object.keys(EXTENT).sort()).toEqual(Object.keys(drawn.team).sort());
  expect(
    createHash("sha1").update(JSON.stringify(drawn.team)).digest("hex"),
  ).toBe(ART_SHA1);
});

test("the twelve faces are the drawings, each with its own clip, and not the round bubble", () => {
  const view = render(<MascotSprite />);
  for (const key of Object.keys(drawn.team)) {
    const symbol = view.container.querySelector(
      `symbol#duet-m-${key}`,
    ) as Element;
    expect(symbol.querySelector(`#fd-${key}-clip`)).not.toBeNull();
  }
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
