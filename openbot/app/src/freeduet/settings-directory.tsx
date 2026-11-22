import { Link, type LinkOptions } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DuetIcon, type DuetIconName } from "@/components/duet/icons";

export type SettingsPlace = {
  label: string;
  icon: DuetIconName;
  to: LinkOptions["to"];
  group: "featured" | "operations" | "account";
  detail?: string;
  color?: "aqua" | "blue";
  adminOnly?: boolean;
  badge?: ReactNode;
};

export function SettingsDirectory({
  places,
}: {
  places: readonly SettingsPlace[];
}) {
  return (
    <nav aria-label="Settings">
      <h2 className="fd-section-title">Workspace tools</h2>
      <div className="fd-feature-grid">
        {places
          .filter((place) => place.group === "featured")
          .map((place) => (
            <Link key={place.label} to={place.to} className="fd-feature">
              <span className="fd-icon" data-color={place.color}>
                <DuetIcon name={place.icon} size={23} />
              </span>
              <strong className="inline-flex items-center gap-2">
                {place.label}
                {place.badge}
              </strong>
              <small>{place.detail}</small>
              <DuetIcon className="fd-go" name="chevronRight" size={16} />
            </Link>
          ))}
      </div>
      <div className="fd-groups">
        {(
          [
            ["operations", "Automation"],
            ["account", "Account & access"],
          ] as const
        ).map(([group, title]) => (
          <section className="fd-surface" key={group}>
            <h2 className="fd-section-title">{title}</h2>
            {places
              .filter((place) => place.group === group)
              .map((place) => (
                <Link className="fd-link" to={place.to} key={place.label}>
                  <DuetIcon name={place.icon} size={19} />
                  <b>{place.label}</b>
                  {place.badge}
                  <DuetIcon name="chevronRight" size={15} />
                </Link>
              ))}
          </section>
        ))}
      </div>
    </nav>
  );
}
