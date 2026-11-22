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
import {
  changeMailRuleMutationOptions,
  type MailRule,
  mailRulesQueryOptions,
} from "@/lib/plugins/mail-rules";

function ruleActivity(rule: MailRule): string {
  if (!rule.lastRunAt) return "Has not run yet.";
  const when = new Date(rule.lastRunAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const n = rule.lastMatched;
  return `Last run ${when}: ${n} ${n === 1 ? "message" : "messages"}. ${rule.totalApplied} in all.`;
}

export function mailRuleStatus(rule: MailRule): string {
  return rule.enabled ? `On. ${ruleActivity(rule)}` : "Off";
}

const PAGE_SIZE = 6;

export function MailRulesSection({ browse = false }: { browse?: boolean }) {
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
        {rule.enabled ? "Switch off" : "Switch on"}
      </Button>
      <Button
        disabled={change.isPending}
        onClick={() => change.mutate({ id: rule.id, change: "delete" })}
        size="sm"
        variant={browse ? "ghost" : "outline"}
      >
        Delete
      </Button>
    </>
  );
  const error = (rule: MailRule) =>
    rule.lastError ? (
      <p className="text-destructive text-sm" role="alert">
        Last problem: {rule.lastError}
      </p>
    ) : null;
  return (
    <PageSection
      className={browse ? "fd-rules" : undefined}
      description="Standing rules you asked for in chat. Your Bots keep and apply them to new mail every few minutes; they are not Gmail filters. Deleting a rule does not undo what it already did."
      title="Mail rules"
    >
      {browse ? (
        <>
          <div className="fd-rules-tools">
            <label className="fd-search">
              <DuetIcon name="search" size={18} />
              <input
                type="search"
                aria-label="Search mail rules"
                placeholder="Search mail rules"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            <select
              aria-label="Rule status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="all">All statuses</option>
              <option value="on">Active</option>
              <option value="off">Paused</option>
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
                        {rule.enabled ? "Active" : "Paused"}
                      </span>
                      {ruleActivity(rule)}
                    </div>
                    {error(rule)}
                  </div>
                  <div className="fd-rule-actions">{actions(rule)}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              No rules match these filters.
            </p>
          )}
          {matching.length > 0 && (
            <div className="fd-paging">
              <span role="status">
                {start + 1}–{start + visible.length} of {matching.length}{" "}
                {matching.length === 1 ? "rule" : "rules"}
              </span>
              {last > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current === 0}
                    onClick={() => setPage(current - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={current === last}
                    onClick={() => setPage(current + 1)}
                  >
                    Next
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
                  {mailRuleStatus(rule)}
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
