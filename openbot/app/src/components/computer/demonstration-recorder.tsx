import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState } from "react";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import { SkillFields } from "@/components/skills/skill-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { channelListQueryOptions } from "@/lib/channels/queries";
import {
  type Demonstration,
  type DemonstrationDraft,
  type DemonstrationRoutine,
  deleteDemonstration,
  demonstrationKeys,
  demonstrationsQueryOptions,
  draftDemonstration,
  publishDemonstration,
  scheduleDemonstration,
  startDemonstration,
  stopDemonstration,
} from "@/lib/demonstrations";
import {
  grantPlugin,
  invalidatePlugins,
  saveSkillMutationOptions,
} from "@/lib/plugins/mutations";
import { routineKeys } from "@/lib/routines/queries";
import { queryClient } from "@/query-client";

/** Seconds left before the server stops a recording, ticking once a second. */
function useSecondsLeft(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const SCHEDULES: readonly { label: MessageId; cron: string }[] = [
  { label: "computer.demo.everyWeekday", cron: "0 9 * * 1-5" },
  { label: "computer.demo.everyDay", cron: "0 9 * * *" },
  { label: "computer.demo.everyMonday", cron: "0 9 * * 1" },
  { label: "computer.demo.everyHour", cron: "0 * * * *" },
];

/** Save the demonstrated path as a routine that reruns the published skill. */
function ScheduleSkill({
  recording,
  onDone,
}: {
  recording: Demonstration;
  onDone: () => void;
}) {
  const { t, date } = useAppLanguage();
  const id = useId();
  const [cron, setCron] = useState<string>(SCHEDULES[0]?.cron ?? "");
  const [custom, setCustom] = useState("");
  const [channelId, setChannelId] = useState("");
  const [inputs, setInputs] = useState("");
  const [scheduled, setScheduled] = useState<DemonstrationRoutine | null>(null);
  const channels = useInfiniteQuery(channelListQueryOptions());
  const botChannels = (channels.data ?? []).filter(
    (channel) => channel.active && channel.agentIds.includes(recording.botId),
  );
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const schedule = useMutation({
    mutationFn: () =>
      scheduleDemonstration(recording.id, {
        cron: cron === "custom" ? custom : cron,
        timezone,
        ...(channelId ? { channelId } : {}),
        ...(inputs.trim() ? { inputs } : {}),
      }),
    onSuccess: async (routine) => {
      setScheduled(routine);
      await queryClient.invalidateQueries({ queryKey: routineKeys.all });
    },
  });
  if (scheduled)
    return (
      <p className="w-full text-xs">
        {t("computer.demo.scheduled", {
          slug: recording.skillSlug ?? "",
          when: date(new Date(scheduled.nextRunAt), {
            dateStyle: "short",
            timeStyle: "medium",
          }),
        })}{" "}
        <Link to="/routines" className="underline">
          {t("computer.demo.seeRoutines")}
        </Link>{" "}
        <button type="button" className="underline" onClick={onDone}>
          {t("routines.card.close")}
        </button>
      </p>
    );
  return (
    <form
      className="grid w-full gap-2 rounded-md border p-3 text-xs"
      onSubmit={(event) => {
        event.preventDefault();
        schedule.mutate();
      }}
    >
      <label htmlFor={`${id}-when`} className="grid gap-1">
        {t("computer.demo.when", { timezone })}
        <select
          id={`${id}-when`}
          className="h-8 rounded-md border bg-background px-2"
          value={cron}
          onChange={(event) => setCron(event.target.value)}
        >
          {SCHEDULES.map((option) => (
            <option key={option.cron} value={option.cron}>
              {t(option.label)}
            </option>
          ))}
          <option value="custom">{t("computer.demo.custom")}</option>
        </select>
      </label>
      {cron === "custom" && (
        <label htmlFor={`${id}-cron`} className="grid gap-1">
          {t("computer.demo.cron")}
          <Input
            id={`${id}-cron`}
            required
            maxLength={120}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder="30 8 * * 1-5"
          />
        </label>
      )}
      <label htmlFor={`${id}-channel`} className="grid gap-1">
        {t("computer.demo.reportIn")}
        <select
          id={`${id}-channel`}
          className="h-8 rounded-md border bg-background px-2"
          value={channelId}
          onChange={(event) => setChannelId(event.target.value)}
        >
          <option value="">{t("computer.demo.onlyConversation")}</option>
          {botChannels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-inputs`} className="grid gap-1">
        {t("computer.demo.inputs")}
        <Input
          id={`${id}-inputs`}
          maxLength={1000}
          value={inputs}
          onChange={(event) => setInputs(event.target.value)}
          placeholder="input_1: last month's invoices"
        />
      </label>
      {schedule.error && (
        <p role="alert" className="text-destructive">
          {schedule.error.message}
        </p>
      )}
      <div className="flex gap-2">
        {/* Base UI's Button defaults to type="button", which never submits the form. */}
        <Button
          size="sm"
          type="submit"
          disabled={schedule.isPending || (cron === "custom" && !custom.trim())}
        >
          {t("responsibilities.source.schedule")}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          {t("settings.cancel")}
        </Button>
      </div>
    </form>
  );
}
export function DemonstrationRecorder({
  botId,
  driving,
  onRecordingChange,
}: {
  botId: string;
  driving: boolean;
  onRecordingChange: () => void;
}) {
  const { t } = useAppLanguage();
  const id = useId();
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState<DemonstrationDraft | null>(null);
  const [savedSlug, setSavedSlug] = useState("");
  const [saveError, setSaveError] = useState<Error | null>(null);
  const recordings = useQuery(demonstrationsQueryOptions(botId));
  const active = recordings.data?.find(
    (recording) => recording.status === "recording",
  );
  const [scheduling, setScheduling] = useState("");
  const secondsLeft = useSecondsLeft(active?.expiresAt);
  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: demonstrationKeys.bot(botId),
    });
  };
  /*
   * The server stops a recording at ten minutes. When the countdown runs out, or a poll shows the
   * active recording gone, re-read and reconnect the stream so it stops carrying the recording id.
   */
  const wasActive = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (wasActive.current && !active) onRecordingChange();
    wasActive.current = active?.id;
  }, [active, onRecordingChange]);
  useEffect(() => {
    if (secondsLeft === 0)
      void queryClient.invalidateQueries({
        queryKey: demonstrationKeys.bot(botId),
      });
  }, [secondsLeft, botId]);
  const start = useMutation({
    mutationFn: () => startDemonstration(botId, title),
    onSuccess: async () => {
      await refresh();
      onRecordingChange();
    },
  });
  const stop = useMutation({
    mutationFn: (recordingId: string) => stopDemonstration(recordingId),
    onSuccess: async () => {
      await refresh();
      onRecordingChange();
    },
  });
  const generate = useMutation({
    mutationFn: draftDemonstration,
    onSuccess: async (value) => {
      setDraft(value);
      setSavedSlug("");
      setSaveError(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: deleteDemonstration,
    onSuccess: async () => {
      await refresh();
      onRecordingChange();
    },
  });
  const save = useMutation(saveSkillMutationOptions(queryClient));
  return (
    <section className="mt-4 grid gap-3 rounded-lg border p-4 text-left">
      <div>
        <h3 className="font-semibold">{t("computer.demo.title")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("computer.demo.intro")}
        </p>
      </div>
      {active ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">
            {t("computer.demo.recording", {
              title: active.title,
              count: active.actions.length,
            })}
          </span>
          {secondsLeft !== null && (
            <span
              aria-live={secondsLeft <= 60 ? "polite" : "off"}
              className={
                secondsLeft <= 60
                  ? "text-sm font-medium text-destructive tabular-nums"
                  : "text-sm text-muted-foreground tabular-nums"
              }
            >
              {secondsLeft > 0
                ? t("computer.demo.left", { time: clock(secondsLeft) })
                : t("computer.demo.limitReached")}
            </span>
          )}
          <Button
            size="sm"
            disabled={stop.isPending}
            onClick={() => stop.mutate(active.id)}
          >
            {t("computer.demo.stop")}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            start.mutate();
          }}
        >
          <label htmlFor={id} className="grid grow gap-1 text-xs">
            {t("computer.demo.name")}
            <Input
              id={id}
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("computer.demo.namePlaceholder")}
            />
          </label>
          {/* Base UI's Button defaults to type="button", which never submits the form. */}
          <Button
            size="sm"
            type="submit"
            disabled={!driving || start.isPending || !title.trim()}
          >
            {t("computer.demo.record")}
          </Button>
          {!driving && (
            <p className="w-full text-xs text-muted-foreground">
              {t("computer.demo.takeControl")}
            </p>
          )}
        </form>
      )}
      {(start.error ||
        stop.error ||
        generate.error ||
        remove.error ||
        recordings.error) && (
        <p role="alert" className="text-sm text-destructive">
          {start.error?.message ||
            stop.error?.message ||
            generate.error?.message ||
            remove.error?.message ||
            recordings.error?.message}
        </p>
      )}
      {recordings.data
        ?.filter((recording) => recording.status !== "recording")
        .slice(0, 5)
        .map((recording) => (
          <div
            key={recording.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
          >
            <span>
              {t("computer.demo.entry", {
                title: recording.title,
                count: recording.actions.length,
              })}
              {recording.reachedTimeLimit && (
                <span className="text-xs text-muted-foreground">
                  {" "}
                  · {t("computer.demo.stoppedAtLimit")}
                </span>
              )}
            </span>
            <div className="flex gap-2">
              {recording.status === "published" && recording.skillSlug ? (
                <>
                  <Link
                    to="/capabilities/skills"
                    search={{ edit: recording.skillSlug }}
                    className="text-xs underline"
                  >
                    {t("computer.demo.edit", {
                      slug: recording.skillSlug ?? "",
                    })}
                  </Link>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setScheduling((current) =>
                        current === recording.id ? "" : recording.id,
                      )
                    }
                  >
                    {t("computer.demo.runSchedule")}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recording.actions.length || generate.isPending}
                  onClick={() => generate.mutate(recording.id)}
                >
                  {t("computer.demo.reviewDraft")}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(recording.id)}
              >
                {t("bot.manage.delete")}
              </Button>
            </div>
            {scheduling === recording.id && (
              <ScheduleSkill
                recording={recording}
                onDone={() => setScheduling("")}
              />
            )}
          </div>
        ))}
      {draft && (
        <div className="grid gap-3 border-t pt-4">
          <h3 className="font-semibold">{t("computer.demo.reviewTitle")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("computer.demo.reviewHelp")}
          </p>
          <SkillFields
            key={draft.sourceRecordingId}
            defaultValues={draft}
            submitLabel={t("computer.demo.saveUse")}
            error={saveError || save.error}
            onCancel={() => setDraft(null)}
            onSubmit={async (values) => {
              setSaveError(null);
              try {
                await save.mutateAsync(values);
                await grantPlugin({
                  kind: "skill",
                  ref: values.slug,
                  agentId: botId,
                });
                await publishDemonstration(
                  draft.sourceRecordingId,
                  values.slug,
                );
                await invalidatePlugins(queryClient);
                await refresh();
                setSavedSlug(values.slug);
                setDraft(null);
              } catch (error) {
                setSaveError(
                  error instanceof Error
                    ? error
                    : new Error(t("computer.demo.couldntSave")),
                );
                await refresh();
              }
            }}
          />
        </div>
      )}
      {savedSlug && (
        <p className="text-sm">
          {t("computer.demo.ready", { slug: savedSlug })}
        </p>
      )}
    </section>
  );
}
