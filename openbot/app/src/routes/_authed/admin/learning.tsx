import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { PageSection, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { englishT, type T, useAppLanguage } from "@/freeduet/i18n/provider";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { appConfig } from "@/lib/generated/application-config";
import {
  createLearningContainer,
  learningAutomaticQueryOptions,
  learningDeliveryQueryOptions,
  learningKeys,
  learningOverviewQueryOptions,
  learningSettingsQueryOptions,
  saveLearningSettings,
} from "@/lib/learning/queries";
import type {
  LearningAutoAssignState,
  LearningSettings,
  LearningTarget,
} from "@openbot/shared/learning";

export const Route = createFileRoute("/_authed/admin/learning")({
  component: LearningPage,
});
const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

/** What automatic assignment found, in words, or nothing when there is nothing to say. */
function automaticMessage(
  automatic: LearningAutoAssignState | null | undefined,
  settings: LearningSettings,
  t: T = englishT,
): string | undefined {
  if (!automatic) return undefined;
  if (
    automatic.state === "assigned" &&
    settings.defaultTarget?.containerId === automatic.containerId
  )
    return t("admin.learning.auto.assigned", {
      container: automatic.containerId,
      product: appConfig.brand.productName,
    });
  if (automatic.state === "absent")
    return t("admin.learning.auto.absent", {
      container: automatic.containerId,
    });
  if (automatic.state === "not_entitled")
    return t("admin.learning.auto.notEntitled");
  if (automatic.state === "unavailable")
    return t("admin.learning.auto.unavailable", {
      product: appConfig.brand.productName,
    });
  return undefined;
}

function TargetFields({
  target,
  onChange,
  label,
}: {
  target: LearningTarget | null;
  onChange: (target: LearningTarget | null) => void;
  label: string;
}) {
  const fieldId = useId();
  const { t } = useAppLanguage();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm" htmlFor={`${fieldId}-container`}>
        {t("admin.learning.target.container", { label })}
        <Input
          id={`${fieldId}-container`}
          aria-label={t("admin.learning.target.container", { label })}
          value={target?.containerId ?? ""}
          maxLength={64}
          placeholder="support-learning"
          onChange={(event) =>
            onChange(
              event.target.value
                ? { ...target, containerId: event.target.value }
                : null,
            )
          }
        />
      </label>
      <label className="grid gap-2 text-sm" htmlFor={`${fieldId}-revision`}>
        {t("admin.learning.target.revision")}
        <Input
          id={`${fieldId}-revision`}
          aria-label={t("admin.learning.target.revisionAria", { label })}
          value={target?.revision ?? ""}
          disabled={!target}
          placeholder={t("admin.learning.target.latest")}
          maxLength={256}
          onChange={(event) => {
            if (target)
              onChange({
                containerId: target.containerId,
                ...(event.target.value ? { revision: event.target.value } : {}),
              });
          }}
        />
      </label>
    </div>
  );
}

/**
 * The missing container, and how it gets made: a button when this deployment holds a credential that
 * can create it, and always the exact steps for an operator, since the runtime key cannot.
 */
function ContainerSetup({
  automatic,
}: {
  automatic: Extract<LearningAutoAssignState, { state: "absent" }>;
}) {
  const { t } = useAppLanguage();
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: createLearningContainer,
    onSuccess: async (next) => {
      queryClient.setQueryData(learningKeys.automatic, next);
      await queryClient.invalidateQueries({ queryKey: learningKeys.all });
    },
  });
  return (
    <div className="grid gap-2 rounded-md border p-3 text-sm">
      {automatic.canCreate && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending
              ? t("admin.learning.create.busy")
              : t("admin.learning.create.button", {
                  container: automatic.containerId,
                })}
          </Button>
          <span className="text-muted-foreground">
            {t("admin.learning.create.note")}
          </span>
        </div>
      )}
      {(create.error || automatic.createError) && (
        <p role="alert" className="text-destructive">
          {create.error?.message ?? automatic.createError}
        </p>
      )}
      {automatic.instructions && (
        <p>
          <span className="font-medium">{t("admin.learning.create.how")}</span>
          {automatic.instructions}
        </p>
      )}
    </div>
  );
}

export function LearningPage() {
  const { t, date } = useAppLanguage();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(learningSettingsQueryOptions());
  const automatic = useQuery(learningAutomaticQueryOptions());
  const agents = useQuery(agentListQueryOptions());
  const hiddenAgents = useQuery(agentListQueryOptions(true));
  const roster = [...(agents.data ?? []), ...(hiddenAgents.data ?? [])];
  const [draft, setDraft] = useState<LearningSettings | null>(null);
  const [selected, setSelected] = useState("");
  const [saved, setSaved] = useState(false);
  const overview = useQuery(
    learningOverviewQueryOptions(selected || undefined),
  );
  const delivery = useQuery(learningDeliveryQueryOptions(selected));
  const settings = draft ?? settingsQuery.data;
  // About what is saved, so it steps aside while an edit is in progress.
  const automaticNote =
    settingsQuery.data && !draft
      ? automaticMessage(automatic.data, settingsQuery.data, t)
      : undefined;
  const save = useMutation({
    mutationFn: saveLearningSettings,
    onSuccess: async (next) => {
      queryClient.setQueryData(learningKeys.settings, next);
      setDraft(null);
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: learningKeys.all });
    },
  });
  function change(next: LearningSettings) {
    setDraft(next);
    setSaved(false);
    save.reset();
  }
  const botIds = [
    ...new Set([
      ...roster.map((agent) => agent.id),
      ...Object.keys(settings?.agents ?? {}),
    ]),
  ];
  const nameFor = (id: string) =>
    roster.find((agent) => agent.id === id)?.name ?? id;
  const snapshot = overview.data;

  return (
    <PageShell
      title={t("admin.nav.learning")}
      description={t("admin.learning.description")}
    >
      <PageSection
        title={t("admin.learning.part.title")}
        description={t("admin.learning.part.description", {
          product: appConfig.brand.productName,
        })}
      >
        {settingsQuery.isPending && (
          <p role="status">{t("admin.learning.part.loading")}</p>
        )}
        {settingsQuery.error && (
          <p role="alert" className="text-destructive">
            {settingsQuery.error.message}
          </p>
        )}
        {settings && (
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(settings);
            }}
          >
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) =>
                  change({ ...settings, enabled: event.target.checked })
                }
              />
              {t("admin.learning.part.turnOn")}
            </label>
            <TargetFields
              label={t("admin.learning.part.default")}
              target={settings.defaultTarget}
              onChange={(defaultTarget) =>
                change({ ...settings, defaultTarget })
              }
            />
            {automaticNote && (
              <p role="status" className="text-sm">
                {automaticNote}
              </p>
            )}
            {!draft && automatic.data?.state === "absent" && (
              <ContainerSetup automatic={automatic.data} />
            )}
            <p className="text-muted-foreground text-sm">
              {t("admin.learning.part.hint")}
            </p>
            <fieldset className="grid gap-4">
              <legend className="mb-3 font-medium">
                {t("admin.learning.part.perBot")}
              </legend>
              {(agents.error || hiddenAgents.error) && (
                <p role="alert" className="text-destructive">
                  {t("admin.learning.part.botListError")}
                </p>
              )}
              {botIds.map((id) => {
                const override = settings.agents[id];
                const mode = !Object.hasOwn(settings.agents, id)
                  ? "inherit"
                  : override === null
                    ? "exclude"
                    : "container";
                return (
                  <div key={id} className="grid gap-3 rounded-lg border p-4">
                    <label className="grid gap-2 text-sm font-medium">
                      {nameFor(id)}
                      <select
                        className={selectClass}
                        aria-label={t("admin.learning.part.botAria", {
                          name: nameFor(id),
                        })}
                        value={mode}
                        onChange={(event) => {
                          const mappings = { ...settings.agents };
                          if (event.target.value === "inherit")
                            delete mappings[id];
                          else
                            mappings[id] =
                              event.target.value === "exclude"
                                ? null
                                : {
                                    containerId:
                                      settings.defaultTarget?.containerId ?? "",
                                  };
                          change({ ...settings, agents: mappings });
                        }}
                      >
                        <option value="inherit">
                          {t("admin.learning.part.inherit")}
                        </option>
                        <option value="exclude">
                          {t("admin.learning.part.exclude")}
                        </option>
                        <option value="container">
                          {t("admin.learning.part.container")}
                        </option>
                      </select>
                    </label>
                    {mode === "container" && (
                      <TargetFields
                        label={nameFor(id)}
                        target={override ?? null}
                        onChange={(target) =>
                          change({
                            ...settings,
                            agents: {
                              ...settings.agents,
                              [id]: target ?? { containerId: "" },
                            },
                          })
                        }
                      />
                    )}
                  </div>
                );
              })}
            </fieldset>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending
                  ? t("admin.learning.part.saving")
                  : t("admin.learning.part.save")}
              </Button>
              {saved && (
                <p role="status" className="text-sm">
                  {t("admin.learning.part.saved")}
                </p>
              )}
            </div>
            {save.error && (
              <p role="alert" className="text-destructive">
                {save.error.message}
              </p>
            )}
          </form>
        )}
      </PageSection>
      <PageSection
        title={t("admin.learning.rev.title")}
        description={t("admin.learning.rev.description")}
      >
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            {t("admin.learning.rev.showFor")}
            <select
              className={selectClass}
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              <option value="">{t("admin.learning.rev.default")}</option>
              {botIds.map((id) => (
                <option key={id} value={id}>
                  {nameFor(id)}
                </option>
              ))}
            </select>
          </label>
          {overview.isPending && (
            <p role="status">{t("admin.learning.rev.checking")}</p>
          )}
          {overview.error && (
            <p role="alert" className="text-destructive">
              {overview.error.message}
            </p>
          )}
          {snapshot && (
            <>
              <p className="text-sm">
                {snapshot.configuration === "configured"
                  ? `${snapshot.container?.name} (${snapshot.container?.id})`
                  : snapshot.configuration === "invalid"
                    ? t("admin.learning.rev.invalid")
                    : snapshot.configuration === "selection_required"
                      ? t("admin.learning.rev.selection")
                      : t("admin.learning.rev.none")}
              </p>
              <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">
                    {t("admin.learning.rev.threads")}
                  </dt>
                  <dd className="font-semibold text-xl">
                    {snapshot.pendingThreadCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("admin.learning.rev.candidates")}
                  </dt>
                  <dd className="font-semibold text-xl">
                    {snapshot.pendingCandidateCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("admin.learning.rev.published")}
                  </dt>
                  <dd className="font-semibold text-xl">
                    {snapshot.publishedSkillCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t("admin.learning.rev.insights")}
                  </dt>
                  <dd className="font-semibold text-xl">
                    {snapshot.insightCount}
                  </dd>
                </div>
              </dl>
              <p className="text-sm">
                {snapshot.hasActiveRun
                  ? t("admin.learning.rev.running")
                  : snapshot.latestRunStatus
                    ? t("admin.learning.rev.latest", {
                        status: snapshot.latestRunStatus,
                      })
                    : t("admin.learning.rev.noRun")}
              </p>
              <div className="flex flex-wrap gap-4 text-sm underline">
                <a
                  href={snapshot.links.learning}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("admin.learning.rev.manage")}
                </a>
                {snapshot.links.candidates && (
                  <a
                    href={snapshot.links.candidates}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("admin.learning.rev.reviewCandidates")}
                  </a>
                )}
                {snapshot.links.runs && (
                  <a
                    href={snapshot.links.runs}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("admin.learning.rev.viewRuns")}
                  </a>
                )}
              </div>
            </>
          )}
          {selected && (
            <div className="grid gap-2 rounded-lg border p-4 text-sm">
              <h3 className="font-medium">{t("admin.learning.del.title")}</h3>
              {delivery.isPending ? (
                <p>{t("admin.learning.del.checking")}</p>
              ) : delivery.error ? (
                <p role="alert">{delivery.error.message}</p>
              ) : (
                delivery.data && (
                  <>
                    <p>
                      {!delivery.data.configured
                        ? t("admin.learning.del.off")
                        : !delivery.data.initialized
                          ? t("admin.learning.del.waiting")
                          : delivery.data.stale
                            ? t("admin.learning.del.stale")
                            : t("admin.learning.del.ok")}
                    </p>
                    {delivery.data.revision && (
                      <p>
                        {t("admin.learning.del.revision", {
                          revision: delivery.data.revision,
                        })}
                      </p>
                    )}
                    {delivery.data.lastCheckedAt && (
                      <p>
                        {t("admin.learning.del.lastChecked")}{" "}
                        {date(new Date(delivery.data.lastCheckedAt), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </p>
                    )}
                    {delivery.data.error && (
                      <p role="alert">{delivery.data.error.message}</p>
                    )}
                  </>
                )
              )}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={overview.isFetching || delivery.isFetching}
            onClick={() => {
              void overview.refetch();
              if (selected) void delivery.refetch();
            }}
          >
            {t("admin.learning.rev.refresh")}
          </Button>
          <p className="text-muted-foreground text-sm">
            {t("admin.learning.rev.footer", {
              product: appConfig.brand.productName,
            })}
          </p>
        </div>
      </PageSection>
    </PageShell>
  );
}
