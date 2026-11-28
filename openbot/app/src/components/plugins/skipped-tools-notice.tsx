import { useT } from "@/freeduet/i18n/provider";

/**
 * The actions an app's last refresh left out because no model could be offered their names.
 *
 * A WARNING, NOT AN ERROR. The refresh stored every other action, so the app works; what is missing
 * is named here, on the app's own page, so nobody has to notice the gap for themselves. It used to
 * ride in `lastError`, which was drawn only when the app had no tools at all and turned the app's
 * row on the Plugins list red — for good, for a server that keeps listing the name.
 */
export function SkippedToolsNotice({ names }: { names: readonly string[] }) {
  const t = useT();
  if (names.length === 0) return null;
  return (
    <p
      className="mt-4 text-amber-600 text-sm dark:text-amber-500"
      role="status"
    >
      {t("admin.shared.skipped", { count: names.length })}
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 ? ", " : null}
          <code className="font-mono text-xs">{name}</code>
        </span>
      ))}
      .
    </p>
  );
}
