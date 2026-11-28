import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DuetIcon } from "@/components/duet/icons";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { englishT, type T, useAppLanguage } from "@/freeduet/i18n/provider";
import {
  changeMailRuleMutationOptions,
  type MailRule,
  mailRulesQueryOptions,
} from "@/lib/plugins/mail-rules";

function ruleActivity(
  rule: MailRule,
  t: T = englishT,
  locale?: string,
): string {
  if (!rule.lastRunAt) return t("connections.mail.neverRun");
  const when = new Date(rule.lastRunAt).toLocaleString(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const n = rule.lastMatched;
  return t("connections.mail.lastRun", {
    when,
    count: n,
    total: rule.totalApplied,
  });
}

export function mailRuleStatus(
  rule: MailRule,
  t: T = englishT,
  locale?: string,
): string {
  return rule.enabled
    ? t("connections.mail.on", { activity: ruleActivity(rule, t, locale) })
    : t("connections.mail.off");
}

const PAGE_SIZE = 6;

export function MailRulesSection({ browse = false }: { browse?: boolean }) {
  const { t, language } = useAppLanguage();
  const queryClient = useQueryClient();
  const rules = useQuery(mailRulesQueryOptions());
  const change = useMutation(changeMailRuleMutationOptions(queryClient));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  if (!rules.data?.length) {
    return browse && rules.isError ? (
      <p className="mt-4 text-destructive" role="alert">
        {rules.error.message}
      </p>
    ) : null;
  }
  const matching = browse
    ? rules.data.filter(
        (rule) =>
          (status === "all" || rule.enabled === (status === "on")) &&
          rule.inWords
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase()),
      )
    : rules.data;
  // A refresh or a deletion can remove the last item on the current page.
  const last = Math.max(0, Math.ceil(matching.length / PAGE_SIZE) - 1);
  const current = Math.min(page, last);
  const start = current * PAGE_SIZE;
  const visible = browse ? matching.slice(start, start + PAGE_SIZE) : matching;
  const actions = (rule: MailRule) => (
    <>
      <Button
        disabled={change.isPending}
        onClick={() =>
          change.mutate({
            id: rule.id,
            change: rule.enabled ? "disable" : "enable",
          })
        }
        size="sm"
        variant="outline"
      >
        {rule.enabled
          ? t("connections.mail.switchOff")
          : t("connections.mail.switchOn")}
      </Button>
      <Button
        disabled={change.isPending}
        onClick={() => change.mutate({ id: rule.id, change: "delete" })}
        size="sm"
        variant={browse ? "ghost" : "outline"}
      >
        {t("connections.mail.delete")}
      </Button>
    </>
  );
  const error = (rule: MailRule) =>
    rule.lastError ? (
      <p className="text-destructive text-sm" role="alert">
        {t("connections.mail.lastProblem", { error: rule.lastError })}
      </p>
    ) : null;
  return (
    <PageSection
      className={browse ? "fd-rules" : undefined}
      description={t("connections.mail.description")}
      title={t("connections.mail.title")}
    >
      {browse ? (
        <>
          <div className="fd-rules-tools">
            <label className="fd-search">
              <DuetIcon name="search" size={18} />
              <input
                type="search"
                aria-label={t("connections.mail.search")}
                placeholder={t("connections.mail.search")}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <select
              aria-label={t("connections.mail.statusLabel")}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">{t("connections.mail.allStatuses")}</option>
              <option value="on">{t("connections.mail.optActive")}</option>
              <option value="off">{t("connections.mail.optPaused")}</option>
            </select>
          </div>
          {visible.length ? (
            <ul className="fd-rules-list">
              {visible.map((rule) => (
                <li key={rule.id} className="fd-rule" data-mail-rule={rule.id}>
                  <div>
                    <p className="fd-rule-title">{rule.inWords}</p>
                    <div className="fd-rule-meta">
                      <span className="fd-state" data-on={rule.enabled}>
                        {rule.enabled
                          ? t("connections.mail.active")
                          : t("connections.mail.paused")}
                      </span>
                      {ruleActivity(rule, t, language)}
                    </div>
                    {error(rule)}
                  </div>
                  <div className="fd-rule-actions">{actions(rule)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {t("connections.mail.noMatch")}
            </p>
          )}
          {matching.length > 0 && (
            <div className="fd-paging">
              <span role="status">
                {t("connections.mail.paging", {
                  from: start + 1,
                  to: start + visible.length,
                  count: matching.length,
                })}
              </span>
              {last > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    {t("connections.mail.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current === last}
                    onClick={() => setPage(current + 1)}
                  >
                    {t("connections.mail.next")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <PageRows className="mt-0">
          {visible.map((rule) => (
            <Item key={rule.id} size="sm" data-mail-rule={rule.id}>
              <ItemContent>
                <ItemTitle className="line-clamp-none">
                  {rule.inWords}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {mailRuleStatus(rule, t, language)}
                </ItemDescription>
                {error(rule)}
              </ItemContent>
              <ItemActions>{actions(rule)}</ItemActions>
            </Item>
          ))}
        </PageRows>
      )}
      {change.isError && (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {change.error.message}
        </p>
      )}
    </PageSection>
  );
}
