import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup, render } from "@testing-library/react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { ChannelAvatar } from "@/components/channels/avatar";
import { settleReactWork } from "./settle-react-work";

/**
 * A FreeDuet team member wears its drawn mascot in every avatar the app draws (the shared
 * `BotFace`, behind `AbstractAvatar` and `ChannelAvatar`); any other Bot keeps the mic orb.
 */

beforeAll(() => GlobalRegistrator.register({ url: "http://localhost:3010" }));
afterEach(cleanup);
afterAll(async () => {
  await settleReactWork();
  GlobalRegistrator.unregister();
});

test("AbstractAvatar draws a team member's mascot, not the orb", () => {
  const view = render(<AbstractAvatar id="freeduet" name="Iris" size={28} />);
  const face = view.container.querySelector("svg[data-face='iris']");
  expect(face).not.toBeNull();
  expect(view.container.querySelectorAll("canvas").length).toBe(0);
  expect(
    view.container.querySelector("[role='img']")?.getAttribute("aria-label"),
  ).toBe("Iris");
});

test("ChannelAvatar draws a team member's mascot in the conversation list", () => {
  const view = render(
    <ChannelAvatar participantIds={["marketer"]} size={32} />,
  );
  expect(view.container.querySelector("svg[data-face='mark']")).not.toBeNull();
  expect(view.container.querySelectorAll("canvas").length).toBe(0);
});

test("a Bot that is not a team member keeps the orb", () => {
  const view = render(
    <AbstractAvatar id="your-agent" name="Helper" size={28} />,
  );
  expect(view.container.querySelector("svg[data-face]")).toBeNull();
  expect(view.container.querySelectorAll("canvas").length).toBe(1);
});

test("a Bot somebody trained with an unlisted id keeps the orb in ChannelAvatar", () => {
  const view = render(
    <ChannelAvatar participantIds={["acme-helper"]} size={32} />,
  );
  expect(view.container.querySelector("svg[data-face]")).toBeNull();
  expect(view.container.querySelectorAll("canvas").length).toBe(1);
});
