import {
  IconAlertTriangle,
  IconChevronRight,
  IconClock,
  IconCode,
  IconDatabase,
  IconFileText,
  IconTag,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { AdminComponentPreview } from "@/components/component-preview";
import {
  PageRows,
  PageSection,
  PageShell,
} from "@/components/layout/page-shell";
import { SettingsItemBackground } from "@/components/settings/background";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type T, useAppLanguage } from "@/freeduet/i18n/provider";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  saveComponentDraftMutationOptions,
  setComponentFunctionMutationOptions,
  setComponentGrantMutationOptions,
  setComponentPublishedMutationOptions,
} from "@/lib/components/mutations";
import {
  type ComponentRecord,
  componentListQueryOptions,
  type DataFunctionSummary,
  dataFunctionsQueryOptions,
} from "@/lib/components/queries";
import { RENDERABLE_NAMES } from "@/lib/copilot/gallery-registry";
import { appConfig } from "@/lib/generated/application-config";
import { queryClient } from "@/query-client";

/**
 * Governance for one compiled component: publication, per-Bot grants, the model-facing description,
 * and which data functions it may read.
 */
/** The same way back from every state this route can be in. */
const backFor = (t: T) =>
  ({
    label: t("admin.nav.components"),
    linkProps: { to: "/admin/components" },
  }) as const;

export const Route = createFileRoute("/_authed/admin/components/$name")({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useAppLanguage();
  const BACK = backFor(t);
  const { name } = Route.useParams();
  const components = useQuery(componentListQueryOptions());
  const agents = useQuery(agentListQueryOptions());
  const dataFunctions = useQuery(dataFunctionsQueryOptions());

  const setGrant = useMutation(setComponentGrantMutationOptions(queryClient));
  const setFunction = useMutation(
    setComponentFunctionMutationOptions(queryClient),
  );
  const setPublished = useMutation(
    setComponentPublishedMutationOptions(queryClient),
  );
  const saveDraft = useMutation(saveComponentDraftMutationOptions(queryClient));

  /*
   * Read out of the list rather than held in state, so a change made here is reflected here.
   */
  const component = components.data?.find((entry) => entry.name === name);

  /*
   * Pending first and drawing nothing: there is no loading placeholder in this app, and the
   * alternative here is worse than a blank — "no such component" while the list is still in flight
   * says something false about a component that is about to appear.
   */
  if (components.isPending) return null;

  if (components.error) {
    return (
      <PageShell backButton={BACK} title={t("admin.compDetail.title")}>
        <p className="mt-8 text-destructive text-sm" role="alert">
          {t("admin.components.loadError")}
        </p>
      </PageShell>
    );
  }

  if (!component) {
    /*
     * A name in the URL is a claim, not a promise: it can be stale, mistyped, or a component this
     * build no longer ships.
     */
    return (
      <PageShell
        backButton={BACK}
        description={t("admin.compDetail.noSuch.description")}
        title={t("admin.compDetail.noSuch.title")}
      >
        <Empty className="mt-12 min-h-[30dvh] border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{name}</EmptyTitle>
            <EmptyDescription className="text-pretty">
              {t("admin.compDetail.noSuch.hint")}
            </EmptyDescription>
          </EmptyHeader>
          <Button
            render={<Link to="/admin/components" />}
            size="sm"
            variant="outline"
          >
            {t("admin.compDetail.back")}
          </Button>
        </Empty>
      </PageShell>
    );
  }

  return (
    /*
     * Keyed on the name so the draft is seeded from the component actually being looked at. The
     * route component is reused when only the parameter changes, so without it the text held from
     * the last one opened would be what a save wrote back.
     */
    <ComponentDetail
      bots={agents.data ?? []}
      component={component}
      dataFunctions={dataFunctions.data ?? []}
      key={component.name}
      onPublish={(published) => setPublished.mutate({ name, published })}
      onSaveDraft={(description) => saveDraft.mutate({ description, name })}
      onSetFunction={(functionName, granted) =>
        setFunction.mutate({ functionName, granted, name })
      }
      onSetGrant={(agentId, granted) =>
        setGrant.mutate({ agentId, granted, name })
      }
    />
  );
}

/** Which sub-dialog is open, if any. */
type Sheet = "description" | "grants" | "functions" | null;

/**
 * A row that states something and cannot be changed. No chevron, because there is nothing behind it.
 */
function FactRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <Item size="sm">
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
      </ItemContent>
      <ItemActions className="text-muted-foreground text-sm">
        {children}
      </ItemActions>
    </Item>
  );
}

/**
 * A row whose detail is a dialog. The whole row is the button, as it is in the settings screens this
 * follows — a chevron on the right announces where it goes, but it is not the only thing you can hit.
 */
function SheetRow({
  icon,
  label,
  summary,
  onOpen,
  testId,
}: {
  icon: ReactNode;
  label: string;
  summary: string;
  onOpen: () => void;
  testId: string;
}) {
  return (
    <Item
      className="w-full text-left transition-colors hover:bg-muted/50"
      /*
       * No children on the render element. `useRender` merges props, and children given here would
       * replace the row's own — which is how this first drew as three empty rows. The button takes
       * its accessible name from the title and summary inside instead.
       */
      render={<button data-testid={testId} onClick={onOpen} type="button" />}
      size="sm"
    >
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        <ItemDescription>{summary}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <IconChevronRight className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

/**
 * One component in full: what it is, what it looks like, what the model is told about it, and who
 * may use it.
 *
 * Settings-screen shape rather than a form. Each row states where something stands and, if it can be
 * changed, opens a dialog to change it; nothing is saved by a button at the bottom of the page,
 * because there is no page-level state to save. Publication and the grants take effect as they are
 * switched, and the description is the one thing held while it is being typed — which is why it is
 * the only dialog with a Cancel.
 */
function ComponentDetail({
  component,
  bots,
  dataFunctions,
  onSetGrant,
  onSetFunction,
  onPublish,
  onSaveDraft,
}: {
  component: ComponentRecord;
  bots: { id: string; name: string }[];
  dataFunctions: DataFunctionSummary[];
  onSetGrant: (agentId: string, granted: boolean) => void;
  onSetFunction: (functionName: string, granted: boolean) => void;
  onPublish: (published: boolean) => void;
  onSaveDraft: (description: string) => void;
}) {
  const { t, date } = useAppLanguage();
  const BACK = backFor(t);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [draft, setDraft] = useState(component.draftDescription);
  const withheld = new Set(component.withheldFrom);
  const heldFunctions = new Set(component.functions);
  const renderable =
    RENDERABLE_NAMES.has(component.name) || component.kind === "sandboxed";

  const granted = bots.filter((bot) => !withheld.has(bot.id));
  const held = dataFunctions.filter((fn) => heldFunctions.has(fn.name));

  const grantSummary =
    bots.length === 0
      ? t("admin.compDetail.grant.noBots")
      : granted.length === bots.length
        ? t("admin.compDetail.grant.all", { count: bots.length })
        : granted.length === 0
          ? t("admin.compDetail.grant.none")
          : t("admin.compDetail.grant.some", {
              granted: granted.length,
              total: bots.length,
            });

  const functionSummary =
    dataFunctions.length === 0
      ? t("admin.compDetail.fn.none")
      : held.length === 0
        ? t("admin.compDetail.fn.nothing")
        : held.map((fn) => fn.name).join(", ");

  return (
    <PageShell
      backButton={BACK}
      description={
        component.publishedDescription ?? t("admin.compDetail.notPublished")
      }
      title={component.title}
    >
      {/*
       * The render at the top of the page. Bordered and rounded rather than bleeding to the edges:
       * inside a prose column that is what the tiles do, and a page has no dialog edge to reach for.
       */}
      <div className="relative mt-8 aspect-[2/1] overflow-hidden rounded-lg border border-border bg-card">
        <div className="absolute inset-0">
          <SettingsItemBackground className="h-full w-full" />
        </div>
        <div className="absolute inset-0 z-10">
          <AdminComponentPreview kind={component.kind} name={component.name} />
        </div>
      </div>

      <PageSection
        description={t("admin.compDetail.config.description")}
        title={t("admin.compDetail.config.title")}
      >
        <PageRows>
          {/*
           * First, and only when it applies: a component this build cannot draw is a fact that
           * outranks everything under it, because none of it can have any effect.
           */}
          {renderable ? null : (
            <>
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconAlertTriangle className="text-amber-600 dark:text-amber-400" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {t("admin.compDetail.notInBuild.title")}
                  </ItemTitle>
                  <ItemDescription>
                    {t("admin.compDetail.notInBuild.description", {
                      product: appConfig.brand.productName,
                    })}
                  </ItemDescription>
                </ItemContent>
              </Item>
              <Separator />
            </>
          )}

          <Item size="sm">
            <ItemMedia variant="icon">
              <IconWorld />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{t("admin.compDetail.published")}</ItemTitle>
              <ItemDescription>
                {component.published
                  ? t("admin.compDetail.published.on")
                  : t("admin.compDetail.published.off")}
                {component.hasUnpublishedChanges
                  ? ` ${t("admin.compDetail.published.changes")}`
                  : null}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                aria-label={t("admin.compDetail.published")}
                checked={component.published}
                data-testid={`publish-${component.name}`}
                onCheckedChange={onPublish}
              />
            </ItemActions>
          </Item>

          <Separator />

          <SheetRow
            icon={<IconFileText />}
            label={t("admin.compDetail.description")}
            onOpen={() => setSheet("description")}
            summary={
              component.draftDescription || t("admin.compDetail.nothingYet")
            }
            testId={`description-${component.name}`}
          />

          <Separator />

          <SheetRow
            icon={<IconUsers />}
            label={t("admin.compDetail.availableTo")}
            onOpen={() => setSheet("grants")}
            summary={grantSummary}
            testId={`grants-${component.name}`}
          />

          <Separator />

          <SheetRow
            icon={<IconDatabase />}
            label={t("admin.compDetail.canRead")}
            onOpen={() => setSheet("functions")}
            summary={functionSummary}
            testId={`functions-${component.name}`}
          />
        </PageRows>
      </PageSection>

      <PageSection title={t("admin.compDetail.details")}>
        <PageRows>
          <FactRow icon={<IconTag />} label={t("admin.compDetail.kind")}>
            {component.kind}
          </FactRow>
          <Separator />
          <FactRow icon={<IconCode />} label={t("admin.compDetail.calledAs")}>
            <code className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs">
              {component.name}
            </code>
          </FactRow>
          <Separator />
          <FactRow
            icon={<IconClock />}
            label={t("admin.compDetail.lastChanged")}
          >
            {date(new Date(component.updatedAt), {
              dateStyle: "short",
              timeStyle: "medium",
            })}
            {component.updatedBy
              ? ` ${t("admin.compDetail.by", { name: component.updatedBy })}`
              : null}
          </FactRow>
        </PageRows>
      </PageSection>

      {/*
       * The one dialog holding state of its own, so the one with something to discard. The draft is
       * reset on close either way, so reopening reads what is actually stored rather than what was
       * abandoned.
       */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setSheet(null);
            setDraft(component.draftDescription);
          }
        }}
        open={sheet === "description"}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.compDetail.description")}</DialogTitle>
            <DialogDescription>
              {t("admin.compDetail.descDlg.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            <Textarea
              aria-label={t("admin.compDetail.description")}
              onChange={(event) => setDraft(event.target.value)}
              rows={6}
              value={draft}
            />
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                setSheet(null);
                setDraft(component.draftDescription);
              }}
              size="sm"
              variant="ghost"
            >
              {t("settings.cancel")}
            </Button>
            <Button
              onClick={() => {
                onSaveDraft(draft);
                setSheet(null);
              }}
              size="sm"
            >
              {t("settings.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grants take effect as they are switched, so there is nothing here to save or to discard. */}
      <Dialog
        onOpenChange={(open) => !open && setSheet(null)}
        open={sheet === "grants"}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.compDetail.availableTo")}</DialogTitle>
            <DialogDescription>
              {t("admin.compDetail.grantsDlg.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            {bots.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("admin.compDetail.grantsDlg.empty")}
              </p>
            ) : (
              <div className="flex flex-col">
                {bots.map((bot, index) => {
                  const has = !withheld.has(bot.id);
                  return (
                    <div key={bot.id}>
                      {index === 0 ? null : <Separator />}
                      <Item size="sm">
                        <ItemContent>
                          <ItemTitle>{bot.name}</ItemTitle>
                        </ItemContent>
                        <ItemActions>
                          <Switch
                            aria-label={bot.name}
                            checked={has}
                            data-testid={`grant-${component.name}-${bot.id}`}
                            onCheckedChange={(next) => onSetGrant(bot.id, next)}
                          />
                        </ItemActions>
                      </Item>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button onClick={() => setSheet(null)} size="sm">
              {t("settings.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setSheet(null)}
        open={sheet === "functions"}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.compDetail.canRead")}</DialogTitle>
            <DialogDescription>
              {t("admin.compDetail.fnDlg.description")}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            {dataFunctions.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t("admin.compDetail.fnDlg.empty")}
              </p>
            ) : (
              <div className="flex flex-col">
                {dataFunctions.map((fn, index) => {
                  const has = heldFunctions.has(fn.name);
                  return (
                    <div key={fn.name}>
                      {index === 0 ? null : <Separator />}
                      <Item size="sm">
                        <ItemContent>
                          <ItemTitle>{fn.name}</ItemTitle>
                          <ItemDescription>{fn.description}</ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Switch
                            aria-label={fn.name}
                            checked={has}
                            data-testid={`function-${component.name}-${fn.name}`}
                            onCheckedChange={(next) =>
                              onSetFunction(fn.name, next)
                            }
                          />
                        </ItemActions>
                      </Item>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button onClick={() => setSheet(null)} size="sm">
              {t("settings.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
