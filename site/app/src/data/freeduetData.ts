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

export interface TeamMember {
  id: MascotId;
  name: string;
  role: string;
  category: Exclude<TeamCategory, "all">;
  accent: string;
  tint: string;
  deep: string;
  status: "Out now" | "Out now · not run live" | "On main · not released";
  description: string;
  prompt: string;
  shortLine: string;
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
  {
    id: "iris",
    name: "Iris",
    role: "Runs the team",
    category: "daily",
    accent: "#BBA6F0",
    tint: "#F4F0FE",
    deep: "#6D4EC9",
    status: "Out now",
    description:
      "You tell Iris what you need. She routes the task to the right specialist, writes a clear done-when check, and brings the final answer back to you.",
    prompt: "Handle everything that came in this morning.",
    shortLine: "Routing your morning to the right teammate",
  },
  {
    id: "otto",
    name: "Otto",
    role: "Mail",
    category: "daily",
    accent: "#F4917A",
    tint: "#FFF2EE",
    deep: "#C6533B",
    status: "Out now",
    description:
      "Reads your inbox, sorts out what matters now from what can wait, and drafts calm replies for you to check before anything goes out.",
    prompt: "Sort my mail and draft the replies that matter.",
    shortLine: "Reply drafted — waiting for your yes",
  },
  {
    id: "portia",
    name: "Portia",
    role: "Contracts",
    category: "daily",
    accent: "#9B7BE0",
    tint: "#F3EEFD",
    deep: "#6643BC",
    status: "Out now",
    description:
      "Reads through the boring small print and flags clauses, notice periods, and catches clearly before you decide to sign.",
    prompt: "Can I sign this lease?",
    shortLine: "Small print scanned — 2 clauses flagged",
  },
  {
    id: "penny",
    name: "Penny",
    role: "Invoices",
    category: "daily",
    accent: "#F6C955",
    tint: "#FFF9E6",
    deep: "#9B6F00",
    status: "Out now",
    description:
      "Prepares clear invoices, double-checks line items, and tracks who still owes you money. She does not pay or move money.",
    prompt: "Invoice Acme for last week and tell me who hasn't paid.",
    shortLine: "Invoice draft ready — totals double-checked",
  },
  {
    id: "jules",
    name: "Jules",
    role: "Errands",
    category: "daily",
    accent: "#6EB8F2",
    tint: "#EDF6FE",
    deep: "#1B6DB5",
    status: "Out now",
    description:
      "Compares flights, gifts, and restaurant tables in its own separate browser, then holds the booking for your yes.",
    prompt: "Book a table for four on Friday.",
    shortLine: "Found 3 Friday tables — holding for you",
  },
  {
    id: "wren",
    name: "Wren",
    role: "Writing",
    category: "studio",
    accent: "#F2A36B",
    tint: "#FFF4EB",
    deep: "#B95D1E",
    status: "Out now",
    description:
      "Turns your rough voice notes and messy drafts into crisp posts, emails, and documents that genuinely sound like you.",
    prompt: "Turn this voice note into a post in my style.",
    shortLine: "Drafted cleanly in your own voice",
  },
  {
    id: "mark",
    name: "Mark",
    role: "Marketing",
    category: "studio",
    accent: "#F27272",
    tint: "#FFF0F0",
    deep: "#C23B3B",
    status: "Out now · not run live",
    description:
      "Builds your marketing plan, launch strategy, SEO checks, and channel ideas. By default he never publishes or spends without your yes.",
    prompt: "Give me a three-month marketing plan for my shop.",
    shortLine: "Launch checklist outlined — zero spend queued",
  },
  {
    id: "cam",
    name: "Cam",
    role: "Video",
    category: "studio",
    accent: "#F38CC2",
    tint: "#FFF0F7",
    deep: "#BA3E80",
    status: "Out now · not run live",
    description:
      "Cuts short videos with subtitles, music, and sound in landscape, vertical, and square formats locally with ffmpeg — never uploading without you.",
    prompt: "Make a 30-second vertical video from this script, with subtitles.",
    shortLine: "30s vertical cut with crisp captions ready",
  },
  {
    id: "rex",
    name: "Rex",
    role: "Model trainer",
    category: "support",
    accent: "#E5484D",
    tint: "#FFF0F0",
    deep: "#B7282E",
    status: "On main · not released",
    description:
      "Compares the team's test reports for your AI engines, from what you paste in, and proposes the best fit for each teammate. He never switches an engine himself: you decide on the Engines page.",
    prompt: "Basil runs on my local model now. Is that good enough?",
    shortLine: "Compare engines — you choose on Engines page",
  },
  {
    id: "gus",
    name: "Gus",
    role: "Repairs",
    category: "support",
    accent: "#9AAABF",
    tint: "#F2F5F9",
    deep: "#4B5D75",
    status: "Out now",
    description:
      "Share a photo of what broke around the home or office. Gus explains how to fix it safely step by step, or when to call a specialist.",
    prompt: "The door won't close. Here's a photo.",
    shortLine: "Safe step-by-step hinge check prepared",
  },
  {
    id: "basil",
    name: "Basil",
    role: "Cooking",
    category: "support",
    accent: "#8DD46E",
    tint: "#F0FAEC",
    deep: "#3B8224",
    status: "Out now",
    description:
      "Tell Basil what is sitting in your fridge and he brings back three practical, delicious dishes you can actually cook tonight.",
    prompt: "What can I cook with spinach and eggs?",
    shortLine: "Three crisp tonight ideas ready",
  },
  {
    id: "vera",
    name: "Vera",
    role: "Checking",
    category: "support",
    accent: "#5F8EF0",
    tint: "#EFF4FE",
    deep: "#2454BE",
    status: "Out now",
    description:
      "Works quietly behind the scenes: re-running sums, double-checking figures, and inspecting drafts before important work reaches you.",
    prompt: "Iris sends Vera every invoice, contract check, and cart.",
    shortLine: "Totals re-checked before you see them",
  },
  {
    id: "leo",
    name: "Leo",
    role: "Builds assistants",
    category: "studio",
    accent: "#F5AE4E",
    tint: "#FFF6E8",
    deep: "#AE6B12",
    status: "Out now",
    description:
      "Need a new specialist that doesn't exist yet? Leo designs it cleanly and proposes any missing tool with its source and licence first.",
    prompt: "I need someone who tracks my domain renewals.",
    shortLine: "New domain-tracker drafted for approval",
  },
];

export interface WorkflowDemo {
  id: string;
  label: string;
  memberId: MascotId;
  memberName: string;
  memberRole: string;
  accent: string;
  tint: string;
  deep: string;
  userPrompt: string;
  irisLine: string;
  deskAction: string;
  memberReply: string;
  doneWhen: string;
  gateTitle: string;
  gateAction: string;
  gateDetails: { label: string; value: string }[];
  approvedText: string;
}

export const WORKFLOW_DEMOS: WorkflowDemo[] = [
  {
    id: "mail",
    label: "Mail reply",
    memberId: "otto",
    memberName: "Otto",
    memberRole: "Mail",
    accent: "#F4917A",
    tint: "#FFF2EE",
    deep: "#C6533B",
    userPrompt: "Reply to the plumber's email: Tuesday at 9 is fine.",
    irisLine: "On it. Sending this over to Otto with a clear draft check.",
    deskAction: "Reading thread · drafting in your tone…",
    memberReply:
      "Found the email thread and prepared your reply. Held until you press Approve.",
    doneWhen: "A reply draft is ready to read, and nothing has been sent.",
    gateTitle: "Send this email?",
    gateAction: "Send",
    gateDetails: [
      { label: "To", value: "The plumber (same conversation)" },
      { label: "Draft", value: "Good morning, Tuesday at 9 works for me. Thank you!" },
    ],
    approvedText: "Approved in demo — Otto sends the email.",
  },
  {
    id: "booking",
    label: "Book a table",
    memberId: "jules",
    memberName: "Jules",
    memberRole: "Errands",
    accent: "#6EB8F2",
    tint: "#EDF6FE",
    deep: "#1B6DB5",
    userPrompt: "Find a table for four on Friday around 8 pm near the square.",
    irisLine: "Handing this to Jules to compare open times in his own browser.",
    deskAction: "Checking real openings in isolated browser…",
    memberReply:
      "Osteria Luma has an 8:00 pm table for four with free cancellation. Waiting for your yes.",
    doneWhen: "A real slot is prepared to confirm, and nothing is booked yet.",
    gateTitle: "Confirm reservation?",
    gateAction: "Book",
    gateDetails: [
      { label: "Place", value: "Osteria Luma · 4 guests" },
      { label: "When", value: "Friday at 20:00 (no prepayment)" },
    ],
    approvedText: "Approved in demo — Jules confirms Friday at 20:00.",
  },
  {
    id: "invoice",
    label: "Send invoice",
    memberId: "penny",
    memberName: "Penny",
    memberRole: "Invoices",
    accent: "#F6C955",
    tint: "#FFF9E6",
    deep: "#9B6F00",
    userPrompt: "Prepare the invoice for Acme Studio from last week's hours.",
    irisLine: "Passing to Penny to build the totals, then Vera re-checks the math.",
    deskAction: "Verifying hours & line totals with Vera…",
    memberReply:
      "Draft #2026-14 is checked and ready to inspect. Nothing goes out without your approval.",
    doneWhen: "Invoice sums match your hours, reviewed cleanly, unsent.",
    gateTitle: "Send invoice draft?",
    gateAction: "Pay / Send",
    gateDetails: [
      { label: "Client", value: "Acme Studio · Invoice #2026-14" },
      { label: "Total", value: "€840.00 (14 hrs · checked by Vera)" },
    ],
    approvedText: "Approved in demo — invoice draft approved.",
  },
];

export interface SafetyAction {
  id: "send" | "pay" | "sign" | "book" | "delete";
  label: string;
  color: string;
  bg: string;
  sample: string;
  rule: string;
  mascot: MascotId;
}

export const SAFETY_ACTIONS: SafetyAction[] = [
  {
    id: "send",
    label: "Send",
    color: "#C6533B",
    bg: "#FFF1ED",
    sample: "Reply to an email thread or post a prepared draft",
    rule: "By default it waits for your approval card. Exception: a brand-new email to an address you typed yourself counts as your yes.",
    mascot: "otto",
  },
  {
    id: "pay",
    label: "Pay",
    color: "#9B6F00",
    bg: "#FFF8E2",
    sample: "Any checkout, transfer, card entry, or invoice payment",
    rule: "A fixed rule that matches payment words in the 12 languages of this site sends it to you, and a reviewer model judges what the words miss. Neither is perfect, and spending caps and purchase permits are not built yet (planned, v0.4).",
    mascot: "penny",
  },
  {
    id: "sign",
    label: "Sign",
    color: "#6643BC",
    bg: "#F3EEFE",
    sample: "Agreements, leases, consent forms, or client quotes",
    rule: "Portia reads the fine print and flags clauses first. A signature still waits for your approval card. Her review is a first pass, not legal advice.",
    mascot: "portia",
  },
  {
    id: "book",
    label: "Book",
    color: "#1B6DB5",
    bg: "#ECF6FF",
    sample: "Flights, tables, deliveries, and calendar confirmations",
    rule: "Jules compares live options inside its own browser and shows time, place, and price. The booking itself waits for your approval card.",
    mascot: "jules",
  },
  {
    id: "delete",
    label: "Delete",
    color: "#B7282E",
    bg: "#FFF0F1",
    sample: "Removing emails permanently, wiping records, or cancelling plans",
    rule: "By default it stops at your approval card. Standing mail rules you set can only label, archive, mark as read, or move mail to Spam or the Bin.",
    mascot: "vera",
  },
];

export const INSTALL_COMMANDS = `git clone https://github.com/MarcoDeliaBot/freeduet.git
cd freeduet
cp .env.example .env
bash scripts/start.sh
cd openbot && docker compose exec -it agent-freeduet claude`;

export const INSTALL_STEPS = [
  {
    num: "01",
    title: "Get the code",
    text: "Clone FreeDuet from GitHub and copy the example settings file.",
  },
  {
    num: "02",
    title: "Run the start script",
    text: "Starts the app, all assistants, and isolated member browsers. Needs Docker, Bash, and Bun (WSL2 on Windows).",
  },
  {
    num: "03",
    title: "Sign in once with your Claude plan",
    text: "Log into official Claude Code yourself. FreeDuet never copies or forwards your sign-in — it stays locally in its Docker volume.",
  },
  {
    num: "04",
    title: "Open localhost:3010 & greet Iris",
    text: "Write one small everyday task in your language. Iris hands it to the right member and asks for your approval where it is needed.",
  },
];

export const FAQ_ITEMS = [
  {
    q: "What is free, and what do I pay for?",
    a: "FreeDuet is free and open source under the MIT licence, including for business use. You bring the monthly AI subscription you already have — today a Claude plan through the official Claude Code app. No pay-per-token API key meter to buy. Extra engines (free or local models) can be added on the Engines page; they are off by default, and only the Claude login has answered a real turn so far.",
  },
  {
    q: "What do I need to install it?",
    a: "A Claude subscription plus Docker, Bash, and Bun on your computer. The maintainer runs it on Windows with WSL2, and CI starts it cleanly on Linux. It has not yet been tested on macOS. A one-file double-click installer is the top item in progress; the first-step install scripts for Ubuntu and Windows have not yet run on a clean machine.",
  },
  {
    q: "Where does my data live?",
    a: "The app, database, and each assistant's isolated browser run on your own computer. By default your conversations stay stored locally there. To think, requests go to the AI service you signed in to (or any extra engine you manually enable on the Engines page).",
  },
  {
    q: "What can an assistant do without asking me?",
    a: "It can search, read, check, and prepare drafts and short reports. By default, Send, Pay, Sign, Book, and Delete pause for your approval card: a fixed rule matches the words, and a reviewer model checks the rest against what you typed. Exceptions: a brand-new email to an address you type yourself, standing mail rules you set (label, archive, mark read, move to Spam or the Bin only), and Full access if you switch it on for a member. Assistants can still make mistakes, so read every card before approving.",
  },
  {
    q: "Can I add a custom assistant to the team?",
    a: "Yes. Ask Leo in chat to design a brand-new specialist for the exact job you need, or edit a member definition yourself. When a tool is missing, Leo lists its source and licence first and installs nothing without your yes.",
  },
  {
    q: "Can I pair it from my phone?",
    a: "v0.2.2 can pair a phone browser from your computer with a one-time code shown as a QR code; this ran once on the maintainer\'s own installation on 16 November 2026. Revoking a pairing and approving from the phone are not yet checked, and remote access from outside your home network is still in progress.",
  },
];
