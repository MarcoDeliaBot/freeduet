import {
  IconChevronRight,
  IconLock,
  IconPlus,
  IconShieldCheck,
} from "@tabler/icons-react";
import type { UseMutationResult } from "@tanstack/react-query";
import { useId, useState } from "react";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { useT } from "@/freeduet/i18n/provider";
import {
  type ApprovalRuleInput,
  type ApprovalRuleRow,
  type HostCommandPolicy,
  type RuleBehaviour,
} from "@/lib/approvals";

/** What a rule's behaviour is called, in the app's language (D181 stage 2f). The keys are the values the server stores. */
export function useBehaviourLabels(): Record<RuleBehaviour, string> {
  const t = useT();
  return {
    allow: t("approvals.behaviour.allow"),
    pre_approved: t("approvals.behaviour.preApproved"),
    ask: t("approvals.behaviour.ask"),
    hand_off: t("approvals.behaviour.handOff"),
  };
}

/** How commands on a person's computer are handled, in the app's language. */
export function useHostLabels(): Record<HostCommandPolicy, string> {
  const t = useT();
  return {
    ask: t("approvals.host.ask"),
    allow: t("approvals.host.allow"),
    never: t("approvals.host.never"),
  };
}

/**
 * One value from a fixed set of labelled choices: a rule's behaviour, or how commands on a computer
 * are handled. The keys of `labels` are the values, in the order they are offered.
 */
export function LabelSelect<T extends string>({
  id,
  label,
  labels,
  value,
  disabled,
  onChange,
}: {
  id?: string;
  /** The trigger's accessible name, where no visible label names it. */
  label?: string;
  labels: Record<T, string>;
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onChange(next as T);
      }}
      value={value}
    >
      <SelectTrigger aria-label={label} id={id}>
        <SelectValue>{labels[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(labels) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {labels[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The behaviours a team rule is offered under, each saying it is the team's. */
function useTeamBehaviourLabels(): Record<RuleBehaviour, string> {
  const t = useT();
  return Object.fromEntries(
    Object.entries(useBehaviourLabels()).map(([key, label]) => [
      key,
      t("approvals.teamRule", { label }),
    ]),
  ) as Record<RuleBehaviour, string>;
}

/**
 * One saved rule, as a row: what it matches, and what a Bot does about it. A locked rule — a team
 * rule seen by a member, or a personal rule the team has switched off — states its behaviour and
 * offers nothing to change.
 */
export function RuleRow({
  rule,
  team,
  locked,
  disabled,
  onRevoke,
  onChange,
}: {
  rule: ApprovalRuleRow;
  team?: boolean;
  locked?: boolean;
  disabled: boolean;
  onRevoke: () => void;
  onChange: (behaviour: RuleBehaviour) => void;
}) {
  const t = useT();
  const own = useBehaviourLabels();
  const teamOwn = useTeamBehaviourLabels();
  const labels = team ? teamOwn : own;
  // The tool is the title; the rest of what the rule matches is the line beneath, never clamped,
  // since two rules for one tool differ only there.
  const match = [
    rule.effect !== "*" ? rule.effect : null,
    rule.scope !== "*" ? t("approvals.matchOn", { scope: rule.scope }) : null,
    rule.botId !== "*" ? t("approvals.matchFor", { bot: rule.botId }) : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Item size="sm">
      <ItemMedia variant="icon">
        {locked ? <IconLock /> : <IconShieldCheck />}
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{rule.toolRef}</ItemTitle>
        {match ? (
          <ItemDescription className="line-clamp-none break-all">
            {match}
          </ItemDescription>
        ) : null}
        {locked ? (
          <ItemDescription>{t("approvals.locked")}</ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        {locked ? (
          <span className="text-muted-foreground text-sm">
            {labels[rule.behaviour]}
          </span>
        ) : (
          <>
            <LabelSelect
              disabled={disabled}
              label={t("approvals.behaviourFor", { tool: rule.toolRef })}
              labels={labels}
              onChange={onChange}
              value={rule.behaviour}
            />
            <Button
              disabled={disabled}
              onClick={onRevoke}
              size="sm"
              variant="outline"
            >
              {t("chat.remove")}
            </Button>
          </>
        )}
      </ItemActions>
    </Item>
  );
}

const EMPTY_RULE: ApprovalRuleInput = {
  botId: "*",
  toolRef: "",
  effect: "*",
  scope: "*",
  behaviour: "ask",
};

/**
 * An action class and a behaviour, added from a row that opens a dialog. `*` matches anything, so
 * `mcp/gmail/*` is every Gmail tool and a target of `*.example.com` is every page on that site.
 */
export function RuleForm({
  label,
  save,
  botField = true,
  forBot,
}: {
  label: string;
  /** The write that adds the rule. The dialog closes when it succeeds and shows why when it fails. */
  save: UseMutationResult<unknown, Error, ApprovalRuleInput>;
  /** Off where the rule applies to every Bot, so there is no Bot to name. */
  botField?: boolean;
  /** The Bot every rule from this form is for, already known from the page it is on. */
  forBot?: string;
}) {
  const t = useT();
  const behaviourLabels = useBehaviourLabels();
  const blank = forBot ? { ...EMPTY_RULE, botId: forBot } : EMPTY_RULE;
  const [rule, setRule] = useState<ApprovalRuleInput>(blank);
  const [open, setOpen] = useState(false);
  const id = useId();
  // Closing without saving drops what was typed, so the dialog opens blank next time.
  const close = () => {
    setOpen(false);
    setRule(blank);
  };
  // Opening starts clean: the last attempt's failure belongs to the draft it was about.
  const show = () => {
    save.reset();
    setOpen(true);
  };
  const field = (key: keyof ApprovalRuleInput, title: string, hint: string) => (
    <Field>
      <FieldLabel htmlFor={`${id}-${key}`}>{title}</FieldLabel>
      <Input
        id={`${id}-${key}`}
        onChange={(event) => {
          // Read before the updater runs: React restores a controlled input's DOM value first.
          const value = event.target.value;
          setRule((prior) => ({ ...prior, [key]: value }));
        }}
        placeholder={hint}
        value={rule[key]}
      />
    </Field>
  );
  return (
    <>
      <Item render={<button onClick={show} type="button" />} size="sm">
        <ItemMedia variant="icon">
          <IconPlus />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{label}</ItemTitle>
          <ItemDescription>{t("approvals.formLead")}</ItemDescription>
        </ItemContent>
        <ItemActions>
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
      <Dialog onOpenChange={(next) => (next ? show() : close())} open={open}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{t("approvals.formHelp")}</DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4">
            {/* The submit button is in the footer and reaches this form by id, so DialogBody stays a
                direct child of DialogContent and keeps scrolling. */}
            <form
              id={id}
              onSubmit={(event) => {
                event.preventDefault();
                // A failed save keeps the dialog and the draft, so the person can correct it.
                save.mutate(rule, { onSuccess: close });
              }}
            >
              <FieldGroup>
                {field(
                  "toolRef",
                  t("approvals.field.tool"),
                  t("approvals.field.toolHint"),
                )}
                {field(
                  "effect",
                  t("approvals.field.effect"),
                  t("approvals.field.effectHint"),
                )}
                {field(
                  "scope",
                  t("approvals.field.scope"),
                  t("approvals.field.scopeHint"),
                )}
                {botField
                  ? field(
                      "botId",
                      t("approvals.field.bot"),
                      t("approvals.field.botHint"),
                    )
                  : null}
                <Field>
                  <FieldLabel htmlFor={`${id}-behaviour`}>
                    {t("approvals.field.behaviour")}
                  </FieldLabel>
                  <LabelSelect
                    id={`${id}-behaviour`}
                    labels={behaviourLabels}
                    onChange={(behaviour) =>
                      setRule((prior) => ({ ...prior, behaviour }))
                    }
                    value={rule.behaviour}
                  />
                </Field>
              </FieldGroup>
            </form>
            {save.error ? (
              <p className="mt-4 text-destructive text-sm" role="alert">
                {save.error.message}
              </p>
            ) : null}
          </DialogBody>
          <DialogFooter className="mt-4">
            <Button onClick={close} size="sm" variant="outline">
              {t("settings.cancel")}
            </Button>
            <Button
              disabled={save.isPending || !rule.toolRef.trim()}
              form={id}
              size="sm"
              type="submit"
            >
              {t("approvals.saveRule")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
