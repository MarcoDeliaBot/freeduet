import { Tabs } from "@base-ui/react/tabs";
import { useId, useState, type ReactNode } from "react";
import { DuetIcon, type DuetIconName } from "@/components/duet/icons";
import { PageShell } from "@/components/layout/page-shell";
import { MemberPicture } from "./wide/mascot";
import "./workspace.css";

export function WorkspaceShell({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: DuetIconName | "iris";
  children: ReactNode;
}) {
  return (
    <PageShell
      className="fd-workspace"
      title={title}
      width="wide"
      header={
        <header className="fd-cover">
          <div className="fd-cover-copy">
            <div className="fd-context">
              <DuetIcon name="layout" size={16} /> Workspace
            </div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="fd-cover-art" aria-hidden="true">
            <i />
            <i />
            <i />
            <div className="fd-cover-symbol">
              {icon === "iris" ? (
                <MemberPicture agentId="freeduet" size={68} />
              ) : (
                <DuetIcon name={icon} size={43} />
              )}
            </div>
          </div>
        </header>
      }
    >
      {children}
    </PageShell>
  );
}

type WorkspaceView = {
  id: string;
  label: string;
  icon: DuetIconName;
  content: ReactNode;
};

/** Open sections on demand and keep drafts and pending confirmations when switching back. */
export function WorkspaceTabs({
  label,
  views,
}: {
  label: string;
  views: WorkspaceView[];
}) {
  const [selected, setSelected] = useState(views[0]?.id);
  const [visited, setVisited] = useState<string[]>([]);
  const active = views.some((view) => view.id === selected)
    ? selected
    : views[0]?.id;
  return (
    <Tabs.Root
      value={active}
      onValueChange={(value) => {
        if (typeof value !== "string") return;
        setVisited((previous) =>
          Array.from(
            new Set([...previous, ...(active ? [active] : []), value]),
          ),
        );
        setSelected(value);
      }}
    >
      <Tabs.List className="fd-tabs" aria-label={label} activateOnFocus>
        {views.map((view) => (
          <Tabs.Tab className="fd-tab" key={view.id} value={view.id}>
            <DuetIcon name={view.icon} size={17} />
            {view.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {views.map((view) => (
        <Tabs.Panel
          className="fd-panel"
          key={view.id}
          value={view.id}
          keepMounted
        >
          {(active === view.id || visited.includes(view.id)) && view.content}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

export function WorkspacePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="fd-picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
