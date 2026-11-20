import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import type { MicOrbState } from "@/components/duet/mic-orb";
import { ChatOrb } from "@/components/shell/header";
import { MemberOrb } from "@/components/shell/member-orb";
import { ActiveBotProvider, useActiveBot } from "@/lib/copilot/active-bot";
import { settleReactWork } from "./settle-react-work";

/**
 * The header's orb in Chat: a FreeDuet team member wears its drawn mascot with a ring that shows the
 * orb's state; any other Bot keeps the mic orb. The ring carries `data-state`, so the states can be
 * read without a canvas.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost/" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

/** Declares the Bot this surface drives, as Chat does for its conversation. */
function Declare({ id }: { id: string }) {
  useActiveBot(id);
  return null;
}

function orbFor(botId: string) {
  return render(
    <ActiveBotProvider>
      <Declare id={botId} />
      <ChatOrb size={48} />
    </ActiveBotProvider>,
  );
}

describe("ChatOrb for a team member", () => {
  test("renders the member's mascot, with a ring in the idle state", () => {
    const view = orbFor("freeduet");
    const face = view.container.querySelector("[data-face='iris']");
    expect(face).not.toBeNull();
    const ring = view.container.querySelector("[data-ring-state]");
    expect(ring?.getAttribute("data-ring-state")).toBe("idle");
    // The mic orb is not drawn for a team member.
    expect(view.container.querySelector("canvas")).toBeNull();
  });

  test("a non-team Bot keeps the mic orb and draws no mascot", () => {
    const view = orbFor("support-desk");
    expect(view.container.querySelector("[data-face]")).toBeNull();
    expect(view.container.querySelector("[data-ring-state]")).toBeNull();
    expect(view.container.querySelector("canvas")).not.toBeNull();
  });

  test("the placeholder Bot (no conversation) keeps the mic orb", () => {
    const view = render(
      <ActiveBotProvider>
        <ChatOrb size={48} />
      </ActiveBotProvider>,
    );
    expect(view.container.querySelector("[data-face]")).toBeNull();
    expect(view.container.querySelector("canvas")).not.toBeNull();
  });
});

describe("MemberOrb ring", () => {
  const states: MicOrbState[] = [
    "idle",
    "listening",
    "thinking",
    "done",
    "finished",
  ];
  for (const state of states) {
    test(`shows the ${state} state on the ring`, () => {
      const view = render(
        <MemberOrb agentId="marketer" size={48} state={state} />,
      );
      const outer = view.container.querySelector("[data-state]");
      expect(outer?.getAttribute("data-state")).toBe(state);
      const ring = view.container.querySelector("[data-ring-state]");
      expect(ring?.getAttribute("data-ring-state")).toBe(state);
      expect(view.container.querySelector("[data-face='mark']")).not.toBeNull();
    });
  }

  test("the ring and the face fit the box the orb occupies", () => {
    const view = render(<MemberOrb agentId="iris" size={48} />);
    const box = view.container.querySelector("[data-state]") as HTMLElement;
    expect(box.style.width).toBe("48px");
    expect(box.style.height).toBe("48px");
  });
});
