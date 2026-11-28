import { englishT, type T, useT } from "@/freeduet/i18n/provider";
import {
  describeApproval,
  type SharedUseApproval,
} from "@/lib/plugins/shared-use";

export function sharedSectionSentence(
  effect: "read" | "write",
  shared: boolean,
  t: T = englishT,
): string | null {
  if (!shared) return null;
  return effect === "write"
    ? t("admin.shared.sentence.write")
    : t("admin.shared.sentence.read");
}

/**
 * Who may use a shared account through one Bot: the audience the Bot has now, offered as the
 * default, and only ever NARROWED here. Named people are offered only when the Bot is published to
 * named people, because that list is what a `people` approval records.
 */
export function SharedApprovalFields({
  value,
  onChange,
}: {
  value: SharedUseApproval;
  onChange: (next: SharedUseApproval) => void;
}) {
  const t = useT();
  const named = value.audience === "people" || value.members.length > 0;
  const options: { audience: SharedUseApproval["audience"]; label: string }[] =
    [
      { audience: "owner", label: t("admin.shared.owner") },
      ...(named
        ? [
            {
              audience: "people" as const,
              label: t("admin.shared.named", {
                who: describeApproval(
                  { ...value, audience: "people", outsideInput: false },
                  t,
                ),
              }),
            },
          ]
        : []),
      { audience: "team", label: t("admin.shared.team") },
    ];
  return (
    <fieldset className="space-y-2 text-sm">
      <legend className="font-medium">{t("admin.shared.legend")}</legend>
      {options.map((option) => (
        <label className="flex items-center gap-2" key={option.audience}>
          <input
            checked={value.audience === option.audience}
            name="shared-audience"
            onChange={() =>
              onChange({
                ...value,
                audience: option.audience,
                members: option.audience === "people" ? value.members : [],
              })
            }
            type="radio"
          />
          {option.label}
        </label>
      ))}
      <label className="flex items-center gap-2">
        <input
          checked={value.outsideInput}
          onChange={(event) =>
            onChange({ ...value, outsideInput: event.target.checked })
          }
          type="checkbox"
        />
        {t("admin.shared.outside")}
      </label>
    </fieldset>
  );
}
