import { IconArchive, IconChevronRight } from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId } from "react";
import { BotsNavBadge } from "@/components/bot-profile/attention";
import { DuetIcon } from "@/components/duet/icons";
import {
  ARCHIVED_STORAGE_KEY,
  ChannelLink,
  EarlierLink,
  MANAGE_PAGES,
  MANAGE_STORAGE_KEY,
  ROW,
  RowIcon,
  TALL_ROW,
  useRememberedGroup,
} from "@/components/shell/menu-sheet";
import { type ShellTab, TABS } from "@/components/shell/tab-bar";
import { BuildLabel } from "@/freeduet/build-label";
import { useT } from "@/freeduet/i18n/provider";
import { showsManageGroup } from "@/freeduet/manage-group";
import {
  dotState,
  justDone,
  dotTooltip,
  workStatusQueryOptions,
} from "@/freeduet/work-status/status";
import { WorkDot } from "@/freeduet/work-status/work-dot";
import { primaryBot } from "@/lib/agents/primary-bot";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { approvalInboxOptions } from "@/lib/approvals";
import { signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { channelListQueryOptions } from "@/lib/channels/queries";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import { archiveDuetChannelMutationOptions } from "@/lib/duet-channels/mutations";
import { useDuetChannels } from "@/lib/duet-channels/use-channel";
import { appConfig } from "@/lib/generated/application-config";
import { needsInputCount } from "@/lib/tasks/groups";
import { taskListQueryOptions } from "@/lib/tasks/queries";
import { cn } from "@/lib/utils";
import { queryClient } from "@/query-client";
import type { WideBand } from "./band";
import { MemberFace } from "./mascot";
import { memberStates, memberTarget, orderTeam } from "./team";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-duet-accent/50";

/**
 * The column on the left of the wide layout (D55): Chat, Tasks and Make, your whole team with a face
 * each, and the places the phone's menu keeps. At 1280 px and wider it has names and what each member
 * is doing; from 1024 to 1279 it folds to faces and icons, and the menu opens as the drawer it is on a
 * phone. Every destination is one the app already had: nothing is added, renamed or removed.
 */
export function TeamColumn({
  band,
  tab,
  onMenu,
  onNewChannel,
}: {
  band: Exclude<WideBand, "off">;
  tab: ShellTab | null;
  onMenu: () => void;
  onNewChannel: () => void;
}) {
  const full = band === "full";
  const t = useT();
  return (
    <aside
      aria-label={t("wide.yourTeam")}
      className={cn(
        "duet-face flex min-h-0 shrink-0 flex-col border-duet-hair border-r bg-duet-card text-duet-ink",
        full ? "w-[clamp(248px,19vw,300px)]" : "w-[76px]",
      )}
      data-band={band}
    >
      {full ? <Brand /> : null}
      <MainLinks current={tab} full={full} />
      <Team full={full} />
      {full ? (
        <Places onNewChannel={onNewChannel} />
      ) : (
        <div className="flex shrink-0 flex-col items-center border-duet-hair border-t py-2">
          <button
            aria-label={t("shell.menu")}
            className={cn(
              "grid size-11 place-items-center rounded-full text-duet-ink-2 transition-colors hover:bg-duet-tile hover:text-duet-ink",
              FOCUS,
            )}
            onClick={onMenu}
            type="button"
          >
            <DuetIcon name="menu" size={22} />
          </button>
        </div>
      )}
    </aside>
  );
}

function Brand() {
  const { data: user } = useQuery(currentUserQueryOptions());
  return (
    <div className="shrink-0 px-5 pt-4 pb-2">
      <p className="type-display font-semibold">
        {appConfig.brand.productName}
      </p>
      <p className="type-sub truncate text-duet-ink-2">
        {user?.name || user?.email}
      </p>
    </div>
  );
}

/** Chat, Tasks and Make: the tab bar's three, in a column, with Tasks' count of what waits. */
function MainLinks({
  current,
  full,
}: {
  current: ShellTab | null;
  full: boolean;
}) {
  const inbox = useQuery(approvalInboxOptions());
  const tasks = useQuery(taskListQueryOptions());
  const waiting = needsInputCount(tasks.data, inbox.data);
  const t = useT();
  return (
    <nav
      aria-label={t("tab.main")}
      className={cn(
        "flex shrink-0 flex-col gap-0.5",
        full ? "px-3 py-2" : "items-center px-2 py-3",
      )}
    >
      {TABS.map((tab) => {
        const on = tab.id === current;
        const badge = tab.id === "tasks" && waiting > 0 ? waiting : 0;
        return (
          <Link
            activeOptions={{ exact: tab.id === "chat" }}
            aria-current={on ? "page" : undefined}
            aria-label={
              badge
                ? t("tab.waiting", { tab: t(tab.key18n), badge })
                : t(tab.key18n)
            }
            className={cn(
              "type-nav relative flex items-center rounded-[22px] font-medium transition-colors",
              full ? "min-h-11 gap-3 px-3" : "size-11 justify-center",
              on
                ? "bg-duet-tile text-duet-ink"
                : "text-duet-ink-2 hover:bg-duet-tile hover:text-duet-ink",
              FOCUS,
            )}
            key={tab.id}
            title={full ? undefined : t(tab.key18n)}
            to={tab.to}
          >
            <DuetIcon name={tab.icon} size={22} stroke={on ? 2.1 : 1.9} />
            {full ? <span>{t(tab.key18n)}</span> : null}
            {badge ? (
              <span
                aria-hidden
                className={cn(
                  "type-caption grid h-5 min-w-5 place-items-center rounded-full bg-duet-accent px-1 font-semibold text-duet-on-accent tabular-nums",
                  full ? "ml-auto" : "absolute top-0 right-0",
                )}
                data-tab-badge=""
              >
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** All of the team, scrolling when the window is short: each with its face and its name. */
function Team({ full }: { full: boolean }) {
  const agents = useQuery(agentListQueryOptions());
  const inbox = useQuery(approvalInboxOptions());
  const roster = useInfiniteQuery(channelListQueryOptions());
  const channels = roster.data;
  const primaryId = primaryBot(agents.data)?.id;
  const states = memberStates(inbox.data, channels);
  // D168: one dot per member from the server's read of the hop queue.
  const work = useQuery(workStatusQueryOptions());
  const workByMember = new Map(
    (work.data?.members ?? []).map((member) => [member.agentId, member]),
  );
  const team = orderTeam(agents.data ?? []);
  const t = useT();
  return (
    <ul
      aria-label={t("wide.team")}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain border-duet-hair border-t",
        full ? "px-3 py-3" : "items-center px-2 py-3",
      )}
      data-testid="team-list"
    >
      {team.map((agent) => {
        const target = memberTarget(agent, primaryId, channels);
        const state = states.get(agent.id) ?? null;
        const working = workByMember.get(agent.id);
        let dot = dotState(working, state === "waiting", state === "working");
        if (
          dot === "idle" &&
          justDone(work.data?.handoffs ?? [], agent.id, Date.now())
        )
          dot = "done";
        const tip = dotTooltip(dot, working);
        const line =
          dot === "stuck" || (dot === "working" && working?.title)
            ? tip
            : state
              ? state === "waiting"
                ? t("wide.stateWaiting")
                : t("wide.stateWorking")
              : agent.title;
        const body = (
          <>
            <span className="relative">
              <MemberFace agentId={agent.id} size={40} />
              <WorkDot state={dot} title={tip} />
            </span>
            {full ? (
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold text-[15px] leading-5">
                  {agent.name}
                </span>
                <span
                  className={cn(
                    "block truncate text-[13px] leading-4",
                    state === "waiting" || dot === "stuck"
                      ? "font-semibold text-[var(--wide-coral)]"
                      : "text-duet-ink-2",
                  )}
                >
                  {line}
                </span>
              </span>
            ) : null}
          </>
        );
        const className = cn(
          "flex items-center rounded-[20px] transition-colors hover:bg-duet-tile [--wide-coral:#c8402a] dark:[--wide-coral:#f2907c]",
          full ? "min-h-12 gap-3 px-2 py-1" : "size-12 justify-center",
          FOCUS,
        );
        const label = t("wide.memberLabel", { name: agent.name, line });
        return (
          <li key={agent.id}>
            {target.to === "/" ? (
              <Link
                activeOptions={{ exact: true }}
                activeProps={{ className: "bg-duet-tile" }}
                aria-label={label}
                className={className}
                title={full ? undefined : label}
                to="/"
              >
                {body}
              </Link>
            ) : target.to === "/channel/$channelId" ? (
              <Link
                activeProps={{ className: "bg-duet-tile" }}
                aria-label={label}
                className={className}
                params={{ channelId: target.channelId }}
                title={full ? undefined : label}
                to="/channel/$channelId"
              >
                {body}
              </Link>
            ) : (
              <Link
                aria-label={label}
                className={className}
                search={{ agent: target.agent }}
                title={full ? undefined : label}
                to="/channel/new"
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The foot of the column: the channels the person made, New channel, Archived, Manage and Settings,
 * which are the phone menu's own rows, so every place it opens is one press from here too.
 */
export function Places({ onNewChannel }: { onNewChannel: () => void }) {
  const navigate = useNavigate();
  const t = useT();
  const { data: user } = useQuery(currentUserQueryOptions());
  const { data: capabilities } = useQuery(deploymentCapabilitiesQueryOptions());
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const manage = useRememberedGroup(MANAGE_STORAGE_KEY);
  const archived = useRememberedGroup(ARCHIVED_STORAGE_KEY);
  const unarchive = useMutation(archiveDuetChannelMutationOptions(queryClient));
  const { bot, list } = useDuetChannels();
  const all = [...(list.data?.channels ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  const current = all.filter((c) => c.dressed && c.archivedAt === null);
  const away = all
    .filter((c) => c.dressed && c.archivedAt !== null)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const earlier = all
    .filter((c) => !c.dressed && c.lastMessageAt !== null)
    .sort((a, b) =>
      (b.lastMessageAt ?? b.createdAt).localeCompare(
        a.lastMessageAt ?? a.createdAt,
      ),
    );
  const channelsId = useId();
  const none = () => {};
  return (
    <div
      className="flex max-h-[45%] min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-duet-hair border-t px-3 py-2"
      data-testid="column-places"
    >
      {current.length > 0 ? (
        <ul
          aria-label={t("shell.channels")}
          className="flex flex-col"
          id={channelsId}
        >
          {current.map((channel) => (
            <li key={channel.id}>
              <ChannelLink channel={channel} onOpen={none} />
            </li>
          ))}
        </ul>
      ) : null}
      {bot ? (
        <button
          className={cn(ROW, FOCUS, "shrink-0")}
          onClick={onNewChannel}
          type="button"
        >
          <RowIcon name="plus" />
          {t("shell.newChannel")}
        </button>
      ) : null}
      {away.length > 0 || earlier.length > 0 ? (
        <>
          <h2>
            <button
              aria-controls={archived.id}
              aria-expanded={archived.open}
              className={cn(ROW, FOCUS)}
              onClick={archived.toggle}
              type="button"
            >
              <IconArchive />
              {t("shell.archived")}
              <IconChevronRight
                aria-hidden
                className={cn(
                  "ml-auto transition-transform motion-reduce:transition-none",
                  archived.open && "rotate-90",
                )}
              />
            </button>
          </h2>
          <div hidden={!archived.open} id={archived.id}>
            <ul
              aria-label={t("shell.archivedChannels")}
              className="flex flex-col"
            >
              {away.map((channel) => (
                <li className="flex items-center gap-1" key={channel.id}>
                  <ChannelLink
                    channel={channel}
                    className={cn(TALL_ROW, "min-w-0 flex-1")}
                    onOpen={none}
                  />
                  <button
                    aria-label={t("shell.unarchiveNamed", {
                      name: channel.name,
                    })}
                    className={cn(
                      "type-label shrink-0 rounded-full px-3 py-1.5 font-semibold text-duet-ink-2 transition-colors hover:bg-duet-tile disabled:opacity-50",
                      FOCUS,
                    )}
                    disabled={
                      unarchive.isPending &&
                      unarchive.variables?.id === channel.id
                    }
                    onClick={() =>
                      unarchive.mutate({ id: channel.id, archived: false })
                    }
                    type="button"
                  >
                    {t("shell.unarchive")}
                  </button>
                </li>
              ))}
            </ul>
            {earlier.length > 0 && archived.open ? (
              <ul aria-label={t("shell.earlier")} className="flex flex-col">
                {earlier.map((conversation) => (
                  <li key={conversation.id}>
                    <EarlierLink conversation={conversation} onOpen={none} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="mt-1 flex flex-col border-duet-hair border-t pt-1">
        {/* FreeDuet's own package has no Manage group: each page is a row in Settings. */}
        {showsManageGroup() ? (
          <>
            <h2>
              <button
                aria-controls={manage.id}
                aria-expanded={manage.open}
                className={cn(ROW, FOCUS)}
                onClick={manage.toggle}
                type="button"
              >
                <DuetIcon
                  className={cn(
                    "transition-transform motion-reduce:transition-none",
                    manage.open && "rotate-90",
                  )}
                  name="chevronRight"
                  size={22}
                />
                {t("shell.manage")}
                {manage.open ? null : <BotsNavBadge />}
              </button>
            </h2>
            <div className="flex flex-col" hidden={!manage.open} id={manage.id}>
              {MANAGE_PAGES.map((page) => (
                <Link
                  activeProps={{ className: "bg-duet-tile" }}
                  className={cn(ROW, FOCUS)}
                  key={page.label}
                  to={page.to}
                >
                  <RowIcon name={page.icon} />
                  {page.key18n ? t(page.key18n) : page.label}
                  {page.badge}
                </Link>
              ))}
              {user?.role === "admin" ? (
                <Link
                  activeProps={{ className: "bg-duet-tile" }}
                  className={cn(ROW, FOCUS)}
                  to="/admin"
                >
                  <RowIcon name="shieldLock" />
                  {t("nav.admin")}
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
        <Link
          activeProps={{ className: "bg-duet-tile" }}
          className={cn(ROW, FOCUS)}
          to="/settings"
        >
          <RowIcon name="settings" />
          {t("nav.settings")}
          {/* Where Manage is hidden (FreeDuet's package), the Bots badge rides on this row (D133). */}
          {showsManageGroup() ? null : <BotsNavBadge />}
        </Link>
        {capabilities?.localEvaluation === false ? (
          <button
            className={cn(ROW, FOCUS)}
            disabled={signOut.isPending}
            onClick={async () => {
              await signOut.mutateAsync();
              await navigate({ to: "/sign" });
            }}
            type="button"
          >
            <RowIcon name="logout" />
            {t("shell.signOut")}
          </button>
        ) : null}
        <BuildLabel />
      </div>
    </div>
  );
}
