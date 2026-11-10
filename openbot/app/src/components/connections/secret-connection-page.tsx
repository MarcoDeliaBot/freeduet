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
}: {
  entry: { key: string; title: string; summary: string };
  /** Whether an administrator has turned the app on. A form with nowhere to go is not drawn. */
  enabled: boolean;
  back: { label: string; linkProps: { to: "/connections" } };
}) {
  const queryClient = useQueryClient();
  const status = useQuery({
    ...secretConnectionQueryOptions(entry.key),
    enabled,
  });
  const [address, setAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [calendarUrl, setCalendarUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const ids = useId();

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
      setDone(
        `Connected. Bots you allow can now read your mail${
          calendarUrl.trim() ? " and calendar" : ""
        } as you.`,
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
        <PageEmpty>
          Not available yet. An admin has to turn this on first.
        </PageEmpty>
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
          Couldn't load whether you've connected this. Reload the page, or ask
          an admin if it keeps happening.
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
              <ItemTitle>Your account</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {connected
                  ? `Connected as ${connected.address}. ${
                      connected.calendar
                        ? "Your calendar is connected too."
                        : "No calendar is connected."
                    } Bots you allow use this as you.`
                  : "No Bot can use this as you. Paste an app password below to connect your Gmail."}
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
                        Connected
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
                      Use a different app password
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
                              `Disconnected. ${PRODUCT} can't read your mail or calendar any more. To be sure the app password stops working, delete it at ${APP_PASSWORDS_URL} too.`,
                            );
                          },
                          onError: (thrown: Error) => setNotice(thrown.message),
                        });
                      }}
                      variant="destructive"
                    >
                      {disconnect.isPending ? "Disconnecting…" : "Disconnect"}
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
          description="Two steps at Google, then paste what they give you. Nothing is saved unless Gmail accepts it."
          title={connected ? "Use a different app password" : "Connect"}
        >
          <ol className="mb-4 list-decimal space-y-2 pl-5 text-muted-foreground text-sm">
            <li>
              Turn on 2-Step Verification for your Google account, then make an
              app password at{" "}
              <a
                className="underline underline-offset-2"
                href={APP_PASSWORDS_URL}
                rel="noreferrer"
                target="_blank"
              >
                myaccount.google.com/apppasswords
              </a>
              . Name it {PRODUCT} and copy the sixteen letters.
            </li>
            <li>
              To let your Bots see your calendar too: in Google Calendar, open
              Settings, choose your calendar, and copy its{" "}
              <a
                className="underline underline-offset-2"
                href={CALENDAR_HELP_URL}
                rel="noreferrer"
                target="_blank"
              >
                Secret address in iCal format
              </a>
              . This one is optional.
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
              });
            }}
          >
            <Item variant="muted">
              <ItemContent>
                <ItemTitle>
                  <label htmlFor={`${ids}-address`}>Your Gmail address</label>
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
                  <label htmlFor={`${ids}-password`}>App password</label>
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  The sixteen letters from Google, with or without the spaces.
                  Not your usual password.
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
                    Calendar secret address (optional)
                  </label>
                </ItemTitle>
                <ItemDescription className="line-clamp-none">
                  Anyone with this address can read your calendar, so it is kept
                  as carefully as the password.
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
                  Cancel
                </Button>
              ) : null}
              <Button disabled={connect.isPending} size="sm" type="submit">
                {connect.isPending ? "Checking with Gmail…" : "Connect"}
              </Button>
            </div>
          </form>
        </PageSection>
      ) : null}

      <PageSection
        description="An app password opens your whole mailbox, so it is worth knowing what this does."
        title="What this lets your Bots do"
      >
        <PageRows>
          <Item size="sm">
            <ItemContent>
              <ItemDescription className="line-clamp-none">
                Your Bots can search and read your mail and look at your
                calendar. They cannot delete, move or label anything. A reply
                goes out only after you approve it, and only to people already
                on the message. You can disconnect at any time, and you can
                delete the app password at Google whenever you like.
              </ItemDescription>
            </ItemContent>
          </Item>
        </PageRows>
      </PageSection>
    </PageShell>
  );
}
