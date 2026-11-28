import { IconChevronDown } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { useT } from "@/freeduet/i18n/provider";
import { useBotNames } from "@/components/routines/bot-names";
import { appConfig } from "@/lib/generated/application-config";
import { disconnectHeldMutationOptions } from "@/lib/plugins/mutations";
import {
  connectSecretMutationOptions,
  secretConnectionQueryOptions,
} from "@/lib/plugins/secret-connection";

const PRODUCT = appConfig.brand.productName;

/** Where Google makes an app password. Needs 2-Step Verification, which the sentence says. */
export const APP_PASSWORDS_URL = "https://myaccount.google.com/apppasswords";
/** Google's own page on a calendar's secret address in iCal format. */
export const CALENDAR_HELP_URL =
  "https://support.google.com/calendar/answer/37111";

/**
 * A connector the person connects by pasting what it is reached with: their Gmail address, an app
 * password and, if they want their calendar read, its secret address.
 *
 * The page for a catalogue entry whose auth is `user-secret`. It says what the person gets (their
 * Bots read their mail and calendar as them), what they have to do at Google first, and what
 * disconnecting does and does not undo: this deployment forgets the password at once, but only the
 * person can delete it at Google, and the page says so with the link.
 *
 * NOTHING THE PERSON TYPES IS KEPT HERE LONGER THAN THE FORM. The three values are component state
 * until the request is sent, and are cleared the moment it is taken. The password and the calendar
 * address are inputs of type password, so they are never drawn in the clear, and the page reads back
 * only the address, which is the one part of the secret the server returns.
 */
export function SecretConnectionPage({
  entry,
  enabled,
  back,
  bot,
}: {
  entry: { key: string; title: string; summary: string };
  /** The member the chat's button named (`?bot=`): who will use this mailbox. Absent from the Connections list. */
  bot?: string;
  /** Whether an administrator has turned the app on. A form with nowhere to go is not drawn. */
  enabled: boolean;
  back: { label: string; linkProps: { to: "/connections" } };
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const status = useQuery({
    ...secretConnectionQueryOptions(entry.key, bot),
    enabled,
  });
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const ids = useId();
  const botNames = useBotNames();
  // Said only when the server agrees this member may use the app: a crafted `?bot=` claims nothing.
  const eligibleBot = bot && status.data?.botEligible === true ? bot : null;
  const memberName = eligibleBot
    ? (botNames.get(eligibleBot) ?? t("connections.secret.aMember"))
    : null;

  const connect = useMutation({
    ...connectSecretMutationOptions(queryClient),
    onError: (thrown: Error) => {
      setDone(null);
      setNotice(thrown.message);
    },
    onSuccess: () => {
      // Taken: nothing the person typed stays in this component.
      setAppPassword("");
      setCalendarUrl("");
      setNotice(null);
      setReplacing(false);
      const withCalendar = calendarUrl.trim() !== "";
      setDone(
        memberName
          ? t(
              withCalendar
                ? "connections.secret.doneMemberCal"
                : "connections.secret.doneMember",
              { name: memberName },
            )
          : t(
              withCalendar
                ? "connections.secret.doneBotsCal"
                : "connections.secret.doneBots",
            ),
      );
    },
  });
  const disconnect = useMutation(disconnectHeldMutationOptions(queryClient));

  if (!enabled) {
    return (
      <PageShell
        backButton={back}
        description={entry.summary}
        title={entry.title}
      >
        <PageEmpty>{t("connections.secret.notAvailable")}</PageEmpty>
      </PageShell>
    );
  }

  const connected = status.data?.connected === true ? status.data : null;
  const showForm = connected === null || replacing;

  return (
    <PageShell
      backButton={back}
      description={entry.summary}
      title={entry.title}
    >
      {notice ? (
        <p className="text-destructive text-sm" role="alert">
          {notice}
        </p>
      ) : null}
      {status.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("connections.secret.statusError")}
        </p>
      ) : null}
      {done ? (
        <p className="text-sm" role="status">
          {done}
        </p>
      ) : null}

      <PageSection>
        <PageRows className="mt-0">
          <Item size="sm">
            <ItemContent>
              <ItemTitle>{t("connections.secret.yourAccount")}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {connected
                  ? t(
                      connected.calendar
                        ? "connections.secret.connectedCal"
                        : "connections.secret.connectedNoCal",
                      { address: connected.address },
                    )
                  : t("connections.secret.notConnected")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              {connected ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        className="min-h-11"
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full bg-emerald-500"
                        />
                        {t("connections.connected")}
                        <IconChevronDown />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-auto">
                    <DropdownMenuItem
                      onClick={() => {
                        setNotice(null);
                        setDone(null);
                        setReplacing(true);
                      }}
                    >
                      {t("connections.secret.useDifferent")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={disconnect.isPending}
                      onClick={() => {
                        setNotice(null);
                        setDone(null);
                        disconnect.mutate(entry.key, {
                          onSuccess: () => {
                            setReplacing(false);
                            setDone(
                              t("connections.secret.disconnected", {
                                product: PRODUCT,
                                url: APP_PASSWORDS_URL,
                              }),
                            );
                          },
                          onError: (thrown: Error) => setNotice(thrown.message),
                        });
                      }}
                      variant="destructive"
                    >
                      {disconnect.isPending
                        ? t("connections.disconnecting")
                        : t("connections.disconnect")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </ItemActions>
          </Item>
        </PageRows>
      </PageSection>

      {showForm ? (
        <PageSection
          description={t("connections.secret.formDesc")}
          title={
            connected
              ? t("connections.secret.useDifferent")
              : t("connections.secret.connectTitle")
          }
        >
          {memberName ? (
            <p
              className="mb-4 text-sm"
              data-connect-member={eligibleBot ?? undefined}
            >
              {t("connections.secret.memberWillUse", { name: memberName })}
            </p>
          ) : null}
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-muted-foreground text-sm">
            <li>
              {t("connections.secret.step1Lead")}{" "}
              <a
                className="underline underline-offset-2"
                href={APP_PASSWORDS_URL}
                rel="noreferrer"
                target="_blank"
              >
                myaccount.google.com/apppasswords
              </a>
              {t("connections.secret.step1Tail", { product: PRODUCT })}
            </li>
            <li>
              {t("connections.secret.step2Lead")}{" "}
              <a
                className="underline underline-offset-2"
                href={CALENDAR_HELP_URL}
                rel="noreferrer"
                target="_blank"
              >
                {t("connections.secret.step2Link")}
              </a>
              {t("connections.secret.step2Tail")}
            </li>
          </ol>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setNotice(null);
              setDone(null);
              connect.mutate({
                serverId: entry.key,
                address,
                appPassword,
                calendarUrl,
                ...(eligibleBot ? { botId: eligibleBot } : {}),
              });
            }}
          >
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>
                  <label htmlFor={`${ids}-address`}>
                    {t("connections.secret.address")}
                  </label>
                </ItemTitle>
                <Input
                  autoCapitalize="off"
                  autoComplete="off"
                  id={`${ids}-address`}
                  onChange={(event) => setAddress(event.target.value)}
                  required
                  spellCheck={false}
                  type="email"
                  value={address}
                />
              </ItemContent>
            </Item>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>
                  <label htmlFor={`${ids}-password`}>
                    {t("connections.secret.password")}
                  </label>
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {t("connections.secret.passwordHint")}
                </ItemDescription>
                <Input
                  autoCapitalize="off"
                  autoComplete="new-password"
                  id={`${ids}-password`}
                  onChange={(event) => setAppPassword(event.target.value)}
                  required
                  spellCheck={false}
                  type="password"
                  value={appPassword}
                />
              </ItemContent>
            </Item>
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>
                  <label htmlFor={`${ids}-calendar`}>
                    {t("connections.secret.calendar")}
                  </label>
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  {t("connections.secret.calendarHint")}
                </ItemDescription>
                <Input
                  autoCapitalize="off"
                  autoComplete="off"
                  id={`${ids}-calendar`}
                  onChange={(event) => setCalendarUrl(event.target.value)}
                  spellCheck={false}
                  type="password"
                  value={calendarUrl}
                />
              </ItemContent>
            </Item>
            <div className="flex items-center justify-end gap-2">
              {connected ? (
                <Button
                  onClick={() => {
                    setReplacing(false);
                    setNotice(null);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("connections.cancel")}
                </Button>
              ) : null}
              <Button disabled={connect.isPending} size="sm" type="submit">
                {connect.isPending
                  ? t("connections.secret.checking")
                  : t("connections.secret.connectTitle")}
              </Button>
            </div>
          </form>
        </PageSection>
      ) : null}

      <PageSection
        description={t("connections.secret.canDoDesc")}
        title={t("connections.secret.canDoTitle")}
      >
        <PageRows>
          <Item size="sm">
            <ItemContent>
              <ItemDescription className="line-clamp-none">
                {t("connections.secret.canDo")}
              </ItemDescription>
            </ItemContent>
          </Item>
        </PageRows>
      </PageSection>
    </PageShell>
  );
}
