"use client";
import { useState } from "react";
import { motion, cubicBezier } from "framer-motion";
import { Briefcase, Building2, Calendar, ExternalLink } from "lucide-react";

type ExperienceItem = {
  id: string;
  company: string;
  role: string;
  period: string;
  points: string[];
  tags: string[];
  link?: string;
  icon?: React.ComponentType<{ className?: string }>;
};

const experiences: ExperienceItem[] = [
  {
    id: "nativebridge-autoflow",
    company: "NativeBridge / AutoFlow",
    role: "Founding Engineer",
    period: "Jan 2024 – Present",
    points: [
      "Architected scalable backend for Playwright runner and real-time device streaming.",
      "Built WebRTC/WebSocket infrastructure for Android/iOS simulators and real devices.",
      "Developed iOS Bridge CLI tool with cross-platform streaming and remote control.",
      "Took leadership in product direction, mentoring, and feature prioritization.",
    ],
    tags: [
      "FastAPI",
      "PostgreSQL",
      "WebRTC",
      "WebSockets",
      "Android",
      "iOS",
      "Streaming",
      "Playwright",
      "AWS",
      "GCP",
      "CLI",
    ],
    icon: Briefcase,
  },
  {
    id: "ikarus-3d",
    company: "Ikarus 3D",
    role: "SDE 1 & Software Developer Associate",
    period: "Jan 2023 – Oct 2023",
    points: [
      "Designed serverless 3D slicer service with GCP Cloud Run/AWS Lambda/EFS.",
      "Built Golang utilities for container lifecycle automation and persistent state storage.",
      "Implemented noVNC desktop streaming for slicer applications.",
      "Researched prompt-to-3D model AI systems and cutting-edge CV/AI techniques.",
    ],
    tags: [
      "GCP Cloud Run",
      "AWS Lambda",
      "EFS",
      "Golang",
      "Docker",
      "noVNC",
      "CDN",
      "CloudFront",
      "AI",
    ],
    icon: Building2,
  },
];

const container = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.16, delayChildren: 0.08 },
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

function firstSentence(text: string) {
  const match = text.match(/[^.!?\n]+[.!?]/);
  return match ? match[0].trim() : text;
}

export default function Experience() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="pointer-events-none absolute left-3 top-0 h-full w-px bg-black/10 dark:bg-white/10" />

      <motion.ol
        variants={container}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-10% 0px -20% 0px" }}
        className="space-y-8"
      >
        {experiences.map((exp) => {
          const Icon = exp.icon ?? Briefcase;
          const isOpen = expanded === exp.id || hovered === exp.id;
          const preview = firstSentence(exp.points[0] || "");

          return (
            <motion.li key={exp.id} variants={item} className="relative pl-10">
              {/* Dot/Icon */}
              <span className="absolute left-0 top-4 grid h-6 w-6 place-items-center rounded-full border border-black/10 dark:border-white/10 bg-black/10 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm">
                <Icon className="h-3.5 w-3.5 opacity-90" />
              </span>

              {/* Card */}
              <motion.div
                layout
                onMouseEnter={() => setHovered(exp.id)}
                onMouseLeave={() => setHovered((h) => (h === exp.id ? null : h))}
                onClick={() => setExpanded((e) => (e === exp.id ? null : exp.id))}
                className="group relative cursor-pointer rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-5 text-gray-800 dark:text-white/90 shadow-lg shadow-black/5 dark:shadow-black/30 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.35),0_12px_36px_-12px_rgba(59,130,246,0.45)] will-change-transform"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-white/60 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" /> {exp.period}
                    </p>
                    <h3 className="mt-1 text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
                      {exp.company} — <span className="text-[var(--accent-2)]">{exp.role}</span>
                    </h3>
                  </div>
                  {exp.link && (
                    <a
                      href={exp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--ring)]/60 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(59,130,246,0.45)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span aria-hidden className="absolute -inset-px -z-10 rounded-lg bg-gradient-to-r from-indigo-500 via-blue-500 to-purple-500 opacity-95 transition-opacity duration-300 group-hover:opacity-100" />
                      <span aria-hidden className="absolute inset-0 -z-20 rounded-lg blur-md bg-gradient-to-r from-indigo-500/40 via-blue-500/35 to-purple-500/40 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      View Details <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>

                {/* Collapsed preview */}
                <p className={`mt-2 text-sm ${isOpen ? "hidden" : "block"}`}>{preview}</p>

                {/* Tech tags (always show a subset) */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {exp.tags.slice(0, 6).map((t) => (
                    <span
                      key={`${exp.id}-${t}`}
                      className="inline-flex items-center rounded-full bg-gradient-to-r from-indigo-500/15 to-blue-500/15 px-2 py-0.5 text-[10px] text-gray-700 dark:text-white/85 ring-1 ring-inset ring-white/10 transition-colors hover:from-indigo-500/25 hover:to-blue-500/25"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {/* Expanded details */}
                <motion.div
                  layout
                  className={`${isOpen ? "mt-3" : "mt-0 h-0 overflow-hidden"}`}
                  transition={{ duration: 0.32, ease: cubicBezier(0.4, 0, 0.2, 1) }}
                >
                  <ul className="list-disc space-y-2 pl-5 text-sm">
                    {exp.points.map((p, j) => (
                      <li key={j} className="marker:text-indigo-300/80">
                        {p}
                      </li>
                    ))}
                  </ul>
                  {exp.tags.length > 6 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {exp.tags.slice(6).map((t) => (
                        <span
                          key={`${exp.id}-${t}`}
                          className="inline-flex items-center rounded-full bg-gradient-to-r from-purple-500/15 to-indigo-500/15 px-2 py-0.5 text-[10px] text-gray-700 dark:text-white/85 ring-1 ring-inset ring-white/10"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>

                <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-blue-500/0 via-purple-500/0 to-blue-500/0 opacity-0 blur group-hover:opacity-60 transition-opacity" />
              </motion.div>
            </motion.li>
          );
        })}
      </motion.ol>

      {/* background illustration accent */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(99,102,241,0.08),transparent_55%)]" />
    </div>
  );
}
