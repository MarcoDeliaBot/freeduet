import { queryOptions, useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";

/*
 * Which build is online (D162): one small grey line, "v0.2.2 · 94313002 · 26 Nov 2026 22:05", under
 * Settings and Sign out in the sidebar and the phone's menu, and a row in Settings > About. The server
 * works the line out at start (server/src/freeduet/build-info.ts); this only shows it. Where it cannot be
 * read (not signed in, an older server) nothing is drawn.
 */
export type BuildInfo = {
  version: string;
  commit: string | null;
  builtAt: string;
  label: string;
};

export const buildInfoQueryOptions = () =>
  queryOptions({
    queryKey: ["freeduet", "build"],
    queryFn: () =>
      client<BuildInfo>("/api/freeduet/build", "build", {
        fallback: "The build could not be read.",
      }),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });

export function useBuildLabel(): string | null {
  return useQuery(buildInfoQueryOptions()).data?.label ?? null;
}

export function BuildLabel({ className }: { className?: string }) {
  const label = useBuildLabel();
  if (!label) return null;
  return (
    <p
      className={`type-caption px-3 pt-2 pb-1 text-duet-ink-2 select-text ${className ?? ""}`}
      data-testid="build-label"
    >
      {label}
    </p>
  );
}
