"use client";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { motion, cubicBezier } from "framer-motion";
import {
  Server,
  Rocket,
  Smartphone,
  Cpu,
  GraduationCap,
  Sparkles,
  BadgeCheck,
  Briefcase,
  FolderGit2,
  Layers,
} from "lucide-react";

// Source content from the original implementation (kept verbatim)
const storyBullets = [
  "Started career at Ikarus 3D (Jan 2023 – Oct 2023) as Software Developer Associate and later SDE 1, working on backend microservices, authentication systems, CI/CD pipelines, and cloud deployments.",
  "Designed and deployed a cloud-based slicer service for converting 3D models into printer scripts, using GCP Cloud Run, AWS Lambda, AWS EFS with s3fuse, and Golang utilities to auto-terminate idle Docker containers while preserving state.",
  "Integrated noVNC to stream slicer desktop applications to the web, experimented with CloudFront/CDN for asset delivery, and researched 3D generative AI (NERF, BLIP, DreamFusion) pre-LLM boom.",
  "In Jan 2024, became the first employee and founding engineer at AutoFlow, building backend from scratch with FastAPI, PostgreSQL, Bun for WebSockets, AWS/GCP deployments, AI integrations for autonomous UI testing, and a scalable Playwright script runner. Launched AutoFlow on Product Hunt and achieved Product of the Day.",
  "In Jan–Feb 2025, pivoted to NativeBridge — a developer tool for cloud-based Android/iOS emulator and real device streaming using WebRTC/WebSockets with low latency, plus remote control features. Built iOS Bridge, an open-source CLI tool to stream iOS simulators remotely (like scrcpy for Android) across platforms, overcoming Mac hardware and resource limitations. Currently adding single-command streaming from the cloud to local via CLI.",
  "Mentored interns, took product architecture responsibilities, and contributed to business and feature strategy alongside core engineering.",
];

// Helper: sentence extraction (first sentence for preview)
function firstSentence(text: string) {
  const match = text.match(/[^.!?\n]+[.!?]/);
  return match ? match[0].trim() : text;
}

// Highlight helper: wraps key phrases in <strong> with gradient text
const HIGHLIGHTS = [
  "FastAPI",
  "PostgreSQL",
  "WebRTC",
  "WebSockets",
  "AWS",
  "GCP",
  "Playwright",
  "Golang",
  "Docker",
  "noVNC",
  "Cloud Run",
  "Lambda",
  "EFS",
  "s3fuse",
  "CloudFront",
  "CDN",
  "AI",
  "Product Hunt",
  "Product of the Day",
  "iOS Bridge",
  "open-source CLI",
];

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HIGHLIGHT_REGEX = new RegExp(
  `(${HIGHLIGHTS.map(escapeRegExp).join("|")})`,
  "g"
);

function highlightPhrases(text: string) {
  return text.split(HIGHLIGHT_REGEX).map((chunk, i) => {
    if (HIGHLIGHTS.includes(chunk)) {
      return (
        <strong
          key={i}
          className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent"
        >
          {chunk}
        </strong>
      );
    }
    return <span key={i}>{chunk}</span>;
  });
}

// Timeline data: group bullets into milestones with tags
const MILESTONES = [
  {
    id: "ikarus",
    title: "Early Career – Ikarus 3D",
    icon: Server,
    period: "Jan 2023 – Oct 2023",
    details: [storyBullets[0], storyBullets[1], storyBullets[2]],
    tags: [
      "Backend",
      "Microservices",
      "Auth",
      "CI/CD",
      "Cloud",
      "GCP",
      "AWS",
      "Golang",
      "Docker",
      "noVNC",
      "CloudFront",
      "CDN",
      "AI",
      "EFS",
      "s3fuse",
      "Cloud Run",
    ],
  },
  {
    id: "autoflow",
    title: "Founding Engineer – AutoFlow",
    icon: Rocket,
    period: "Jan 2024",
    details: [storyBullets[3]],
    tags: [
      "FastAPI",
      "PostgreSQL",
      "Bun",
      "WebSockets",
      "AWS",
      "GCP",
      "AI",
      "Playwright",
      "Product Hunt",
    ],
  },
  {
    id: "nativebridge",
    title: "Product Leadership – NativeBridge",
    icon: Smartphone,
    period: "Jan–Feb 2025",
    details: [storyBullets[4]],
    tags: [
      "WebRTC",
      "WebSockets",
      "iOS Bridge",
      "Open Source",
      "CLI",
      "Android",
      "iOS",
      "Streaming",
      "Remote Control",
      "Cloud",
    ],
  },
  {
    id: "leadership",
    title: "Leadership & Mentorship",
    icon: Cpu,
    period: "Ongoing",
    details: [storyBullets[5]],
    tags: ["Mentorship", "Architecture", "Strategy"],
  },
] as const;

const container = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.18, delayChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: cubicBezier(0.4, 0, 0.2, 1) },
  },
};

// subtle stat/skills animation
const badgeBase =
  "group relative inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] leading-none text-white/85 hover:bg-white/10 transition-colors select-none";

// NEW: quick stats and skills data
const QUICK_STATS = [
  { icon: Briefcase, value: "2+", label: "Years Experience" },
  { icon: FolderGit2, value: "10+", label: "Major Projects" },
  { icon: Layers, value: "Backend+", label: "Core Focus" },
  { icon: Rocket, value: "2", label: "Product Launches" },
] as const;

const TOP_SKILLS = [
  { name: "FastAPI", level: 85 },
  { name: "PostgreSQL", level: 80 },
  { name: "WebRTC/WebSockets", level: 88 },
  { name: "AWS/GCP", level: 78 },
] as const;

export default function About() {
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hasAvatar, setHasAvatar] = useState(false);

  // Check if /avatar.jpg exists to avoid Next/Image 404 warnings in dev
  useEffect(() => {
    let mounted = true;
    fetch("/avatar.jpg", { method: "HEAD" })
      .then((res) => {
        const type = res.headers.get("content-type") || "";
        if (mounted) setHasAvatar(res.ok && (type.startsWith("image/") || type === ""));
      })
      .catch(() => mounted && setHasAvatar(false));
    return () => {
      mounted = false;
    };
  }, []);

  const allTags = useMemo(
    () => Array.from(new Set(MILESTONES.flatMap((m) => m.tags))).sort(),
    []
  );

  const isActive = (mTags: readonly string[]) =>
    activeTags.length === 0 || mTags.some((t) => activeTags.includes(t));

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // Education panel animation variants
  const eduVariants = {
    hidden: { opacity: 0, y: 12 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) },
    },
  };

  return (
    // Make the section fill the viewport on md+, allow natural flow on mobile to avoid clipping
    <div className="grid gap-6 md:grid-cols-12 md:grid-rows-1 grid-rows-[auto,1fr] md:h-[100dvh] md:overflow-hidden">
      {/* Left: Education + intro (sticky on md+) */}
      <motion.aside
        variants={eduVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-20% 0px -10% 0px" }}
        className="relative rounded-2xl border border-white/10 bg-white/5 p-6 md:col-span-4 xl:col-span-5 shadow-lg shadow-black/5 dark:shadow-black/30 overflow-hidden md:sticky md:top-24 md:self-start md:h-[calc(100dvh-6rem)] md:max-h-[calc(100dvh-6rem)]"
      >
        {/* subtle gradient accent */}
        <div className="pointer-events-none absolute -top-20 -right-24 h-56 w-56 rounded-full bg-gradient-to-br from-indigo-500/15 via-blue-500/10 to-purple-500/10 blur-2xl" />

        <div className="flex items-center gap-4">
          {/* Avatar with fallback initials */}
          <div className="relative h-14 w-14 shrink-0">
            {hasAvatar ? (
              <Image
                src="/avatar.jpg"
                alt="Himanshu Kukreja"
                width={56}
                height={56}
                className="h-14 w-14 rounded-full object-cover ring-2 ring-white/10"
                priority
              />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 text-white font-semibold">
                HK
              </span>
            )}
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-semibold text-white flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-white/80" /> Education
            </h3>
            <p className="mt-1 text-sm text-white/80">
              B.E. in Computer Science, Thapar Institute of Engineering & Technology (CGPA 9.04/10)
            </p>
          </div>
        </div>

        {/* short intro */}
        <p className="mt-4 text-sm text-white/85">
          Startup‑minded engineer passionate about building scalable systems and solving complex backend challenges.
        </p>

        {/* vertical progress bar for style parity with timeline */}
        <div className="mt-6 flex items-start gap-4">
          <div className="relative ml-2 mr-1">
            <div className="absolute left-2 top-0 h-full w-0.5 bg-gradient-to-b from-indigo-500/60 via-blue-500/40 to-purple-500/30" />
            <div className="relative z-10 ml-0.5 mt-1 grid gap-6">
              <BadgeCheck className="h-4 w-4 text-indigo-400" />
              <Sparkles className="h-4 w-4 text-blue-400" />
              <Cpu className="h-4 w-4 text-purple-400" />
            </div>
          </div>
          <ul className="text-sm text-white/75 space-y-3">
            <li>Strong CS fundamentals and hands‑on product mindset.</li>
            <li>Focus on backend, cloud, real‑time streaming, and AI.</li>
            <li>Comfortable owning features from idea to production.</li>
          </ul>
        </div>

        {/* Quick Highlights */}
        <h4 className="mt-8 text-sm font-semibold text-white/90">Core Strengths</h4>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {QUICK_STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-20% 0px -10% 0px" }}
              transition={{ duration: 0.35, ease: cubicBezier(0.4, 0, 0.2, 1), delay: 0.06 * i }}
              className="rounded-xl border border-white/10 bg-white/5 p-3 shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(99,102,241,0.45)]"
            >
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500/20 to-blue-500/20 text-indigo-300 ring-1 ring-inset ring-white/10">
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-base font-semibold text-white leading-tight">{s.value}</div>
                  <div className="text-[11px] text-white/70 leading-tight">{s.label}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Top skills bars */}
        <h4 className="mt-6 text-sm font-semibold text-white/90">Top Skills</h4>
        <div className="mt-3 space-y-3">
          {TOP_SKILLS.map((sk) => (
            <div key={sk.name} className="">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>{sk.name}</span>
                <span>{sk.level}%</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-white/10">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${sk.level}%` }}
                  viewport={{ once: true, margin: "-20% 0px -10% 0px" }}
                  transition={{ duration: 0.4, ease: cubicBezier(0.4, 0, 0.2, 1) }}
                  className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                />
              </div>
            </div>
          ))}
        </div>
      </motion.aside>

      {/* Right: Story timeline in its own scroll container with sticky header, only cards scroll */}
      <div className="relative md:col-span-8 xl:col-span-7 md:h-[calc(100dvh-6rem)] md:self-start">
        <div
          data-scrollable="true"
          className="md:h-full md:overflow-y-auto scroll-smooth md:overscroll-y-contain [scrollbar-width:thin] [scrollbar-color:rgba(99,102,241,0.55)_transparent] md:pr-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="rounded-2xl border border-white/10 bg-white/5 shadow-lg shadow-black/5 dark:shadow-black/30 min-h-full overflow-hidden">
            {/* Sticky header: title + tags remain visible while the cards scroll */}
            <div className="sticky top-0 z-10 p-6 bg-white/5 backdrop-blur-sm border-b border-white/10">
              <h3 className="text-lg sm:text-xl font-semibold text-white">My story</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {allTags.map((t) => {
                  const active = activeTags.includes(t);
                  return (
                    <button
                      key={t}
                      aria-pressed={active}
                      onClick={() => toggleTag(t)}
                      className={`${badgeBase} ${
                        active ? "ring-1 ring-inset ring-indigo-400/50 bg-indigo-500/10" : ""
                      }`}
                    >
                      <span className="pointer-events-none absolute -inset-px rounded-full bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 group-hover:opacity-60 blur transition-opacity" />
                      <span className="relative">{t}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Scrollable cards area */}
            <div className="p-6 pt-4">
              <div className="relative mt-4">
                {/* center line */}
                <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />

                <motion.ul
                  variants={container}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
                  className="space-y-10"
                >
                  {MILESTONES.map((m, idx) => {
                    const Icon = m.icon;
                    const sideLeft = idx % 2 === 0;
                    const preview = firstSentence(m.details[0]);
                    const isExpanded = hovered === m.id || expanded === m.id;
                    const dim = !isActive(m.tags);

                    return (
                      <motion.li key={m.id} variants={item} className="relative">
                        {/* dot */}
                        <span className="absolute left-1/2 top-4 -translate-x-1/2 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/10 text-white shadow-sm">
                          <Icon className="h-3.5 w-3.5 opacity-90" />
                        </span>

                        <div
                          className={`md:grid md:grid-cols-2 md:gap-8 ${
                            dim ? "opacity-45" : "opacity-100"
                          } transition-opacity`}
                        >
                          <div
                            className={`${
                              sideLeft ? "md:col-start-1 md:pr-10" : "md:col-start-2 md:pl-10"
                            }`}
                          >
                            <motion.div
                              layout
                              onMouseEnter={() => setHovered(m.id)}
                              onMouseLeave={() =>
                                setHovered((h) => (h === m.id ? null : h))
                              }
                              onClick={() =>
                                setExpanded((e) => (e === m.id ? null : m.id))
                              }
                              className="relative cursor-pointer rounded-xl border border-white/10 bg-white/5 p-4 text-white/90 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)] group"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs text-white/60">{m.period}</p>
                                  <h4 className="mt-0.5 text-base font-semibold text-white">
                                    {m.title}
                                  </h4>
                                </div>
                                <Icon className="mt-1 h-5 w-5 text-indigo-300/90" />
                              </div>

                              {/* collapsed preview */}
                              <p className={`mt-2 text-sm ${isExpanded ? "hidden" : "block"}`}>
                                {highlightPhrases(preview)}
                              </p>

                              {/* tech tags (always visible) */}
                              <div className="mt-3 flex flex-wrap gap-1.5">
                                {m.tags.slice(0, 6).map((t) => (
                                  <span
                                    key={`${m.id}-${t}`}
                                    className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:from-indigo-500/25 hover:to-blue-500/25"
                                  >
                                    {t}
                                  </span>
                                ))}
                              </div>

                              {/* expanded full details */}
                              <motion.div
                                layout
                                className={`overflow-hidden ${isExpanded ? "mt-3" : "h-0 mt-0"}`}
                                transition={{ duration: 0.45, ease: cubicBezier(0.22, 1, 0.36, 1) }}
                              >
                                <ul className="mt-1 list-disc space-y-2 pl-5 text-sm">
                                  {m.details.map((d, i) => {
                                    const sentences = d.split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);
                                    return (
                                      <li key={i} className="marker:text-indigo-300/80">
                                        {sentences.map((s, si) => (
                                          <span key={si} className="block">
                                            {highlightPhrases(s)}
                                          </span>
                                        ))}
                                      </li>
                                    );
                                  })}
                                </ul>
                                {m.tags.length > 6 && (
                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    {m.tags.slice(6).map((t) => (
                                      <span
                                        key={`${m.id}-${t}`}
                                        className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500/15 to-indigo-500/15 px-2 py-0.5 text-[10px] text-white/85 ring-1 ring-inset ring-white/10"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </motion.div>
                              <span className="pointer-events-none absolute -inset-px rounded-xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
                            </motion.div>
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </motion.ul>

                {/* background illustration accent */}
                <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_55%)]" />
              </div>
            </div>
          </div>
          {/* bottom padding so content isn't clipped by fade */}
          <div className="h-6 md:h-8" />
        </div>

        {/* Fade masks to hint scrollable content */}
        <div className="pointer-events-none absolute inset-x-2 top-0 h-10 bg-gradient-to-b from-black/20 to-transparent dark:from-black/40" />
        <div className="pointer-events-none absolute inset-x-2 bottom-0 h-10 bg-gradient-to-t from-black/20 to-transparent dark:from-black/40" />
      </div>
    </div>
  );
}
