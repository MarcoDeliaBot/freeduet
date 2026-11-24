// Structure only: ids, colours, links and commands. Every visible string is a key in src/i18n/en.json
// (member.<id>.role, demo.<id>.label, safety.<id>.sample, faq.q1 ...), looked up with useI18n().t.

export type MascotId =
  | "iris"
  | "otto"
  | "portia"
  | "penny"
  | "jules"
  | "wren"
  | "mark"
  | "cam"
  | "rex"
  | "gus"
  | "basil"
  | "vera"
  | "leo";

export type TeamCategory = "all" | "daily" | "studio" | "support";

/** out: "Out now"; notlive: "Out now · not run live"; main: "On main · not released" (keys status.*). */
export type StatusKind = "out" | "notlive" | "main";

export interface TeamMember {
  id: MascotId;
  category: Exclude<TeamCategory, "all">;
  accent: string;
  tint: string;
  deep: string;
  status: StatusKind;
}

export const REPO_URL = "https://github.com/MarcoDeliaBot/freeduet";
export const REPORT_URL =
  "https://github.com/MarcoDeliaBot/freeduet/blob/main/evals/team/reports/2026-11-13-claude-code-regraded-2026-11-13-public.md";
export const ROADMAP_URL =
  "https://github.com/MarcoDeliaBot/freeduet/blob/main/docs/ROADMAP.md";
export const SECURITY_URL =
  "https://github.com/MarcoDeliaBot/freeduet/blob/main/SECURITY.md";
export const TEAM_DOCS_URL =
  "https://github.com/MarcoDeliaBot/freeduet/blob/main/docs/TEAM.md";
export const ISSUES_URL =
  "https://github.com/MarcoDeliaBot/freeduet/issues/new/choose";
export const SPONSOR_URL = "https://github.com/sponsors/MarcoDeliaBot";

export const TEAM_MEMBERS: TeamMember[] = [
  { id: "iris", category: "daily", accent: "#BBA6F0", tint: "#F4F0FE", deep: "#6D4EC9", status: "out" },
  { id: "otto", category: "daily", accent: "#F4917A", tint: "#FFF2EE", deep: "#C6533B", status: "out" },
  { id: "portia", category: "daily", accent: "#9B7BE0", tint: "#F3EEFD", deep: "#6643BC", status: "out" },
  { id: "penny", category: "daily", accent: "#F6C955", tint: "#FFF9E6", deep: "#9B6F00", status: "out" },
  { id: "jules", category: "daily", accent: "#6EB8F2", tint: "#EDF6FE", deep: "#1B6DB5", status: "out" },
  { id: "wren", category: "studio", accent: "#F2A36B", tint: "#FFF4EB", deep: "#B95D1E", status: "out" },
  { id: "mark", category: "studio", accent: "#F27272", tint: "#FFF0F0", deep: "#C23B3B", status: "notlive" },
  { id: "cam", category: "studio", accent: "#F38CC2", tint: "#FFF0F7", deep: "#BA3E80", status: "notlive" },
  { id: "rex", category: "support", accent: "#E5484D", tint: "#FFF0F0", deep: "#B7282E", status: "main" },
  { id: "gus", category: "support", accent: "#9AAABF", tint: "#F2F5F9", deep: "#4B5D75", status: "out" },
  { id: "basil", category: "support", accent: "#8DD46E", tint: "#F0FAEC", deep: "#3B8224", status: "out" },
  { id: "vera", category: "support", accent: "#5F8EF0", tint: "#EFF4FE", deep: "#2454BE", status: "out" },
  { id: "leo", category: "studio", accent: "#F5AE4E", tint: "#FFF6E8", deep: "#AE6B12", status: "out" },
];

/** Text keys: demo.<id>.label|prompt|iris|desk|reply|done|gate_title|gate_action|d1l|d1v|d2l|d2v|approved */
export interface WorkflowDemo {
  id: "mail" | "booking" | "invoice";
  memberId: MascotId;
  memberName: string;
  accent: string;
  tint: string;
  deep: string;
}

export const WORKFLOW_DEMOS: WorkflowDemo[] = [
  { id: "mail", memberId: "otto", memberName: "Otto", accent: "#F4917A", tint: "#FFF2EE", deep: "#C6533B" },
  { id: "booking", memberId: "jules", memberName: "Jules", accent: "#6EB8F2", tint: "#EDF6FE", deep: "#1B6DB5" },
  { id: "invoice", memberId: "penny", memberName: "Penny", accent: "#F6C955", tint: "#FFF9E6", deep: "#9B6F00" },
];

/** Text keys: act.<id> (the label), safety.<id>.sample, safety.<id>.rule */
export interface SafetyAction {
  id: "send" | "pay" | "sign" | "book" | "delete";
  color: string;
  bg: string;
  mascot: MascotId;
}

export const SAFETY_ACTIONS: SafetyAction[] = [
  { id: "send", color: "#C6533B", bg: "#FFF1ED", mascot: "otto" },
  { id: "pay", color: "#9B6F00", bg: "#FFF8E2", mascot: "penny" },
  { id: "sign", color: "#6643BC", bg: "#F3EEFE", mascot: "portia" },
  { id: "book", color: "#1B6DB5", bg: "#ECF6FF", mascot: "jules" },
  { id: "delete", color: "#B7282E", bg: "#FFF0F1", mascot: "vera" },
];

// Commands are the same in every language.
export const INSTALL_COMMANDS = `git clone https://github.com/MarcoDeliaBot/freeduet.git
cd freeduet
cp .env.example .env
bash scripts/start.sh
cd openbot && docker compose exec -it agent-freeduet claude`;

/** Text keys: install.s<n>.title, install.s<n>.text */
export const INSTALL_STEP_NUMBERS = ["01", "02", "03", "04"];

/** Text keys: faq.q<n>, faq.a<n> */
export const FAQ_COUNT = 6;
