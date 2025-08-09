"use client";
import { useEffect, useState } from "react";
import { motion, cubicBezier } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Mail, FileText, Github, Linkedin, Instagram, Twitter, MapPin } from "lucide-react";

type StoryCard = {
  slug: string;
  title: string;
  excerpt?: string;
};

const container = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.14, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) },
  },
};

// Small hook to scramble digits on hover for playful feedback
function useScramble(value: string, active: boolean, duration = 800) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (!active) {
      setDisplay(value);
      return;
    }
    let mounted = true;
    const digits = "0123456789";
    const plus = value.endsWith("+") ? "+" : "";
    const base = value.replace("+", "");
    const arr = base.split("");
    const start = Date.now();
    const id = setInterval(() => {
      if (!mounted) return;
      const t = Date.now() - start;
      if (t >= duration) {
        setDisplay(base + plus);
        clearInterval(id);
        return;
      }
      const scrambled = arr
        .map((ch) => (/[0-9]/.test(ch) ? digits[Math.floor(Math.random() * 10)] : ch))
        .join("");
      setDisplay(scrambled + plus);
    }, 32);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [value, active, duration]);
  return display;
}

// Number component that uses the scramble hook (avoids calling hooks inside loops)
function StatNumber({ value, active }: { value: string; active: boolean }) {
  const text = useScramble(value, active);
  return (
    <motion.span
      layout
      className="inline-block"
      animate={{ y: active ? -2 : 0, scale: active ? 1.06 : 1 }}
      transition={{ duration: 0.2, ease: cubicBezier(0.22, 1, 0.36, 1) }}
    >
      {text}
    </motion.span>
  );
}

export default function Hero() {
  const [latest, setLatest] = useState<StoryCard | null>(null);
  const [hoverXY, setHoverXY] = useState<{ x: number; y: number } | null>(null);
  // Interactivity for stats card
  const [statsXY, setStatsXY] = useState<{ x: number; y: number } | null>(null);
  const [tilt, setTilt] = useState<{ rx: number; ry: number }>({ rx: 0, ry: 0 });
  const [activeStat, setActiveStat] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/stories")
      .then((r) => r.json())
      .then((d) => {
        const s = (d?.stories || [])[0];
        if (mounted && s) setLatest({ slug: s.slug, title: s.title, excerpt: s.excerpt });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section id="home" className="pt-12 sm:pt-28 pb-20 sm:pb-28 relative overflow-hidden">
      <div className="code-grid" />
      {/* subtle gradient accent */}
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-purple-500/10 blur-3xl" />

      <div className="max-w-7xl mx-auto px-6 relative z-10 grid lg:grid-cols-2 gap-10 items-start">
        {/* Left column */}
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-15% 0px -10% 0px" }}>
          {/* Badge row */}
          <motion.div variants={item} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"></span>
            Backend • Cloud • Realtime • Startups
          </motion.div>

          {/* Heading */}
          <motion.h1 variants={item} className="mt-4 text-4xl sm:text-6xl font-semibold tracking-tight text-white">
            Himanshu Kukreja
          </motion.h1>

          {/* Subtitle */}
          <motion.p variants={item} className="mt-4 max-w-2xl text-base sm:text-lg text-white/70">
            Software Engineer focused on backend systems, cloud architecture, real-time streaming, and shipping 0→1 products with startup agility.
          </motion.p>

          {/* Location + Socials */}
          <motion.div variants={item} className="mt-5 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/85">
              <MapPin className="h-3.5 w-3.5 text-indigo-300" /> Bengaluru, India
            </span>
            <nav className="flex items-center gap-2" aria-label="Social links">
              <a
                href="https://github.com/himanshkukreja/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 transition-colors"
                aria-label="GitHub"
              >
                <Github className="h-4.5 w-4.5" />
              </a>
              <a
                href="https://www.linkedin.com/in/himanshukukreja/"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="h-4.5 w-4.5" />
              </a>
              <a
                href="https://www.instagram.com/himanshukreja_?igsh=dm84OHlyZTJyeXZl&utm_source=qr"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-4.5 w-4.5" />
              </a>
              <a
                href="https://x.com/hi_kukreja"
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center h-8 w-8 rounded-full border border-white/10 bg-white/5 text-white/85 hover:bg-white/10 transition-colors"
                aria-label="X (Twitter)"
              >
                <Twitter className="h-4.5 w-4.5" />
              </a>
            </nav>
          </motion.div>

          {/* CTAs */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/#projects"
              className="group relative inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/10 ring-1 ring-white/10"
            >
              <span className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-r from-white/10 via-white/0 to-white/10 blur opacity-70" />
              View Projects
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/#contact"
              className="group relative inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-[var(--ring)] transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_12px_36px_-12px_rgba(59,130,246,0.55)]"
            >
              <span aria-hidden className="absolute -inset-px -z-10 rounded-xl bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 opacity-95 transition-opacity duration-300 group-hover:opacity-100" />
              <span aria-hidden className="absolute inset-0 -z-20 rounded-xl blur-md bg-gradient-to-r from-indigo-500/40 via-blue-500/35 to-purple-500/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              Get in Touch
              <Mail className="h-4 w-4" />
            </Link>
          </motion.div>

          {/* Stats – interactive */}
          <motion.div
            variants={item}
            className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 text-white/80 relative overflow-hidden group will-change-transform"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              setStatsXY({ x, y });
              // tilt
              const nx = x / rect.width - 0.5;
              const ny = y / rect.height - 0.5;
              setTilt({ rx: -(ny * 8), ry: nx * 8 });
            }}
            onMouseLeave={() => {
              setStatsXY(null);
              setTilt({ rx: 0, ry: 0 });
              setActiveStat(null);
            }}
            style={{ transform: `perspective(900px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)` }}
          >
            <div className="pointer-events-none absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/10 to-blue-500/10 blur-2xl" />
            {/* mouse-follow glow */}
            {statsXY && (
              <span
                className="pointer-events-none absolute h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.22),rgba(99,102,241,0)_60%)] blur-2xl"
                style={{ left: statsXY.x, top: statsXY.y }}
              />
            )}

            <div className="grid grid-cols-3 text-center relative z-10">
              {[
                { label: "Projects", value: "6+" },
                { label: "PH Product of the Day", value: "1+" },
                { label: "Startups", value: "2+" },
              ].map((s, i) => {
                const active = activeStat === i;
                return (
                  <div
                    key={s.label}
                    className="px-3 relative"
                    onMouseEnter={() => setActiveStat(i)}
                  >
                    {/* column divider */}
                    {i !== 0 && <span className="pointer-events-none absolute left-0 top-2 bottom-2 w-px bg-white/10" />}
                    {/* highlight ring behind number when active */}
                    <motion.span
                      aria-hidden
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.9 }}
                      transition={{ duration: 0.25, ease: cubicBezier(0.22, 1, 0.36, 1) }}
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 h-14 w-14 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.28),rgba(99,102,241,0)_60%)]"
                    />
                    <div className="text-3xl font-semibold text-white select-none relative">
                      <StatNumber value={s.value} active={active} />
                    </div>
                    <div className="text-xs mt-1">{s.label}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>

        {/* Right: Exploring & Education card - interactive blueprint with Story Spotlight pill */}
        <motion.aside
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px -10% 0px" }}
          transition={{ duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) }}
          className="lg:mt-4"
        >
          <div
            className="relative rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6 text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 overflow-hidden group"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoverXY({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => setHoverXY(null)}
          >
            {/* blueprint grid background */}
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-60">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.12)_1px,transparent_1px)] bg-[size:22px_22px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-blue-500/10" />
            </div>

            {/* mouse-follow glow */}
            {hoverXY && (
              <span
                className="pointer-events-none absolute h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.25),rgba(99,102,241,0)_60%)] blur-2xl"
                style={{ left: hoverXY.x, top: hoverXY.y }}
              />
            )}

            {/* Story Spotlight pill to keep symmetry */}
            <div className="absolute right-4 top-4">
              <Link
                href={latest ? `/stories/${latest.slug}` : "/stories"}
                className="group inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10"
              >
                <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="hidden sm:inline">Story Spotlight</span>
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <h3 className="text-sm font-semibold text-white/80">Currently exploring</h3>
            <ul className="mt-3 space-y-3 text-white/85">
              {[
                "Low-latency streaming with WebRTC/WebSockets",
                "Cloud-native serverless pipelines",
                "Generative AI for 3D & testing automation",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-2 inline-block h-2 w-2 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 shadow-[0_0_0_2px_rgba(255,255,255,0.06)] group-hover:animate-pulse" />
                  <span className="text-sm">{t}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:shadow-[0_0_0_1px_rgba(99,102,241,0.25),0_12px_36px_-12px_rgba(59,130,246,0.35)]">
              <div className="text-xs font-semibold tracking-wide text-white/60">EDUCATION</div>
              <div className="mt-2 text-white">B.E. Computer Science — Thapar Institute of Engineering & Technology</div>
              <div className="text-sm text-white/70">CGPA 9.04 / 10</div>
            </div>

            {/* animated wiring path */}
            <motion.svg
              initial={{ pathLength: 0, opacity: 0.6 }}
              whileInView={{ pathLength: 1, opacity: 0.9 }}
              viewport={{ once: true, margin: "-20% 0px -10% 0px" }}
              transition={{ duration: 1.2, ease: cubicBezier(0.22, 1, 0.36, 1) }}
              className="absolute -right-8 -bottom-8 h-40 w-40 text-indigo-400/35"
              viewBox="0 0 200 200"
              fill="none"
            >
              <motion.path d="M20 20 H140 V140 H20 Z" stroke="currentColor" strokeWidth="1" pathLength={1} />
              <motion.path d="M140 80 H180 V180 H80 V140" stroke="currentColor" strokeWidth="1" pathLength={1} />
              <motion.circle cx="80" cy="140" r="3" fill="currentColor" />
            </motion.svg>

            <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
          </div>
        </motion.aside>
      </div>
    </section>
  );
}
