"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import { Dot, Prompt, container, h2Class } from "./ui";

type Layer = "client" | "edge" | "service" | "data";

type Era = {
  key: string;
  year: string;
  name: string;
  role: string;
  period: string;
  title: string;
  points: string[];
  stats: string[];
  lesson: string;
  add: [Layer, string, string][];
};

const ERAS: Era[] = [
  {
    key: "thapar",
    year: "2019–23",
    name: "Thapar",
    role: "Student · B.E. CS",
    period: "Aug 2019 – Jul 2023 · Patiala",
    title: "Thapar Institute · B.E. Computer Science",
    points: [
      "CGPA 9.04 / 10.",
      "AI smart glasses for visually impaired people on a NodeMCU ESP8266, with 4 teammates.",
      "SmartAgri: crop recommendations at 96% accuracy, plant-disease detection with TensorFlow.",
    ],
    stats: ["CGPA 9.04", "96% model"],
    lesson: "A model is the easy part. Getting it onto a $3 microcontroller is the project.",
    add: [
      ["client", "ESP8266 glasses", "camera → speech"],
      ["service", "Flask app", "first deploy, on GCP"],
      ["data", "TensorFlow models", "faces, captions, crops"],
    ],
  },
  {
    key: "ikarus",
    year: "2023",
    name: "Ikarus 3D",
    role: "SDA → SDE 1",
    period: "Jan – Oct 2023 · Chandigarh",
    title: "Ikarus 3D · first job, first fleet",
    points: [
      "Led backend for the IkarusNest launch across 7+ microservices: auth, carts, orders, slicer.",
      "Moved the online slicer from AWS ECS/EFS to GCP Cloud Run.",
      "First CI/CD pipelines; JWT service auth plus caching; mentored 3 interns.",
    ],
    stats: ["−90% infra cost", "−50% API latency", "−30% login time"],
    lesson: "The cheapest server is the one that turns itself off.",
    add: [
      ["edge", "JWT auth + API cache", "between 7+ services"],
      ["edge", "CI/CD", "the company’s first"],
      ["service", "Slicer on Cloud Run", "scale to zero"],
      ["data", "MySQL + Liquibase", "migrations, not hand edits"],
    ],
  },
  {
    key: "autoflow",
    year: "2024",
    name: "AutoFlow",
    role: "Founding engineer #1",
    period: "Jan – Dec 2024 · Bengaluru",
    title: "AutoFlow · employee #1",
    points: [
      "Built the whole backend from an empty repo.",
      "AI integrations for autonomous UI testing on a scalable Playwright runner.",
      "Launched on Product Hunt: Product of the Day.",
    ],
    stats: ["employee #1", "Product of the Day"],
    lesson: "Founding engineer means you also own the pager, the bill and the demo.",
    add: [
      ["edge", "Bun WebSocket gateway", "live test runs"],
      ["service", "FastAPI core", "from git init"],
      ["service", "LLM test agent", "writes the tests"],
      ["data", "Playwright runner fleet", "AWS + GCP workers"],
      ["data", "PostgreSQL", "the default, again"],
    ],
  },
  {
    key: "nativebridge",
    year: "2025",
    name: "NativeBridge + pCloudy",
    role: "Founding eng · freelance",
    period: "2025 · Bengaluru / remote",
    title: "Real phones in the browser",
    points: [
      "NativeBridge: cloud Android and iOS devices streamed over WebRTC, with touch, rotation, clipboard and file transfer.",
      "Open-sourced iOS Bridge (75★) and BridgeLink.",
      "pCloudy (freelance): device-streaming research for a 5,000+ device cloud and mobile testing solutions.",
    ],
    stats: ["<100 ms streams", "75★ iOS Bridge"],
    lesson: "Latency is a feature. Users feel 80 ms before they can name it.",
    add: [
      ["client", "Browser device viewer", "touch, keys, clipboard"],
      ["edge", "WebRTC signaling", "sub-100 ms"],
      ["service", "Device farm control", "Android + iOS"],
      ["data", "Secure tunnels", "BridgeLink"],
    ],
  },
  {
    key: "senseloaf",
    year: "[YYYY]–now",
    name: "Senseloaf AI",
    role: "Senior SWE · eng lead",
    period: "[MMM YYYY] – present · Bengaluru",
    title: "Senseloaf AI · agentic hiring",
    points: [
      "Lead engineering for a hiring platform used by enterprises and startups.",
      "Own features end to end: product research, UI design, frontend, backend, infra scaling.",
      "Building SIA, the chat where a recruiter hires end to end, and its MCP server.",
    ],
    stats: ["5 hiring agents", "SIA + MCP"],
    lesson: "An agent is only as good as the product decisions around it.",
    add: [
      ["client", "SIA chat", "hire from one conversation"],
      ["edge", "MCP server", "SIA’s tools, anywhere"],
      ["service", "Agent orchestrator", "source → match → verify → screen → interview"],
      ["data", "ATS · Gmail · WhatsApp", "where recruiters already work"],
    ],
  },
];

const LAYERS: [Layer, string][] = [
  ["client", "CLIENTS"],
  ["edge", "EDGE + CONTRACTS"],
  ["service", "SERVICES"],
  ["data", "DATA + INFRA"],
];

const REPLAY_MS = 1400;

export default function CareerReplay() {
  const { award } = useGame();
  const [ei, setEi] = useState(ERAS.length - 1);
  const [replaying, setReplaying] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearInterval(timer.current), []);

  const pick = (k: number) => {
    window.clearInterval(timer.current);
    setReplaying(false);
    setEi(k);
  };

  const replay = () => {
    window.clearInterval(timer.current);
    let k = 0;
    setEi(0);
    setReplaying(true);
    timer.current = window.setInterval(() => {
      k += 1;
      if (k >= ERAS.length) {
        window.clearInterval(timer.current);
        setReplaying(false);
        award("replay", "Career replayed · all 5 eras");
        return;
      }
      setEi(k);
    }, REPLAY_MS);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>, k: number) => {
    let n = -1;
    if (e.key === "ArrowRight") n = (k + 1) % ERAS.length;
    else if (e.key === "ArrowLeft") n = (k - 1 + ERAS.length) % ERAS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = ERAS.length - 1;
    if (n < 0) return;
    e.preventDefault();
    pick(n);
    tabRefs.current[n]?.focus();
  };

  // Keep the active era chip in view on the mobile chip scroller (horizontal only; never moves the page).
  useEffect(() => {
    const box = listRef.current;
    const el = tabRefs.current[ei];
    if (!box || !el || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "smooth" });
  }, [ei]);

  const era = ERAS[ei];
  let compCount = 0;
  const layers = LAYERS.map(([key, name]) => {
    const items: { label: string; note: string; state: "now" | "live" | "fog"; id: string }[] = [];
    ERAS.forEach((e, k) =>
      e.add.forEach((a, j) => {
        if (a[0] !== key) return;
        const live = k <= ei;
        if (live) compCount += 1;
        items.push({
          id: `${e.key}-${j}`,
          label: live ? a[1] : "???",
          note: live ? a[2] : `era ${k + 1}`,
          state: k === ei ? "now" : live ? "live" : "fog",
        });
      })
    );
    return { key, name, items };
  });

  return (
    <section id="career" aria-labelledby="career-h" className={`${container} flex scroll-mt-20 flex-col gap-7 pb-14 pt-16 sm:pb-16 sm:pt-[88px]`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[760px] flex-col gap-3">
          <Prompt>./career --replay</Prompt>
          <h2 id="career-h" className={h2Class}>
            <span className="sm:hidden">One system I keep scaling</span>
            <span className="hidden sm:inline">My career is one system I keep scaling</span>
            <Dot />
          </h2>
          <p className="m-0 text-base leading-relaxed text-fg-2 sm:text-[17px]">
            Every job added pieces to the same architecture. Scrub through the eras or hit replay. Orange is what that era
            added; the fog is what&apos;s still ahead.
          </p>
        </div>
        <button
          type="button"
          onClick={replay}
          disabled={replaying}
          className="min-h-12 bg-signal px-[18px] font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {replaying ? "replaying…" : "▶ replay career"}
        </button>
      </div>

      <div
        ref={listRef}
        role="tablist"
        aria-label="Career eras"
        className="relative -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 md:grid md:grid-cols-5 md:gap-0 md:border md:border-line md:pb-0"
      >
        {ERAS.map((e, k) => {
          const on = k === ei;
          return (
            <button
              key={e.key}
              ref={(el) => {
                tabRefs.current[k] = el;
              }}
              type="button"
              role="tab"
              id={`era-tab-${e.key}`}
              aria-selected={on}
              aria-controls="era-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => pick(k)}
              onKeyDown={(ev) => onTabKey(ev, k)}
              className={`flex min-h-11 w-[150px] shrink-0 flex-col items-start gap-1.5 border px-3 py-2.5 text-left md:min-h-24 md:w-auto md:border-0 md:border-r md:border-line md:px-4 md:py-3.5 md:last:border-r-0 ${
                on
                  ? "border-signal bg-signal text-on-signal"
                  : k < ei
                    ? "border-line bg-surface text-fg"
                    : "border-dashed border-line-strong bg-bg text-fg-3 md:border-solid"
              }`}
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden
                  className={`h-2.5 w-2.5 shrink-0 ${
                    k < ei ? "bg-fg" : on ? "bg-on-signal" : "border border-dashed border-fg-4"
                  }`}
                />
                <span className="font-mono text-xs">{e.year}</span>
              </span>
              <span className="text-[15px] font-semibold">{e.name}</span>
              <span className="hidden text-xs opacity-80 md:block">{e.role}</span>
            </button>
          );
        })}
      </div>

      <div
        id="era-panel"
        role="tabpanel"
        aria-labelledby={`era-tab-${era.key}`}
        className="flex flex-wrap gap-px border border-line bg-line"
      >
        <div
          className="flex min-w-0 flex-[999_1_640px] flex-col gap-3 bg-raised p-3 sm:p-5"
          style={{
            backgroundImage:
              "linear-gradient(var(--c-surface-2) 1px, transparent 1px), linear-gradient(90deg, var(--c-surface-2) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div className="flex justify-between gap-2 font-mono text-[11px] tracking-label text-fg-3">
            <span>himanshu-architecture.svg · era {ei + 1}/5</span>
            <span aria-live="polite">{compCount} components live</span>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-h-[360px] lg:grid-cols-4">
            {layers.map((l) => (
              <div key={l.key} className="flex min-w-0 flex-col gap-2">
                <span className="border-b border-dashed border-line pb-1 font-mono text-[10px] tracking-[0.1em] text-fg-4">{l.name}</span>
                {l.items.map((c) => (
                  <div
                    key={c.id}
                    className={`flex flex-col gap-[3px] px-2.5 py-2 transition-colors sm:px-3 sm:py-2.5 ${
                      c.state === "now"
                        ? "border border-signal bg-signal text-on-signal"
                        : c.state === "live"
                          ? "border border-line-strong bg-bg text-fg"
                          : "border border-dashed border-line bg-transparent text-fg-4"
                    }`}
                  >
                    <span className="font-mono text-[11px] font-semibold leading-tight sm:text-xs">{c.label}</span>
                    <span className="text-[11px] leading-[1.35] opacity-80">{c.note}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-3.5 bg-surface p-4 sm:p-6">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">{era.period}</span>
          <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.025em] sm:text-[30px]">{era.title}</span>
          <ul className="m-0 flex list-disc flex-col gap-2 pl-[18px] text-[15px] leading-normal text-fg-2">
            {era.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5">
            {era.stats.map((s) => (
              <span key={s} className="border border-signal bg-bg px-2.5 py-1.5 font-mono text-xs text-signal-text">
                {s}
              </span>
            ))}
          </div>
          <div className="mt-auto flex flex-col gap-1 border border-dashed border-line-strong p-3.5">
            <span className="font-mono text-[11px] tracking-label text-fg-3">LESSON LOGGED</span>
            <span className="text-[15px] leading-[1.45] text-fg">{era.lesson}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 font-mono text-xs text-fg-3">
        <span>running in parallel since 2025:</span>
        <Link href="/projects" className="inline-flex min-h-11 items-center border border-signal px-2.5 text-signal-text no-underline hover:bg-surface-2">
          markdrop · my venture
        </Link>
        <Link href="/projects" className="inline-flex min-h-11 items-center border border-line-strong px-2.5 text-fg-2 no-underline hover:bg-surface-2">
          open source · 7 repos
        </Link>
      </div>
    </section>
  );
}
