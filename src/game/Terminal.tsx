"use client";

import { useEffect, useRef, useState } from "react";
import { EMAIL, SOCIALS } from "@/lib/socials";
import { usePathname, useRouter } from "next/navigation";
import { useGame } from "./GameProvider";
import { LEVELS, MAIN_QUESTS, levelIndex } from "./catalog";

type Line = { kind: "in" | "out" | "sys"; text: string };

const ROUTES: Record<string, string> = {
  home: "/",
  "~": "/",
  projects: "/projects",
  arcade: "/projects",
  play: "/play",
  playground: "/play",
  "case-files": "/stories",
  cases: "/stories",
  stories: "/stories",
  learn: "/learn",
};

export default function Terminal() {
  const { terminalOpen, setTerminalOpen, award, xp, done } = useGame();
  const [lines, setLines] = useState<Line[]>([{ kind: "sys", text: "himanshu-shell 4.0 · type help and press enter" }]);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // ⌘K / Ctrl+K opens the terminal everywhere except /learn, where ⌘K is course search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && !pathname.startsWith("/learn")) {
        e.preventDefault();
        setTerminalOpen(true);
      }
      if (e.key === "Escape") setTerminalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname, setTerminalOpen]);

  useEffect(() => {
    if (!terminalOpen) return;
    award("term", "Terminal opened");
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [terminalOpen, award]);

  if (!terminalOpen) return null;

  const go = (href: string, note: string) => {
    setLines((l) => [...l, { kind: "out", text: note }]);
    window.setTimeout(() => {
      setTerminalOpen(false);
      router.push(href);
    }, 350);
  };

  const run = (raw: string) => {
    const c = raw.trim().toLowerCase();
    if (!c) return;
    const echo: Line = { kind: "in", text: raw };
    if (c === "clear") {
      setLines([]);
      setInput("");
      return;
    }
    if (c === "exit") {
      setInput("");
      setTerminalOpen(false);
      return;
    }
    let out: string[] = [];
    const lv = LEVELS[levelIndex(xp)];
    if (c === "help") {
      out = [
        "whoami          your level and XP",
        "cd <place>      home · projects · play · case-files · learn",
        "git log         the career, one line each",
        "ls repos        open source, by stars",
        "npx markdrop    what markdrop does",
        "npx chukta      split bills, settle over UPI",
        "cat resume      open the résumé",
        "socials         where to find me",
        "clear · exit",
      ];
    } else if (c === "socials" || c === "ls ~/socials" || c === "cat socials") {
      out = [...SOCIALS.map((s) => `${s.label.padEnd(14)}${s.handle.padEnd(22)}${s.href}`), `${"email".padEnd(14)}${EMAIL}`];
    } else if (c === "whoami") {
      const quests = MAIN_QUESTS.filter((q) => done[q.id]).length;
      out = [`${lv.code} · ${lv.name} · ${xp} XP · ${quests}/${MAIN_QUESTS.length} quests`];
    } else if (c.startsWith("cd ")) {
      const target = c.slice(3).replace(/\/$/, "");
      const href = ROUTES[target];
      if (href) {
        setLines((l) => [...l, echo]);
        setInput("");
        go(href, `→ ${href}`);
        return;
      }
      out = [`cd: no such directory: ${target}`];
    } else if (c === "ls") {
      out = ["projects/   play/   case-files/   learn/   resume.pdf"];
    } else if (c === "git log" || c === "git log --oneline") {
      out = [
        "a1f3c09 (HEAD -> main) feat(senseloaf): lead eng, ship SIA + MCP server",
        "7c2e4b1 chore(pcloudy): freelance device-streaming research",
        "4d9a0e2 feat(nativebridge): <100ms device streaming",
        "2b7f1c8 feat(autoflow): employee #1, Product of the Day",
        "9e0d3a6 perf(ikarus3d): -90% infra cost",
        "0000001 init(thapar): B.E. CS, 9.04",
      ];
    } else if (c === "ls repos" || c === "ls ~/github") {
      out = ["ios-bridge        ★75  python", "bridgelink        ★6   python", "markdrop          ★5   typescript", "ios-web-streamer  ★5   webrtc", "waygate           ★4   go", "obscura           ★3   typescript"];
    } else if (c === "npx markdrop" || c === "markdrop") {
      out = ["markdrop: docs and files as links that render.", "paste markdown → link. no account. → https://markdrop.in"];
    } else if (c === "npx chukta" || c === "chukta") {
      out = [
        "chukta: split it. settle it. chukta.",
        "free, ad-free bill splitting for friends in India. settle up over UPI in one tap.",
        "android beta   https://getchukta.in/#android",
        "iphone · web   https://app.getchukta.in",
        "→ https://getchukta.in",
      ];
    } else if (c === "cat resume" || c === "cat resume.pdf") {
      window.open("/resume.pdf", "_blank", "noopener");
      out = ["opening /resume.pdf in a new tab…"];
    } else if (c === "play" || c === "./tatkal-rush") {
      setLines((l) => [...l, echo]);
      setInput("");
      go("/#rush", "Tatkal Rush armed.");
      return;
    } else if (c === "sudo hire himanshu") {
      award("root", "Root shell · hidden command found");
      setLines((l) => [...l, echo, { kind: "out", text: "[sudo] password for guest: ********" }]);
      setInput("");
      go("/#contact", "permission granted. opening POST /api/hire…");
      return;
    } else if (c.startsWith("sudo")) {
      out = ["guest is not in the sudoers file. This incident will be reported. (Try something more specific.)"];
    } else if (c === "rm -rf /" || c === "rm -rf /*") {
      out = ["nice try. this site is immutable and deployed on vercel."];
    } else if (c === "vim" || c === "vi") {
      out = ["you are now trapped. (type exit — we are not monsters)"];
    } else {
      out = [`zsh: command not found: ${c} · try help`];
    }
    setLines((l) => [...l, echo, ...out.map((text) => ({ kind: "out" as const, text }))].slice(-18));
    setInput("");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-24" onClick={() => setTerminalOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="Terminal" className="w-full max-w-2xl animate-hk-in border border-line-strong bg-raised" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5 font-mono text-xs text-fg-3">
          <span>guest@himanshu — zsh</span>
          <button type="button" onClick={() => setTerminalOpen(false)} className="min-h-8 border border-line px-2.5 text-fg-2 hover:text-fg">
            esc
          </button>
        </div>
        <div className="flex min-h-[260px] flex-col gap-1 p-4 font-mono text-sm leading-relaxed">
          {lines.map((l, i) => (
            <div key={i} className={l.kind === "out" ? "whitespace-pre-wrap text-fg-2" : l.kind === "sys" ? "text-fg-3" : "text-fg"}>
              {l.kind === "in" && <span className="text-signal-text">guest@himanshu:~$ </span>}
              {l.text}
            </div>
          ))}
          <label className="mt-1.5 flex items-center gap-2">
            <span className="text-signal-text">guest@himanshu:~$</span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") run(input);
              }}
              aria-label="Command"
              spellCheck={false}
              autoComplete="off"
              className="min-h-9 flex-1 bg-transparent font-mono text-sm text-fg outline-none"
            />
          </label>
        </div>
        <div className="border-t border-line px-3.5 py-2.5 font-mono text-xs text-fg-3">try: help · whoami · cd projects · git log · and one command that isn&apos;t listed</div>
      </div>
    </div>
  );
}
