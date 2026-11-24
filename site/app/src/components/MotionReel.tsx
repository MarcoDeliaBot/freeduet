import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  FileText,
  Globe,
  Lock,
  Mail,
  Pause,
  Play,
  Receipt,
  ShieldCheck,
  Sparkles,
  Sun,
  Utensils,
} from "lucide-react";
import { FreeDuetMascot } from "./FreeDuetMascot";

interface MotionReelProps {
  paused: boolean;
}

const SCENE_MS = 5200;

const SCENES = [
  {
    id: "split",
    num: "01",
    label: "One office inside your PC",
    title: "One sentence replaces forty tabs.",
    caption:
      "Tell Iris what is piling up — she quietly routes inbox, leases, invoices, and tables to the right mascot.",
    color: "#1B4FD8",
    bg: "linear-gradient(135deg, #EEFAFA 0%, #F2F6FF 55%, #F5F0FF 100%)",
  },
  {
    id: "desk",
    num: "02",
    label: "Separate browser desk",
    title: "Each mascot acts — not just talks.",
    caption:
      "Each member works in its own isolated browser, away from yours: comparing details, filling fields, and drafting replies for you to check.",
    color: "#C6533B",
    bg: "linear-gradient(135deg, #FFF5F1 0%, #F4F9FF 55%, #EFFBFA 100%)",
  },
  {
    id: "gate",
    num: "03",
    label: "You press Approve",
    title: "The big buttons wait for your yes.",
    caption:
      "By default, Send, Pay, Sign, Book, and Delete ask for your yes: a fixed rule and a reviewer model decide when a card appears. Vera re-checks important work, such as invoices and carts, before it reaches you.",
    color: "#0F8A64",
    bg: "linear-gradient(135deg, #ECFBF5 0%, #F1F8FF 52%, #F5F1FE 100%)",
  },
  {
    id: "buspass",
    num: "04",
    label: "Zero API meter",
    title: "Like a bus pass, never a taxi meter.",
    caption:
      "Runs on your own computer with your own Claude plan: no API key and no per-token bill from FreeDuet. Your plan's own usage limits still apply. Routines, such as a morning summary, are built and not yet run live.",
    color: "#0C8B91",
    bg: "linear-gradient(135deg, #FFF9EB 0%, #EEFBFB 52%, #EEF4FF 100%)",
  },
];

/**
 * Studio-grade looping SVG & Framer Motion explainer reel in pure bright daylight.
 * Demonstrates the whole FreeDuet story in 4 auto-playing kinetic scenes with
 * manual scene scrubbing and play/pause controls.
 */
export function MotionReel({ paused }: MotionReelProps) {
  const [scene, setScene] = useState(0);
  const [reelPaused, setReelPaused] = useState(false);
  const [tick, setTick] = useState(0);

  const isStopped = paused || reelPaused;

  useEffect(() => {
    if (isStopped) return;
    const id = window.setInterval(() => {
      setScene((s) => (s + 1) % SCENES.length);
      setTick((t) => t + 1);
    }, SCENE_MS);
    return () => window.clearInterval(id);
  }, [isStopped]);

  const active = SCENES[scene];

  const pickScene = (idx: number) => {
    setScene(idx);
    setTick((t) => t + 1);
  };

  return (
    <section
      className="section-surface surface-white reel-section"
      id="motion-reel"
      aria-labelledby="reel-heading"
    >
      <div className="container">
        <div className="section-head split-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-dot" style={{ background: "#4FD3D6" }} />
              FreeDuet in motion
            </p>
            <h2 id="reel-heading">
              Too much to do, and <span className="accent-text">only one of you?</span>
            </h2>
          </div>
          <p className="section-lead">
            Emails, invoices, leases, dinner bookings — FreeDuet turns your computer into a calm
            little studio where each teammate has one job. The scenes below are illustrations with made-up examples.
          </p>
        </div>

        {/* Light widescreen broadcast motion-graphics canvas */}
        <div className="reel-shell">
          <div className="reel-stage" style={{ background: active.bg }}>
            {/* Top subtle studio bar */}
            <div className="reel-chrome">
              <span className="reel-chip">
                <span className="reel-live-dot" style={{ backgroundColor: active.color }} />
                Scene {active.num} / 04 · {active.label}
              </span>
              <button
                type="button"
                className="reel-play-btn"
                onClick={() => setReelPaused((p) => !p)}
                aria-pressed={reelPaused}
                aria-label={isStopped ? "Play motion storyboard" : "Pause motion storyboard"}
              >
                {isStopped ? <Play size={14} fill="currentColor" /> : <Pause size={14} />}
                <span>{isStopped ? "Play" : "Pause"}</span>
              </button>
            </div>

            {/* Animated core graphic canvas */}
            <div className="reel-canvas" aria-live="polite">
              <AnimatePresence mode="wait">
                {scene === 0 && (
                  <motion.div
                    key="s0"
                    className="reel-scene reel-scene-split"
                    initial={paused ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={paused ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {/* Animated vector radial burst with 4 orbiting floating task badges routing to 4 real mascots */}
                    <svg className="reel-bg-svg" viewBox="0 0 860 320" fill="none" aria-hidden="true">
                      <circle cx="430" cy="160" r="138" stroke="#CFE3F7" strokeWidth="1.5" strokeDasharray="6 8" className="mg-orbit-cw" style={{ transformOrigin: "430px 160px" }} />
                      {/* Four graceful branching connection highways */}
                      <path id="sp1" d="M 372 152 C 296 152 276 84 188 84" stroke="#F4917A" strokeWidth="3" strokeDasharray="8 6" className="mg-flow-line" strokeLinecap="round" />
                      <path id="sp2" d="M 372 172 C 296 172 276 238 188 238" stroke="#F6C955" strokeWidth="3" strokeDasharray="8 6" className="mg-flow-line" strokeLinecap="round" />
                      <path id="sp3" d="M 488 152 C 564 152 584 84 672 84" stroke="#9B7BE0" strokeWidth="3" strokeDasharray="8 6" className="mg-flow-line" strokeLinecap="round" />
                      <path id="sp4" d="M 488 172 C 564 172 584 238 672 238" stroke="#6EB8F2" strokeWidth="3" strokeDasharray="8 6" className="mg-flow-line" strokeLinecap="round" />
                      {!isStopped && (
                        <>
                          <circle r="6" fill="#F4917A" stroke="#fff" strokeWidth="2">
                            <animateMotion dur="1.7s" repeatCount="indefinite" path="M 372 152 C 296 152 276 84 188 84" />
                          </circle>
                          <circle r="6" fill="#E5A91C" stroke="#fff" strokeWidth="2">
                            <animateMotion dur="2s" repeatCount="indefinite" path="M 372 172 C 296 172 276 238 188 238" />
                          </circle>
                          <circle r="6" fill="#9B7BE0" stroke="#fff" strokeWidth="2">
                            <animateMotion dur="1.8s" repeatCount="indefinite" path="M 488 152 C 564 152 584 84 672 84" />
                          </circle>
                          <circle r="6" fill="#3B93DF" stroke="#fff" strokeWidth="2">
                            <animateMotion dur="1.9s" repeatCount="indefinite" path="M 488 172 C 564 172 584 238 672 238" />
                          </circle>
                        </>
                      )}
                    </svg>

                    <div className="split-col">
                      <motion.div
                        className="mini-crew-card"
                        initial={paused ? false : { opacity: 0, x: -24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.12, type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <FreeDuetMascot id="otto" size={62} mood="work" animated={!isStopped} />
                        <div>
                          <b>Otto</b>
                          <span><Mail size={12} /> 14 emails triaged</span>
                        </div>
                      </motion.div>
                      <motion.div
                        className="mini-crew-card"
                        initial={paused ? false : { opacity: 0, x: -24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.24, type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <FreeDuetMascot id="penny" size={62} mood="work" animated={!isStopped} delay={0.3} />
                        <div>
                          <b>Penny</b>
                          <span><Receipt size={12} /> 2 invoices ready</span>
                        </div>
                      </motion.div>
                    </div>

                    <motion.div
                      className="split-center"
                      initial={paused ? false : { scale: 0.86, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                    >
                      <div className="split-iris-bubble">“Handle this morning”</div>
                      <FreeDuetMascot id="iris" size={142} mood="listen" showNotes={!isStopped} animated={!isStopped} />
                      <span className="split-name">Iris delegates</span>
                    </motion.div>

                    <div className="split-col">
                      <motion.div
                        className="mini-crew-card"
                        initial={paused ? false : { opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.18, type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <FreeDuetMascot id="portia" size={62} mood="think" animated={!isStopped} delay={0.2} />
                        <div>
                          <b>Portia</b>
                          <span><FileText size={12} /> Lease scanned</span>
                        </div>
                      </motion.div>
                      <motion.div
                        className="mini-crew-card"
                        initial={paused ? false : { opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3, type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <FreeDuetMascot id="jules" size={62} mood="work" animated={!isStopped} delay={0.5} />
                        <div>
                          <b>Jules</b>
                          <span><Utensils size={12} /> Table held · 8 pm</span>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {scene === 1 && (
                  <motion.div
                    key="s1"
                    className="reel-scene reel-scene-desk"
                    initial={paused ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={paused ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="desk-mascot">
                      <FreeDuetMascot id="otto" size={140} mood="work" animated={!isStopped} />
                      <span className="desk-pill" style={{ background: "#FFF1EC", color: "#C6533B" }}>
                        Otto’s own browser
                      </span>
                    </div>

                    {/* Animated isolated light browser card with gliding kinetic cursor */}
                    <div className="mock-browser" aria-hidden="true">
                      <div className="mock-bar">
                        <span className="mock-dots">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="mock-url">
                          <Globe size={11} /> isolated-desk://otto/inbox
                        </span>
                        <span className="mock-tag">Sandboxed</span>
                      </div>
                      <div className="mock-body">
                        <div className="mock-head">
                          <strong>Re: Kitchen pipe visit</strong>
                          <span>Plumber · Today</span>
                        </div>
                        <div className="mock-draft">
                          <motion.span
                            className="mock-line w-full"
                            initial={paused ? false : { scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.65, delay: 0.15 }}
                          />
                          <motion.span
                            className="mock-line w-80"
                            initial={paused ? false : { scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{ duration: 0.55, delay: 0.45 }}
                          />
                          <span className="mock-typed">
                            “Good morning, Tuesday at 9 works for me. Thank you!”
                          </span>
                        </div>
                        <div className="mock-foot">
                          <span className="mock-btn-hold">
                            <Lock size={12} /> Draft saved · Send held
                          </span>
                          <span className="mock-safe-note">Treats page text as data, not orders</span>
                        </div>

                        {/* Animated vector Studio cursor clicking nicely */}
                        {!isStopped && (
                          <motion.svg
                            className="mock-cursor"
                            viewBox="0 0 28 28"
                            width="26"
                            height="26"
                            animate={{
                              x: [140, 24, 62, 62],
                              y: [12, 46, 108, 108],
                              scale: [1, 1, 0.88, 1],
                            }}
                            transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
                          >
                            <path
                              d="M4 3 L23 14 L14 16 L19 24 L15 26 L10 18 L4 23 Z"
                              fill="#1B4FD8"
                              stroke="#FFFFFF"
                              strokeWidth="2.2"
                              strokeLinejoin="round"
                            />
                          </motion.svg>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}

                {scene === 2 && (
                  <motion.div
                    key="s2"
                    className="reel-scene reel-scene-gate"
                    initial={paused ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={paused ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="gate-reel-mascot">
                      <FreeDuetMascot id="portia" size={118} mood="ask" animated={!isStopped} />
                      <small>Portia pauses</small>
                    </div>

                    <div className="gate-reel-center">
                      <div className="gate-five-row">
                        {["Send", "Pay", "Sign", "Book", "Delete"].map((word, idx) => (
                          <motion.span
                            key={word}
                            className="gate-word"
                            initial={paused ? false : { opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.08 }}
                          >
                            <Lock size={11} /> {word}
                          </motion.span>
                        ))}
                      </div>

                      <motion.div
                        className="gate-yes-card"
                        initial={paused ? false : { scale: 0.94, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.28, type: "spring", stiffness: 280, damping: 22 }}
                      >
                        <div className="gy-icon">
                          <ShieldCheck size={22} />
                        </div>
                        <div className="gy-text">
                          <strong>Asks first, by default</strong>
                          <span>Payments, sends and deletions wait for your card</span>
                        </div>
                        <motion.span
                          className="gy-btn"
                          animate={isStopped ? undefined : { scale: [1, 1.07, 1] }}
                          transition={{ duration: 1.5, repeat: Infinity }}
                        >
                          <Check size={14} strokeWidth={3} /> Approve
                        </motion.span>
                      </motion.div>
                    </div>

                    <div className="gate-reel-mascot">
                      <FreeDuetMascot id="vera" size={118} mood="done" showSparkles={!isStopped} animated={!isStopped} delay={0.35} />
                      <small>Vera double-checks</small>
                    </div>
                  </motion.div>
                )}

                {scene === 3 && (
                  <motion.div
                    key="s3"
                    className="reel-scene reel-scene-local"
                    initial={paused ? false : { opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={paused ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <motion.div
                      className="pass-card pass-bad"
                      initial={paused ? false : { opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <span className="pass-kicker">API key (taxi meter)</span>
                      <strong className="pass-strike">€0.04 → €18 → €64…</strong>
                      <p>Illustration: every word adds to the bill</p>
                    </motion.div>

                    <div className="pass-mascot">
                      <FreeDuetMascot id="iris" size={126} mood="done" wave showNotes={!isStopped} animated={!isStopped} />
                    </div>

                    <motion.div
                      className="pass-card pass-good"
                      initial={paused ? false : { opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.18 }}
                    >
                      <span className="pass-kicker">
                        <Sparkles size={12} /> Your Claude pass + FreeDuet
                      </span>
                      <strong>€0 software · MIT</strong>
                      <div className="mini-week" aria-hidden="true">
                        <Sun size={13} />
                        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                          <span key={i}>{d}</span>
                        ))}
                      </div>
                      <p>Saved on your PC · scheduled routines</p>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom caption strip */}
            <div className="reel-caption">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.id}
                  className="reel-caption-inner"
                  initial={paused ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={paused ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.25 }}
                >
                  <h3>{active.title}</h3>
                  <p>{active.caption}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* Smooth auto-advancing 4-chapter studio timeline tabs */}
          <div className="reel-tabs" role="tablist" aria-label="Storyboard scenes">
            {SCENES.map((item, idx) => {
              const isActive = idx === scene;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`reel-tab ${isActive ? "is-active" : ""}`}
                  onClick={() => pickScene(idx)}
                >
                  <span className="reel-tab-bar" aria-hidden="true">
                    {isActive && (
                      <span
                        key={`${idx}-${tick}`}
                        className={`reel-tab-fill ${isStopped ? "is-static" : ""}`}
                        style={{
                          backgroundColor: item.color,
                          animationDuration: `${SCENE_MS}ms`,
                        }}
                      />
                    )}
                  </span>
                  <span className="reel-tab-num">{item.num}</span>
                  <span className="reel-tab-label">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
