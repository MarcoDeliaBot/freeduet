import { queryOptions, useQuery } from "@tanstack/react-query";
import { DuetIcon } from "@/components/duet/icons";
import { DuetCard, OutcomePill } from "@/components/duet/kit";
import { PageEmpty } from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import { client } from "@/lib/client";
import { EngineMembers } from "./engines-members";
import { EngineProviders } from "./engines-providers";
import {
  type EngineSummary,
  type EnginesReading,
  enginePill,
  engineReasonText,
  engineStateText,
} from "./engines-text";
import { EngineTokens } from "./engines-tokens";
import { englishT, type T, useAppLanguage } from "./i18n/provider";
import { LightPageShell } from "./light/light-page";
import { isFreeDuetApp } from "./manage-group";
import { WorkspaceTabs } from "./workspace";

/** How often the page asks again, so a time it shows does not go stale while it stays open. */
const REFRESH_MS = 30_000;

export const enginesKeys = { all: ["freeduet", "engines"] as const };

/** The server's read of agent-freeduet's engines. The token never reaches this page. */
export function enginesQueryOptions(t: T = englishT) {
  return queryOptions({
    queryKey: enginesKeys.all,
    queryFn: async (): Promise<EnginesReading> => {
      const response = await client("/api/freeduet/engines", {
        fallback: t("engines.fallback"),
      });
      return response.json();
    },
  });
}

/** One engine: its word for the state, its name, and one line of note from the server's words. */
function EngineCard({ engine, now }: { engine: EngineSummary; now: Date }) {
  const { t, language } = useAppLanguage();
  const pill = enginePill(engine.state, t);
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
        {engineStateText(engine, now, undefined, t, language)}
      </p>
    </DuetCard>
  );
}

export function FreeDuetEngines() {
  const { t } = useAppLanguage();
  const engines = useQuery({
    ...enginesQueryOptions(t),
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
          {t("engines.loadFailed")}
        </p>
      ) : null}
      {reading?.reason ? (
        <PageEmpty>{engineReasonText(reading.reason, t)}</PageEmpty>
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
  // The light design (D174): a header with a way back to the settings home, one sentence, the same sections.
  return (
    <LightPageShell
      className={workspace ? "fd-workspace" : undefined}
      purpose={t("engines.intro")}
      title={t("dash.engines")}
      width="wide"
    >
      {content}
    </LightPageShell>
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
  const { t } = useAppLanguage();
  const states =
    reading.engines.length === 0 ? (
      <PageEmpty>{t("engines.noEngines")}</PageEmpty>
    ) : (
      <section>
        <h2 className={workspace ? "fd-section-title" : "sr-only"}>
          {t("engines.statesTitle")}
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
    <aside
      aria-label={t("engines.asideLabel")}
      className="flex min-w-0 flex-col gap-4"
    >
      <DuetCard className="p-5">
        <h2 className="type-body font-semibold">
          {workspace && <DuetIcon name="key" size={19} />}{" "}
          {t("engines.keys.title")}
        </h2>
        <p className="type-label mt-2 text-duet-ink-2">
          {t("engines.keys.text")}
        </p>
        <p className="type-label mt-2 text-duet-ink-2">
          {t("engines.keys.notBuilt")}
        </p>
      </DuetCard>
      <DuetCard className="p-5">
        <h2 className="type-body font-semibold">
          {workspace && <DuetIcon name="activity" size={19} />}{" "}
          {t("engines.spending.title")}
        </h2>
        <p className="type-label mt-2 text-duet-ink-2">
          {t("engines.spending.text")}
        </p>
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
        label={t("engines.sectionsLabel")}
        views={[
          {
            id: "overview",
            label: t("engines.tab.overview"),
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
                  label: t("engines.tab.providers"),
                  icon: "plug" as const,
                  content: providers,
                },
              ]
            : []),
          ...(reading.members?.length
            ? [
                {
                  id: "members",
                  label: t("engines.tab.members"),
                  icon: "bolt" as const,
                  content: members,
                },
              ]
            : []),
          {
            id: "usage",
            label: t("engines.tab.usage"),
            icon: "activity",
            content: usage,
          },
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
