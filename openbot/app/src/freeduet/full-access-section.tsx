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
import { useAppLanguage } from "./i18n/provider";

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

/** What the choice is called, on the page and in the question that asks the person to confirm it (catalogue keys). */
const LABEL = {
  no_payments: "fullaccess.label.noPayments",
  full: "fullaccess.label.full",
} as const;

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
  const { t, date } = useAppLanguage();
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
    if (choice === "off" || !entry) return t("fullaccess.summary.off");
    const since = date(new Date(entry.since), { dateStyle: "short" });
    return choice === "no_payments"
      ? t("fullaccess.summary.noPayments", { since })
      : t("fullaccess.summary.full", { since });
  };

  return (
    <>
      <PageSection
        description={t("fullaccess.description")}
        title={t("fullaccess.label.full")}
      >
        <ul className="mt-3 space-y-1 text-muted-foreground text-sm">
          <li>
            <span className="font-medium text-foreground">
              {t("fullaccess.offTerm")}
            </span>{" "}
            {t("fullaccess.offText")}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t("fullaccess.noPaymentsTerm")}
            </span>{" "}
            {t("fullaccess.noPaymentsText")}
          </li>
          <li>
            <span className="font-medium text-foreground">
              {t("fullaccess.fullTerm")}
            </span>{" "}
            {t("fullaccess.fullText")}
          </li>
        </ul>
        {error ? (
          <p className="mt-2 mb-2 text-destructive text-sm" role="alert">
            {error.message}
          </p>
        ) : null}
        {asking ? (
          <section
            aria-label={t("fullaccess.askTitle", {
              name: asking.name,
              label: t(LABEL[asking.choice]),
            })}
            className={
              asking.choice === "full"
                ? "mt-3 mb-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4"
                : "mt-3 mb-3 rounded-lg border border-border bg-muted/40 p-4"
            }
          >
            <p className="font-medium text-sm">
              {t("fullaccess.askTitle", {
                name: asking.name,
                label: t(LABEL[asking.choice]),
              })}
            </p>
            {asking.choice === "full" ? (
              <>
                <p className="mt-1 text-sm">
                  {t("fullaccess.full.p1", { name: asking.name })}
                </p>
                <p className="mt-1 font-medium text-sm">
                  {t("fullaccess.full.p2")}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t("fullaccess.full.p3")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm">
                  {t("fullaccess.noPayments.p1", { name: asking.name })}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {t("fullaccess.noPayments.p2")}
                </p>
              </>
            )}
            <div className="mt-3 flex gap-2">
              <Button onClick={() => setAsking(null)} variant="outline">
                {t("settings.cancel")}
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
                {t("fullaccess.give", { label: t(LABEL[asking.choice]) })}
              </Button>
            </div>
          </section>
        ) : null}
        {bots.length === 0 ? (
          <PageEmpty>{t("fullaccess.noBots")}</PageEmpty>
        ) : null}
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
                          {t("fullaccess.legend", { name: agent.name })}
                        </legend>
                        {(
                          [
                            ["off", "fullaccess.off"],
                            ["no_payments", LABEL.no_payments],
                            ["full", LABEL.full],
                          ] as const
                        ).map(([choice, labelId]) => {
                          const label = t(labelId);
                          return (
                            <label
                              className="flex items-center gap-1.5"
                              key={choice}
                            >
                              <input
                                aria-label={t("fullaccess.radioAria", {
                                  label,
                                  name: agent.name,
                                })}
                                checked={current === choice}
                                disabled={change.isPending}
                                name={`full-access-${agent.id}`}
                                onChange={() => choose(agent, choice)}
                                type="radio"
                                value={choice}
                              />
                              {label}
                            </label>
                          );
                        })}
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
          description={t("fullaccess.doneDescription")}
          title={t("fullaccess.doneTitle")}
        >
          {recent.length === 0 ? (
            <PageEmpty>{t("fullaccess.nothingYet")}</PageEmpty>
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
                        {action.scope} ·{" "}
                        {date(new Date(action.at), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
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
