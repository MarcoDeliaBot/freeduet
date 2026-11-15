import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/** "Last run 14 Nov, 9:05: 3 messages." or that it has not run yet. */
export function mailRuleStatus(rule: MailRule): string {
  if (!rule.enabled) return "Off";
  if (!rule.lastRunAt) return "On. Has not run yet.";
  const when = new Date(rule.lastRunAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const n = rule.lastMatched;
  return `On. Last run ${when}: ${n} ${n === 1 ? "message" : "messages"}. ${rule.totalApplied} in all.`;
}

/**
 * The mail rules the person has, in words, each with Switch off or on and Delete. Drawn only when there
 * is at least one: a rule is made in chat, and this list is where it is seen and stopped.
 */
export function MailRulesSection() {
  const queryClient = useQueryClient();
  const rules = useQuery(mailRulesQueryOptions());
  const change = useMutation(changeMailRuleMutationOptions(queryClient));
  if (!rules.data || rules.data.length === 0) return null;
  return (
    <PageSection
      description="Standing rules you asked for in chat. Your Bots keep and apply them to new mail every few minutes; they are not Gmail filters. Deleting a rule does not undo what it already did."
      title="Mail rules"
    >
      <PageRows className="mt-0">
        {rules.data.map((rule) => (
          <Item key={rule.id} size="sm" data-mail-rule={rule.id}>
            <ItemContent>
              <ItemTitle className="line-clamp-none">{rule.inWords}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {mailRuleStatus(rule)}
              </ItemDescription>
              {rule.lastError ? (
                <p className="text-destructive text-sm" role="alert">
                  Last problem: {rule.lastError}
                </p>
              ) : null}
            </ItemContent>
            <ItemActions>
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
                variant="outline"
              >
                Delete
              </Button>
            </ItemActions>
          </Item>
        ))}
      </PageRows>
      {change.isError ? (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {change.error.message}
        </p>
      ) : null}
    </PageSection>
  );
}
