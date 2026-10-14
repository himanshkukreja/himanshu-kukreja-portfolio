"use client";

import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { Prompt, container, ghostBtn, h2Class, primaryBtn } from "./ui";

type Repo = {
  name: string;
  stars: number;
  desc: string;
  cmd: string;
  lang: string;
  /** GitHub linguist colour, or null for the site signal colour. */
  langColor: string | null;
  extra: string;
  url: string;
  featured: boolean;
};

const REPOS: Repo[] = [
  {
    name: "ios-bridge",
    stars: 75,
    desc: "Stream and control iOS simulators from any device: full touch, app management, recording. Cross-platform desktop app.",
    cmd: "git clone github.com/himanshkukreja/ios-bridge",
    lang: "Python",
    langColor: "#3572A5",
    extra: "10 forks",
    url: "https://github.com/himanshkukreja/ios-bridge",
    featured: true,
  },
  {
    name: "markdrop",
    stars: 5,
    desc: "Docs and files as links that render. Paste markdown, get a shareable link, no login. Web, VS Code and CLI.",
    cmd: "brew install himanshkukreja/tap/markdrop",
    lang: "TypeScript",
    langColor: "#3178C6",
    extra: "markdrop.in",
    url: "https://markdrop.in",
    featured: true,
  },
  {
    name: "bridgelink",
    stars: 6,
    desc: "Remote Android device access through secure tunnels. Plug a phone in at the office, use it from anywhere.",
    cmd: "git clone github.com/himanshkukreja/bridgelink",
    lang: "Python",
    langColor: "#3572A5",
    extra: "adb · tunnels",
    url: "https://github.com/himanshkukreja/bridgelink",
    featured: false,
  },
  {
    name: "ios-web-streamer",
    stars: 5,
    desc: "Stream and control a real iOS device from any browser with low-latency WebRTC mirroring.",
    cmd: "git clone github.com/himanshkukreja/ios-web-streamer",
    lang: "WebRTC",
    langColor: null,
    extra: "real device",
    url: "https://github.com/himanshkukreja/ios-web-streamer",
    featured: false,
  },
  {
    name: "waygate",
    stars: 4,
    desc: "Open-source, self-hosted tunnel for exposing local services through infrastructure you control.",
    cmd: "git clone github.com/himanshkukreja/waygate",
    lang: "Go",
    langColor: "#00ADD8",
    extra: "self-hosted",
    url: "https://github.com/himanshkukreja/waygate",
    featured: false,
  },
  {
    name: "obscura",
    stars: 3,
    desc: "Private video delivery without handing out the original file. Self-hostable HLS from S3 with encrypted segments.",
    cmd: "git clone github.com/himanshkukreja/obscura",
    lang: "TypeScript",
    langColor: "#3178C6",
    extra: "hls · ffmpeg",
    url: "https://github.com/himanshkukreja/obscura",
    featured: false,
  },
];

function readStarred(v: unknown): Record<string, boolean> {
  return v && typeof v === "object" ? (v as Record<string, boolean>) : {};
}

export default function PinnedRepos() {
  const { flags, setFlag, award, hydrated } = useGame();
  const starred = hydrated ? readStarred(flags.starred) : {};

  const toggle = (name: string) => {
    const was = !!starred[name];
    setFlag("starred", { ...starred, [name]: !was });
    if (!was) award("star", `Starred ${name}`);
  };

  return (
    <section id="repos" aria-labelledby="repos-h" className={`${container} flex scroll-mt-20 flex-col gap-7 py-12 sm:py-16`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Prompt>gh repo list --sort stars</Prompt>
          <h2 id="repos-h" className={h2Class}>
            Pinned repos
          </h2>
        </div>
        <span className="max-w-[400px] text-[15px] text-fg-3">
          Built after hours, used by other developers. Star one and the counter moves (+20 XP, once).
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] gap-3">
        {REPOS.map((r) => {
          const st = !!starred[r.name];
          return (
            <article
              key={r.name}
              className={`flex min-h-[250px] min-w-0 flex-col gap-3.5 bg-surface p-4 sm:p-[22px] ${
                r.featured ? "border border-signal" : "border border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="font-mono text-xs text-fg-3">himanshkukreja /</span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-words font-mono text-lg font-semibold text-fg no-underline hover:text-signal-text sm:text-[22px]"
                  >
                    {r.name}
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => toggle(r.name)}
                  aria-pressed={st}
                  aria-label={`${st ? "Unstar" : "Star"} ${r.name}, ${r.stars + (st ? 1 : 0)} stars`}
                  className={`min-h-11 shrink-0 px-3 font-mono text-[13px] ${
                    st ? "border border-signal bg-signal text-on-signal" : "border border-line-strong bg-transparent text-fg hover:bg-surface-2"
                  }`}
                >
                  ★ {r.stars + (st ? 1 : 0)}
                </button>
              </div>
              <p className="m-0 flex-grow text-[15px] leading-normal text-fg-2">{r.desc}</p>
              <div className="flex items-center gap-2.5 overflow-x-auto whitespace-nowrap border border-line bg-bg px-3 py-2.5 font-mono text-xs text-fg-2">
                <span className="text-signal-text" aria-hidden>
                  $
                </span>
                <code>{r.cmd}</code>
              </div>
              <div className="flex flex-wrap items-center gap-3.5 font-mono text-xs text-fg-3">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`h-2.5 w-2.5 rounded-full ${r.langColor ? "" : "bg-signal"}`}
                    style={r.langColor ? { background: r.langColor } : undefined}
                  />
                  {r.lang}
                </span>
                <span>{r.extra}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-col items-start gap-3">
        <Link href="/projects" className={primaryBtn}>
          Enter the Project Arcade: play every project →
        </Link>
        <a href="https://github.com/himanshkukreja?tab=repositories" target="_blank" rel="noopener noreferrer" className={ghostBtn}>
          ls ~/github&nbsp;&nbsp;# 50 public repos →
        </a>
      </div>
    </section>
  );
}
