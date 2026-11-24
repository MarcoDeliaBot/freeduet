import { useEffect, useState } from "react";
import { AnimatePresence, motion, MotionConfig, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  Coffee,
  Copy,
  GitBranch,
  Heart,
  Menu,
  Pause,
  Play,
  Plus,
  Terminal,
  X,
} from "lucide-react";
import { FreeDuetMascot } from "./components/FreeDuetMascot";
import type { MascotMood } from "./components/FreeDuetMascot";
import { MotionReel } from "./components/MotionReel";
import {
  HeroOrchestra,
  SafetyGateMotion,
  TeamShowcase,
  WorkflowTheater,
} from "./components/MotionSections";
import {
  FAQ_COUNT,
  INSTALL_COMMANDS,
  INSTALL_STEP_NUMBERS,
  ISSUES_URL,
  REPO_URL,
  ROADMAP_URL,
  SECURITY_URL,
  SPONSOR_URL,
  TEAM_DOCS_URL,
} from "./data/freeduetData";
import SITE from "../../src/site.json";
import { useI18n } from "./i18n";

function FreeDuetLogo() {
  return (
    <svg className="brand-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="#1B4FD8" />
      <circle cx="15.5" cy="20" r="7.2" stroke="#FFFFFF" strokeWidth="3" />
      <circle cx="24.5" cy="20" r="7.2" stroke="#7AE8EA" strokeWidth="3" />
    </svg>
  );
}

const RIBBON_DOTS = ["#4FD3D6", "#BBA6F0", "#F4917A", "#F6C955", "#1B4FD8", "#8DD46E"];

export default function App() {
  const { t, rich, lang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);
  const [companionMood, setCompanionMood] = useState<MascotMood>("idle");
  const [showCompanion, setShowCompanion] = useState(false);

  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 240,
    damping: 32,
    restDelta: 0.001,
  });

  // Respect user's system reduced-motion setting
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) setMotionPaused(true);
    const onChange = (e: MediaQueryListEvent) => setMotionPaused(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Track header scroll elevation and subtle live scroll-companion mascot mood
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 16);
      setShowCompanion(y > 540);
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const pct = y / max;
      if (pct > 0.82) setCompanionMood("done");
      else if (pct > 0.62) setCompanionMood("ask");
      else if (pct > 0.4) setCompanionMood("listen");
      else if (pct > 0.2) setCompanionMood("work");
      else setCompanionMood("idle");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMANDS);
      setCopied(true);
    } catch {
      const area = document.createElement("textarea");
      area.value = INSTALL_COMMANDS;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
      setCopied(true);
    }
    window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <MotionConfig reducedMotion={motionPaused ? "always" : "user"}>
      <div className={`page-root ${motionPaused ? "motion-paused" : ""}`}>
        <a className="skip-link" href="#main">
          {t("a11y.skip")}
        </a>

        {/* Bright translucent glass header with subtle aqua-to-lavender scroll line */}
        <header className={`site-header ${scrolled ? "is-scrolled" : ""}`}>
          <div className="container nav-inner">
            <a className="brand" href="#top" aria-label={t("brand.home")}>
              <FreeDuetLogo />
              <span className="brand-name">
                FreeDuet<span className="brand-dot">.</span>
              </span>
            </a>

            <nav className="nav-links" aria-label={t("nav.main")}>
              <a href="#motion-reel">{t("nav.reel")}</a>
              <a href="#how">{t("nav.demo")}</a>
              <a href="#team">{t("nav.team")}</a>
              <a href="#safety">{t("nav.safety")}</a>
              <a href="#install">{t("nav.install")}</a>
              <a href="#faq">{t("nav.faq")}</a>
            </nav>

            <div className="nav-right">
              <button
                type="button"
                className="motion-toggle"
                onClick={() => setMotionPaused((p) => !p)}
                aria-pressed={motionPaused}
                aria-label={motionPaused ? t("motion.play_label") : t("motion.pause_label")}
                title={motionPaused ? t("motion.play_label") : t("motion.pause_label")}
              >
                {motionPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} />}
                <span>{motionPaused ? t("motion.play") : t("motion.motion")}</span>
              </button>

              <a className="nav-gh" href={REPO_URL} target="_blank" rel="noreferrer">
                <GitBranch size={15} aria-hidden="true" />
                GitHub
              </a>

              <a className="btn btn-primary btn-nav" href="#install">
                {t("nav.getfree")}
                <ArrowRight size={15} aria-hidden="true" />
              </a>
            </div>

            <button
              type="button"
              className="menu-btn"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label={menuOpen ? t("menu.close") : t("menu.open")}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
          </div>

          {/* Crisp chromatic scroll progress ribbon */}
          <motion.div
            className="scroll-bar"
            style={{ scaleX: smoothProgress }}
            aria-hidden="true"
          />

          <AnimatePresence>
            {menuOpen && (
              <motion.nav
                id="mobile-nav"
                className="mobile-nav"
                aria-label={t("menu.aria")}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <a href="#motion-reel" onClick={() => setMenuOpen(false)}>{t("mnav.reel")}</a>
                <a href="#how" onClick={() => setMenuOpen(false)}>{t("mnav.demo")}</a>
                <a href="#team" onClick={() => setMenuOpen(false)}>{t("mnav.team")}</a>
                <a href="#safety" onClick={() => setMenuOpen(false)}>{t("mnav.safety")}</a>
                <a href="#install" onClick={() => setMenuOpen(false)}>{t("mnav.install")}</a>
                <a href="#faq" onClick={() => setMenuOpen(false)}>{t("nav.faq")}</a>
                <div className="mobile-nav-bottom">
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    onClick={() => setMotionPaused((p) => !p)}
                  >
                    {motionPaused ? <Play size={14} /> : <Pause size={14} />}
                    {motionPaused ? t("mnav.play") : t("mnav.pause")}
                  </button>
                  <a
                    className="btn btn-primary btn-sm"
                    href="#install"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("mnav.installbtn")} <ArrowRight size={14} />
                  </a>
                </div>
              </motion.nav>
            )}
          </AnimatePresence>
        </header>

        <main id="main">
          {/* 1. Radiant sunlit hero featuring real interactive animated mascots */}
          <section className="hero" id="top" aria-labelledby="hero-title">
            <div className="hero-grid-dots" aria-hidden="true" />
            <div className="container hero-grid">
              <motion.div
                className="hero-copy"
                initial={motionPaused ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="hero-pill">
                  <span className="pill-dot" aria-hidden="true" />
                  <span>{t("hero.pill")}</span>
                </div>

                <h1 id="hero-title">
                  {rich("hero.h1", undefined, {
                    accent: (inner, key) => (
                      <span className="hero-highlight" key={key}>
                        {inner}
                        <svg
                          className="hero-underline"
                          viewBox="0 0 340 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M 4 11 Q 92 2 174 9 T 336 7"
                            stroke="url(#heroWave)"
                            strokeWidth="6.5"
                            strokeLinecap="round"
                          />
                          <defs>
                            <linearGradient
                              id="heroWave"
                              x1="0"
                              y1="0"
                              x2="340"
                              y2="0"
                              gradientUnits="userSpaceOnUse"
                            >
                              <stop offset="0%" stopColor="#4FD3D6" />
                              <stop offset="52%" stopColor="#1B4FD8" />
                              <stop offset="100%" stopColor="#BBA6F0" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </span>
                    ),
                  })}
                </h1>

                <p className="hero-lead">{rich("hero.lead")}</p>

                <div className="hero-actions">
                  <a className="btn btn-primary" href="#install">
                    {t("hero.cta")}
                    <ArrowRight size={17} aria-hidden="true" />
                  </a>
                  <a className="btn btn-outline" href="#motion-reel">
                    <span className="play-badge" aria-hidden="true">
                      <Play size={11} fill="currentColor" />
                    </span>
                    {t("hero.watch")}
                  </a>
                </div>

                <ul className="hero-checks">
                  <li>
                    <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                    {t("hero.check1")}
                  </li>
                  <li>
                    <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                    {t("hero.check2")}
                  </li>
                  <li>
                    <Check size={15} strokeWidth={2.8} aria-hidden="true" />
                    {t("hero.check3")}
                  </li>
                </ul>
              </motion.div>

              <motion.div
                className="hero-visual"
                initial={motionPaused ? false : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.72, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <HeroOrchestra paused={motionPaused} />
              </motion.div>
            </div>
          </section>

          {/* 2. Light airy kinetic ribbon */}
          <div
            className="ticker-band"
            aria-label={t("ticker.aria")}
          >
            <div className="ticker-track" aria-hidden="true">
              {[0, 1].map((dup) => (
                <div className="ticker-group" key={dup}>
                  {RIBBON_DOTS.map((dot, i) => (
                    <span className="ticker-item" key={`${dup}-${i}`}>
                      <i style={{ backgroundColor: dot }} />
                      {t(`ticker.${i + 1}`)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* 3. Looping studio daylight motion-graphic storyboard reel (4 choreographed scenes) */}
          <MotionReel paused={motionPaused} />

          {/* 4. Interactive step-by-step live delegation & approval card theater */}
          <WorkflowTheater paused={motionPaused} />

          {/* 5. All 13 real official mascots + interactive 6-mood animation studio */}
          <TeamShowcase paused={motionPaused} />

          {/* 6. Kinetic 5-button Safety Gate + interactive Routine + Safe Update + 45/45 Ring */}
          <SafetyGateMotion paused={motionPaused} />

          {/* 7. Crisp light Quick Start + light-mode command card featuring animated Leo */}
          <section className="section-surface surface-white" id="install" aria-labelledby="install-heading">
            <div className="container install-grid">
              <div>
                <p className="eyebrow">
                  <span className="eyebrow-dot" style={{ background: "#F5AE4E" }} />
                  {t("install.eyebrow")}
                </p>
                <h2 id="install-heading">{rich("install.h2")}</h2>
                <p className="section-lead install-lead">{t("install.lead")}</p>

                <ol className="install-steps">
                  {INSTALL_STEP_NUMBERS.map((num, i) => (
                    <li key={num}>
                      <span className="install-num">{num}</span>
                      <div>
                        <strong>{t(`install.s${i + 1}.title`)}</strong>
                        <p>{t(`install.s${i + 1}.text`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="code-panel">
                <div className="code-mascot-header">
                  <div className="code-title">
                    <Terminal size={16} aria-hidden="true" />
                    <span>{t("install.panel")}</span>
                  </div>
                  <button
                    type="button"
                    className={`copy-btn ${copied ? "is-copied" : ""}`}
                    onClick={handleCopy}
                    aria-label={t("install.copy_label")}
                  >
                    {copied ? (
                      <>
                        <Check size={14} aria-hidden="true" /> {t("install.copied")}
                      </>
                    ) : (
                      <>
                        <Copy size={14} aria-hidden="true" /> {t("install.copy")}
                      </>
                    )}
                  </button>
                </div>

                <pre className="code-block">
                  <code>
                    <span className="ck-line">
                      <span className="ck-prompt">$</span> git clone https://github.com/MarcoDeliaBot/freeduet.git
                    </span>
                    <span className="ck-line">
                      <span className="ck-prompt">$</span> cd freeduet &amp;&amp; cp .env.example .env
                    </span>
                    <span className="ck-line">
                      <span className="ck-prompt">$</span> bash scripts/start.sh{" "}
                      <span className="ck-note">{t("install.note")}</span>
                    </span>
                    <span className="ck-line">
                      <span className="ck-prompt">$</span> cd openbot &amp;&amp; docker compose exec -it agent-freeduet claude
                    </span>
                  </code>
                </pre>

                <div className="code-footer">
                  <div className="code-companion">
                    <FreeDuetMascot
                      id="leo"
                      size={60}
                      mood={copied ? "done" : "listen"}
                      wave={copied}
                      showSparkles={copied}
                      animated={!motionPaused}
                    />
                    <div>
                      <strong>{t("install.then")}</strong>
                      <span>{t("install.then_sub")}</span>
                    </div>
                  </div>
                  <a
                    className="inline-link"
                    href={`${REPO_URL}#quick-start`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("install.guide")} <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* 8. Bright smooth FAQ */}
          <section className="section-surface surface-mist" id="faq" aria-labelledby="faq-heading">
            <div className="container faq-grid">
              <div className="faq-intro">
                <p className="eyebrow">
                  <span className="eyebrow-dot" style={{ background: "#4FD3D6" }} />
                  {t("nav.faq")}
                </p>
                <h2 id="faq-heading">{t("faq.h2")}</h2>
                <p className="section-lead">{t("faq.lead")}</p>
                <div className="faq-links">
                  <a className="inline-link" href={ROADMAP_URL} target="_blank" rel="noreferrer">
                    {t("faq.roadmap")} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                  <a className="inline-link" href={ISSUES_URL} target="_blank" rel="noreferrer">
                    {t("faq.issues")} <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                </div>
              </div>

              <div className="faq-list">
                {Array.from({ length: FAQ_COUNT }, (_, idx) => {
                  const open = openFaq === idx;
                  return (
                    <div className={`faq-item ${open ? "is-open" : ""}`} key={idx}>
                      <button
                        type="button"
                        className="faq-trigger"
                        aria-expanded={open}
                        onClick={() => setOpenFaq(open ? null : idx)}
                      >
                        <span>{t(`faq.q${idx + 1}`)}</span>
                        <span className="faq-plus" aria-hidden="true">
                          <Plus size={18} />
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {open && (
                          <motion.div
                            className="faq-panel"
                            initial={motionPaused ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={motionPaused ? undefined : { height: 0, opacity: 0 }}
                            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <p>{t(`faq.a${idx + 1}`)}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 9. Joyful sunny pastel CTA featuring animated 5-mascot ensemble */}
          <section className="section-surface surface-white finale-wrap" aria-labelledby="finale-heading">
            <div className="container">
              <div className="finale-banner">
                <div className="finale-rings" aria-hidden="true">
                  <span className="fr-1" />
                  <span className="fr-2" />
                </div>

                <div className="finale-copy">
                  <p className="eyebrow">
                    <span className="eyebrow-dot" style={{ background: "#1B4FD8" }} />
                    {t("finale.eyebrow")}
                  </p>
                  <h2 id="finale-heading">{rich("finale.h2")}</h2>
                  <p>{t("finale.lead")}</p>
                  <div className="finale-actions">
                    <a className="btn btn-primary" href={REPO_URL} target="_blank" rel="noreferrer">
                      {t("finale.github")}
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </a>
                    <a
                      className="btn btn-white-outline"
                      href={SPONSOR_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Coffee size={16} aria-hidden="true" />
                      {t("finale.coffee")}
                    </a>
                  </div>
                </div>

                <div className="finale-trio" aria-hidden="true">
                  <div className="trio-side trio-left">
                    <FreeDuetMascot id="otto" size={114} mood="listen" animated={!motionPaused} delay={0.3} />
                  </div>
                  <div className="trio-center">
                    <FreeDuetMascot
                      id="iris"
                      size={168}
                      mood="done"
                      wave
                      showNotes={!motionPaused}
                      showSparkles={!motionPaused}
                      animated={!motionPaused}
                    />
                  </div>
                  <div className="trio-side trio-right">
                    <FreeDuetMascot id="penny" size={114} mood="listen" animated={!motionPaused} delay={0.75} />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Polite bright floating mascot back-to-top guide (reaches live moods as you scroll!) */}
        <AnimatePresence>
          {showCompanion && (
            <motion.a
              href="#top"
              className="iris-dock"
              aria-label={t("dock.label")}
              initial={motionPaused ? false : { opacity: 0, scale: 0.75, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={motionPaused ? undefined : { opacity: 0, scale: 0.75, y: 18 }}
              whileHover={motionPaused ? undefined : { y: -4, scale: 1.05 }}
              transition={{ type: "spring", stiffness: 340, damping: 24 }}
            >
              <FreeDuetMascot id="iris" size={48} mood={companionMood} animated={!motionPaused} />
              <span className="iris-dock-up" aria-hidden="true">
                <ArrowUp size={11} strokeWidth={3} />
              </span>
            </motion.a>
          )}
        </AnimatePresence>

        {/* Crisp luminous editorial footer */}
        <footer className="site-footer">
          <div className="container">
            <div className="footer-top">
              <div className="footer-brand">
                <a className="brand" href="#top" aria-label={t("footer.top_aria")}>
                  <FreeDuetLogo />
                  <span className="brand-name">
                    FreeDuet<span className="brand-dot">.</span>
                  </span>
                </a>
                <p>{t("footer.blurb")}</p>
              </div>

              <div className="footer-cols">
                <div>
                  <h3>{t("footer.explore")}</h3>
                  <a href="#motion-reel">{t("footer.e1")}</a>
                  <a href="#how">{t("footer.e2")}</a>
                  <a href="#team">{t("footer.e3")}</a>
                  <a href="#safety">{t("footer.e4")}</a>
                </div>
                <div>
                  <h3>{t("footer.os")}</h3>
                  <a href={REPO_URL} target="_blank" rel="noreferrer">{t("footer.o1")}</a>
                  <a href={ROADMAP_URL} target="_blank" rel="noreferrer">{t("footer.o2")}</a>
                  <a href={SECURITY_URL} target="_blank" rel="noreferrer">{t("footer.o3")}</a>
                  <a href={TEAM_DOCS_URL} target="_blank" rel="noreferrer">{t("footer.o4")}</a>
                </div>
                <div>
                  <h3>{t("footer.community")}</h3>
                  <a href={ISSUES_URL} target="_blank" rel="noreferrer">{t("footer.c1")}</a>
                  <a href={SPONSOR_URL} target="_blank" rel="noreferrer">
                    <Heart size={13} aria-hidden="true" /> {t("footer.c2")}
                  </a>
                </div>
              </div>
            </div>

            <nav className="footer-langs" aria-label={t("footer.lang_aria")}>
              <span>{t("footer.lang")}</span>
              {SITE.languages.map((l) => (
                <a
                  key={l.code}
                  href={l.code === SITE.default ? "/" : `/${l.code}/`}
                  hrefLang={l.code}
                  lang={l.code}
                  aria-current={l.code === lang ? "page" : undefined}
                >
                  {l.name}
                </a>
              ))}
            </nav>

            <div className="footer-bottom">
              <span>{t("footer.legal")}</span>
              <span>{t("footer.warning")}</span>
            </div>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
