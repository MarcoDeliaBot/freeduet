import { IconPlugConnected, IconPlus } from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useId, useState } from "react";
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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
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
import { Switch } from "@/components/ui/switch";
import { useAppLanguage } from "@/freeduet/i18n/provider";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { appConfig } from "@/lib/generated/application-config";
import {
  addMemorySourceMutationOptions,
  availableMemorySourcesQueryOptions,
  memorySourceActionMutationOptions,
  memorySourcesQueryOptions,
} from "@/lib/memory";
import { queryClient } from "@/query-client";

/** A date and time as `Date.toLocaleString` drew them, now in the app's language (D181). */
const STAMP_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
};

/**
 * Connected apps a Bot reads facts from. Given a Bot, only that Bot's sources, and a new one is that
 * Bot's without asking.
 *
 * Each source is a row; adding one is a dialog behind the section's action. The draft lives here
 * rather than in the dialog, so the Bot's read actions are already loaded when it opens.
 */
export function MemorySources({ agentId: fixedBot }: { agentId?: string }) {
  const { t, date } = useAppLanguage();
  const sources = useQuery(memorySourcesQueryOptions());
  const bots = useQuery(agentListQueryOptions());
  const [adding, setAdding] = useState(false);
  const [pickedBot, setAgentId] = useState("");
  const agentId = fixedBot ?? pickedBot;
  const [toolRef, setToolRef] = useState("");
  const [title, setTitle] = useState("");
  const [args, setArgs] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const id = useId();
  const tools = useQuery(availableMemorySourcesQueryOptions(agentId));
  const chosen = tools.data?.find((tool) => tool.ref === toolRef);
  const properties = chosen?.inputSchema.properties;
  const settings =
    properties && typeof properties === "object" && !Array.isArray(properties)
      ? Object.entries(properties).flatMap(([name, value]) =>
          value && typeof value === "object" && !Array.isArray(value)
            ? [
                {
                  name,
                  schema: value as {
                    type?: string;
                    title?: string;
                    description?: string;
                    enum?: unknown[];
                  },
                },
              ]
            : [],
        )
      : [];
  const required = Array.isArray(chosen?.inputSchema.required)
    ? chosen.inputSchema.required
    : [];
  const add = useMutation(addMemorySourceMutationOptions(queryClient));
  const action = useMutation(memorySourceActionMutationOptions(queryClient));
  const shown = (sources.data ?? []).filter(
    (source) => fixedBot === undefined || source.agentId === fixedBot,
  );
  return (
    <PageSection
      action={
        <Button
          onClick={() => {
            // The draft is kept on purpose; the last attempt's failure is not.
            setError("");
            add.reset();
            setAdding(true);
          }}
          size="sm"
          variant="ghost"
        >
          <IconPlus />
          {t("memory.addSource")}
        </Button>
      }
      description={t("memory.description")}
      title={t("memory.title")}
    >
      {sources.isPending ? null : sources.error ? (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {sources.error.message}
        </p>
      ) : shown.length === 0 ? (
        <PageEmpty>{t("memory.empty")}</PageEmpty>
      ) : (
        <PageRows>
          {shown.map((source, index) => (
            <Fragment key={source.id}>
              {index > 0 ? <Separator /> : null}
              <Item size="sm">
                <ItemMedia variant="icon">
                  <IconPlugConnected />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{source.title}</ItemTitle>
                  <ItemDescription>
                    {source.enabled
                      ? source.syncStatus === "succeeded"
                        ? t("memory.upToDate")
                        : source.syncStatus
                      : t("memory.off")}
                    {source.lastSyncAt
                      ? ` · ${t("memory.lastRead", {
                          when: date(
                            new Date(source.lastSyncAt),
                            STAMP_OPTIONS,
                          ),
                        })}`
                      : ""}
                  </ItemDescription>
                  {source.syncError && (
                    <p role="alert" className="text-destructive text-sm">
                      {source.syncError}
                    </p>
                  )}
                  {/* A set, so it wraps onto its own line rather than crowding the title. */}
                  <ItemFooter>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!source.enabled || action.isPending}
                        onClick={() =>
                          action.mutate({ sourceId: source.id, name: "sync" })
                        }
                      >
                        {t("memory.syncNow")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          action.mutate({ sourceId: source.id, name: "remove" })
                        }
                      >
                        {t("chat.remove")}
                      </Button>
                    </div>
                  </ItemFooter>
                </ItemContent>
                <ItemActions>
                  {/* Binary and immediate: it refreshes, or stops refreshing, when switched. */}
                  <Switch
                    aria-label={t("memory.readNamed", { name: source.title })}
                    checked={source.enabled}
                    disabled={action.isPending}
                    onCheckedChange={(enabled) =>
                      action.mutate({
                        sourceId: source.id,
                        name: enabled ? "enable" : "disable",
                      })
                    }
                  />
                </ItemActions>
              </Item>
            </Fragment>
          ))}
        </PageRows>
      )}
      {action.error && (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {action.error.message}
        </p>
      )}
      <Dialog onOpenChange={setAdding} open={adding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("memory.addTitle")}</DialogTitle>
            <DialogDescription>
              {t("memory.addDescription", {
                product: appConfig.brand.productName,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 overflow-y-auto">
            {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
                direct child of DialogContent and keeps scrolling. */}
            <form
              id={id}
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const values: Record<string, unknown> = {};
                  for (const setting of settings) {
                    const value = args[setting.name];
                    if (!value) continue;
                    if (
                      setting.schema.type === "number" ||
                      setting.schema.type === "integer"
                    ) {
                      const number = Number(value);
                      if (!Number.isFinite(number))
                        throw new Error(
                          t("memory.enterNumber", { name: setting.name }),
                        );
                      values[setting.name] = number;
                    } else if (setting.schema.type === "boolean")
                      values[setting.name] = value === "true";
                    else if (setting.schema.type === "array")
                      values[setting.name] = value
                        .split("\n")
                        .map((entry) => entry.trim())
                        .filter(Boolean);
                    else if (setting.schema.type === "object")
                      throw new Error(
                        t("memory.cantShow", {
                          product: appConfig.brand.productName,
                        }),
                      );
                    else values[setting.name] = value;
                  }
                  setError("");
                  add.mutate(
                    {
                      agentId,
                      toolRef,
                      title,
                      args: values,
                    },
                    {
                      onSuccess: () => {
                        setTitle("");
                        setAdding(false);
                      },
                    },
                  );
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : t("memory.checkSettings"),
                  );
                }
              }}
            >
              <FieldGroup>
                {fixedBot === undefined ? (
                  <Field>
                    <FieldLabel htmlFor={`${id}-bot`}>
                      {t("botPage.fallbackTitle")}
                    </FieldLabel>
                    <Select
                      items={bots.data?.map((bot) => ({
                        value: bot.id,
                        label: bot.name,
                      }))}
                      onValueChange={(value) => {
                        setAgentId(value ?? "");
                        setToolRef("");
                      }}
                      required
                      value={agentId || null}
                    >
                      <SelectTrigger className="w-full" id={`${id}-bot`}>
                        <SelectValue placeholder={t("bot.choose")} />
                      </SelectTrigger>
                      <SelectContent>
                        {bots.data?.map((bot) => (
                          <SelectItem key={bot.id} value={bot.id}>
                            {bot.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
                <Field>
                  <FieldLabel htmlFor={`${id}-action`}>
                    {t("memory.whatToRead")}
                  </FieldLabel>
                  <Select
                    items={tools.data?.map((tool) => ({
                      value: tool.ref,
                      label: tool.title,
                    }))}
                    onValueChange={(value) => {
                      setToolRef(value ?? "");
                      setArgs({});
                    }}
                    required
                    value={toolRef || null}
                  >
                    <SelectTrigger className="w-full" id={`${id}-action`}>
                      <SelectValue placeholder={t("memory.chooseWhat")} />
                    </SelectTrigger>
                    <SelectContent>
                      {tools.data?.map((tool) => (
                        <SelectItem key={tool.ref} value={tool.ref}>
                          {tool.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {chosen?.description ? (
                    <FieldDescription>{chosen.description}</FieldDescription>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${id}-name`}>
                    {t("memory.sourceName")}
                  </FieldLabel>
                  <Input
                    id={`${id}-name`}
                    required
                    maxLength={160}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="My project documents"
                  />
                </Field>
                {settings.map(({ name, schema }) => (
                  <Field key={name}>
                    {/* `arg-` keeps a setting called `name` or `bot` off the fixed fields' ids. */}
                    <FieldLabel htmlFor={`${id}-arg-${name}`}>
                      {schema.title || name.replaceAll("_", " ")}
                      {required.includes(name) ? " *" : ""}
                    </FieldLabel>
                    {schema.type === "boolean" || schema.enum ? (
                      <Select
                        onValueChange={(value) =>
                          setArgs({ ...args, [name]: value ?? "" })
                        }
                        required={required.includes(name)}
                        value={args[name] || null}
                      >
                        <SelectTrigger
                          className="w-full"
                          id={`${id}-arg-${name}`}
                        >
                          <SelectValue placeholder={t("memory.chooseValue")} />
                        </SelectTrigger>
                        <SelectContent>
                          {(schema.enum ?? ["true", "false"]).map((value) => (
                            <SelectItem
                              key={String(value)}
                              value={String(value)}
                            >
                              {String(value)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`${id}-arg-${name}`}
                        type={
                          schema.type === "number" || schema.type === "integer"
                            ? "number"
                            : "text"
                        }
                        required={required.includes(name)}
                        value={args[name] ?? ""}
                        onChange={(event) =>
                          setArgs({ ...args, [name]: event.target.value })
                        }
                      />
                    )}
                    {schema.description && (
                      <FieldDescription>{schema.description}</FieldDescription>
                    )}
                  </Field>
                ))}
              </FieldGroup>
            </form>
            {(error || add.error || tools.error) && (
              <p role="alert" className="text-destructive text-sm">
                {error || add.error?.message || tools.error?.message}
              </p>
            )}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button
              onClick={() => setAdding(false)}
              size="sm"
              variant="outline"
            >
              {t("settings.cancel")}
            </Button>
            <Button
              disabled={add.isPending || !toolRef}
              form={id}
              size="sm"
              type="submit"
            >
              {add.isPending ? t("memory.reading") : t("memory.addAndSync")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
