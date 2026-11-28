import { IconPlus, IconRobot, IconUser } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode, useId, useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
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
import { useAppLanguage, useT } from "@/freeduet/i18n/provider";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  createMemoryMutationOptions,
  deleteMemoryMutationOptions,
  type MemoryRecord,
  memoriesQueryOptions,
  updateMemoryMutationOptions,
} from "@/lib/memory";
import { queryClient } from "@/query-client";

/**
 * A fact the person tells their Bots directly. It reaches every one of them.
 *
 * The page's one primary verb, so it is a button for `PageShell`'s `action` that opens a dialog,
 * rather than a form standing above the list somebody came to read.
 */
export function RememberFact() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const formId = useId();
  const remember = useMutation(createMemoryMutationOptions(queryClient, t));
  return (
    <>
      <Button
        onClick={() => {
          // Opening starts clean: no draft or failure left from an earlier attempt.
          setContent("");
          remember.reset();
          setOpen(true);
        }}
        size="sm"
        variant="ghost"
      >
        <IconPlus />
        {t("memory.fact.button")}
      </Button>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("memory.fact.button")}</DialogTitle>
            <DialogDescription>{t("memory.fact.help")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
                direct child of DialogContent and keeps scrolling. */}
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault();
                remember.mutate(content, {
                  onSuccess: () => {
                    setContent("");
                    setOpen(false);
                  },
                });
              }}
            >
              <Field>
                <FieldLabel htmlFor={`${formId}-content`}>
                  {t("memory.fact.label")}
                </FieldLabel>
                <Textarea
                  id={`${formId}-content`}
                  required
                  maxLength={6000}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder={t("memory.fact.placeholder")}
                />
              </Field>
            </form>
            {remember.error ? (
              <p role="alert" className="text-destructive text-sm">
                {remember.error.message}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button onClick={() => setOpen(false)} size="sm" variant="outline">
              {t("memory.fact.cancel")}
            </Button>
            <Button
              disabled={remember.isPending || !content.trim()}
              form={formId}
              size="sm"
              type="submit"
            >
              {t("memory.fact.remember")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Everything the person's Bots remember about them, with who formed each memory. `action` and
 * `description` belong to the section, since the page heading above it is the whole Plugins screen.
 */
export function MemoryList({
  action,
  description,
}: {
  action?: ReactNode;
  description?: ReactNode;
} = {}) {
  const t = useT();
  const memories = useQuery(memoriesQueryOptions(t));
  const agents = useQuery(agentListQueryOptions());
  const botName = (id: string | null) =>
    agents.data?.find((agent) => agent.id === id)?.name ??
    t("memory.list.yourBot");
  return (
    <PageSection
      action={action}
      description={description}
      title={t("memory.list.title")}
    >
      {memories.isPending ? null : memories.error ? (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {memories.error.message}
        </p>
      ) : memories.data.length ? (
        <PageRows>
          {memories.data.map((memory, index) => (
            <Fragment key={memory.id}>
              {index > 0 ? <Separator /> : null}
              <MemoryRow
                botName={botName(memory.formedByAgentId)}
                memory={memory}
              />
            </Fragment>
          ))}
        </PageRows>
      ) : (
        <PageEmpty>{t("memory.list.empty")}</PageEmpty>
      )}
    </PageSection>
  );
}

/**
 * One memory: the fact itself, then where it came from. Whether Bots use it is a switch; editing
 * its words opens a dialog, and confirming or forgetting it are the buttons beneath.
 */
function MemoryRow({
  memory,
  botName,
}: {
  memory: MemoryRecord;
  botName: string;
}) {
  const t = useT();
  const { date } = useAppLanguage();
  const [editing, setEditing] = useState(false);
  const save = useMutation(updateMemoryMutationOptions(queryClient, t));
  const forget = useMutation(deleteMemoryMutationOptions(queryClient, t));
  const update = (input: {
    content?: string;
    enabled?: boolean;
    reviewState?: "confirmed";
  }) => save.mutate({ id: memory.id, input });
  // Intelligence keeps only the words of a memory it holds for this person, so it can be edited or
  // forgotten here but not paused or reviewed.
  const heldByIntelligence = memory.formedBy === "intelligence";
  const status = heldByIntelligence
    ? t("memory.list.inIntelligence")
    : !memory.enabled
      ? t("memory.list.off")
      : memory.formedBy === "bot"
        ? t(
            memory.reviewState === "unreviewed"
              ? "memory.list.formedByReview"
              : "memory.list.formedBy",
            { name: botName },
          )
        : memory.reviewState === "unreviewed"
          ? t("memory.list.importedReview")
          : t("memory.list.reviewed");
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        {memory.formedBy === "bot" ? <IconRobot /> : <IconUser />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="line-clamp-none whitespace-pre-wrap">
          {memory.content}
        </ItemTitle>
        <ItemDescription className="line-clamp-none">
          {memory.provenance} · {status}
        </ItemDescription>
        {memory.formedBy === "bot" && (
          <ItemDescription className="line-clamp-none">
            {t("memory.list.fromSource", {
              source: memory.sourceApp ?? t("memory.list.aConversation"),
            })}
            {memory.observedAt
              ? t("memory.list.readAt", {
                  when: date(new Date(memory.observedAt), {
                    dateStyle: "short",
                    timeStyle: "medium",
                  }),
                })
              : ""}
            {memory.sourceLink && (
              <>
                {" · "}
                <a href={memory.sourceLink} target="_blank" rel="noreferrer">
                  {t("memory.list.openRecord")}
                </a>
              </>
            )}
          </ItemDescription>
        )}
        {/* A set, so it wraps onto its own line rather than crowding the fact. */}
        <ItemFooter>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                save.reset();
                setEditing(true);
              }}
              size="sm"
              variant="outline"
            >
              {t("memory.list.edit")}
            </Button>
            {memory.reviewState === "unreviewed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => update({ reviewState: "confirmed" })}
              >
                {t("memory.list.confirm")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={forget.isPending}
              onClick={() => forget.mutate(memory.id)}
            >
              {t("memory.list.forget")}
            </Button>
          </div>
        </ItemFooter>
        {!editing && (save.error || forget.error) && (
          <p role="alert" className="text-destructive text-sm">
            {save.error?.message || forget.error?.message}
          </p>
        )}
      </ItemContent>
      {heldByIntelligence ? null : (
        <ItemActions>
          {/* Binary and immediate: Bots stop or start using it when switched. */}
          <Switch
            aria-label={t("memory.list.useAria", {
              text: clip(memory.content),
            })}
            checked={memory.enabled}
            disabled={save.isPending}
            onCheckedChange={(enabled) => update({ enabled })}
          />
        </ItemActions>
      )}
      {editing ? (
        <EditMemoryDialog
          memory={memory}
          onClose={() => setEditing(false)}
          onSave={(content) =>
            save.mutate(
              { id: memory.id, input: { content } },
              { onSuccess: () => setEditing(false) },
            )
          }
          error={save.error?.message ?? null}
          saving={save.isPending}
        />
      ) : null}
    </Item>
  );
}

/** A memory's words, cut short enough to name the switch beside them. */
function clip(content: string) {
  const line = content.replace(/\s+/g, " ").trim();
  return line.length > 60 ? `${line.slice(0, 59)}…` : line;
}

/** The memory's words in a dialog. Saving rewrites them; the server records it as edited. */
function EditMemoryDialog({
  memory,
  saving,
  error,
  onSave,
  onClose,
}: {
  memory: MemoryRecord;
  saving: boolean;
  error: string | null;
  onSave: (content: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [content, setContent] = useState(memory.content);
  const id = useId();
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("memory.list.editTitle")}</DialogTitle>
          <DialogDescription>{memory.provenance}</DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-4">
          <Field>
            <FieldLabel className="sr-only" htmlFor={id}>
              {t("memory.list.memory")}
            </FieldLabel>
            <Textarea
              autoFocus
              id={id}
              maxLength={6000}
              onChange={(event) => setContent(event.target.value)}
              rows={5}
              value={content}
            />
          </Field>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" variant="outline">
            {t("memory.fact.cancel")}
          </Button>
          <Button
            disabled={saving || !content.trim()}
            onClick={() => onSave(content)}
            size="sm"
          >
            {t("memory.list.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
