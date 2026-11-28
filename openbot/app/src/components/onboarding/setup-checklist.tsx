import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactNode, useState } from "react";
import { englishT, type T, useT } from "@/freeduet/i18n/provider";
import { GmailLogo, GoogleCalendarLogo } from "@/components/duet/google-logos";
import type { DuetIconName } from "@/components/duet/icons";
import { DuetCard, OutcomePill, Tile } from "@/components/duet/kit";
import { deliveryQueryOptions } from "@/lib/delivery";
import { appConfig } from "@/lib/generated/application-config";
import { connectAccountMutationOptions } from "@/lib/plugins/mutations";
import { recheckSetupMutationOptions } from "@/lib/setup/mutations";
import {
  type NotificationPermissionState,
  refreshNotificationPermission,
  requestNotificationPermission,
  useNotificationPermission,
} from "@/lib/setup/notifications";
import {
  type SetupFix,
  type SetupRow,
  type SetupRowId,
  setupChecklistQueryOptions,
} from "@/lib/setup/queries";

const ICONS: Record<SetupRowId, DuetIconName> = {
  intelligence: "bulb",
  model: "waveform",
  google: "lock",
  gmail: "mail",
  notifications: "inbox",
  computer: "globe",
  apps: "plus",
  chat: "chat",
};

const PRODUCT = appConfig.brand.productName;

/**
 * What this deployment has, and what still needs setting up: one row each, Ready or Needs setup.
 *
 * Onboarding ends on it and Settings opens it again. The rows, their sentences and their fixes are
 * the server's (see `lib/setup/queries.ts`): this draws them, and holds the two things only a browser
 * can do, which are starting a connection and checking again.
 *
 * NOTHING HERE BLOCKS ANYTHING. A required gap is drawn plainly, in red, and the page around it still
 * lets the person carry on: they cannot set a server's environment from a browser, and keeping them
 * out of the app would not set it either.
 *
 * DRAWN IN THE DUET CARD ON BOTH SCREENS, INCLUDING SETTINGS, which otherwise lays its rows out with
 * `PageRows`. It is one list in two places, and drawing it twice would be two lists to keep in step.
 */
export function SetupChecklist({
  returnTo,
  openPage,
  leaveFor = (url) => window.location.assign(url),
  notice,
}: {
  /** Which screen a connection's consent comes back to: onboarding's checklist, or Settings › Setup. */
  returnTo: "onboarding" | "settings-setup";
  /** Opens one of the app's own screens. Onboarding finishes first, since it cannot be left open. */
  openPage: (path: string) => void;
  /** Where the browser goes to approve a connection: the vendor's own page. */
  leaveFor?: (url: string) => void;
  /** Said above the list, such as a connection that came back failed. */
  notice?: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const checklist = useQuery(setupChecklistQueryOptions());
  const recheck = useMutation(recheckSetupMutationOptions(queryClient));
  const notifications = useNotificationsRow(t);
  const [dismissed, setDismissed] = useState<SetupRowId[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useMutation({
    ...connectAccountMutationOptions(returnTo),
    onError: (error: Error) => setProblem(error.message),
    onSuccess: (url) => {
      if (url === null) {
        setProblem(t("onboarding.checklist.noStart"));
        return;
      }
      leaveFor(url);
    },
  });

  /*
   * Check again asks the server to ask Intelligence and the model provider again, which a plain
   * refetch would not: those two answers are kept from the last time they were asked. A checklist
   * that could not be read at all is read again first.
   */
  const checking = checklist.isFetching || recheck.isPending;
  const checkAgain = (
    <button
      className="type-label h-9 self-center rounded-full px-4 font-semibold text-duet-ink-2 outline-none transition-colors hover:bg-duet-tile hover:text-duet-ink focus-visible:ring-3 focus-visible:ring-duet-violet/40 disabled:opacity-50"
      disabled={checking}
      onClick={() => {
        setProblem(null);
        refreshNotificationPermission();
        void notifications.refetch();
        if (checklist.error) void checklist.refetch();
        else recheck.mutate();
      }}
      type="button"
    >
      {checking
        ? t("onboarding.checklist.checking")
        : t("onboarding.checklist.checkAgain")}
    </button>
  );

  const said =
    problem ??
    (recheck.error ? t("onboarding.checklist.recheckFailed") : null) ??
    notice;
  const rows = checklist.data
    ? withNotifications(checklist.data.rows, notifications.row)
    : [];

  return (
    <div className="flex w-full flex-col gap-3">
      {said ? (
        <p className="type-sub px-1 text-duet-red" role="alert">
          {said}
        </p>
      ) : null}
      {checklist.isPending ? null : checklist.error ? (
        <>
          <p className="type-sub px-1 text-duet-red" role="alert">
            {t("onboarding.checklist.readFailed")}
          </p>
          {checkAgain}
        </>
      ) : (
        <>
          <p className="type-sub px-1 text-duet-ink-2" role="status">
            {summaryOf(rows, t)}
          </p>
          <DuetCard>
            <ul aria-label={t("onboarding.checklist.aria")}>
              {rows.map((row) => (
                <SetupItem
                  connecting={connect.isPending}
                  dismissed={dismissed.includes(row.id)}
                  key={row.id}
                  onConnect={(serverId) => {
                    setProblem(null);
                    connect.mutate(serverId);
                  }}
                  onDismiss={() =>
                    setDismissed((current) => [...current, row.id])
                  }
                  openPage={openPage}
                  row={row}
                />
              ))}
            </ul>
          </DuetCard>
          {checkAgain}
        </>
      )}
    </div>
  );
}

/** One line over the card, so the state of the whole list is said before its rows are read. */
function summaryOf(rows: SetupRow[], t: T = englishT): string {
  const gaps = rows.filter((row) => row.status === "needs_setup");
  const unchecked = rows.filter((row) => row.status === "not_checked").length;
  const notChecked =
    unchecked === 0
      ? null
      : t("onboarding.checklist.unchecked", { count: unchecked });
  if (gaps.length === 0) return notChecked ?? t("onboarding.checklist.allSet");
  const required = gaps.filter((row) => row.required).length;
  const things = t("onboarding.checklist.gaps", { count: gaps.length });
  const needs =
    required > 0
      ? t("onboarding.checklist.gapsRequired", {
          gaps: things,
          required: t("onboarding.checklist.required", { count: required }),
        })
      : t("onboarding.checklist.optional", {
          count: gaps.length,
          gaps: things,
          product: PRODUCT,
        });
  return notChecked ? `${needs} ${notChecked}` : needs;
}

/** The notifications row goes with the reader's other own row, after Gmail. */
function withNotifications(rows: SetupRow[], notifications: SetupRow) {
  const at = rows.findIndex((row) => row.id === "gmail");
  return at === -1
    ? [...rows, notifications]
    : [...rows.slice(0, at + 1), notifications, ...rows.slice(at + 1)];
}

/**
 * The one row the browser decides: whether OpenDuet can tell this person something needs them.
 *
 * Ready when this browser allows notifications, or when a phone of theirs is registered for push
 * (`GET /api/delivery`). Otherwise its fix is the Get notified step's button again. Blocked and
 * unsupported say so, since no button here can change either.
 */
function useNotificationsRow(t: T = englishT): {
  row: SetupRow;
  refetch: () => unknown;
} {
  const permission = useNotificationPermission();
  const delivery = useQuery({
    ...deliveryQueryOptions(),
    refetchInterval: false,
    retry: false,
  });
  const phone =
    delivery.data?.devices.some((device) => device.enabled) === true;
  return {
    row: notificationsRow(permission, phone, t),
    refetch: delivery.refetch,
  };
}

export function notificationsRow(
  permission: NotificationPermissionState,
  phone: boolean,
  t: T = englishT,
): SetupRow {
  const row = {
    id: "notifications" as const,
    scope: "person" as const,
    title: t("onboarding.checklist.notifTitle"),
    required: false,
  };
  if (permission === "granted" || phone)
    return {
      ...row,
      status: "ready",
      ready: true,
      detail:
        permission === "granted"
          ? t("onboarding.checklist.notifBrowser", { product: PRODUCT })
          : t("onboarding.checklist.notifPhone", { product: PRODUCT }),
      fix: null,
    };
  return {
    ...row,
    status: "needs_setup",
    ready: false,
    detail:
      permission === "denied"
        ? t("onboarding.checklist.notifBlocked")
        : permission === "unsupported"
          ? t("onboarding.checklist.notifUnsupported")
          : t("onboarding.checklist.notifWithout"),
    fix: permission === "default" ? { kind: "notify" } : null,
  };
}

function SetupItem({
  row,
  dismissed,
  connecting,
  onConnect,
  onDismiss,
  openPage,
}: {
  row: SetupRow;
  dismissed: boolean;
  connecting: boolean;
  onConnect: (serverId: string) => void;
  onDismiss: () => void;
  openPage: (path: string) => void;
}) {
  const t = useT();
  const tone =
    row.status === "ready"
      ? "green"
      : row.status === "not_checked" || !row.required
        ? "amber"
        : "red";
  return (
    <li
      // The hairline between rows, lined up with the text after the tile as the kit's `Rule` is.
      className="relative flex gap-[13px] px-4 py-3.5 [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[65px] [&+&]:before:h-px [&+&]:before:bg-duet-hair-2"
      data-ready={row.ready ? "" : undefined}
      data-setup-row={row.id}
      data-status={row.status}
    >
      {row.id === "gmail" ? (
        // The apps' own marks, so the row reads as Gmail and Calendar at a glance.
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center gap-0.5"
          data-tile="gmail"
        >
          <GmailLogo size={17} />
          <GoogleCalendarLogo size={17} />
        </span>
      ) : (
        <Tile icon={ICONS[row.id]} size={36} tone={tone} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="type-row font-semibold text-duet-ink [overflow-wrap:anywhere]">
              {row.title}
            </h3>
            {row.required ? (
              <p className="type-label text-duet-ink-3">
                {t("onboarding.checklist.requiredTag")}
              </p>
            ) : null}
          </div>
          <OutcomePill icon={row.ready ? "check" : null} tone={tone}>
            {row.status === "ready"
              ? t("onboarding.checklist.ready")
              : row.status === "not_checked"
                ? t("onboarding.checklist.notChecked")
                : t("onboarding.checklist.needsSetup")}
          </OutcomePill>
        </div>
        <p className="type-sub mt-1 text-duet-ink-2 [overflow-wrap:anywhere]">
          {row.detail}
        </p>
        {!row.ready && row.fix ? (
          <Fix
            connecting={connecting}
            dismissed={dismissed}
            fix={row.fix}
            onConnect={onConnect}
            onDismiss={onDismiss}
            openPage={openPage}
          />
        ) : null}
      </div>
    </li>
  );
}

const LINK =
  "font-semibold text-duet-violet underline-offset-2 outline-none hover:underline focus-visible:underline";

/** How to close one gap: a page, the variables to set, or a connection to make here and now. */
function Fix({
  fix,
  dismissed,
  connecting,
  onConnect,
  onDismiss,
  openPage,
}: {
  fix: SetupFix;
  dismissed: boolean;
  connecting: boolean;
  onConnect: (serverId: string) => void;
  onDismiss: () => void;
  openPage: (path: string) => void;
}) {
  const t = useT();
  const around = (id: "openPage" | "orAdd", node: ReactNode) => {
    const [before = "", after = ""] = t(`onboarding.checklist.${id}`, {
      link: "\u0000",
    }).split("\u0000");
    return (
      <>
        {before}
        {node}
        {after}
      </>
    );
  };
  const page = (target: { label: string; path: string }) => (
    <a
      className={LINK}
      href={target.path}
      onClick={(event) => {
        event.preventDefault();
        openPage(target.path);
      }}
    >
      {target.label}
    </a>
  );
  const guide = (url: string) => (
    <a className={LINK} href={url} rel="noopener noreferrer" target="_blank">
      {t("onboarding.checklist.guide")}
    </a>
  );

  if (fix.kind === "connect") {
    if (dismissed) {
      return (
        <p className="type-sub mt-2 text-duet-ink-3">
          {t("onboarding.checklist.later")}
        </p>
      );
    }
    return (
      <div className="mt-3 flex gap-2">
        <button
          className="type-label h-9 rounded-full bg-duet-black px-4 font-semibold text-duet-on-black outline-none transition-[filter,transform,opacity] hover:brightness-125 focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.97] disabled:opacity-50"
          disabled={connecting}
          onClick={() => onConnect(fix.serverId)}
          type="button"
        >
          {connecting
            ? t("onboarding.checklist.connecting")
            : t("onboarding.checklist.connect")}
        </button>
        <button
          className="type-label h-9 rounded-full px-4 font-semibold text-duet-ink shadow-[inset_0_0_0_1px_var(--duet-hair)] outline-none transition-colors hover:bg-duet-tile focus-visible:ring-3 focus-visible:ring-duet-violet/40"
          onClick={onDismiss}
          type="button"
        >
          {t("onboarding.notNow")}
        </button>
      </div>
    );
  }

  if (fix.kind === "notify") {
    return (
      <div className="mt-3 flex gap-2">
        <button
          className="type-label h-9 rounded-full bg-duet-black px-4 font-semibold text-duet-on-black outline-none transition-[filter,transform,opacity] hover:brightness-125 focus-visible:ring-3 focus-visible:ring-duet-violet/40 active:scale-[0.97]"
          onClick={() => void requestNotificationPermission()}
          type="button"
        >
          {t("onboarding.checklist.turnOn")}
        </button>
      </div>
    );
  }

  if (fix.kind === "page") {
    return (
      <p className="type-sub mt-2 text-duet-ink-2">
        {around("openPage", page(fix))}{" "}
        {fix.docsUrl ? guide(fix.docsUrl) : null}
      </p>
    );
  }

  return (
    <p className="type-sub mt-2 text-duet-ink-2">
      {t("onboarding.checklist.setNames", {
        names: "\u0000",
        product: PRODUCT,
      })
        .split("\u0000")
        .flatMap((piece, index) =>
          index === 0
            ? [piece]
            : [
                <Fragment key="names">
                  {fix.names.map((name, at) => (
                    <Fragment key={name}>
                      {at > 0
                        ? at === fix.names.length - 1
                          ? t("onboarding.checklist.and")
                          : ", "
                        : null}
                      <code className="rounded-md bg-duet-tile px-1.5 py-0.5 font-mono text-[0.85em] text-duet-ink [overflow-wrap:anywhere]">
                        {name}
                      </code>
                    </Fragment>
                  ))}
                </Fragment>,
                piece,
              ],
        )}
      {fix.page ? <> {around("orAdd", page(fix.page))}</> : null}{" "}
      {guide(fix.docsUrl)}
    </p>
  );
}
