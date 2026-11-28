import {
  IconChartBar,
  IconChevronRight,
  IconDeviceDesktop,
  IconFingerprint,
  IconKey,
  IconNetwork,
  IconPlug,
  IconShieldLock,
  IconTerminal2,
  IconToggleRight,
  IconUsersGroup,
  IconWorld,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  removeNetworkPolicyMutationOptions,
  setCapabilityMutationOptions,
  setEnterpriseSettingMutationOptions,
  setNetworkPolicyMutationOptions,
  terminateInactiveComputersMutationOptions,
} from "@/lib/enterprise/mutations";
import {
  actionRecordsQueryOptions,
  type CapabilitySetting,
  type EgressRule,
  type EnterpriseOverview,
  enterpriseOverviewQueryOptions,
  modelUsageQueryOptions,
  type NetworkMode,
  type NetworkPolicy,
} from "@/lib/enterprise/queries";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { queryClient } from "@/query-client";

export const Route = createFileRoute("/_authed/admin/enterprise")({
  component: EnterprisePage,
});

const MODE_NAMES: Record<NetworkMode, MessageId> = {
  allow_all: "admin.enterprise.mode.allow_all",
  defaults_plus_allowlist: "admin.enterprise.mode.defaults_plus_allowlist",
  allowlist_only: "admin.enterprise.mode.allowlist_only",
};

type T = ReturnType<typeof useAppLanguage>["t"];

/** One rule per line: `example.com`, `*.corp.example`, or `10.0.0.0/8 443,8443`. */
function rulesFromText(text: string): EgressRule[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [value = "", ports] = line.split(/\s+/, 2);
      return /^[\d.:a-fA-F]+(\/\d+)?$/.test(value) &&
        /[\d]/.test(value) &&
        /[.:]/.test(value)
        ? { type: "cidr" as const, value, ...(ports ? { ports } : {}) }
        : { type: "domain" as const, value };
    });
}

function rulesToText(rules: EgressRule[]): string {
  return rules
    .map((rule) =>
      rule.type === "domain"
        ? rule.value
        : `${rule.value}${rule.ports ? ` ${rule.ports}` : ""}`,
    )
    .join("\n");
}

function summarizePolicy(policy: NetworkPolicy | undefined, t: T): string {
  if (!policy) return t("admin.enterprise.noPolicy");
  const count = policy.rules.length;
  return `${t(MODE_NAMES[policy.mode])} · ${t("bot.settings.ruleCount", { count })}${policy.locked ? t("admin.enterprise.locked") : ""}`;
}

function EnterprisePage() {
  const { t } = useAppLanguage();
  const overview = useQuery(enterpriseOverviewQueryOptions());
  const setCapability = useMutation(setCapabilityMutationOptions(queryClient));
  const setSetting = useMutation(
    setEnterpriseSettingMutationOptions(queryClient),
  );
  const failure = setCapability.error ?? setSetting.error;

  return (
    <PageShell
      description={t("admin.enterprise.description")}
      title={t("admin.enterprise.title")}
    >
      {failure ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {failure.message}
        </p>
      ) : null}
      {overview.isPending ? null : overview.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {t("admin.enterprise.loadError")}
        </p>
      ) : (
        <EnterpriseSections
          data={overview.data}
          onCapability={(capability, allowed) =>
            setCapability.mutate({
              scopeKind: "organization",
              scopeId: "",
              capability,
              allowed,
            })
          }
          onSetting={(key, value) => setSetting.mutate({ key, value })}
          saving={setCapability.isPending || setSetting.isPending}
        />
      )}
    </PageShell>
  );
}

function EnterpriseSections({
  data,
  onCapability,
  onSetting,
  saving,
}: {
  data: EnterpriseOverview;
  onCapability: (
    capability: CapabilitySetting["capability"],
    allowed: boolean,
  ) => void;
  onSetting: (
    key: keyof EnterpriseOverview["settings"],
    value: unknown,
  ) => void;
  saving: boolean;
}) {
  const { t } = useAppLanguage();
  const [overridesOpen, setOverridesOpen] = useState(false);
  const [networkScope, setNetworkScope] = useState<
    { scopeKind: "organization" | "group"; scopeId: string } | undefined
  >();
  const [modelsOpen, setModelsOpen] = useState(false);
  const [daysOpen, setDaysOpen] = useState(false);
  const { settings } = data;
  const overrideCount = data.capabilities.reduce(
    (count, capability) =>
      count +
      Object.keys(capability.roles).length +
      Object.keys(capability.groups).length,
    0,
  );
  const organizationPolicy = data.network.find(
    (row) => row.scopeKind === "organization",
  );
  const groupPolicies = data.network.filter((row) => row.scopeKind === "group");

  return (
    <>
      <PageSection
        description={t("admin.enterprise.signin.description", {
          env: "INITIAL_ADMIN_EMAILS",
        })}
        title={t("admin.enterprise.signin.title")}
      >
        <PageRows>
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconShieldLock />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.sso.title")}</ItemTitle>
              <ItemDescription>
                {settings.ssoRequired
                  ? t("admin.enterprise.sso.on")
                  : t("admin.enterprise.sso.off")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("admin.enterprise.sso.title")}
                checked={settings.ssoRequired}
                disabled={saving}
                onCheckedChange={(checked) => onSetting("ssoRequired", checked)}
              />
            </ItemActions>
          </Item>
          <Separator />
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconFingerprint />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.scim.title")}</ItemTitle>
              <ItemDescription className="line-clamp-none">
                {data.scim.configured
                  ? t("admin.enterprise.scim.on", {
                      url:
                        data.scim.baseUrl ??
                        t("admin.enterprise.scim.unsetUrl"),
                      env: "SCIM_BEARER_TOKEN",
                    })
                  : t("admin.enterprise.scim.off", {
                      env: "SCIM_BEARER_TOKEN",
                    })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-muted-foreground text-sm">
                {data.scim.configured
                  ? t("admin.enterprise.on")
                  : t("admin.enterprise.off")}
              </span>
            </ItemActions>
          </Item>
        </PageRows>
      </PageSection>

      <PageSection
        description={t("admin.enterprise.cap.description")}
        title={t("admin.enterprise.cap.title")}
      >
        <PageRows>
          {data.capabilities.map((capability) => {
            const effective = capability.organization ?? capability.default;
            return (
              <div key={capability.capability}>
                <Item size="sm">
                  <ItemMedia variant="icon">
                    <IconToggleRight />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{capability.title}</ItemTitle>
                    <ItemDescription>
                      {effective
                        ? capability.description
                        : t("admin.enterprise.cap.offFor")}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      aria-label={capability.title}
                      checked={effective}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        onCapability(capability.capability, checked)
                      }
                    />
                  </ItemActions>
                </Item>
                <Separator />
              </div>
            );
          })}
          <Item
            render={
              <button onClick={() => setOverridesOpen(true)} type="button" />
            }
            size="sm"
          >
            <ItemMedia variant="icon">
              <IconUsersGroup />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.over.title")}</ItemTitle>
              <ItemDescription>
                {overrideCount === 0
                  ? t("admin.enterprise.over.none")
                  : t("admin.enterprise.over.set", { count: overrideCount })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        </PageRows>
      </PageSection>

      <PageSection
        description={t("admin.enterprise.net.description")}
        title={t("admin.enterprise.net.title")}
      >
        <PageRows>
          <Item
            render={
              <button
                onClick={() =>
                  setNetworkScope({ scopeKind: "organization", scopeId: "" })
                }
                type="button"
              />
            }
            size="sm"
          >
            <ItemMedia variant="icon">
              <IconWorld />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.net.org")}</ItemTitle>
              <ItemDescription>
                {summarizePolicy(organizationPolicy, t)}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
          {groupPolicies.map((policy) => (
            <div key={policy.scopeId}>
              <Separator />
              <Item
                render={
                  <button
                    onClick={() =>
                      setNetworkScope({
                        scopeKind: "group",
                        scopeId: policy.scopeId,
                      })
                    }
                    type="button"
                  />
                }
                size="sm"
              >
                <ItemMedia variant="icon">
                  <IconNetwork />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {t("admin.enterprise.net.group", { name: policy.scopeId })}
                  </ItemTitle>
                  <ItemDescription>
                    {summarizePolicy(policy, t)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            </div>
          ))}
        </PageRows>
        {data.groups.length > 0 ? (
          <Button
            className="mt-4"
            onClick={() => setNetworkScope({ scopeKind: "group", scopeId: "" })}
            size="sm"
            variant="outline"
          >
            {t("admin.enterprise.net.addGroup")}
          </Button>
        ) : null}
      </PageSection>

      <PageSection
        description={t("admin.enterprise.mcp.description")}
        title={t("admin.enterprise.mcp.title")}
      >
        <PageRows>
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconPlug />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.mcp.only")}</ItemTitle>
              <ItemDescription>
                {settings.mcpAllowlist.enabled
                  ? t("admin.enterprise.mcp.approved", {
                      count: settings.mcpAllowlist.servers.length,
                    })
                  : t("admin.enterprise.mcp.offDesc")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("admin.enterprise.mcp.onlyAria")}
                checked={settings.mcpAllowlist.enabled}
                disabled={saving}
                onCheckedChange={(enabled) =>
                  onSetting("mcpAllowlist", {
                    ...settings.mcpAllowlist,
                    enabled,
                  })
                }
              />
            </ItemActions>
          </Item>
          {data.mcpServers.map((server) => {
            const approved = settings.mcpAllowlist.servers.includes(server.id);
            return (
              <div key={server.id}>
                <Separator />
                <Item size="sm">
                  <ItemMedia variant="icon">
                    <IconKey />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{server.title}</ItemTitle>
                    <ItemDescription>{server.url}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Switch
                      aria-label={t("admin.enterprise.mcp.approveAria", {
                        name: server.title,
                      })}
                      checked={approved}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        onSetting("mcpAllowlist", {
                          ...settings.mcpAllowlist,
                          servers: checked
                            ? [...settings.mcpAllowlist.servers, server.id]
                            : settings.mcpAllowlist.servers.filter(
                                (id) => id !== server.id,
                              ),
                        })
                      }
                    />
                  </ItemActions>
                </Item>
              </div>
            );
          })}
        </PageRows>
      </PageSection>

      <PageSection
        description={t("admin.enterprise.models.description", {
          model: data.builtInModel ?? t("admin.enterprise.models.configured"),
        })}
        title={t("admin.enterprise.models.title")}
      >
        <PageRows>
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconShieldLock />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.models.allowlist")}</ItemTitle>
              <ItemDescription>
                {settings.modelAllowlist.enabled
                  ? t("admin.enterprise.models.allowlistOn")
                  : t("admin.enterprise.models.allowlistOff")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("admin.enterprise.models.allowlist")}
                checked={settings.modelAllowlist.enabled}
                disabled={saving}
                onCheckedChange={(enabled) =>
                  onSetting("modelAllowlist", {
                    ...settings.modelAllowlist,
                    enabled,
                  })
                }
              />
            </ItemActions>
          </Item>
          <Separator />
          <Item
            render={
              <button onClick={() => setModelsOpen(true)} type="button" />
            }
            size="sm"
          >
            <ItemMedia variant="icon">
              <IconKey />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.models.allowed")}</ItemTitle>
              <ItemDescription>
                {settings.modelAllowlist.models.length === 0
                  ? t("admin.enterprise.models.none")
                  : settings.modelAllowlist.models.join(", ")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        </PageRows>
        <ModelUsage />
      </PageSection>

      <PageSection
        description={t("admin.enterprise.rec.description", {
          env: "OTEL_EXPORTER_OTLP_ENDPOINT",
          tag: "openbot.surface",
        })}
        title={t("admin.enterprise.rec.title")}
      >
        <PageRows>
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconTerminal2 />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.rec.action")}</ItemTitle>
              <ItemDescription>
                {settings.actionRecording
                  ? t("admin.enterprise.rec.actionOn", {
                      days: data.actionRecordRetentionDays,
                    })
                  : t("admin.enterprise.rec.actionOff")}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("admin.enterprise.rec.action")}
                checked={settings.actionRecording}
                disabled={saving}
                onCheckedChange={(checked) =>
                  onSetting("actionRecording", checked)
                }
              />
            </ItemActions>
          </Item>
          <Separator />
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconChartBar />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.rec.otel")}</ItemTitle>
              <ItemDescription>
                {data.otel.configured
                  ? t("admin.enterprise.rec.otelOn")
                  : t("admin.enterprise.rec.otelOff", {
                      env: "OTEL_EXPORTER_OTLP_ENDPOINT",
                    })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-muted-foreground text-sm">
                {data.otel.configured
                  ? t("admin.enterprise.on")
                  : t("admin.enterprise.off")}
              </span>
            </ItemActions>
          </Item>
        </PageRows>
        {settings.actionRecording ? <RecordedActions /> : null}
      </PageSection>

      <PageSection
        description={t("admin.enterprise.comp.description")}
        title={t("admin.enterprise.comp.title")}
      >
        <PageRows>
          <Item
            render={<button onClick={() => setDaysOpen(true)} type="button" />}
            size="sm"
          >
            <ItemMedia variant="icon">
              <IconDeviceDesktop />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.enterprise.comp.stopInactive")}</ItemTitle>
              <ItemDescription>
                {settings.inactiveComputerDays === 0
                  ? t("admin.enterprise.off")
                  : t("admin.enterprise.comp.afterDays", {
                      days: settings.inactiveComputerDays,
                    })}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <IconChevronRight className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        </PageRows>
        <SweepNow />
      </PageSection>

      <OverridesDialog
        data={data}
        onOpenChange={setOverridesOpen}
        open={overridesOpen}
      />
      {networkScope ? (
        <NetworkDialog
          data={data}
          initial={networkScope}
          onClose={() => setNetworkScope(undefined)}
        />
      ) : null}
      <ListDialog
        description={t("admin.enterprise.models.listDesc", {
          example: "openai/gpt-5.6-terra",
        })}
        initial={settings.modelAllowlist.models}
        onClose={() => setModelsOpen(false)}
        onSave={(models) =>
          onSetting("modelAllowlist", { ...settings.modelAllowlist, models })
        }
        open={modelsOpen}
        title={t("admin.enterprise.models.allowed")}
      />
      <DaysDialog
        initial={settings.inactiveComputerDays}
        onClose={() => setDaysOpen(false)}
        onSave={(days) => onSetting("inactiveComputerDays", days)}
        open={daysOpen}
      />
    </>
  );
}

function ModelUsage() {
  const { t, date } = useAppLanguage();
  const usage = useQuery(modelUsageQueryOptions(30));
  if (usage.isPending) return null;
  if (usage.error)
    return (
      <p className="mt-4 text-destructive text-sm" role="alert">
        {t("admin.enterprise.usage.error")}
      </p>
    );
  if (usage.data.summary.length === 0)
    return <PageEmpty>{t("admin.enterprise.usage.empty")}</PageEmpty>;
  return (
    <PageRows>
      {usage.data.summary.map((row, index) => (
        <div key={`${row.model}-${row.source}`}>
          {index > 0 ? <Separator /> : null}
          <Item size="sm">
            <ItemMedia variant="icon">
              <IconChartBar />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{row.model}</ItemTitle>
              <ItemDescription>
                {t("admin.enterprise.usage.runs", {
                  runs: row.runs,
                  people: row.people,
                  who:
                    row.people === 1
                      ? t("admin.enterprise.usage.person")
                      : t("admin.enterprise.usage.people"),
                })}
                {row.refused > 0
                  ? t("admin.enterprise.usage.refused", {
                      count: row.refused,
                    })
                  : ""}{" "}
                · {row.source}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-muted-foreground text-sm">
                {date(new Date(row.lastUsedAt))}
              </span>
            </ItemActions>
          </Item>
        </div>
      ))}
    </PageRows>
  );
}

function RecordedActions() {
  const { t, date } = useAppLanguage();
  const actions = useQuery(actionRecordsQueryOptions());
  if (actions.isPending) return null;
  if (actions.error)
    return (
      <p className="mt-4 text-destructive text-sm" role="alert">
        {t("admin.enterprise.recorded.error")}
      </p>
    );
  if (actions.data.length === 0)
    return <PageEmpty>{t("admin.enterprise.recorded.empty")}</PageEmpty>;
  return (
    <PageRows>
      {actions.data.map((action, index) => (
        <div key={action.id}>
          {index > 0 ? <Separator /> : null}
          <Item size="sm">
            <ItemContent>
              <ItemTitle className="font-mono text-xs">
                {action.command}
              </ItemTitle>
              <ItemDescription>
                {action.surface === "local"
                  ? t("admin.enterprise.recorded.local")
                  : t("admin.enterprise.recorded.bot", {
                      id: action.botId ?? "?",
                    })}{" "}
                · {action.outcome} ·{" "}
                {date(new Date(action.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </ItemDescription>
            </ItemContent>
          </Item>
        </div>
      ))}
    </PageRows>
  );
}

function SweepNow() {
  const { t } = useAppLanguage();
  const sweep = useMutation(terminateInactiveComputersMutationOptions());
  return (
    <div className="mt-4 flex items-center gap-3">
      <Button
        disabled={sweep.isPending}
        onClick={() => sweep.mutate()}
        size="sm"
        variant="outline"
      >
        {sweep.isPending
          ? t("admin.enterprise.sweep.stopping")
          : t("admin.enterprise.sweep.now")}
      </Button>
      {sweep.data ? (
        <span className="text-muted-foreground text-sm">
          {t("admin.enterprise.sweep.stopped", {
            count: sweep.data.stopped.length,
          })}
        </span>
      ) : null}
      {sweep.error ? (
        <span className="text-destructive text-sm" role="alert">
          {sweep.error.message}
        </span>
      ) : null}
    </div>
  );
}

type Tri = "inherit" | "on" | "off";

function OverridesDialog({
  data,
  open,
  onOpenChange,
}: {
  data: EnterpriseOverview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useAppLanguage();
  const setCapability = useMutation(setCapabilityMutationOptions(queryClient));
  const scopes: { kind: "role" | "group"; id: string; label: string }[] = [
    { kind: "role", id: "admin", label: t("admin.enterprise.ov.admins") },
    { kind: "role", id: "user", label: t("admin.enterprise.ov.members") },
    ...data.groups.map((group) => ({
      kind: "group" as const,
      id: group,
      label: t("admin.enterprise.ov.group", { name: group }),
    })),
  ];
  const [scopeIndex, setScopeIndex] = useState(0);
  const scope = scopes[scopeIndex] ?? scopes[0];

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.enterprise.over.title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 space-y-4 overflow-y-auto">
          <Select
            onValueChange={(value) => setScopeIndex(Number(value))}
            value={String(scopeIndex)}
          >
            <SelectTrigger aria-label={t("admin.enterprise.ov.scope")}>
              <SelectValue>{scope?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {scopes.map((candidate, index) => (
                  <SelectItem
                    key={`${candidate.kind}:${candidate.id}`}
                    value={String(index)}
                  >
                    {candidate.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-muted-foreground text-xs">
            {scope?.kind === "group"
              ? t("admin.enterprise.ov.groupNote")
              : t("admin.enterprise.ov.roleNote")}
          </p>
          {scope
            ? data.capabilities.map((capability) => {
                const stored =
                  scope.kind === "role"
                    ? capability.roles[scope.id as "admin" | "user"]
                    : capability.groups[scope.id];
                const value: Tri =
                  stored === undefined ? "inherit" : stored ? "on" : "off";
                return (
                  <div
                    className="flex items-center justify-between gap-4"
                    key={capability.capability}
                  >
                    <Label>{capability.title}</Label>
                    <Select
                      onValueChange={(next) =>
                        setCapability.mutate({
                          scopeKind: scope.kind,
                          scopeId: scope.id,
                          capability: capability.capability,
                          allowed: next === "inherit" ? null : next === "on",
                        })
                      }
                      value={value}
                    >
                      <SelectTrigger
                        aria-label={t("admin.enterprise.ov.forScope", {
                          title: capability.title,
                          scope: scope.label,
                        })}
                        className="w-36"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="inherit">
                            {t("admin.enterprise.ov.inherit")}
                          </SelectItem>
                          <SelectItem value="on">
                            {scope.kind === "group"
                              ? t("admin.enterprise.ov.grant")
                              : t("admin.enterprise.on")}
                          </SelectItem>
                          {scope.kind === "role" ? (
                            <SelectItem value="off">
                              {t("admin.enterprise.off")}
                            </SelectItem>
                          ) : null}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                );
              })
            : null}
          {setCapability.error ? (
            <p className="text-destructive text-sm" role="alert">
              {setCapability.error.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={() => onOpenChange(false)} size="sm" type="button">
            {t("settings.done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NetworkDialog({
  data,
  initial,
  onClose,
}: {
  data: EnterpriseOverview;
  initial: { scopeKind: "organization" | "group"; scopeId: string };
  onClose: () => void;
}) {
  const { t } = useAppLanguage();
  const existing = data.network.find(
    (row) =>
      row.scopeKind === initial.scopeKind && row.scopeId === initial.scopeId,
  );
  const [group, setGroup] = useState(initial.scopeId || data.groups[0] || "");
  const [mode, setMode] = useState<NetworkMode>(
    existing?.mode ?? "defaults_plus_allowlist",
  );
  const [rules, setRules] = useState(rulesToText(existing?.rules ?? []));
  const [locked, setLocked] = useState(existing?.locked ?? false);
  const save = useMutation(setNetworkPolicyMutationOptions(queryClient));
  const remove = useMutation(removeNetworkPolicyMutationOptions(queryClient));
  const scopeId = initial.scopeKind === "group" ? group : "";
  const formId = useId();

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial.scopeKind === "organization"
              ? t("admin.enterprise.netd.org")
              : t("admin.enterprise.netd.group")}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 space-y-4 overflow-y-auto">
          {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
              direct child of DialogContent and keeps scrolling. */}
          <form
            className="flex flex-col gap-4"
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(
                {
                  scopeKind: initial.scopeKind,
                  scopeId,
                  mode,
                  rules: rulesFromText(rules),
                  locked,
                },
                { onSuccess: onClose },
              );
            }}
          >
            {initial.scopeKind === "group" && !initial.scopeId ? (
              <div className="space-y-1.5">
                <Label>{t("admin.enterprise.netd.groupLabel")}</Label>
                <Select
                  onValueChange={(value) => setGroup(String(value))}
                  value={group}
                >
                  <SelectTrigger
                    aria-label={t("admin.enterprise.netd.groupLabel")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {data.groups.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label>{t("admin.enterprise.netd.mode")}</Label>
              <Select
                onValueChange={(value) => setMode(value as NetworkMode)}
                value={mode}
              >
                <SelectTrigger aria-label={t("admin.enterprise.netd.mode")}>
                  <SelectValue>{t(MODE_NAMES[mode])}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(MODE_NAMES) as NetworkMode[]).map(
                      (candidate) => (
                        <SelectItem key={candidate} value={candidate}>
                          {t(MODE_NAMES[candidate])}
                        </SelectItem>
                      ),
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="network-rules">
                {t("admin.enterprise.netd.allowlist")}
              </Label>
              <Textarea
                className="font-mono text-xs"
                id="network-rules"
                onChange={(event) => setRules(event.target.value)}
                placeholder={"example.com\n*.corp.example\n10.0.0.0/8 443,5432"}
                rows={8}
                value={rules}
              />
              <p className="text-muted-foreground text-xs">
                {t("admin.enterprise.netd.help", {
                  first: data.defaultDestinations.slice(0, 4).join(", "),
                  more: data.defaultDestinations.length - 4,
                })}
              </p>
            </div>
            {initial.scopeKind === "organization" ? (
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="network-locked">
                  {t("admin.enterprise.netd.lock")}
                </Label>
                <Switch
                  checked={locked}
                  id="network-locked"
                  onCheckedChange={setLocked}
                />
              </div>
            ) : null}
          </form>
          {(save.error ?? remove.error) ? (
            <p className="text-destructive text-sm" role="alert">
              {(save.error ?? remove.error)?.message}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          {existing ? (
            <Button
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(
                  { scopeKind: initial.scopeKind, scopeId },
                  { onSuccess: onClose },
                )
              }
              size="sm"
              type="button"
              variant="destructive"
            >
              {t("admin.enterprise.netd.remove")}
            </Button>
          ) : null}
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={
              save.isPending || (initial.scopeKind === "group" && !scopeId)
            }
            form={formId}
            size="sm"
            type="submit"
          >
            {save.isPending ? t("settings.saving") : t("settings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ListDialog({
  open,
  title,
  description,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  initial: string[];
  onSave: (values: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useAppLanguage();
  const [text, setText] = useState(initial.join("\n"));
  return (
    <Dialog
      onOpenChange={(next) => (next ? setText(initial.join("\n")) : onClose())}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 space-y-2 overflow-y-auto">
          <Textarea
            className="font-mono text-xs"
            onChange={(event) => setText(event.target.value)}
            rows={8}
            value={text}
          />
          <p className="text-muted-foreground text-xs">{description}</p>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            onClick={() => {
              onSave(
                text
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              );
              onClose();
            }}
            size="sm"
            type="button"
          >
            {t("settings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DaysDialog({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial: number;
  onSave: (days: number) => void;
  onClose: () => void;
}) {
  const { t } = useAppLanguage();
  const [days, setDays] = useState(String(initial));
  const parsed = Number(days);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 3650;
  return (
    <Dialog
      onOpenChange={(next) => (next ? setDays(String(initial)) : onClose())}
      open={open}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.enterprise.comp.stopInactive")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 space-y-2">
          <Label htmlFor="inactive-days">
            {t("admin.enterprise.days.label")}
          </Label>
          <Input
            id="inactive-days"
            inputMode="numeric"
            onChange={(event) => setDays(event.target.value)}
            value={days}
          />
          <p className="text-muted-foreground text-xs">
            {t("admin.enterprise.days.help")}
          </p>
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" type="button" variant="outline">
            {t("settings.cancel")}
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave(parsed);
              onClose();
            }}
            size="sm"
            type="button"
          >
            {t("settings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
