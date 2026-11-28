import { afterAll, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { render } from "@testing-library/react";
import {
  firstUnreadItemId,
  takeFirstUnread,
  type UnreadScroller,
  useFirstUnreadScroll,
  wantFirstUnread,
} from "@/lib/channels/first-unread";

/** D172: "Read newest" opens at the first message after the person's last own message. */

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

const text = (id: string, role: "user" | "assistant") => ({
  kind: "text" as const,
  id,
  role,
});

test("the target is the first item after the person's last message", () => {
  expect(
    firstUnreadItemId([
      text("a", "user"),
      text("b", "assistant"),
      text("c", "user"),
      text("d", "assistant"),
      { kind: "tools", id: "e" },
      text("f", "assistant"),
    ]),
  ).toBe("d");
});

test("nothing after the person's last message, or no message of theirs, is the newest (no target)", () => {
  expect(firstUnreadItemId([text("a", "user")])).toBeNull();
  expect(firstUnreadItemId([text("a", "assistant")])).toBeNull();
  expect(firstUnreadItemId([])).toBeNull();
});

test("an attachment-only turn of the person counts as theirs", () => {
  expect(
    firstUnreadItemId([
      text("a", "assistant"),
      { kind: "attachments", id: "p" },
      text("b", "assistant"),
    ]),
  ).toBe("b");
});

test("the click is valid once and only for a short while", () => {
  takeFirstUnread();
  wantFirstUnread(1_000);
  expect(takeFirstUnread(1_000 + 20_000)).toBe(false);
  wantFirstUnread(1_000);
  expect(takeFirstUnread(1_000 + 5_000)).toBe(true);
  expect(takeFirstUnread(1_000 + 5_000)).toBe(false);
});

function Probe({
  items,
  restoring,
  scroller,
}: {
  items: Parameters<typeof useFirstUnreadScroll>[0];
  restoring: boolean;
  scroller: UnreadScroller;
}) {
  useFirstUnreadScroll(items, restoring, scroller);
  return null;
}

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("after a click, the opened conversation scrolls to its first unread message once, and not before it is restored", async () => {
  const jumps: string[] = [];
  const scroller: UnreadScroller = {
    scrollToMessage: (id) => {
      jumps.push(id);
      return true;
    },
    scrollToEnd: () => {
      jumps.push("end");
      return true;
    },
  };
  const items = [
    text("a", "user"),
    text("b", "assistant"),
    text("c", "assistant"),
  ];
  takeFirstUnread();
  wantFirstUnread();
  const view = render(<Probe items={[]} restoring scroller={scroller} />);
  await wait(80);
  expect(jumps).toEqual([]);
  view.rerender(<Probe items={items} restoring={false} scroller={scroller} />);
  await wait(120);
  expect(jumps).toEqual(["b"]);
  view.rerender(
    <Probe
      items={[...items, text("d", "assistant")]}
      restoring={false}
      scroller={scroller}
    />,
  );
  await wait(120);
  expect(jumps).toEqual(["b"]);
});

test("without a click, or with nothing to land on, it falls back to the end and never moves a conversation opened any other way", async () => {
  const jumps: string[] = [];
  const scroller: UnreadScroller = {
    scrollToMessage: (id) => {
      jumps.push(id);
      return true;
    },
    scrollToEnd: () => {
      jumps.push("end");
      return true;
    },
  };
  takeFirstUnread();
  render(
    <Probe
      items={[text("a", "user"), text("b", "assistant")]}
      restoring={false}
      scroller={scroller}
    />,
  );
  await wait(120);
  expect(jumps).toEqual([]);
  wantFirstUnread();
  render(
    <Probe
      items={[text("a", "assistant")]}
      restoring={false}
      scroller={scroller}
    />,
  );
  await wait(120);
  expect(jumps).toEqual(["end"]);
});
