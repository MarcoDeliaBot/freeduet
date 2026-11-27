import { Link, type LinkOptions, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";
import "./tokens.css";
import "./light-page.css";

/** The address of the settings home, where every inner page's back link goes (D154, D174). */
export const SETTINGS_HOME_PATH = "/settings";
export const BACK_TO_SETTINGS = "← Settings";

/**
 * The top of an inner settings page in the light design: a back link to the settings home, the title,
 * one plain sentence saying what the page is for, and the page's own primary action on the right.
 * A page may add a crumb (a Bot's page adds "Bots") between the back link and the title.
 */
export function LightHeader({
  title,
  purpose,
  action,
  crumbs = [],
}: {
  title: string;
  purpose: ReactNode;
  action?: ReactNode;
  crumbs?: readonly { label: string; to: LinkOptions["to"] }[];
}) {
  // Drawn with no router (a test of a page on its own) the back link is a plain address; in the app it is a Link.
  const inRouter = Boolean(useRouter({ warn: false }));
  return (
    <header className="fdl-head" data-testid="light-header">
      <nav aria-label="Where you are" className="fdl-crumbs">
        {inRouter ? (
          <Link
            className="fdl-back"
            data-testid="back-to-settings"
            to="/settings"
          >
            {BACK_TO_SETTINGS}
          </Link>
        ) : (
          <a
            className="fdl-back"
            data-testid="back-to-settings"
            href={SETTINGS_HOME_PATH}
          >
            {BACK_TO_SETTINGS}
          </a>
        )}
        {inRouter
          ? crumbs.map((crumb) => (
              <Link className="fdl-crumb" key={String(crumb.to)} to={crumb.to}>
                {crumb.label}
              </Link>
            ))
          : null}
      </nav>
      <div className="fdl-head-row">
        <h1 className="fdl-title">{title}</h1>
        {action ? <div className="fdl-action">{action}</div> : null}
      </div>
      <p className="fdl-purpose">{purpose}</p>
    </header>
  );
}

/**
 * `PageShell` in the light design: the same frame, back disc and scroller, with the light header and
 * the light tokens (`.fdl`) over everything the page draws. The page's own controls are not replaced.
 */
export function LightPageShell({
  title,
  purpose,
  action,
  crumbs,
  className,
  width = "prose",
  backButton,
  children,
}: {
  title: string;
  purpose: ReactNode;
  action?: ReactNode;
  crumbs?: readonly { label: string; to: LinkOptions["to"] }[];
  className?: string;
  width?: "prose" | "wide";
  backButton?: Parameters<typeof PageShell>[0]["backButton"];
  children: ReactNode;
}) {
  return (
    <PageShell
      backButton={backButton}
      className={`fdl ${className ?? ""}`.trim()}
      header={
        <LightHeader
          action={action}
          crumbs={crumbs}
          purpose={purpose}
          title={title}
        />
      }
      title={title}
      width={width}
    >
      {children}
    </PageShell>
  );
}
