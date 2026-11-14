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
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { client } from "@/lib/client";

/**
 * Full access (docs/FULL_ACCESS.md): the person's own setting, one member at a time, with three
 * choices: off (the default), Full access without payments, and Full access. Raising a Bot's choice
 * shows one warning and needs a confirm; lowering it, or turning it off, is immediate. Kept in
 * app/src/freeduet/ so the upstream page only gains one line (docs/UPSTREAM_TOUCHES.md).
 */
export type FullAccessChoice = "off" | "no_payments" | "full";
export type FullAccessData = {
  /** `mode` is absent when talking to a server from before the second setting: that is plain Full access. */
  bots: Record<string, { since: string; mode?: "full" | "no_payments" }>;
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

/** What the choice is called, on the page and in the question that asks the person to confirm it. */
const LABEL: Record<Exclude<FullAccessChoice, "off">, string> = {
  no_payments: "Full access without payments",
  full: "Full access",
};

const choiceOf = (entry: FullAccessData["bots"][string] | undefined) =>
  entry === undefined
    ? "off"
    : entry.mode === "no_payments"
      ? "no_payments"
      : "full";

/**
 * The server wants a confirm for whatever raises what the Bot may do without asking: turning either
 * choice on, and going from "without payments" to Full access. Going down needs none.
 */
const needsConfirm = (from: FullAccessChoice, to: FullAccessChoice) =>
  to === "full" || (to === "no_payments" && from === "off");

const setFullAccess = (
  botId: string,
  choice: FullAccessChoice,
  confirmed: boolean,
) =>
  client(`${PATH}/${encodeURIComponent(botId)}`, {
    method: "PUT",
    // `confirm` is the answer to the warning below; the server refuses a raise without it.
    body:
      choice === "off"
        ? { enabled: false }
        : confirmed
          ? { enabled: true, mode: choice, confirm: true }
          : { enabled: true, mode: choice },
    fallback: "Your Full access setting could not be saved.",
  });

export function FreeDuetFullAccess() {
  const state = useQuery(fullAccessOptions());
  const agents = useQuery(agentListQueryOptions());
  const [asking, setAsking] = useState<{
    id: string;
    name: string;
    choice: Exclude<FullAccessChoice, "off">;
  } | null>(null);
  const queryClient = useQueryClient();
  const change = useMutation({
    mutationFn: (input: {
      botId: string;
      choice: FullAccessChoice;
      confirmed: boolean;
    }) => setFullAccess(input.botId, input.choice, input.confirmed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const error = state.error ?? change.error;
  if (state.isPending && !error) return null;
  const bots = (agents.data ?? []).filter((agent) => !agent.hidden);
  const on = state.data?.bots ?? {};
  const nameOf = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.name ?? id;
  const recent = state.data?.recent ?? [];

  const choose = (
    agent: { id: string; name: string },
    choice: FullAccessChoice,
  ) => {
    const from = choiceOf(on[agent.id]);
    if (choice === from) return;
    if (choice !== "off" && needsConfirm(from, choice)) {
      setAsking({ id: agent.id, name: agent.name, choice });
      return;
    }
    // Going down, or off: nothing to confirm, and a question about this Bot is no longer the point.
    setAsking(null);
    change.mutate({ botId: agent.id, choice, confirmed: false });
  };

  const summary = (id: string) => {
    const entry = on[id];
    const choice = choiceOf(entry);
    if (choice === "off" || !entry)
      return "Asks before it sends, pays, signs, books or deletes.";
    const since = new Date(entry.since).toLocaleDateString();
    return choice === "no_payments"
      ? `Acts without asking, except that payments and purchases still ask you. Since ${since}.`
      : `Acts without asking, payments included, with no limit on the amount. Since ${since}.`;
  };

  return (
    <>
      <PageSection
        description="Safe by default: your Bots ask before they send, pay, sign, book or delete. For each Bot you can choose to let it do these without asking."
        title="Full access"
      >
        <ul className="mt-3 space-y-1 text-muted-foreground text-sm">
          <li>
            <span className="font-medium text-foreground">Off:</span> the Bot
            asks before it sends, pays, signs, books or deletes.
          </li>
          <li>
            <span className="font-medium text-foreground">
              Full access without payments:
            </span>{" "}
            it sends, signs, books and deletes without asking. Payments and
            purchases still ask you.
          </li>
          <li>
            <span className="font-medium text-foreground">Full access:</span> it
            also pays and buys without asking. There is no limit on the amount
            until spending caps exist (planned for v0.4).
          </li>
        </ul>
        {error ? (
          <p className="mt-2 mb-2 text-destructive text-sm" role="alert">
            {error.message}
          </p>
        ) : null}
        {asking ? (
          <section
            aria-label={`Give ${asking.name} ${LABEL[asking.choice]}?`}
            className={
              asking.choice === "full"
                ? "mt-3 mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                : "mt-3 mb-3 rounded-lg border border-border bg-muted/40 p-4"
            }
          >
            <p className="font-medium text-sm">
              Give {asking.name} {LABEL[asking.choice]}?
            </p>
            {asking.choice === "full" ? (
              <>
                <p className="mt-1 text-sm">
                  {asking.name} will send, pay, sign, book and delete without
                  asking you first. It can act on what it reads, such as an
                  email or a web page, so only turn this on if you trust it with
                  that.
                </p>
                <p className="mt-1 font-medium text-sm">
                  There is no limit on the amount it can pay: spending caps do
                  not exist yet (they are planned for v0.4). To keep payments
                  and purchases asking you, choose Full access without payments
                  instead.
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Passwords and security settings still need you. This applies
                  to what you ask in your own chats, not to routines or
                  check-ins. You can turn it off at any time, and it stops at
                  once.
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm">
                  {asking.name} will send, sign, book and delete without asking
                  you first. Payments and purchases still ask you. It can act on
                  what it reads, such as an email or a web page, so only turn
                  this on if you trust it with that.
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  The app recognises a payment by its built-in checks, so a
                  message that only mentions a payment may ask too, and a
                  payment worded in an unusual way might not be caught.
                  Passwords and security settings still need you. This applies
                  to what you ask in your own chats, not to routines or
                  check-ins. You can turn it off at any time, and it stops at
                  once.
                </p>
              </>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setAsking(null)} variant="outline">
                Cancel
              </Button>
              <Button
                disabled={change.isPending}
                onClick={() =>
                  change.mutate(
                    {
                      botId: asking.id,
                      choice: asking.choice,
                      confirmed: true,
                    },
                    { onSuccess: () => setAsking(null) },
                  )
                }
              >
                Give {LABEL[asking.choice]}
              </Button>
            </div>
          </section>
        ) : null}
        {bots.length === 0 ? <PageEmpty>No Bots yet.</PageEmpty> : null}
        {bots.length > 0 ? (
          <PageRows>
            {bots.map((agent, index) => {
              const current = choiceOf(on[agent.id]);
              return (
                <React.Fragment key={agent.id}>
                  <Item size="sm">
                    <ItemMedia variant="icon">
                      <IconBolt />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{agent.name}</ItemTitle>
                      <ItemDescription className="line-clamp-none">
                        {summary(agent.id)}
                      </ItemDescription>
                      <fieldset className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <legend className="sr-only">
                          Access for {agent.name}
                        </legend>
                        {(
                          [
                            ["off", "Off"],
                            ["no_payments", LABEL.no_payments],
                            ["full", LABEL.full],
                          ] as const
                        ).map(([choice, label]) => (
                          <label
                            className="flex items-center gap-1.5"
                            key={choice}
                          >
                            <input
                              aria-label={`${label} for ${agent.name}`}
                              checked={current === choice}
                              disabled={change.isPending}
                              name={`full-access-${agent.id}`}
                              onChange={() => choose(agent, choice)}
                              type="radio"
                              value={choice}
                            />
                            {label}
                          </label>
                        ))}
                      </fieldset>
                    </ItemContent>
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
