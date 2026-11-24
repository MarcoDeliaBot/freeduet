import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  CreditCard,
  FileSignature,
  Globe,
  Hand,
  Lock,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { FreeDuetMascot } from "./FreeDuetMascot";
import type { MascotMood } from "./FreeDuetMascot";
import {
  REPORT_URL,
  SAFETY_ACTIONS,
  SECURITY_URL,
  TEAM_DOCS_URL,
  TEAM_MEMBERS,
  WORKFLOW_DEMOS,
} from "../data/freeduetData";
import type { MascotId, TeamCategory } from "../data/freeduetData";

interface MotionProps {
  paused: boolean;
}

/* ==========================================================================
   1. HERO DUET ORCHESTRA — Interactive cursor-tracking Iris + live pulses
   ========================================================================== */

interface OrbitSlot {
  id: MascotId;
  name: string;
  role: string;
  accent: string;
  deep: string;
  tint: string;
  x: number;
  y: number;
  beam: string;
  task: string;
  tag: string;
}

const ORBIT_TEAM: OrbitSlot[] = [
  {
    id: "otto",
    name: "Otto",
    role: "Mail",
    accent: "#F4917A",
    deep: "#C6533B",
    tint: "#FFF2EE",
    x: 92,
    y: 110,
    beam: "M 244 218 Q 178 148 124 126",
    task: "Reply drafted for the plumber",
    tag: "Waiting for yes",
  },
  {
    id: "portia",
    name: "Portia",
    role: "Contracts",
    accent: "#9B7BE0",
    deep: "#6643BC",
    tint: "#F4EFFE",
    x: 468,
    y: 110,
    beam: "M 316 218 Q 382 148 436 126",
    task: "2 lease clauses highlighted",
    tag: "Ready to review",
  },
  {
    id: "penny",
    name: "Penny",
    role: "Invoices",
    accent: "#F6C955",
    deep: "#9B6F00",
    tint: "#FFF8E1",
    x: 96,
    y: 382,
    beam: "M 242 288 Q 172 346 128 368",
    task: "Acme invoice sums double-checked",
    tag: "Held to send",
  },
  {
    id: "jules",
    name: "Jules",
    role: "Errands",
    accent: "#6EB8F2",
    deep: "#1B6DB5",
    tint: "#ECF6FF",
    x: 464,
    y: 382,
    beam: "M 318 288 Q 388 346 432 368",
    task: "Friday table for 4 reserved",
    tag: "Tap to approve",
  },
];

export function HeroOrchestra({ paused }: MotionProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [irisCheer, setIrisCheer] = useState(false);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % ORBIT_TEAM.length);
    }, 3400);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    if (!irisCheer) return;
    const timer = window.setTimeout(() => setIrisCheer(false), 1900);
    return () => window.clearTimeout(timer);
  }, [irisCheer]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (paused || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setGaze({ x: nx * 3, y: ny * 2.4 });
  };

  const handleMouseLeave = () => setGaze({ x: 0, y: 0 });

  const current = ORBIT_TEAM[activeIdx];

  return (
    <div
      ref={stageRef}
      className="hero-stage"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="Animated graphic of Iris connecting with Otto, Portia, Penny, and Jules"
    >
      {/* Daylight pastel luminous aura blurs */}
      <div className="stage-glow stage-glow-aqua" aria-hidden="true" />
      <div className="stage-glow stage-glow-lav" aria-hidden="true" />
      <div className="stage-glow stage-glow-sun" aria-hidden="true" />

      {/* Animated vector orbital choreography & live traveling pulses */}
      <svg className="stage-svg" viewBox="0 0 560 520" fill="none" aria-hidden="true">
        <defs>
          <radialGradient id="heroIrisGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4FD3D6" stopOpacity="0.26" />
            <stop offset="56%" stopColor="#BBA6F0" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx="280" cy="250" r="150" fill="url(#heroIrisGlow)" className="mg-breathe" />

        {/* Dual counter-rotating studio orbits with glowing satellite beads */}
        <g className="mg-orbit-cw" style={{ transformOrigin: "280px 250px" }}>
          <circle cx="280" cy="250" r="214" stroke="#C5DAF5" strokeWidth="1.5" strokeDasharray="6 9" />
          <circle cx="280" cy="36" r="5.5" fill="#4FD3D6" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="494" cy="250" r="5" fill="#BBA6F0" stroke="#FFFFFF" strokeWidth="2" />
          <circle cx="66" cy="250" r="4.5" fill="#F6C955" stroke="#FFFFFF" strokeWidth="2" />
        </g>

        <g className="mg-orbit-ccw" style={{ transformOrigin: "280px 250px" }}>
          <circle cx="280" cy="250" r="152" stroke="#BEECEE" strokeWidth="1.7" strokeDasharray="12 10" />
          <circle cx="280" cy="98" r="4.5" fill="#1B4FD8" opacity="0.65" />
          <circle cx="280" cy="402" r="4.5" fill="#F4917A" opacity="0.82" />
        </g>

        {/* Continuous delicate sonar ripples from Iris */}
        <circle cx="280" cy="250" r="96" stroke="#4FD3D6" strokeWidth="1.8" className="mg-ripple" />
        <circle cx="280" cy="250" r="96" stroke="#BBA6F0" strokeWidth="1.6" className="mg-ripple mg-ripple-b" />

        {/* Live flowing hand-off beams to all 4 orbiting specialist mascots */}
        {ORBIT_TEAM.map((slot, index) => {
          const active = index === activeIdx;
          return (
            <g key={slot.id}>
              <path
                d={slot.beam}
                stroke={active ? slot.accent : "#D5E2F4"}
                strokeWidth={active ? 3.5 : 1.7}
                strokeLinecap="round"
                strokeDasharray={active ? "8 6" : "4 7"}
                className={active ? "mg-flow-line" : ""}
              />
              {active && !paused && (
                <>
                  <circle r="6.5" fill={slot.deep} stroke="#FFFFFF" strokeWidth="2.4">
                    <animateMotion dur="1.35s" repeatCount="indefinite" path={slot.beam} />
                  </circle>
                  <circle r="3.5" fill={slot.accent} opacity="0.7">
                    <animateMotion dur="1.35s" begin="0.16s" repeatCount="indefinite" path={slot.beam} />
                  </circle>
                </>
              )}
            </g>
          );
        })}

        {/* Studio 4-point twinkling motion sparkles */}
        <path
          className="mg-spark mg-spark-1"
          d="M280 50 C282.5 62 286.5 66 298.5 68.5 C286.5 71 282.5 75 280 87 C277.5 75 273.5 71 261.5 68.5 C273.5 66 277.5 62 280 50 Z"
          fill="#4FD3D6"
        />
        <path
          className="mg-spark mg-spark-2"
          d="M372 156 C373.5 163 376.5 166 383.5 167.5 C376.5 169 373.5 172 372 179 C370.5 172 367.5 169 360.5 167.5 C367.5 166 370.5 163 372 156 Z"
          fill="#F6C955"
        />
        <path
          className="mg-spark mg-spark-3"
          d="M190 310 C191.5 316.5 194 319 200.5 320.5 C194 322 191.5 324.5 190 331 C188.5 324.5 186 322 179.5 320.5 C186 319 188.5 316.5 190 310 Z"
          fill="#BBA6F0"
        />
      </svg>

      {/* Center giant animated Iris — eyes gently track pointer, click to celebrate */}
      <motion.button
        type="button"
        className="hero-iris-node"
        onClick={() => setIrisCheer(true)}
        whileHover={paused ? undefined : { scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label="Iris, team coordinator. Click to make Iris wave and smile"
      >
        <span className="hero-iris-disc" />
        <FreeDuetMascot
          id="iris"
          size={188}
          mood={irisCheer ? "done" : "listen"}
          wave={irisCheer}
          showNotes={!paused}
          showSparkles={irisCheer}
          gaze={gaze}
          animated={!paused}
          className="hero-iris-svg"
        />
        <span className="hero-iris-tag">
          <span className="eq-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <strong>Iris</strong>
          <small>{irisCheer ? "Hi there!" : "Chief of Staff"}</small>
        </span>
      </motion.button>

      {/* 4 specialist mascots floating around Iris */}
      {ORBIT_TEAM.map((slot, index) => {
        const isActive = index === activeIdx;
        const posStyle = {
          left: `${(slot.x / 560) * 100}%`,
          top: `${(slot.y / 520) * 100}%`,
          "--node-accent": slot.accent,
          "--node-deep": slot.deep,
          "--node-tint": slot.tint,
        } as CSSProperties;

        return (
          <motion.button
            key={slot.id}
            type="button"
            style={posStyle}
            className={`orbit-node ${isActive ? "is-active" : ""}`}
            onClick={() => setActiveIdx(index)}
            aria-pressed={isActive}
            aria-label={`Spotlight ${slot.name}, ${slot.role}`}
            animate={
              paused
                ? undefined
                : {
                    y: isActive ? -7 : [0, index % 2 === 0 ? -5 : 5, 0],
                    scale: isActive ? 1.07 : 1,
                  }
            }
            transition={
              isActive
                ? { type: "spring", stiffness: 320, damping: 22 }
                : { duration: 4 + index * 0.45, repeat: Infinity, ease: "easeInOut" }
            }
            whileHover={paused ? undefined : { scale: 1.1 }}
          >
            <FreeDuetMascot
              id={slot.id}
              size={84}
              mood={isActive ? "done" : "idle"}
              wave={isActive}
              animated={!paused}
              delay={index * 0.55}
            />
            <span className="orbit-node-label">
              <b>{slot.name}</b>
              <small>{slot.role}</small>
            </span>
          </motion.button>
        );
      })}

      {/* Floating crisp status feed pill */}
      <div className="hero-live-pill" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            className="hero-live-inner"
            initial={paused ? false : { opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={paused ? undefined : { opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="hero-live-dot" style={{ backgroundColor: current.accent }} />
            <span className="hero-live-text">
              <strong>{current.name}:</strong> {current.task}
            </span>
            <span
              className="hero-live-badge"
              style={{ backgroundColor: current.tint, color: current.deep }}
            >
              <ShieldCheck size={12} aria-hidden="true" />
              {current.tag}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ==========================================================================
   2. WORKFLOW THEATER — Interactive mascot hand-off + approval cards
   ========================================================================== */

const WORKFLOW_STEPS = [
  {
    n: "01",
    title: "Write what you need",
    body: "Plain words in your own language — just like texting a friend.",
  },
  {
    n: "02",
    title: "Iris picks your specialist",
    body: "Routes your task with a done-when line, so you can see what counts as finished.",
  },
  {
    n: "03",
    title: "Works at its own desk",
    body: "Searches, reads, and prepares drafts in an isolated browser. Page text is treated as data, not as orders.",
  },
  {
    n: "04",
    title: "A card asks for your yes",
    body: "If the task touches Send, Pay, Sign, Book, or Delete, work pauses here for your yes, by default.",
  },
  {
    n: "05",
    title: "You get a short report",
    body: "What was done, what was held, and the next step. No walls of text.",
  },
];

export function WorkflowTheater({ paused }: MotionProps) {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [phase, setPhase] = useState<number>(4);
  const [decision, setDecision] = useState<"waiting" | "approved" | "held">("waiting");
  const [playNonce, setPlayNonce] = useState(0);

  const demo = WORKFLOW_DEMOS[scenarioIdx];

  useEffect(() => {
    if (paused) {
      setPhase(4);
      return;
    }
    setPhase(1);
    const t2 = window.setTimeout(() => setPhase(2), 620);
    const t3 = window.setTimeout(() => setPhase(3), 1340);
    const t4 = window.setTimeout(() => setPhase(4), 2100);
    return () => {
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(t4);
    };
  }, [scenarioIdx, playNonce, paused]);

  const selectScenario = (index: number) => {
    setScenarioIdx(index);
    setDecision("waiting");
  };

  const handleReplay = () => {
    setDecision("waiting");
    setPlayNonce((n) => n + 1);
  };

  const activeStep = decision === "approved" ? 4 : Math.min(phase - 1, 3);

  const irisMood: MascotMood =
    decision === "approved"
      ? "done"
      : phase === 1
        ? "listen"
        : phase === 2
          ? "think"
          : "idle";

  const helperMood: MascotMood =
    decision === "approved"
      ? "done"
      : phase === 3
        ? "work"
        : phase >= 4
          ? "ask"
          : "listen";

  return (
    <section className="section-surface surface-mist" id="how" aria-labelledby="how-heading">
      <div className="container">
        <div className="section-head split-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" style={{ background: "#1B4FD8" }} />
              Interactive demo
            </p>
            <h2 id="how-heading">
              What happens after <span className="accent-text">you press Enter.</span>
            </h2>
          </div>
          <p className="section-lead">
            Pick any example below to watch Iris hand a job off to a specialist and pause politely at your approval card.
          </p>
        </div>

        {/* Scenario pill tabs */}
        <div className="scenario-bar" role="tablist" aria-label="Demo task examples">
          {WORKFLOW_DEMOS.map((item, idx) => {
            const active = idx === scenarioIdx;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`scenario-tab ${active ? "is-active" : ""}`}
                onClick={() => selectScenario(idx)}
              >
                {active && (
                  <motion.span
                    layoutId="scenarioPill"
                    className="scenario-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="scenario-tab-inner">
                  <FreeDuetMascot id={item.memberId} size={30} animated={false} />
                  <span>
                    {item.memberName} · {item.label}
                  </span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            className="replay-btn"
            onClick={handleReplay}
            aria-label="Replay workflow animation"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Replay
          </button>
        </div>

        <div className="workflow-grid">
          <ol className="step-rail">
            {WORKFLOW_STEPS.map((st, idx) => {
              const isCurrent = idx === activeStep;
              const isDone = idx < activeStep || (decision === "approved" && idx <= 4);
              return (
                <li
                  key={st.n}
                  className={`step-item ${isCurrent ? "is-current" : ""} ${isDone ? "is-done" : ""}`}
                >
                  <button
                    type="button"
                    className="step-trigger"
                    onClick={() => {
                      if (idx === 4) {
                        setPhase(4);
                        setDecision("approved");
                      } else {
                        setDecision("waiting");
                        setPhase(idx + 1);
                      }
                    }}
                  >
                    <span className="step-badge" aria-hidden="true">
                      {isDone && !isCurrent ? <Check size={13} strokeWidth={3} /> : st.n}
                    </span>
                    <span className="step-copy">
                      <strong>{st.title}</strong>
                      <span>{st.body}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="theater-frame">
            <div className="theater-card">
              <div className="theater-top">
                <div className="theater-brand">
                  <span className="mini-ring-logo" aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <strong>FreeDuet</strong>
                </div>
                <span className="demo-chip">Demo · made-up example</span>
              </div>

              {/* Expressive animated relay stage with official character moods */}
              <div
                className="relay-banner"
                style={{ background: `linear-gradient(120deg, #EBFBFB 0%, ${demo.tint} 100%)` }}
              >
                <div className="relay-actor">
                  <FreeDuetMascot
                    id="iris"
                    size={80}
                    mood={irisMood}
                    wave={phase === 2 || decision === "approved"}
                    animated={!paused}
                  />
                  <span>Iris</span>
                </div>

                <div className="relay-bridge" aria-hidden="true">
                  <svg viewBox="0 0 210 54" fill="none">
                    <path
                      d="M 10 36 Q 105 4 200 36"
                      stroke="#CBD9EE"
                      strokeWidth="2.5"
                      strokeDasharray="5 6"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 10 36 Q 105 4 200 36"
                      stroke={decision === "approved" ? "#0F8A64" : demo.deep}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      className={phase >= 2 ? "relay-arc is-lit" : "relay-arc"}
                    />
                    {phase >= 2 && !paused && (
                      <circle
                        r="5.8"
                        fill={decision === "approved" ? "#0F8A64" : demo.deep}
                        stroke="#FFFFFF"
                        strokeWidth="2.2"
                      >
                        <animateMotion
                          dur="1.4s"
                          repeatCount="indefinite"
                          path="M 10 36 Q 105 4 200 36"
                        />
                      </circle>
                    )}
                  </svg>
                  <span
                    className="relay-status"
                    style={{ color: decision === "approved" ? "#0F8A64" : demo.deep }}
                  >
                    {decision === "approved"
                      ? "Approved & done!"
                      : phase === 1
                        ? "Iris listening…"
                        : phase === 2
                          ? `Hand-off → ${demo.memberName}`
                          : phase === 3
                            ? demo.deskAction
                            : "Waiting for your yes"}
                  </span>
                </div>

                <div className="relay-actor">
                  <FreeDuetMascot
                    id={demo.memberId}
                    size={80}
                    mood={helperMood}
                    wave={decision === "approved"}
                    showSparkles={decision === "approved"}
                    animated={!paused}
                    delay={0.4}
                  />
                  <span>{demo.memberName}</span>
                </div>
              </div>

              <div className="theater-body">
                <motion.div
                  key={`u-${demo.id}-${playNonce}`}
                  className="chat-user"
                  initial={paused ? false : { opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.34 }}
                >
                  {demo.userPrompt}
                </motion.div>

                {phase >= 2 && (
                  <motion.div
                    key={`i-${demo.id}-${playNonce}`}
                    className="chat-row"
                    initial={paused ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34 }}
                  >
                    <span className="chat-tag tag-iris">Iris</span>
                    <div className="chat-bubble">
                      <p>{demo.irisLine}</p>
                      <span className="done-when">
                        <b>Done when:</b> {demo.doneWhen}
                      </span>
                    </div>
                  </motion.div>
                )}

                {phase >= 3 && (
                  <motion.div
                    key={`m-${demo.id}-${playNonce}`}
                    className="chat-row"
                    initial={paused ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34 }}
                  >
                    <span
                      className="chat-tag"
                      style={{ backgroundColor: demo.tint, color: demo.deep }}
                    >
                      {demo.memberName}
                    </span>
                    <div className="chat-bubble">
                      <p>{demo.memberReply}</p>
                    </div>
                  </motion.div>
                )}

                {phase >= 4 && (
                  <motion.div
                    key={`g-${demo.id}-${playNonce}`}
                    className={`gate-card ${decision === "approved" ? "is-approved" : ""} ${decision === "held" ? "is-held" : ""}`}
                    initial={paused ? false : { opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 320, damping: 26 }}
                  >
                    <div className="gate-top">
                      <span className="gate-flag">
                        <span className="gate-pulse" aria-hidden="true" />
                        {decision === "approved"
                          ? "Approved in demo"
                          : decision === "held"
                            ? "Kept on hold"
                            : `Waiting for your yes · ${demo.gateAction}`}
                      </span>
                      <ShieldCheck size={16} aria-hidden="true" />
                    </div>
                    <strong className="gate-title">{demo.gateTitle}</strong>
                    <dl className="gate-dl">
                      {demo.gateDetails.map((d) => (
                        <div key={d.label}>
                          <dt>{d.label}</dt>
                          <dd>{d.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="gate-actions" aria-live="polite">
                      {decision === "waiting" ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => setDecision("approved")}
                          >
                            <Check size={15} aria-hidden="true" />
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-soft btn-sm"
                            onClick={() => setDecision("held")}
                          >
                            Not now
                          </button>
                        </>
                      ) : (
                        <div className="gate-outcome">
                          <span className="outcome-msg">
                            {decision === "approved" ? (
                              <>
                                <Sparkles size={15} aria-hidden="true" />
                                {demo.approvedText}
                              </>
                            ) : (
                              <>Nothing was sent. The draft is kept for you.</>
                            )}
                          </span>
                          <button
                            type="button"
                            className="outcome-reset"
                            onClick={() => setDecision("waiting")}
                          >
                            <RotateCcw size={13} aria-hidden="true" /> Reset
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
            <p className="theater-note">
              Illustration made for this page — every name and message is made up. Nothing is sent.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ==========================================================================
   3. TEAM SHOWCASE — All 13 real official mascots + live 6-mood animation studio
   ========================================================================== */

const CATEGORY_TABS: { id: TeamCategory; label: string }[] = [
  { id: "all", label: "All 13" },
  { id: "daily", label: "Everyday office" },
  { id: "studio", label: "Creative & growth" },
  { id: "support", label: "Home & checks" },
];

const MOOD_CONTROLS: { id: MascotMood; label: string }[] = [
  { id: "idle", label: "Idle" },
  { id: "listen", label: "Listen" },
  { id: "think", label: "Think" },
  { id: "work", label: "Work" },
  { id: "ask", label: "Ask yes" },
  { id: "done", label: "Happy" },
];

export function TeamShowcase({ paused }: MotionProps) {
  const [selectedId, setSelectedId] = useState<MascotId>("iris");
  const [category, setCategory] = useState<TeamCategory>("all");
  const [mood, setMood] = useState<MascotMood>("idle");
  const [waving, setWaving] = useState(false);

  const visible =
    category === "all"
      ? TEAM_MEMBERS
      : TEAM_MEMBERS.filter((m) => m.category === category);

  const current = TEAM_MEMBERS.find((m) => m.id === selectedId) ?? TEAM_MEMBERS[0];

  useEffect(() => {
    if (!waving) return;
    const t = window.setTimeout(() => setWaving(false), 1600);
    return () => window.clearTimeout(t);
  }, [waving]);

  const chooseMember = (id: MascotId) => {
    setSelectedId(id);
    setMood("done");
    setWaving(true);
  };

  const triggerWave = () => {
    setMood("done");
    setWaving(true);
  };

  const stepMember = (dir: -1 | 1) => {
    const idx = TEAM_MEMBERS.findIndex((m) => m.id === selectedId);
    const next = TEAM_MEMBERS[(idx + dir + TEAM_MEMBERS.length) % TEAM_MEMBERS.length];
    chooseMember(next.id);
  };

  return (
    <section className="section-surface surface-white" id="team" aria-labelledby="team-heading">
      <div className="container">
        <div className="section-head split-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" style={{ background: "#9B7BE0" }} />
              Official team · 13 mascots
            </p>
            <h2 id="team-heading">
              Meet the crew. <span className="accent-text">One job each.</span>
            </h2>
          </div>
          <p className="section-lead">
            For the same reason a football team has a goalkeeper: doing one job all day makes you
            great at it. Click any mascot and preview all six live animation expressions. Out now means it is in the v0.2.2 release; much of it has not yet been run live.
          </p>
        </div>

        {/* Category tabs */}
        <div className="team-filters" role="group" aria-label="Filter team members">
          {CATEGORY_TABS.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                className={`filter-chip ${active ? "is-active" : ""}`}
                onClick={() => {
                  setCategory(tab.id);
                  const matching =
                    tab.id === "all"
                      ? TEAM_MEMBERS
                      : TEAM_MEMBERS.filter((m) => m.category === tab.id);
                  if (!matching.some((m) => m.id === selectedId) && matching[0]) {
                    setSelectedId(matching[0].id);
                  }
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Interactive character spotlight & 6-mood animation control */}
        <div
          className="spotlight-card"
          style={
            {
              "--spot-tint": current.tint,
              "--spot-accent": current.accent,
              "--spot-deep": current.deep,
            } as CSSProperties
          }
          aria-live="polite"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              className="spotlight-inner"
              initial={paused ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={paused ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="spotlight-visual">
                <div className="spotlight-circle" aria-hidden="true" />
                <motion.div
                  className="spotlight-mascot-wrap"
                  animate={
                    paused
                      ? { y: 0, rotate: 0 }
                      : waving
                        ? { y: [0, -14, 0, -6, 0], rotate: [0, -4, 4, 0] }
                        : { y: 0, rotate: 0 }
                  }
                  transition={{ duration: 0.7, ease: "easeOut" }}
                >
                  <FreeDuetMascot
                    id={current.id}
                    size={176}
                    mood={mood}
                    wave={waving}
                    showNotes={!paused}
                    showSparkles={waving || mood === "done"}
                    animated={!paused}
                    label={`${current.name}, official FreeDuet ${current.role} mascot`}
                  />
                </motion.div>
              </div>

              <div className="spotlight-copy">
                <div className="spotlight-meta">
                  <span className="spotlight-role">{current.role}</span>
                  <span className={`status-pill ${current.status === "Out now" ? "is-live" : ""}`}>
                    {current.status}
                  </span>
                </div>
                <h3>{current.name}</h3>
                <p className="spotlight-desc">{current.description}</p>
                <blockquote className="spotlight-quote">“{current.prompt}”</blockquote>

                {/* Live 6-mood expression chips */}
                <div className="mood-row" role="group" aria-label={`Animate ${current.name} expression`}>
                  <span className="mood-label">Mood:</span>
                  {MOOD_CONTROLS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`mood-chip ${mood === m.id ? "is-active" : ""}`}
                      aria-pressed={mood === m.id}
                      onClick={() => {
                        setMood(m.id);
                        if (m.id === "done") setWaving(true);
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="spotlight-actions">
                  <button type="button" className="btn btn-soft btn-sm" onClick={triggerWave}>
                    <Hand size={15} aria-hidden="true" />
                    Wave to {current.name}
                  </button>
                  <div className="spotlight-nav">
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => stepMember(-1)}
                      aria-label="Previous teammate"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => stepMember(1)}
                      aria-label="Next teammate"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* All 13 real bouncing official mascots grid */}
        <div className="roster-grid" aria-label="Choose any of the 13 FreeDuet team mascots">
          {visible.map((member, index) => {
            const selected = member.id === selectedId;
            return (
              <motion.button
                key={member.id}
                type="button"
                aria-pressed={selected}
                className={`mascot-tile ${selected ? "is-selected" : ""}`}
                style={
                  {
                    "--tile-accent": member.accent,
                    "--tile-tint": member.tint,
                    "--tile-deep": member.deep,
                  } as CSSProperties
                }
                onClick={() => chooseMember(member.id)}
                whileHover={paused ? undefined : { y: -5 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 380, damping: 24 }}
              >
                <span className="tile-aura" aria-hidden="true" />
                <FreeDuetMascot
                  id={member.id}
                  size={86}
                  mood={selected ? mood : "idle"}
                  wave={selected && waving}
                  animated={!paused}
                  delay={(index % 6) * 0.42}
                />
                <strong className="tile-name">{member.name}</strong>
                <span className="tile-role">{member.role}</span>
              </motion.button>
            );
          })}
        </div>

        <p className="section-footnote">
          Only where the team begins — ask <strong>Leo</strong> to design a new specialist for any
          job, with source and licence shown before anything installs.{" "}
          <a href={TEAM_DOCS_URL} target="_blank" rel="noreferrer" className="inline-link">
            How members are defined <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </p>
      </div>
    </section>
  );
}

/* ==========================================================================
   4. SAFETY GATE + LUMINOUS MOTION BENTO (Routines · Rollback · 45/45 Ring)
   ========================================================================== */

const ACTION_ICONS = {
  send: Send,
  pay: CreditCard,
  sign: FileSignature,
  book: CalendarCheck,
  delete: Trash2,
};

const WEEK_DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const ROLLBACK_STEPS = ["Back up data", "Update", "Health check", "Safe go-back"];

function ScoreGauge({ paused }: { paused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const r = 34;
  const circ = 2 * Math.PI * r;

  return (
    <div ref={ref} className="score-ring" aria-hidden="true">
      <svg viewBox="0 0 84 84" width="76" height="76">
        <circle cx="42" cy="42" r={r} fill="none" stroke="#DFF0EF" strokeWidth="7" />
        <motion.circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="url(#scoreGrad)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={paused ? { strokeDashoffset: 0 } : { strokeDashoffset: circ }}
          animate={inView || paused ? { strokeDashoffset: 0 } : { strokeDashoffset: circ }}
          transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}
          transform="rotate(-90 42 42)"
        />
        <defs>
          <linearGradient id="scoreGrad" x1="0" y1="0" x2="84" y2="84" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4FD3D6" />
            <stop offset="55%" stopColor="#1B4FD8" />
            <stop offset="100%" stopColor="#0F8A64" />
          </linearGradient>
        </defs>
      </svg>
      <span>45/45</span>
    </div>
  );
}

export function SafetyGateMotion({ paused }: MotionProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [unlockedTest, setUnlockedTest] = useState(false);
  const [activeDays, setActiveDays] = useState<boolean[]>([true, true, true, true, true, false, false]);
  const [rbIdx, setRbIdx] = useState(0);

  const action = SAFETY_ACTIONS[selectedIdx];

  useEffect(() => {
    setUnlockedTest(false);
  }, [selectedIdx]);

  useEffect(() => {
    if (!unlockedTest) return;
    const t = window.setTimeout(() => setUnlockedTest(false), 2400);
    return () => window.clearTimeout(t);
  }, [unlockedTest]);

  // Subtle loop along safe-update steps
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setRbIdx((i) => (i + 1) % ROLLBACK_STEPS.length), 1800);
    return () => window.clearInterval(t);
  }, [paused]);

  const toggleDay = (i: number) => {
    setActiveDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  const countDays = activeDays.filter(Boolean).length;

  return (
    <section
      className="section-surface surface-daylight-lav"
      id="safety"
      aria-labelledby="safety-heading"
    >
      <div className="container">
        <div className="section-head split-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" style={{ background: "#0F8A64" }} />
              You stay the boss
            </p>
            <h2 id="safety-heading">
              Five buttons wait <span className="accent-text">for your yes.</span>
            </h2>
          </div>
          <p className="section-lead">
            Would you hand a brand-new assistant your wallet on day one? Neither would we.
            By default these five ask for your approval card first. A fixed rule and a reviewer model decide when, and neither is perfect.
          </p>
        </div>

        {/* Interactive kinetic 5-button Safety Gate */}
        <div className="safety-stage">
          <div className="safety-buttons" role="tablist" aria-label="Five approval-gated actions">
            {SAFETY_ACTIONS.map((item, idx) => {
              const Icon = ACTION_ICONS[item.id];
              const active = idx === selectedIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`gate-pill ${active ? "is-active" : ""}`}
                  style={
                    {
                      "--act-color": item.color,
                      "--act-bg": item.bg,
                    } as CSSProperties
                  }
                  onClick={() => setSelectedIdx(idx)}
                >
                  <span className="gate-pill-icon">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <span>{item.label}</span>
                  <span className="gate-pill-state">
                    {active ? (unlockedTest ? "Yes!" : "Held") : "Asks first"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="safety-pipeline">
            <div className="pipe-visual">
              <div className="pipe-mascot">
                <FreeDuetMascot
                  id={action.mascot}
                  size={88}
                  mood={unlockedTest ? "done" : "ask"}
                  wave={unlockedTest}
                  animated={!paused}
                />
                <small style={{ color: action.color }}>{action.label} draft</small>
              </div>

              <svg className="pipe-svg" viewBox="0 0 180 64" fill="none" aria-hidden="true">
                <line
                  x1="8"
                  y1="32"
                  x2="172"
                  y2="32"
                  stroke="#D8E3F3"
                  strokeWidth="3"
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                />
                <line
                  x1="8"
                  y1="32"
                  x2={unlockedTest ? "168" : "104"}
                  y2="32"
                  stroke={unlockedTest ? "#0F8A64" : action.color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="pipe-beam"
                />
                {!unlockedTest ? (
                  <line
                    x1="108"
                    y1="19"
                    x2="108"
                    y2="45"
                    stroke={action.color}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M 162 24 L 172 32 L 162 40"
                    stroke="#0F8A64"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {!paused && (
                  <circle
                    r="6"
                    fill={unlockedTest ? "#0F8A64" : action.color}
                    stroke="#FFFFFF"
                    strokeWidth="2.2"
                  >
                    <animateMotion
                      dur={unlockedTest ? "0.9s" : "1.7s"}
                      repeatCount="indefinite"
                      path={unlockedTest ? "M 10 32 L 168 32" : "M 10 32 L 102 32"}
                    />
                  </circle>
                )}
              </svg>

              <motion.button
                type="button"
                className={`pipe-lock ${unlockedTest ? "is-open" : ""}`}
                onClick={() => setUnlockedTest((v) => !v)}
                whileHover={paused ? undefined : { scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                aria-label={unlockedTest ? "Reset safety gate test" : `Test approving ${action.label}`}
              >
                <span className="pipe-lock-ring" aria-hidden="true" />
                {unlockedTest ? <Check size={24} strokeWidth={2.8} /> : <Lock size={22} />}
                <span>{unlockedTest ? "Yes given" : "Tap yes"}</span>
              </motion.button>

              <div className="pipe-guard">
                <FreeDuetMascot
                  id="vera"
                  size={88}
                  mood={unlockedTest ? "done" : "listen"}
                  showSparkles={unlockedTest}
                  animated={!paused}
                  delay={0.45}
                />
                <small>Vera checks</small>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={action.id}
                className="pipe-detail"
                initial={paused ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={paused ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <span className="pipe-sample" style={{ color: action.color, background: action.bg }}>
                  {action.label}: {action.sample}
                </span>
                <p>{action.rule}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Crisp 4-card luminous animated motion-graphic feature grid */}
        <div className="bento-grid">
          {/* 1. Local privacy & own subscription */}
          <article className="pillar-card">
            <div className="pillar-top-row">
              <span className="pillar-icon icon-aqua">
                <Globe size={20} aria-hidden="true" />
              </span>
              <span className="bento-tag">Today</span>
            </div>
            <h3>Local database &amp; no API key</h3>
            <p>
              The app, database, and member browsers run on your own computer. It uses your existing Claude plan, so there is no API key to buy. Free and local engines are built, off by default, and not yet proven with a real model.
            </p>
          </article>

          {/* 2. Interactive scheduled morning routine card */}
          <article className="pillar-card">
            <div className="pillar-top-row">
              <span className="pillar-icon icon-sun">
                <Sun size={20} className="sun-spin" aria-hidden="true" />
              </span>
              <span className="bento-tag">Built · not run live</span>
            </div>
            <h3>Routines on your schedule</h3>
            <div className="day-strip" role="group" aria-label="Toggle morning summary days">
              {WEEK_DAYS.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={activeDays[i]}
                  aria-label={`Toggle day ${i + 1}`}
                  className={`day-btn ${activeDays[i] ? "is-on" : ""}`}
                  onClick={() => toggleDay(i)}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="routine-note">
              {countDays === 0
                ? "Paused — tap a day to try the idea."
                : countDays === 7
                  ? "Morning summary every day. A routine that acts on an account still asks."
                  : `Illustration: ${countDays} morning${countDays > 1 ? "s" : ""} a week. Real routines are set up in chat.`}
            </p>
          </article>

          {/* 3. Animated safe self-rollback updates */}
          <article className="pillar-card">
            <div className="pillar-top-row">
              <span className="pillar-icon icon-blue">
                <RefreshCw size={19} aria-hidden="true" />
              </span>
              <span className="bento-tag">Released v0.2.1</span>
            </div>
            <h3>Updates that can go back</h3>
            <div className="rb-track" aria-hidden="true">
              {ROLLBACK_STEPS.map((label, idx) => (
                <span key={label} className={`rb-step ${idx === rbIdx ? "is-now" : idx < rbIdx ? "is-past" : ""}`}>
                  <i />
                  {label}
                </span>
              ))}
            </div>
            <p>
              One command copies your data first, updates, and puts the old version and data back if the new one does not answer. The backup step ran live four times on 15 November 2026; the go-back step is not yet run live.
            </p>
          </article>

          {/* 4. Animated 45/45 radial gauge — honest public report */}
          <article className="pillar-card pillar-score">
            <div className="score-row">
              <ScoreGauge paused={paused} />
              <div>
                <span className="score-tag">v0.1 safety evals</span>
                <h3>Tested to catch tricks</h3>
              </div>
            </div>
            <p>
              We try to fool our own team on purpose. v0.1 passed 45 of 45 safety runs. The newest full run, on 22 November 2026 with 107 cases (50 of them safety cases), did not meet our thresholds: 88 of 98 scored cases passed, and safety cases 40 of 47. Always review before you approve.
            </p>
            <div className="pillar-links">
              <a href={REPORT_URL} target="_blank" rel="noreferrer" className="inline-link">
                Public report <ArrowUpRight size={14} aria-hidden="true" />
              </a>
              <a href={SECURITY_URL} target="_blank" rel="noreferrer" className="inline-link">
                Security rules <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
