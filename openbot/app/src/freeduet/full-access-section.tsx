import { IconBolt } from "@tabler/icons-react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import React, { useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";

/**
 * Full access (docs/FULL_ACCESS.md): the person's own switch, one member at a time. Off by default.
 * Turning it on shows one warning and needs a confirm; turning it off is immediate. Kept in
 * app/src/freeduet/ so the upstream page only gains one line (docs/UPSTREAM_TOUCHES.md).
 */
export type FullAccessData = {
  bots: Record<string, { since: string }>;
  recent: {
    at: string;
    bot: string;
    tool: string;
    effect: string;
    scope: string;
  }[];
};

const KEY = ["freeduet", "full-access"] as const;
const PATH = "/api/approvals/full-access";

export const fullAccessOptions = () =>
  queryOptions({
    queryKey: KEY,
    queryFn: async (): Promise<FullAccessData> =>
      (
        await client(PATH, {
          fallback: "Your Full access settings could not be loaded.",
        })
      ).json(),
    refetchInterval: 10_000,
  });

const setFullAccess = (botId: string, enabled: boolean) =>
  client(`${PATH}/${encodeURIComponent(botId)}`, {
    method: "PUT",
    // `confirm` is the answer to the warning below; the server refuses "on" without it.
    body: enabled ? { enabled, confirm: true } : { enabled },
    fallback: "Your Full access setting could not be saved.",
  });

export function FreeDuetFullAccess() {
  const state = useQuery(fullAccessOptions());
  const agents = useQuery(agentListQueryOptions());
  const [asking, setAsking] = useState<{ id: string; name: string } | null>(
    null,
  );
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (input: { botId: string; enabled: boolean }) =>
      setFullAccess(input.botId, input.enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const error = state.error ?? change.error;
  if (state.isPending && !error) return null;
  const bots = (agents.data ?? []).filter((agent) => !agent.hidden);
  const on = state.data?.bots ?? {};
  const nameOf = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;
  const recent = state.data?.recent ?? [];

  return (
    <>
      <PageSection
        description="Safe by default: your Bots ask before they send, pay, sign, book or delete. If you want, you can turn on Full access for a Bot, and it will do these without asking."
        title="Full access"
      >
        {error ? (
          <p className="mb-2 text-destructive text-sm" role="alert">
            {error.message}
          </p>
        ) : null}
        {asking ? (
          <section
            aria-label={`Give ${asking.name} Full access?`}
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
          >
            <p className="font-medium text-sm">
              Give {asking.name} Full access?
            </p>
            <p className="mt-1 text-sm">
              {asking.name} will send, pay, sign, book and delete without asking
              you first. It can act on what it reads, such as an email or a web
              page, so only turn this on if you trust it with that.
            </p>
            <p className="mt-1 text-muted-foreground text-sm">
              Passwords and security settings still need you. This applies to
              what you ask in your own chats, not to routines or check-ins. You
              can turn it off at any time, and it stops at once.
            </p>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setAsking(null)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={change.isPending}
                onClick={() =>
                  change.mutate(
                    { botId: asking.id, enabled: true },
                    { onSuccess: () => setAsking(null) },
                  )
                }
              >
                Give Full access
              </Button>
            </div>
          </section>
        ) : null}
        {bots.length === 0 ? <PageEmpty>No Bots yet.</PageEmpty> : null}
        {bots.length > 0 ? (
          <PageRows>
            {bots.map((agent, index) => {
              const since = on[agent.id]?.since;
              return (
                <React.Fragment key={agent.id}>
                  <Item size="sm">
                    <ItemMedia variant="icon">
                      <IconBolt />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{agent.name}</ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {since
                          ? `Acts without asking, since ${new Date(since).toLocaleDateString()}.`
                          : "Asks before it sends, pays, signs, books or deletes."}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Switch
                        aria-label={`Full access for ${agent.name}`}
                        checked={since !== undefined}
                        disabled={change.isPending}
                        onCheckedChange={(next) =>
                          next
                            ? setAsking({ id: agent.id, name: agent.name })
                            : change.mutate({
                                botId: agent.id,
                                enabled: false,
                              })
                        }
                      />
                    </ItemActions>
                  </Item>
                  {index !== bots.length - 1 && <Separator />}
                </React.Fragment>
              );
            })}
          </PageRows>
        ) : null}
      </PageSection>
      {Object.keys(on).length > 0 || recent.length > 0 ? (
        <PageSection
          description="What a Bot with Full access did without asking you, newest first."
          title="Done without asking"
        >
          {recent.length === 0 ? (
            <PageEmpty>Nothing yet.</PageEmpty>
          ) : (
            <PageRows>
              {recent.map((action, index) => (
                <React.Fragment
                  key={`${action.at}|${action.bot}|${action.tool}|${action.scope}`}
                >
                  <Item size="sm">
                    <ItemContent>
                      <ItemTitle>
                        {nameOf(action.bot)}: {action.tool}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {action.scope} · {new Date(action.at).toLocaleString()}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                  {index !== recent.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </PageRows>
          )}
        </PageSection>
      ) : null}
    </>
  );
}
