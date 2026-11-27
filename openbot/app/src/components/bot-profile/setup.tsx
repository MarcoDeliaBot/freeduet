import {
  IconChevronRight,
  IconEye,
  IconId,
  IconPlugConnected,
  IconShieldCheck,
  IconTag,
  IconTextCaption,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import type { ZodType } from "zod";
import { CallbackTokenPanel } from "@/components/agents/callback-token-panel";
import { PageRows, PageSection } from "@/components/layout/page-shell";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { MessageId } from "@/freeduet/i18n/catalogs";
import { useAppLanguage, useT } from "@/freeduet/i18n/provider";
import {
  type AgentFormValues,
  agentFormSchema,
  profileUpdateInput,
  roleDescriptionSchema,
} from "@/lib/agents/form";
import { updateAgentMutationOptions } from "@/lib/agents/mutations";
import type { AgentProfile } from "@/lib/agents/queries";
import { isComposing } from "@/lib/composing";
import { queryClient } from "@/query-client";
import { appConfig } from "@/lib/generated/application-config";

type TextField = "name" | "title" | "roleDescription";

const TEXT_FIELDS: {
  field: TextField;
  label: MessageId;
  icon: typeof IconId;
  multiline?: boolean;
}[] = [
  { field: "name", label: "settings.name", icon: IconId },
  { field: "title", label: "bot.setup.title", icon: IconTag },
  {
    field: "roleDescription",
    // Not "Role": beside "Title" it read as a second job title, when it is the standing
    // instruction the Bot carries into every channel. The create dialog says the same.
    label: "bot.setup.whatItDoes",
    icon: IconTextCaption,
    multiline: true,
  },
];

/** Who a Bot is and where it runs. Editable by whoever may manage it; read-only for everyone else. */
export function SetupSections({ agent }: { agent: AgentProfile }) {
  const t = useT();
  const update = useMutation(updateAgentMutationOptions(queryClient));
  const [editing, setEditing] = useState<TextField | null>(null);
  const save = (patch: Partial<AgentFormValues>) =>
    update.mutateAsync({
      agentId: agent.id,
      input: profileUpdateInput(agent, patch),
    });
  const open = TEXT_FIELDS.find((entry) => entry.field === editing);

  return (
    <>
      <PageSection title={t("bot.setup.identity")}>
        <PageRows>
          {TEXT_FIELDS.map(({ field, label, icon: Icon }, index) => (
            <Fragment key={field}>
              {index > 0 ? <Separator /> : null}
              <Item
                render={
                  agent.canManage ? (
                    <button onClick={() => setEditing(field)} type="button" />
                  ) : undefined
                }
                size="sm"
              >
                <ItemMedia variant="icon">
                  <Icon />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t(label)}</ItemTitle>
                  <ItemDescription>{agent[field]}</ItemDescription>
                </ItemContent>
                {agent.canManage ? (
                  <ItemActions>
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                ) : null}
              </Item>
            </Fragment>
          ))}
          <Separator />
          <VisibilityRow
            agent={agent}
            onSave={(visibility) => save({ visibility })}
          />
          {agent.systemOwned ? (
            <>
              <Separator />
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconShieldCheck />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{t("bot.setup.systemOwned")}</ItemTitle>
                  <ItemDescription>
                    {t("bot.setup.systemOwnedDescription", {
                      product: appConfig.brand.productName,
                    })}
                  </ItemDescription>
                </ItemContent>
              </Item>
            </>
          ) : null}
        </PageRows>
      </PageSection>
      <ConnectionSection agent={agent} />
      {open ? (
        <EditTextDialog
          label={t(open.label)}
          limit={
            open.field === "roleDescription"
              ? agent.roleDescriptionLimit
              : undefined
          }
          multiline={open.multiline ?? false}
          onClose={() => setEditing(null)}
          onSave={(value) => save({ [open.field]: value })}
          schema={
            open.field === "roleDescription"
              ? roleDescriptionSchema(agent.roleDescriptionLimit)
              : agentFormSchema.shape[open.field]
          }
          value={agent[open.field]}
        />
      ) : null}
    </>
  );
}

/** Two named choices that write on pick: no draft worth holding, so no dialog. */
function VisibilityRow({
  agent,
  onSave,
}: {
  agent: AgentProfile;
  onSave: (visibility: AgentProfile["visibility"]) => Promise<unknown>;
}) {
  const t = useT();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        <IconEye />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{t("bot.setup.visibility")}</ItemTitle>
        <ItemDescription>
          {error ??
            (agent.visibility === "private"
              ? t("bot.setup.visiblePrivate")
              : t("bot.setup.visiblePublic", {
                  product: appConfig.brand.productName,
                }))}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {agent.canManage ? (
          <Select
            disabled={saving}
            // The label map, so the closed trigger says "Private" rather than the raw value.
            items={{
              private: t("bot.setup.private"),
              public: t("bot.setup.public"),
            }}
            onValueChange={async (next) => {
              if (next === agent.visibility) return;
              setError(null);
              setSaving(true);
              try {
                await onSave(next as AgentProfile["visibility"]);
              } catch (failure) {
                setError(
                  failure instanceof Error
                    ? failure.message
                    : t("bot.setup.saveError"),
                );
              } finally {
                setSaving(false);
              }
            }}
            value={agent.visibility}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{t("bot.setup.private")}</SelectItem>
              <SelectItem value="public">{t("bot.setup.public")}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="text-muted-foreground text-sm">
            {agent.visibility === "private"
              ? t("bot.setup.private")
              : t("bot.setup.public")}
          </span>
        )}
      </ItemActions>
    </Item>
  );
}

/**
 * One text field in a dialog, validated against the same limits the server enforces. Enter saves a
 * single-line field — but not the Enter that confirms a composed character, which would save the
 * value before the person finished typing it.
 */
function EditTextDialog({
  label,
  value,
  multiline,
  limit,
  schema,
  onSave,
  onClose,
}: {
  label: string;
  value: string;
  multiline: boolean;
  /** Shown as a counter when the field has a limit, read from the coworker. */
  limit?: number;
  schema: ZodType<string>;
  onSave: (value: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { number, t } = useAppLanguage();
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("bot.setup.checkField"));
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      onClose();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : t("bot.setup.saveError"),
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <DialogBody className="mt-4 grid gap-2">
          {multiline ? (
            <Textarea
              aria-label={label}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              rows={5}
              value={draft}
            />
          ) : (
            <Input
              aria-label={label}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !isComposing(event)) {
                  event.preventDefault();
                  void submit();
                }
              }}
              value={draft}
            />
          )}
          {limit !== undefined ? (
            <p
              className={`text-xs ${draft.length > limit ? "text-destructive" : "text-muted-foreground"}`}
            >
              {t("settings.charactersOf", {
                used: number(draft.length),
                limit: number(limit),
              })}
            </p>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button
            disabled={saving}
            onClick={onClose}
            size="sm"
            variant="outline"
          >
            {t("settings.cancel")}
          </Button>
          <Button disabled={saving} onClick={() => void submit()} size="sm">
            {saving ? t("settings.saving") : t("settings.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Where it runs. A built-in Bot runs on the deployment's own Bot, whose process already holds the
 * deployment's tool credential, so there is nothing to show but that sentence.
 */
function ConnectionSection({ agent }: { agent: AgentProfile }) {
  const t = useT();
  const builtIn = !agent.endpoint || agent.builtIn;
  return (
    <PageSection title={t("bot.setup.connection")}>
      <PageRows>
        <Item size="sm">
          <ItemMedia variant="icon">
            <IconPlugConnected />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>
              {builtIn ? t("bot.setup.builtIn") : t("bot.setup.agentUrl")}
            </ItemTitle>
            <ItemDescription
              className={
                builtIn ? undefined : "line-clamp-none break-all font-mono"
              }
            >
              {builtIn
                ? t("bot.setup.builtInDescription", {
                    product: appConfig.brand.productName,
                  })
                : agent.endpoint}
            </ItemDescription>
          </ItemContent>
        </Item>
      </PageRows>
      {!builtIn && agent.canManage ? (
        <CallbackTokenPanel
          agentId={agent.id}
          hasToken={agent.hasCallbackToken}
        />
      ) : null}
    </PageSection>
  );
}
