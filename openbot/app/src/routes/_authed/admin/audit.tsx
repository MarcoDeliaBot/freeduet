import { IconDownload, IconRefresh } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  PageEmpty,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { useBotNames } from "@/lib/agents/bot-names";
import {
  DID_NOT_HAPPEN_EVENT_TYPES,
  eventTypeFilter,
  outcomeOf,
  REFUSED_EVENT_TYPES,
} from "@/lib/audit/outcome";
import { auditEventsQueryOptions, auditExportUrl } from "@/lib/audit/queries";
import { silenceOf } from "@/lib/audit/silence";
import { client } from "@/lib/client";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage } from "@/freeduet/i18n/provider";

/**
 * Read surface for policy, computer, component, MCP, and credential audit events.
 */
export const Route = createFileRoute("/_authed/admin/audit")({
  component: AuditPage,
});

/** One row as the API returns it. */
type AuditEvent = {
  id: string;
  actorUserId: string | null;
  /** Absent on a deployment that has not migrated yet. */
  initiatorKind?: string;
  initiatorId?: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

/*
 * The saved views, built from the same lists the row label and colour are decided by.
 *
 * Written out by hand here and again below, they had already drifted: a refusal on one list and not
 * the other is a row drawn as "Allowed" or a row missing from the view somebody clicks to ask what
 * this deployment refused. See `@/lib/audit/outcome`, which is now the only place either question is
 * answered.
 */
const FILTERS = [
  { label: "admin.audit.filter.all", search: "" },
  {
    label: "admin.audit.filter.computer",
    search: "?eventType=computer.action_allowed",
  },
  {
    label: "admin.audit.filter.blocked",
    search: eventTypeFilter(REFUSED_EVENT_TYPES),
  },
  {
    label: "admin.audit.filter.didNot",
    search: eventTypeFilter(DID_NOT_HAPPEN_EVENT_TYPES),
  },
  {
    label: "admin.audit.filter.nobody",
    search: "?initiatorKind=routine,handoff,responsibility,memory",
  },
] as const satisfies readonly { label: MessageId; search: string }[];

function AuditPage() {
  const { t, number } = useAppLanguage();
  const [search, setSearch] = useState<string>(FILTERS[0].search);
  const events = useQuery(auditEventsQueryOptions(search));
  const rows = (events.data?.events ?? []) as AuditEvent[];
  const nameFor = useBotNames();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportCapped, setExportCapped] = useState<number | null>(null);

  /*
   * The same filtered query as the table, downloaded as a file. The server walks every
   * matching page up to its cap, so this stays a single request no matter how many pages
   * the filter matches; the filename carries the day it was pulled.
   */
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    setExportCapped(null);
    try {
      const response = await client(auditExportUrl(search), {
        fallback: t("admin.audit.exportFailed"),
      });
      // A file that stopped early must say so, or it reads as the whole trail.
      const capped = Number(response.headers.get("x-audit-export-truncated"));
      if (Number.isInteger(capped) && capped > 0) setExportCapped(capped);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `audit-events-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : t("admin.audit.exportFailed"),
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    /*
     * THE ONE WIDE PAGE IN ADMIN, and the one that keeps a table. Five columns of short values is
     * what a log is; rows of prose would make every entry a paragraph and the scanning this page
     * exists for impossible. It takes the same header and the same type scale as everything else,
     * and differs only where the content forces it to.
     */
    <PageShell
      action={
        <div className="flex items-center gap-2">
          <Button
            disabled={exporting}
            onClick={exportCsv}
            size="sm"
            variant="outline"
          >
            <IconDownload />
            {exporting ? t("admin.audit.exporting") : t("admin.audit.export")}
          </Button>
          <Button onClick={() => events.refetch()} size="sm" variant="ghost">
            <IconRefresh />
            {t("admin.audit.refresh")}
          </Button>
        </div>
      }
      description={t("admin.audit.desc")}
      title={t("admin.audit.title")}
      width="wide"
    >
      <PageSection>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((filter) => (
            <Button
              key={t(filter.label)}
              onClick={() => setSearch(filter.search)}
              size="sm"
              type="button"
              /* The fill is the state, as on every other set of switches in the app. */
              variant={search === filter.search ? "default" : "outline"}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {exportError ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {exportError}
          </p>
        ) : null}
        {exportCapped ? (
          <p className="mt-4 text-muted-foreground text-sm" role="status">
            {t("admin.audit.capped", { count: number(exportCapped) })}
          </p>
        ) : null}
        {events.isPending ? null : events.isError ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {t("admin.audit.loadError")}
          </p>
        ) : rows.length === 0 ? (
          <PageEmpty>{t("admin.audit.empty")}</PageEmpty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground text-xs uppercase">
                <tr className="border-border border-b">
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.when")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.what")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.on")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.bot")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.startedBy")}
                  </th>
                  <th className="px-4 py-2 font-medium">
                    {t("admin.audit.col.decision")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((event) => (
                  <Row event={event} key={event.id} nameFor={nameFor} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageSection>
    </PageShell>
  );
}

function StartedBy({
  event,
  nameFor,
}: {
  event: AuditEvent;
  nameFor: (botId: string) => string;
}) {
  const { t } = useAppLanguage();
  if (event.initiatorKind === "routine") {
    return (
      <span
        className="font-medium text-amber-600 dark:text-amber-500"
        title={event.initiatorId ?? undefined}
      >
        {t("admin.audit.by.routine")}
      </span>
    );
  }
  if (event.initiatorKind === "handoff") {
    return (
      <span
        className="font-medium text-amber-600 dark:text-amber-500"
        title={event.initiatorId ?? undefined}
      >
        {event.initiatorId
          ? t("admin.audit.by.handedOnBy", {
              name: nameFor(event.initiatorId),
            })
          : t("admin.audit.by.handedOn")}
      </span>
    );
  }
  if (
    event.initiatorKind === "responsibility" ||
    event.initiatorKind === "memory"
  ) {
    return (
      <span
        className="font-medium text-amber-600 dark:text-amber-500"
        title={event.initiatorId ?? undefined}
      >
        {event.initiatorKind === "memory"
          ? t("admin.audit.by.memory")
          : t("admin.audit.by.responsibility")}
      </span>
    );
  }
  if (event.initiatorKind === "deployment") {
    return (
      <span className="text-muted-foreground">
        {t("admin.audit.by.deployment")}
      </span>
    );
  }
  // FreeDuet (docs/design/phone-and-remote.md 3.5.5): a chat from a signed-in browser that is not paired with
  // the computer. It is not "a person" at the desk, and the trail must not say so.
  if (event.initiatorKind === "remote") {
    return (
      <span className="font-medium text-amber-600 dark:text-amber-500">
        {t("admin.audit.by.remote")}
      </span>
    );
  }
  return (
    <span className="text-muted-foreground">{t("admin.audit.by.person")}</span>
  );
}

function Row({
  event,
  nameFor,
}: {
  event: AuditEvent;
  nameFor: (botId: string) => string;
}) {
  const { t, date } = useAppLanguage();
  const payload = event.payload ?? {};
  const decision = (payload.decision ?? {}) as {
    allowed?: boolean;
    mode?: string;
    rule?: string | null;
    carriedOut?: boolean;
  };
  const element = payload.element as
    | { role?: string; name?: string }
    | string
    | undefined;
  const outcome = outcomeOf(event.eventType);
  const refused = outcome === "refused";
  const stalled = event.eventType === "agent.stream_stalled";
  /*
   * Three different things, and the difference is what somebody comes to this row to find out.
   *
   * A person naming a coworker, the router matching one, and the router giving up and using the
   * default are not the same event, and one label covering all three would make the row worth less
   * than the reason line under it. Nothing here is a refusal, so none of them take the refusal
   * colour.
   */
  const routed =
    event.eventType === "channel.routed"
      ? payload.viaMention === true
        ? t("admin.audit.routed.mention")
        : payload.fallback === true
          ? t("admin.audit.routed.default")
          : t("admin.audit.routed.meant")
      : null;
  // Allowed by policy but not carried out. A stalled turn belongs in the same family: the Bot was
  // asked and the answer never arrived. Colour is how this table is read, and a row left in the
  // muted foreground reads as "Allowed", which a turn nobody ever got an answer to was not.
  const failed = outcome === "did-not-happen";
  const silence = stalled ? silenceOf(payload) : null;

  return (
    <tr className="border-border border-t align-top">
      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
        {date(new Date(event.createdAt), { timeStyle: "medium" })}
      </td>
      <td className="px-4 py-2 font-medium">
        {/* Strip the internal computer tool namespace for display. */}
        {typeof payload.action === "string"
          ? payload.action.replace("computer_", "")
          : event.eventType}
      </td>
      <td className="px-4 py-2">
        {/*
         * A routing row's subject is the coworker it went to, and it is the only thing on the row
         * worth reading. Its target type is `agent`, which is not a named target because everywhere
         * else an agent id appears it belongs in the Bot column; here nothing acted, so there is no
         * Bot and the target is all there is. Rendered through `nameFor` so it reads as the name on
         * the roster rather than the immutable id.
         */}
        {event.eventType === "channel.routed" && event.targetId ? (
          <span title={event.targetId}>{nameFor(event.targetId)}</span>
        ) : /*
         * A discovery row's subject is the narrowing itself, so the numbers are the subject. A
         * reader asking "why did it not call the tool" needs to see that eleven of thirty were
         * offered before anything else on the row means anything.
         */
        event.eventType === "mcp.tools_discovered" ? (
          <span className="font-mono text-xs">
            {typeof payload.offered === "number" &&
            typeof payload.granted === "number"
              ? t("admin.audit.toolsOf", {
                  offered: payload.offered,
                  granted: payload.granted,
                })
              : "-"}
          </span>
        ) : /* Named targets and file paths are the audit subject before page elements. */
        NAMED_TARGETS.has(event.targetType) && event.targetId ? (
          <span className="font-mono text-xs">
            {event.targetId}
            {typeof payload.function === "string" ? (
              <span className="text-muted-foreground">
                {" "}
                · {payload.function}
              </span>
            ) : null}
          </span>
        ) : typeof payload.file === "string" ? (
          <span className="font-mono text-xs">{payload.file}</span>
        ) : typeof payload.command === "string" ? (
          // The command is the subject of its own row, the way a path is for a file action.
          <span className="font-mono text-xs">{payload.command}</span>
        ) : typeof element === "object" && element?.name ? (
          <span>
            {element.name}
            {element.role ? (
              <span className="text-muted-foreground"> ({element.role})</span>
            ) : null}
          </span>
        ) : typeof element === "string" ? (
          <span className="text-muted-foreground">{element}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
        {/* Page host is meaningful only for browser actions, not workspace file actions. */}
        {typeof payload.file !== "string" &&
        typeof payload.command !== "string" &&
        typeof payload.page === "string" &&
        payload.page ? (
          <div className="text-xs text-muted-foreground">
            {hostOf(payload.page)}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2 text-muted-foreground">
        {typeof payload.bot === "string" ? (
          // Keep the immutable bot id available even when names collide.
          <span title={payload.bot}>{nameFor(payload.bot)}</span>
        ) : (
          "-"
        )}
      </td>
      <td className="px-4 py-2">
        <StartedBy event={event} nameFor={nameFor} />
      </td>
      <td className="px-4 py-2">
        <span
          className={
            refused
              ? "font-medium text-destructive"
              : failed
                ? "font-medium text-amber-600 dark:text-amber-500"
                : "text-muted-foreground"
          }
        >
          {routed ??
            (DECISIONS[event.eventType]
              ? t(DECISIONS[event.eventType])
              : refused
                ? t("admin.audit.blocked")
                : failed
                  ? t("admin.audit.didNot")
                  : t("admin.audit.allowed"))}
        </span>
        {/* Refusal reasons mirror the conversation-facing reason. */}
        {(event.eventType === "component.refused" ||
          event.eventType === "component.function_refused" ||
          event.eventType === "mcp.call_rejected") &&
        typeof payload.reason === "string" ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {payload.reason}
          </div>
        ) : null}
        {/*
         * Why this run was offered what it was, which is the only part of a discovery row that
         * cannot be worked out from the numbers. "Nothing declared" and "selector unavailable" both
         * offer everything and mean entirely different things about the deployment.
         */}
        {event.eventType === "mcp.tools_discovered" &&
        typeof payload.reason === "string" ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {DISCOVERY_REASONS[payload.reason]
              ? t(DISCOVERY_REASONS[payload.reason])
              : payload.reason}
            {Array.isArray(payload.skills) && payload.skills.length > 0
              ? `: ${payload.skills.join(", ")}`
              : ""}
          </div>
        ) : null}
        {event.eventType === "mcp.callback_refused" &&
        typeof payload.refusal === "string" ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {payload.refusal}
          </div>
        ) : null}
        {/*
         * Why the conversation went where it went, which is the whole reason the row is written.
         * Without it a routing row says "Allowed" and names nobody, which is indistinguishable from
         * a row that failed to write.
         */}
        {event.eventType === "channel.routed" &&
        typeof payload.reason === "string" ? (
          /*
           * A width rather than a max-width, because the table lays itself out from its content and
           * a max-width on a block inside a cell does not constrain that. A router's reason is a
           * sentence a model wrote, not a rule name, and left unbounded in the last column it
           * pushes the table wider than the page and the end of the sentence goes off the edge,
           * where nobody scrolls to find it.
           */
          <div className="mt-0.5 w-[22rem] break-words text-xs text-muted-foreground">
            {payload.reason}
          </div>
        ) : null}
        {event.eventType === "bot.declined" &&
        typeof payload.reason === "string" ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {payload.reason}
            <span className="italic">{t("admin.audit.reportedByBot")}</span>
          </div>
        ) : null}
        {failed && typeof payload.failure === "string" ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            {payload.failure}
          </div>
        ) : null}
        {/*
         * The two numbers the stall row is worth reading for. Without them every stalled turn looks
         * the same, and the difference between an endpoint that dies halfway through an answer and
         * one that never begins is the difference between a slow Bot and a dead one.
         */}
        {silence ? (
          <div className="mt-0.5 text-xs text-muted-foreground">{silence}</div>
        ) : null}
        {/* Show concrete policy rules, but suppress the uninformative default `true` allow rule. */}
        {decision.rule && decision.rule !== "true" ? (
          <div className="mt-0.5 font-mono text-xs text-muted-foreground">
            {decision.rule}
          </div>
        ) : null}
        {decision.mode === "dry-run" &&
        decision.allowed === false &&
        decision.carriedOut ? (
          <div className="text-xs text-muted-foreground">
            {t("admin.audit.dryRun")}
          </div>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Target types whose id is a name worth putting on screen.
 *
 * Anything else falls through to the element or file subject.
 */
/**
 * Why a run was offered the tools it was, in words rather than in the slug the server writes.
 *
 * Every one of these looks the same from outside: the Bot was handed some tools. The distinction is
 * the difference between a deployment that narrowed on purpose, one that has never declared a skill,
 * and one whose selector could not be reached, and only the last is a fault.
 */
const DISCOVERY_REASONS: Record<string, MessageId> = {
  "under-floor": "admin.audit.discovery.under-floor",
  "nothing-declared": "admin.audit.discovery.nothing-declared",
  unavailable: "admin.audit.discovery.unavailable",
  "nothing-chosen": "admin.audit.discovery.nothing-chosen",
  selected: "admin.audit.discovery.selected",
};

const NAMED_TARGETS = new Set([
  "component",
  "mcp_tool",
  "mcp_server",
  "skill",
  "credential",
]);

const DECISIONS: Record<string, MessageId> = {
  "bot.declined": "admin.audit.decision.bot.declined",
  // Not a refusal, so not the refusal colour: nothing was blocked. The Bot was asked and never
  // answered, which is the same complaint as an action that was allowed and then did not happen.
  "agent.stream_stalled": "admin.audit.decision.agent.stream_stalled",
  "computer.policy_loaded": "admin.audit.decision.computer.policy_loaded",
  "computer.isolation_loaded": "admin.audit.decision.computer.isolation_loaded",
  "computer.control_taken": "admin.audit.decision.computer.control_taken",
  "computer.control_released": "admin.audit.decision.computer.control_released",
  "computer.help_requested": "admin.audit.decision.computer.help_requested",
  "computer.secret_requested": "admin.audit.decision.computer.secret_requested",
  "computer.secret_supplied": "admin.audit.decision.computer.secret_supplied",
  "computer.reset": "admin.audit.decision.computer.reset",
  "computer.updated": "admin.audit.decision.computer.updated",
  "computer.stopped": "admin.audit.decision.computer.stopped",

  "component.granted": "admin.audit.decision.component.granted",
  "component.revoked": "admin.audit.decision.component.revoked",
  "component.published": "admin.audit.decision.component.published",
  "component.unpublished": "admin.audit.decision.component.unpublished",
  "component.draft_saved": "admin.audit.decision.component.draft_saved",
  "component.refused": "admin.audit.decision.component.refused",
  "component.function_granted":
    "admin.audit.decision.component.function_granted",
  "component.function_revoked":
    "admin.audit.decision.component.function_revoked",
  "component.function_called": "admin.audit.decision.component.function_called",
  "component.function_refused":
    "admin.audit.decision.component.function_refused",
  // A function failure is execution failure, not a policy refusal.
  "component.function_failed": "admin.audit.decision.component.function_failed",

  // Not a call and not a decision: the tools this run was allowed to see. Worded so nobody reads it
  // as permission, which it is not — everything named was already granted.
  "mcp.tools_discovered": "admin.audit.decision.mcp.tools_discovered",
  "mcp.call_succeeded": "admin.audit.decision.mcp.call_succeeded",
  "mcp.call_rejected": "admin.audit.decision.mcp.call_rejected",
  "mcp.call_failed": "admin.audit.decision.mcp.call_failed",
  // Not "Blocked": nothing about the Bot was judged, because nothing proved which Bot it was.
  "mcp.callback_refused": "admin.audit.decision.mcp.callback_refused",

  "configuration.changed": "admin.audit.decision.configuration.changed",
  "credential.created": "admin.audit.decision.credential.created",
};

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
