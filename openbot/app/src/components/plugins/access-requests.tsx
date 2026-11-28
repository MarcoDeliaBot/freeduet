import { IconInbox } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import { PageRows, PageSection } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import {
  approveAppAccessRequestMutationOptions,
  dismissAppAccessRequestMutationOptions,
} from "@/lib/app-access/mutations";
import {
  type AppAccessRequest,
  type AppWant,
  appAccessInboxQueryOptions,
} from "@/lib/app-access/queries";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import { relativeTime } from "@/lib/relative-time";
import { queryClient } from "@/query-client";

/**
 * The requests people have filed for an administrator to answer: switch an app on, give it to a
 * Bot, or connect its shared account.
 *
 * ONE SECTION, ON TWO SCREENS. An app's own admin page lists the requests about that app, because
 * that is where an administrator is already deciding about it. The Plugins list carries all of them,
 * because an app nobody has switched on has no page of its own to list them on — a Composio app
 * enabled by approving the request is exactly that case — and because a request nobody sees is a
 * person waiting for nothing.
 *
 * APPROVE DOES THE THING. The server switches the app on and grants it to the Bot in the same press,
 * or refuses with the step only an administrator can take first — a token to paste, a team account
 * to connect — and the request stays pending. That sentence is drawn on the row it is about, because
 * the screen's own banner is a long way from the button that was pressed.
 *
 * A GRANT IS READ-ONLY UNTIL SOMEBODY CHOOSES MORE. One press is not a decision about every action an
 * app offers — Gmail's include sending and deleting mail — so approving gives the Bot the app's
 * read-only actions and nothing else, and an app with none is refused with a sentence pointing at the
 * Bot's page. The row says so before the press, and links to that page where it can.
 *
 * A TOOL THAT SENDS IS NEVER GIVEN HERE (decided 14 November 2026). It is allowed on that same page, in
 * settings, by the person. A row that wants one says so in plain words with the link, leaves the tool
 * out of what its press names, and has no Approve at all when every tool it wants is one. The server
 * refuses such a tool whatever a press names, so this is the explanation and not the rule.
 *
 * REQUESTS, NOT CONNECTIONS. Each row names who asked, because they asked; nothing here says who has
 * connected what, which stays private to each person (see the note on `admin/plugins/$key.tsx`).
 *
 * Nothing at all while the read is open or when nothing is waiting: an empty section on every app's
 * page would teach an administrator to scroll past the heading.
 */
export function AccessRequestsSection({ app }: { app?: string }) {
  const inbox = useQuery(appAccessInboxQueryOptions(true, app));
  if (inbox.isPending) return null;
  if (inbox.error)
    return (
      <PageSection title="Requests">
        <p className="mt-4 text-destructive text-sm" role="alert">
          Couldn't load access requests. Reload the page.
        </p>
      </PageSection>
    );
  const requests = inbox.data?.requests ?? [];
  if (requests.length === 0) return null;
  return (
    <PageSection
      description={
        app
          ? "People asking for this app. Approve does what they asked, right away."
          : "People asking for an app to be turned on, given to a Bot, or connected. Approve does what they asked, right away."
      }
      title="Requests"
    >
      <PageRows>
        {requests.map((request, index) => (
          <Fragment key={request.id}>
            {index > 0 ? <Separator /> : null}
            <AccessRequestRow request={request} />
          </Fragment>
        ))}
      </PageRows>
    </PageSection>
  );
}

/** What the request asks for, as the thing an administrator would do. */
export function askedFor(request: AppAccessRequest): string {
  const bot = request.botName ?? "a Bot";
  switch (request.kind) {
    case "enable":
      return `Turn on ${request.appTitle} for ${bot}`;
    case "grant":
      // A Bot that holds some of the app already and whose skills need more of it: say which.
      return request.wants && request.wants.length > 0
        ? `Give ${bot} more of ${request.appTitle}: ${[...new Set(request.wants.map((want) => want.label))].join(", ")}`
        : `Give ${request.appTitle} to ${bot}`;
    case "connect_shared":
      return `Connect the shared ${request.appTitle} account`;
  }
}

function AccessRequestRow({ request }: { request: AppAccessRequest }) {
  // One pair per row, so a refusal is drawn under the request it is about and nowhere else.
  const approve = useMutation(
    approveAppAccessRequestMutationOptions(queryClient),
  );
  const dismiss = useMutation(
    dismissAppAccessRequestMutationOptions(queryClient),
  );
  const { language } = useAppLanguage();
  const busy = approve.isPending || dismiss.isPending;
  const error = approve.error ?? dismiss.error;
  const who = request.requesterName ?? request.requesterEmail ?? "Somebody";
  // What a press may name: the tools the row wants, less the ones only settings gives.
  const approvable = (request.wants ?? []).filter((want) => !want.settingsOnly);
  const wantsOnlySettings =
    (request.wants?.length ?? 0) > 0 && approvable.length === 0;
  return (
    <Item data-request={request.id} size="sm">
      <ItemMedia variant="icon">
        <IconInbox />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{askedFor(request)}</ItemTitle>
        <ItemDescription className="line-clamp-none">
          {who} asked {relativeTime(request.createdAt, language)}
          {request.kind === "connect_shared" && request.botName
            ? `, for ${request.botName}`
            : ""}
          . <GrantNote request={request} />
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          disabled={busy}
          onClick={() => {
            approve.reset();
            dismiss.mutate(request.id);
          }}
          size="sm"
          variant="ghost"
        >
          {dismiss.isPending ? "Dismissing…" : "Dismiss"}
        </Button>
        {wantsOnlySettings ? null : (
          <Button
            disabled={busy}
            onClick={() => {
              dismiss.reset();
              approve.mutate({
                id: request.id,
                // The tools the row names, so the press gives what was read and nothing the app has since
                // added. Never one that only settings gives: the server would refuse the whole press.
                ...(request.wants && request.wants.length > 0
                  ? { refs: approvable.map((want) => want.ref) }
                  : {}),
              });
            }}
            size="sm"
          >
            {approve.isPending ? "Approving…" : "Approve"}
          </Button>
        )}
      </ItemActions>
      {error ? (
        <ItemFooter>
          <p className="text-destructive text-sm" role="alert">
            {error.message}
          </p>
        </ItemFooter>
      ) : null}
    </Item>
  );
}

/**
 * What approving gives a Bot, for a request that grants one: the app's read-only actions, with the
 * rest chosen on the Bot's page under the app. Linked there for a grant, whose app is already on
 * and so has that page; an app still to be switched on has none until the press that switches it on.
 */
function GrantNote({ request }: { request: AppAccessRequest }) {
  if (request.kind === "connect_shared" || !request.agentId) return null;
  const bot = request.botName ?? "the Bot";
  const where = `the Bot's page under ${request.appTitle}`;
  const page =
    request.kind === "grant" ? (
      <Link
        params={{ agentId: request.agentId, key: request.appKey }}
        to="/admin/plugins/$key/bots/$agentId"
      >
        {where}
      </Link>
    ) : (
      where
    );
  /*
   * A request for tools a Bot's skills need and it was never given is approved for exactly those,
   * and the row names them — each one that changes something is said to, because one press here is
   * what lets the Bot ask to do it. The ones that only settings gives are not among them: they are
   * said to be, with where to allow them, and the press does not name them.
   */
  if (request.wants && request.wants.length > 0) {
    const given = request.wants.filter((want) => !want.settingsOnly);
    const heldBack = request.wants.filter((want) => want.settingsOnly);
    return (
      <>
        {given.length > 0 ? (
          <>
            Approving gives {bot} exactly these tools and nothing else:{" "}
            {given
              .map(
                (want) =>
                  `${want.name} (${want.read ? "read-only" : "changes something"})`,
              )
              .join(", ")}
            .
          </>
        ) : null}
        {given.length > 0 && heldBack.length > 0 ? " " : null}
        {heldBack.length > 0 ? (
          <SettingsOnlyNote
            app={request.appTitle}
            page={page}
            tools={heldBack}
          />
        ) : null}
      </>
    );
  }
  return (
    <>
      Approving gives {bot} only {request.appTitle}'s read-only actions. Choose
      any others on {page}.
    </>
  );
}

/**
 * Why the tools that only settings gives are not in what a press names, and where to allow them.
 *
 * The same story as the sentence the server refuses a direct call with, which is plain text: this one
 * draws the link. A tool the app's own list says sends, and a tool nothing reviewed describes, are told
 * apart, because the second is a precaution and not a finding.
 */
function SettingsOnlyNote({
  app,
  page,
  tools,
}: {
  app: string;
  page: ReactNode;
  tools: AppWant[];
}) {
  const sends = tools.filter((want) => want.settingsOnly === "send");
  const unreviewed = tools.filter((want) => want.settingsOnly === "unreviewed");
  const many = tools.length > 1;
  return (
    <>
      {sends.length > 0
        ? `${named(sends)} can ${sends.length > 1 ? "each " : ""}send on the person's behalf. `
        : null}
      {unreviewed.length > 0
        ? `No reviewed list says what ${named(unreviewed)} ${unreviewed.length > 1 ? "do" : "does"} in ${app}, so ${unreviewed.length > 1 ? "each" : "it"} may send on the person's behalf. `
        : null}
      Approving never gives {many ? "tools" : "a tool"} like that: allow{" "}
      {many ? "them" : "it"} in settings, on {page}.
    </>
  );
}

/** Tool names as a person reads a list: "a", "a and b", "a, b and c". */
function named(tools: AppWant[]): string {
  const names = tools.map((want) => want.name);
  return names.length < 3
    ? names.join(" and ")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * How many requests are waiting, for a list row that wants to say so: one app's, or all of them.
 * Null while nothing is waiting or nothing has been read, so a row draws nothing rather than "0".
 */
export function usePendingRequestCounts() {
  const inbox = useQuery(appAccessInboxQueryOptions(true));
  return inbox.data?.counts ?? null;
}
