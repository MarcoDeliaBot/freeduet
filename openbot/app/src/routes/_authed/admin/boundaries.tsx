import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageSection, PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isComposing } from "@/lib/composing";
import { saveActionPolicyMutationOptions } from "@/lib/computers/mutations";
import {
  type ActionPolicy,
  actionPolicyQueryOptions,
  type DryRunReport,
  dryRunActionPolicy,
  type PolicyMode,
} from "@/lib/computers/queries";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { queryClient } from "@/query-client";

/**
 * CEL computer-action boundary editor. Rules are shown as the gateway evaluates them, and denied
 * actions are recorded in Audit with the matching rule.
 */

/**
 * Presets are concrete CEL rules, not a separate policy language.
 */
const PRESETS: { label: MessageId; rule: string; cost: MessageId }[] = [
  {
    label: "admin.boundaries.preset.form",
    // `key` is guarded by tool name so the clause short-circuits before it on actions that have no
    // keypress in them. Both tools that can press Enter are named: `computer_type` takes a `submit`
    // flag that presses it once the text is in, and a rule naming only `computer_key` left that door
    // open.
    rule: '(intent == "activate" && contains(element.name, "submit")) || ((tool.name == "computer_key" || tool.name == "computer_type") && key == "Enter")',
    cost: "admin.boundaries.preset.formCost",
  },
  {
    label: "admin.boundaries.preset.password",
    rule: 'intent == "type" && contains(element.name, "password")',
    cost: "admin.boundaries.preset.passwordCost",
  },
  {
    label: "admin.boundaries.preset.social",
    rule: 'intent == "navigate" && (contains(page.host, "facebook.com") || contains(page.host, "x.com"))',
    cost: "admin.boundaries.preset.socialCost",
  },
];

export const Route = createFileRoute("/_authed/admin/boundaries")({
  component: BoundariesPage,
});

function BoundariesPage() {
  const { t } = useAppLanguage();
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState("");

  const [tested, setTested] = useState<{
    rule: string;
    report: DryRunReport;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const stored = useQuery(actionPolicyQueryOptions());
  const savePolicy = useMutation(saveActionPolicyMutationOptions(queryClient));

  /*
   * The saved policy wins while a save is in flight and after it lands: the server normalises what
   * it stores, so what came back is the policy, not what was sent.
   */
  const policy = savePolicy.data ?? stored.data ?? null;
  const saving = savePolicy.isPending;

  const save = (next: ActionPolicy) => {
    setSaved(false);
    setProblem(null);
    savePolicy.mutate(next, {
      onError: (thrown: Error) => setProblem(thrown.message),
      onSuccess: () => setSaved(true),
    });
  };

  /*
   * A read that failed says so. This screen used to set "The boundary could not be read." itself;
   * since the read became a query, that sentence (or the server's own) is the query's error, and
   * without this the page sat on its title with nothing under it for as long as it was open.
   */
  const unreadable = problem ?? stored.error?.message ?? null;
  if (unreadable && !policy) {
    return (
      <PageShell title={t("admin.boundaries.title")}>
        <p className="mt-4 text-destructive text-sm" role="alert">
          {unreadable}
        </p>
      </PageShell>
    );
  }

  /* Nothing until the policy is known: a rule list that guesses is worse than a blank. */
  if (!policy) {
    return <PageShell title={t("admin.boundaries.title")}>{null}</PageShell>;
  }

  const addRule = (rule: string) => {
    const trimmed = rule.trim();
    if (!trimmed || policy.deny.includes(trimmed)) return;
    void save({ ...policy, deny: [...policy.deny, trimmed] });
    setDraft("");
    setTested(null);
  };

  /*
   * The rule as it would be in force — the current policy plus this draft — replayed over recent
   * recorded actions. Nothing is saved and nothing is decided; the reply names the actions the
   * addition would have decided differently, so the rule's real reach is known before it starts
   * refusing anybody.
   */
  const testRule = async (rule: string) => {
    const trimmed = rule.trim();
    if (!trimmed) return;
    setProblem(null);
    setTesting(true);
    try {
      const report = await dryRunActionPolicy({
        ...policy,
        deny: [...policy.deny, trimmed],
      });
      setTested({ rule: trimmed, report });
    } catch (thrown) {
      setProblem((thrown as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <PageShell
      description={
        <>
          {t("admin.boundaries.descLead")}{" "}
          <Link className="underline" to="/admin/audit">
            {t("admin.boundaries.descAudit")}
          </Link>{" "}
          {t("admin.boundaries.descTail")}
        </>
      }
      title={t("admin.boundaries.title")}
    >
      <PageSection
        description={t("admin.boundaries.whenDesc")}
        title={t("admin.boundaries.whenTitle")}
      >
        <div className="mt-2 flex gap-2">
          {(["enforce", "dry-run"] as PolicyMode[]).map((mode) => (
            <Button
              key={mode}
              aria-pressed={policy.mode === mode}
              className={policy.mode === mode ? "bg-foreground/5" : undefined}
              disabled={saving}
              onClick={() => void save({ ...policy, mode })}
              size="sm"
              variant="outline"
            >
              {mode === "enforce"
                ? t("admin.boundaries.modeEnforce")
                : t("admin.boundaries.modeRecord")}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {policy.mode === "enforce"
            ? t("admin.boundaries.modeEnforceNote")
            : t("admin.boundaries.modeRecordNote")}
        </p>
      </PageSection>

      <PageSection
        description={
          <>
            {t("admin.boundaries.neverLead")} <code>tool.name</code>,{" "}
            <code>intent</code>, <code>bot.id</code>, <code>actor.id</code>,{" "}
            <code>page.url</code>, <code>page.host</code>
            {t("admin.boundaries.neverMid1")} <code>key</code>{" "}
            {t("admin.boundaries.neverMid2")} <code>command</code>{" "}
            {t("admin.boundaries.neverMid3")} <code>mcp.server</code>,{" "}
            <code>mcp.tool</code> {t("admin.boundaries.and")}{" "}
            <code>mcp.effect</code> {t("admin.boundaries.neverMid4")}{" "}
            <code>initiator.kind</code> {t("admin.boundaries.neverMid5")}{" "}
            <code>person</code>, <code>routine</code> {t("admin.boundaries.or")}{" "}
            <code>handoff</code>. {t("admin.boundaries.neverTail")}{" "}
            <code>actor.id</code> {t("admin.boundaries.neverTail2")}
          </>
        }
        title={t("admin.boundaries.neverTitle")}
      >
        {policy.deny.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("admin.boundaries.noRules")}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-md border border-border">
            {policy.deny.map((rule) => (
              <li
                className="flex items-center justify-between gap-4 px-3 py-2"
                key={rule}
              >
                <code className="min-w-0 break-all font-mono text-xs">
                  {rule}
                </code>
                <Button
                  disabled={saving}
                  onClick={() =>
                    void save({
                      ...policy,
                      deny: policy.deny.filter((one) => one !== rule),
                    })
                  }
                  size="sm"
                  variant="ghost"
                >
                  {t("admin.boundaries.remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex gap-2">
          <Input
            aria-label={t("admin.boundaries.ruleLabel")}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 font-mono text-xs"
            onChange={(event) => {
              setDraft(event.target.value);
              setSaved(false);
              setTested(null);
            }}
            onKeyDown={(event) => {
              // Not the Enter that confirms a composed character, which would put a half-typed
              // rule into the policy in force.
              if (event.key === "Enter" && !isComposing(event)) addRule(draft);
            }}
            placeholder='tool.name == "computer_click" && contains(element.name, "submit")'
            value={draft}
          />
          <Button
            disabled={testing || draft.trim().length === 0}
            onClick={() => void testRule(draft)}
            size="sm"
            variant="outline"
          >
            {testing
              ? t("admin.boundaries.testing")
              : t("admin.boundaries.testFirst")}
          </Button>
          <Button
            disabled={saving || draft.trim().length === 0}
            onClick={() => addRule(draft)}
            size="sm"
          >
            {t("admin.boundaries.addRule")}
          </Button>
        </div>

        {tested ? <DryRunResult report={tested.report} /> : null}

        <ul className="mt-3 space-y-2">
          {PRESETS.map((preset) => (
            <li className="flex items-start gap-3" key={preset.rule}>
              <Button
                className="shrink-0"
                disabled={saving || policy.deny.includes(preset.rule)}
                onClick={() => addRule(preset.rule)}
                size="sm"
                variant="outline"
              >
                {t(preset.label)}
              </Button>
              <span className="pt-1 text-xs text-muted-foreground">
                {t(preset.cost)}
              </span>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection
        description={t("admin.boundaries.otherwiseDesc")}
        title={t("admin.boundaries.otherwiseTitle")}
      >
        <ul className="mt-2 space-y-1">
          {policy.allow.map((rule) => (
            <li className="font-mono text-xs text-muted-foreground" key={rule}>
              {rule === "true" ? t("admin.boundaries.allowAll") : rule}
            </li>
          ))}
        </ul>
      </PageSection>

      <p className="mt-8 text-muted-foreground text-xs">
        {problem ? (
          <span className="text-destructive" role="alert">
            {problem}
          </span>
        ) : saved ? (
          t("admin.boundaries.saved")
        ) : (
          t("admin.boundaries.footer")
        )}
      </p>
    </PageShell>
  );
}

/**
 * What the tested rule would have done to actions already on the trail.
 *
 * Says the number over everything scanned first, because the list below it is capped and a reader
 * who stops at the rows should not believe the rows are the whole answer.
 */
function DryRunResult({ report }: { report: DryRunReport }) {
  const { t, date } = useAppLanguage();
  if (report.scanned === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {t("admin.boundaries.dry.none")}
      </p>
    );
  }

  return (
    <div className="mt-2" role="status">
      <p className="text-xs text-muted-foreground">
        {report.wouldRefuse === 0
          ? t("admin.boundaries.dry.zero", { scanned: report.scanned })
          : t("admin.boundaries.dry.some", {
              scanned: report.scanned,
              refused: report.wouldRefuse,
            })}
      </p>
      {report.changes.length > 0 ? (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {report.changes.map((change) => (
            <li className="px-3 py-2" key={change.id}>
              <p className="text-xs">
                <span className="font-medium">
                  {change.would === "refused"
                    ? t("admin.boundaries.dry.wouldRefuse")
                    : t("admin.boundaries.dry.wouldAllow")}
                </span>{" "}
                <code className="font-mono">{change.action}</code>
                {change.element?.name
                  ? ` ${t("admin.boundaries.dry.on", { name: change.element.name })}`
                  : null}
                {change.command ? (
                  <>
                    {" "}
                    {t("admin.boundaries.dry.running")}{" "}
                    <code className="font-mono">{change.command}</code>
                  </>
                ) : null}
                {change.file
                  ? ` ${t("admin.boundaries.dry.touching", { file: change.file })}`
                  : null}
              </p>
              <p className="mt-0.5 text-muted-foreground text-xs">
                {change.bot}
                {change.page ? <> · {change.page}</> : null} ·{" "}
                {date(new Date(change.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {report.wouldRefuse > report.changes.length ? (
        <p className="mt-1 text-muted-foreground text-xs">
          {t("admin.boundaries.dry.first", { shown: report.changes.length })}
        </p>
      ) : null}
    </div>
  );
}
