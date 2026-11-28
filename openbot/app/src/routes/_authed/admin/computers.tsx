import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { StaggerItem } from "@/components/layout/stagger";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { useBotNames } from "@/lib/agents/bot-names";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { setComputerStateMutationOptions } from "@/lib/computers/mutations";
import {
  hostAccessQueryOptions,
  requestHostFolderGrantMutationOptions,
  revokeHostFolderGrantMutationOptions,
  stopHostAccessMutationOptions,
  type HostFolderGrant,
  type HostAccessPendingOperation,
} from "@/lib/computers/host-access";
import { computerFleetQueryOptions } from "@/lib/computers/queries";
import { englishT, type T, useAppLanguage } from "@/freeduet/i18n/provider";
import { appConfig } from "@/lib/generated/application-config";

export const Route = createFileRoute("/_authed/admin/computers")({
  component: ComputersPage,
});

function ComputersPage() {
  /** Bot id currently running a stop/reset request. */
  const [busy, setBusy] = useState<string | null>(null);
  /** Reset deletes the browser profile, so it requires confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Updating restarts a running computer mid-task, so it is confirmed too. */
  const [confirmingUpdate, setConfirmingUpdate] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const nameFor = useBotNames();
  const { t, date } = useAppLanguage();

  const fleet = useQuery(computerFleetQueryOptions());
  const hostAccess = useQuery(hostAccessQueryOptions());
  const agents = useQuery(agentListQueryOptions());
  const setState = useMutation(setComputerStateMutationOptions(queryClient));
  const requestGrant = useMutation(
    requestHostFolderGrantMutationOptions(queryClient),
  );
  const revokeGrant = useMutation(
    revokeHostFolderGrantMutationOptions(queryClient),
  );
  const stopHostAccess = useMutation(
    stopHostAccessMutationOptions(queryClient),
  );

  const computers = fleet.data?.computers ?? null;
  const isolation = fleet.data?.isolation ?? null;
  /*
   * A list that could not be read. A refused stop, reset or update is said beside the buttons
   * instead, because the top of this page is a long scroll away from them.
   */
  const problem = fleet.error ? t("admin.computers.loadError") : null;
  const hostProblem = hostAccess.error
    ? hostAccess.error.message
    : requestGrant.error
      ? requestGrant.error.message
      : revokeGrant.error
        ? revokeGrant.error.message
        : stopHostAccess.error
          ? stopHostAccess.error.message
          : null;

  const run = (botId: string, action: "stop" | "reset" | "update") => {
    setBusy(botId);
    setConfirming(null);
    setConfirmingUpdate(null);
    setState.mutate({ action, botId }, { onSettled: () => setBusy(null) });
  };

  return (
    <PageShell
      description={t("admin.computers.description")}
      title={t("admin.nav.computers")}
    >
      {problem ? (
        <p
          className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          {problem}
        </p>
      ) : null}

      {isolation === "shared" ? (
        <p className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="font-medium">
            {t("admin.computers.shared.lead")}
          </span>{" "}
          {t("admin.computers.shared.before")}{" "}
          <code>COMPUTER_SUPERVISOR_URL</code>{" "}
          {t("admin.computers.shared.after")}
        </p>
      ) : isolation === "per-bot" ? (
        <p className="mt-4 rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
          {t("admin.computers.perBot")}
        </p>
      ) : null}

      <HostFoldersSection
        connected={hostAccess.data?.connected ?? false}
        grants={hostAccess.data?.grants ?? []}
        botIds={(agents.data ?? []).map((agent) => agent.id)}
        loading={hostAccess.isPending || agents.isPending}
        nameFor={nameFor}
        onGrant={(botId) => requestGrant.mutate({ botId })}
        onRevoke={(grantId) => revokeGrant.mutate({ grantId })}
        onStop={() => stopHostAccess.mutate()}
        pending={hostAccess.data?.pending ?? []}
        problem={hostProblem}
        requestingBotId={
          requestGrant.isPending
            ? (requestGrant.variables?.botId ?? null)
            : null
        }
        revokingGrantId={
          revokeGrant.isPending
            ? (revokeGrant.variables?.grantId ?? null)
            : null
        }
        stopping={stopHostAccess.isPending}
      />

      <PageSection title={t("admin.computers.list.title")}>
        {setState.error ? (
          <p
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
            role="alert"
          >
            {setState.error.message}
          </p>
        ) : null}
        {computers === null && problem ? (
          <PageEmpty>{t("admin.computers.list.error")}</PageEmpty>
        ) : computers === null ? null : computers.length === 0 ? (
          <PageEmpty>{t("admin.computers.list.empty")}</PageEmpty>
        ) : (
          <PageRows>
            {computers.map((computer, index) => (
              <StaggerItem index={index} key={computer.botId}>
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle title={computer.botId}>
                      {nameFor(computer.botId)}
                    </ItemTitle>
                    <ItemDescription>
                      {computer.running
                        ? t("admin.computers.running", {
                            time: date(new Date(computer.startedAt ?? ""), {
                              timeStyle: "medium",
                            }),
                          })
                        : t("admin.computers.notRunning")}
                      {" · "}
                      {computer.egress === undefined
                        ? t("admin.computers.egress.unknown")
                        : computer.egress === null
                          ? t("admin.computers.egress.direct")
                          : t("admin.computers.egress.via", {
                              egress: computer.egress,
                            })}
                      {computer.updateAvailable
                        ? ` · ${t("admin.computers.updateAvailable")}`
                        : ""}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    {computer.updateAvailable ? (
                      <Button
                        disabled={busy === computer.botId}
                        onClick={() => setConfirmingUpdate(computer.botId)}
                        size="sm"
                        variant="outline"
                      >
                        {t("admin.computers.update")}
                      </Button>
                    ) : null}
                    <Button
                      disabled={busy === computer.botId || !computer.running}
                      onClick={() => void run(computer.botId, "stop")}
                      size="sm"
                      variant="outline"
                    >
                      {busy === computer.botId
                        ? t("admin.computers.working")
                        : t("admin.computers.stop")}
                    </Button>
                    <Button
                      disabled={busy === computer.botId}
                      onClick={() => setConfirming(computer.botId)}
                      size="sm"
                      variant="outline"
                    >
                      {t("admin.computers.reset")}
                    </Button>
                  </ItemActions>
                </Item>
                {index !== computers.length - 1 && <Separator />}
              </StaggerItem>
            ))}
          </PageRows>
        )}
      </PageSection>

      {/*
       * A DIALOG RATHER THAN AN INLINE CONFIRM. Resetting signs a Bot out of everything it has ever
       * logged into and cannot be undone, and the row it was confirmed on was one of several
       * identical-looking rows. The dialog names the Bot, so the sentence somebody agrees to says
       * which computer it destroys.
       */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        open={confirming !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.computers.resetTitle", {
                name: confirming ? nameFor(confirming) : "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.computers.resetDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirming(null)}
              size="sm"
              variant="ghost"
            >
              {t("settings.cancel")}
            </Button>
            <Button
              disabled={busy === confirming}
              onClick={() => {
                if (confirming) void run(confirming, "reset");
              }}
              size="sm"
              variant="destructive"
            >
              {busy === confirming
                ? t("admin.computers.resetting")
                : t("admin.computers.resetIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirmingUpdate(null);
        }}
        open={confirmingUpdate !== null}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("admin.computers.updateTitle", {
                name: confirmingUpdate ? nameFor(confirmingUpdate) : "",
              })}
            </DialogTitle>
            <DialogDescription>
              {t("admin.computers.updateDesc")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setConfirmingUpdate(null)}
              size="sm"
              variant="ghost"
            >
              {t("settings.cancel")}
            </Button>
            <Button
              disabled={busy === confirmingUpdate}
              onClick={() => {
                if (confirmingUpdate) void run(confirmingUpdate, "update");
              }}
              size="sm"
            >
              {busy === confirmingUpdate
                ? t("admin.computers.updating")
                : t("admin.computers.updateIt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-muted-foreground text-sm">
        <strong>{t("admin.computers.foot.stopLead")}</strong>{" "}
        {t("admin.computers.foot.stopRest")}{" "}
        <strong>{t("admin.computers.foot.resetLead")}</strong>{" "}
        {t("admin.computers.foot.resetRest")}{" "}
        <strong>{t("admin.computers.foot.updateLead")}</strong>{" "}
        {t("admin.computers.foot.updateRest")} {t("admin.computers.foot.audit")}{" "}
        <Link className="underline" to="/admin/audit">
          {t("admin.nav.audit")}
        </Link>
        .
      </p>
    </PageShell>
  );
}

type HostFoldersSectionProps = {
  botIds: string[];
  connected: boolean;
  grants: HostFolderGrant[];
  loading: boolean;
  nameFor: (botId: string) => string;
  onGrant: (botId: string) => void;
  onRevoke: (grantId: string) => void;
  onStop: () => void;
  pending: HostAccessPendingOperation[];
  problem: string | null;
  requestingBotId: string | null;
  revokingGrantId: string | null;
  stopping: boolean;
};

function HostFoldersSection({
  botIds: knownBotIds,
  connected,
  grants,
  loading,
  nameFor,
  onGrant,
  onRevoke,
  onStop,
  pending,
  problem,
  requestingBotId,
  revokingGrantId,
  stopping,
}: HostFoldersSectionProps) {
  const { t } = useAppLanguage();
  const botIds = Array.from(
    new Set([
      ...knownBotIds,
      ...grants.map((grant) => grant.botId),
      ...pending.map((one) => one.botId),
    ]),
  ).sort((left, right) => nameFor(left).localeCompare(nameFor(right)));

  return (
    <PageSection
      description={t("admin.computers.host.description", {
        product: appConfig.brand.productName,
      })}
      title={t("admin.computers.host.title")}
    >
      {problem ? (
        <p
          className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
          role="alert"
        >
          {problem}
        </p>
      ) : null}

      {!connected && !loading ? (
        <p className="mb-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          {t("admin.computers.host.offline")}
        </p>
      ) : null}

      {loading ? null : botIds.length === 0 ? (
        <PageEmpty>{t("admin.computers.host.noBots")}</PageEmpty>
      ) : (
        <PageRows>
          {botIds.map((botId, index) => (
            <StaggerItem index={index} key={botId}>
              <Item size="sm">
                <ItemContent>
                  <ItemTitle title={botId}>{nameFor(botId)}</ItemTitle>
                  <ItemDescription>
                    {summaryFor(botId, grants, pending, t)}
                  </ItemDescription>
                  <FolderGrantList
                    botId={botId}
                    grants={grants}
                    onRevoke={onRevoke}
                    pending={pending}
                    revokingGrantId={revokingGrantId}
                  />
                </ItemContent>
                <ItemActions>
                  <Button
                    disabled={!connected || requestingBotId === botId}
                    onClick={() => onGrant(botId)}
                    size="sm"
                    variant="outline"
                  >
                    {requestingBotId === botId
                      ? t("admin.computers.host.waiting")
                      : t("admin.computers.host.choose")}
                  </Button>
                </ItemActions>
              </Item>
              {index !== botIds.length - 1 && <Separator />}
            </StaggerItem>
          ))}
        </PageRows>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
        <p>{t("admin.computers.host.readOnlyNote")}</p>
        <div className="flex items-center gap-3">
          <Button
            disabled={!connected || stopping}
            onClick={onStop}
            size="sm"
            variant="outline"
          >
            {stopping
              ? t("admin.computers.host.stopping")
              : t("admin.computers.host.stopAccess")}
          </Button>
          <Link className="underline" to="/admin/audit">
            {t("admin.computers.host.viewAudit")}
          </Link>
        </div>
      </div>
    </PageSection>
  );
}

function FolderGrantList({
  botId,
  grants,
  onRevoke,
  pending,
  revokingGrantId,
}: {
  botId: string;
  grants: HostFolderGrant[];
  onRevoke: (grantId: string) => void;
  pending: HostAccessPendingOperation[];
  revokingGrantId: string | null;
}) {
  const { t } = useAppLanguage();
  const botGrants = grants.filter(
    (grant) => grant.botId === botId && !grant.revoked,
  );
  const botPending = pending.filter((request) => request.botId === botId);

  if (botGrants.length === 0 && botPending.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {botGrants.map((grant) => (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2"
          key={grant.id}
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{grant.displayName}</p>
            <p className="text-muted-foreground text-xs">
              {ownerLabel(grant, t)} · {t("admin.computers.host.readOnly")}
            </p>
          </div>
          <Button
            disabled={revokingGrantId === grant.id}
            onClick={() => onRevoke(grant.id)}
            size="sm"
            variant="ghost"
          >
            {revokingGrantId === grant.id
              ? t("admin.computers.host.revoking")
              : t("admin.computers.host.revoke")}
          </Button>
        </div>
      ))}
      {botPending.map((request) => (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
          key={request.operationId}
        >
          {request.displayName
            ? t("admin.computers.host.pendingFromFor", {
                label: pendingLabel(request, t),
                name: request.displayName,
                owner: ownerLabel(request, t),
              })
            : t("admin.computers.host.pendingFrom", {
                label: pendingLabel(request, t),
                owner: ownerLabel(request, t),
              })}
        </div>
      ))}
    </div>
  );
}

function summaryFor(
  botId: string,
  grants: HostFolderGrant[],
  pending: HostAccessPendingOperation[],
  t: T = englishT,
) {
  const active = grants.filter(
    (grant) => grant.botId === botId && !grant.revoked,
  ).length;
  const waiting = pending.filter((request) => request.botId === botId).length;
  const parts = [];
  if (active > 0)
    parts.push(t("admin.computers.host.folders", { count: active }));
  if (waiting > 0)
    parts.push(t("admin.computers.host.requests", { count: waiting }));
  return parts.length > 0 ? parts.join(" · ") : t("admin.computers.host.none");
}

function ownerLabel(
  grant: { ownerName?: string; ownerEmail?: string },
  t: T = englishT,
) {
  return grant.ownerName ?? grant.ownerEmail ?? t("admin.computers.host.owner");
}

function pendingLabel(request: HostAccessPendingOperation, t: T = englishT) {
  switch (request.kind) {
    case "write_file":
      return t("admin.computers.host.p.write");
    case "run_command":
      return t("admin.computers.host.p.run");
    case "list_files":
      return t("admin.computers.host.p.list");
    case "read_file":
      return t("admin.computers.host.p.read");
    case "cancel":
    case "stop":
      return t("admin.computers.host.p.stop");
    default:
      return t("admin.computers.host.p.default");
  }
}
