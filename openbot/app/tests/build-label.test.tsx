/** D162: the build line in the sidebar, the phone menu and Settings > About. */
import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { FreeDuetAbout } from "@/freeduet/about-section";
import { BuildLabel, buildInfoQueryOptions } from "@/freeduet/build-label";

const LABEL = "v0.2.2 · 94313002 · 26 Nov 2026 22:05";
function withBuild(node: React.ReactNode, label: string | null) {
  const queries = new QueryClient();
  if (label)
    queries.setQueryData(buildInfoQueryOptions().queryKey, {
      version: "0.2.2",
      commit: "94313002",
      builtAt: "2026-11-26T21:05:00.000Z",
      label,
    });
  return renderToStaticMarkup(
    <QueryClientProvider client={queries}>{node}</QueryClientProvider>,
  );
}

describe("BuildLabel", () => {
  test("renders the server's line", () => {
    const html = withBuild(<BuildLabel />, LABEL);
    expect(html).toContain(LABEL);
    expect(html).toContain('data-testid="build-label"');
  });
  test("draws nothing where the build is unknown", () => {
    expect(withBuild(<BuildLabel />, null)).toBe("");
  });
  test("Settings > About carries it too", () => {
    const html = withBuild(<FreeDuetAbout />, LABEL);
    expect(html).toContain("This build");
    expect(html).toContain(LABEL);
    expect(withBuild(<FreeDuetAbout />, null)).not.toContain("This build");
  });
});
