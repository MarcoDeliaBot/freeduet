import { queryOptions, useQuery } from "@tanstack/react-query";
import { DuetIcon } from "@/components/duet/icons";
import { DuetCard, OutcomePill } from "@/components/duet/kit";
import { PageEmpty, PageShell } from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import { client } from "@/lib/client";
import { isFreeDuetApp } from "./manage-group";
import { WorkspaceShell, WorkspaceTabs } from "./workspace";
import { EngineMembers } from "./engines-members";
import { EngineProviders } from "./engines-providers";
import { EngineTokens } from "./engines-tokens";
import {
  ASIDE_LABEL,
  ENGINE_STATES_TITLE,
  ENGINES_FALLBACK,
  ENGINES_INTRO,
  ENGINES_TITLE,
  type EngineSummary,
  type EnginesReading,
  enginePill,
  engineReasonText,
  engineStateText,
  KEYS_NOT_BUILT,
  KEYS_TEXT,
  KEYS_TITLE,
  LOAD_FAILED,
  NO_ENGINES,
  SPENDING_TEXT,
  SPENDING_TITLE,
} from "./engines-text";

/** How often the page asks again, so a time it shows does not go stale while it stays open. */
const REFRESH_MS = 30_000;

export const enginesKeys = { all: ["freeduet", "engines"] as const };

/** The server's read of agent-freeduet's engines. The token never reaches this page. */
export function enginesQueryOptions() {
  return queryOptions({
    queryKey: enginesKeys.all,
    queryFn: async (): Promise<EnginesReading> => {
      const response = await client("/api/freeduet/engines", {
        fallback: ENGINES_FALLBACK,
      });
      return response.json();
    },
  });
}

/** One engine: its word for the state, its name, and one line of note from the server's words. */
function EngineCard({ engine, now }: { engine: EngineSummary; now: Date }) {
  const pill = enginePill(engine.state);
  return (
    <DuetCard className="flex h-full flex-col gap-3 p-5" data-slot="engine">
      <div>
        <OutcomePill icon={null} tone={pill.tone}>
          {pill.label}
        </OutcomePill>
      </div>
      <h3 className="type-body font-semibold [overflow-wrap:anywhere]">
        {engine.name}
      </h3>
      <p className="type-label mt-auto border-duet-hair-2 border-t pt-3 text-duet-ink-2">
        {engineStateText(engine, now)}
      </p>
    </DuetCard>
  );
}

export function FreeDuetEngines() {
  const engines = useQuery({
    ...enginesQueryOptions(),
    refetchInterval: REFRESH_MS,
  });
  const reading = engines.data;
  // Read at each render: a time that has passed reads as past at the next refresh.
  const now = new Date();

  const workspace = isFreeDuetApp();
  const content = (
    <>
      {engines.error ? (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          {LOAD_FAILED}
        </p>
      ) : null}
      {reading?.reason ? (
        <PageEmpty>{engineReasonText(reading.reason)}</PageEmpty>
      ) : null}
      {reading && !reading.reason ? (
        <EngineSections
          reading={reading}
          now={now}
          workspace={workspace}
          onChanged={() => engines.refetch()}
        />
      ) : null}
    </>
  );
  return workspace ? (
    <WorkspaceShell
      title={ENGINES_TITLE}
      icon="activity"
      description={ENGINES_INTRO}
    >
      {content}
    </WorkspaceShell>
  ) : (
    <PageShell description={ENGINES_INTRO} title={ENGINES_TITLE} width="wide">
      {content}
    </PageShell>
  );
}

export function EngineSections({
  reading,
  now,
  workspace,
  onChanged,
}: {
  reading: EnginesReading;
  now: Date;
  workspace: boolean;
  onChanged: () => unknown;
}) {
  const states =
    reading.engines.length === 0 ? (
      <PageEmpty>{NO_ENGINES}</PageEmpty>
    ) : (
      <section>
        <h2 className={workspace ? "fd-section-title" : "sr-only"}>
          {ENGINE_STATES_TITLE}
        </h2>
        <ul
          className={workspace ? "fd-engine-grid" : "grid gap-4 sm:grid-cols-2"}
        >
          {reading.engines.map((engine, index) => (
            <li className="min-w-0" key={engine.id}>
              <StaggerItem className="h-full" index={index}>
                <EngineCard engine={engine} now={now} />
              </StaggerItem>
            </li>
          ))}
        </ul>
      </section>
    );
  const notes = (
    <aside aria-label={ASIDE_LABEL} className="flex min-w-0 flex-col gap-4">
      <DuetCard className="p-5">
        <h2 className="type-body font-semibold">
          {workspace && <DuetIcon name="key" size={19} />} {KEYS_TITLE}
        </h2>
        <p className="type-label mt-2 text-duet-ink-2">{KEYS_TEXT}</p>
        <p className="type-label mt-2 text-duet-ink-2">{KEYS_NOT_BUILT}</p>
      </DuetCard>
      <DuetCard className="p-5">
        <h2 className="type-body font-semibold">
          {workspace && <DuetIcon name="activity" size={19} />} {SPENDING_TITLE}
        </h2>
        <p className="type-label mt-2 text-duet-ink-2">{SPENDING_TEXT}</p>
      </DuetCard>
    </aside>
  );
  const providers = (
    <EngineProviders
      reading={reading}
      onChanged={onChanged}
      browse={workspace}
    />
  );
  const members = reading.members?.length ? (
    <EngineMembers reading={reading} onChanged={onChanged} browse={workspace} />
  ) : null;
  const usage = <EngineTokens reading={reading} />;
  if (workspace) {
    return (
      <WorkspaceTabs
        label="Engine sections"
        views={[
          {
            id: "overview",
            label: "Overview",
            icon: "dashboard",
            content: (
              <div className="fd-overview">
                {states}
                {notes}
              </div>
            ),
          },
          ...(reading.providers?.length
            ? [
                {
                  id: "providers",
                  label: "Providers",
                  icon: "plug" as const,
                  content: providers,
                },
              ]
            : []),
          ...(reading.members?.length
            ? [
                {
                  id: "members",
                  label: "Bot assignments",
                  icon: "bolt" as const,
                  content: members,
                },
              ]
            : []),
          { id: "usage", label: "Usage", icon: "activity", content: usage },
        ]}
      />
    );
  }
  return (
    <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
      <div className="flex min-w-0 flex-col gap-10">
        {states}
        {providers}
        {members}
        {usage}
      </div>
      {notes}
    </div>
  );
}
