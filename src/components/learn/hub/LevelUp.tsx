"use client";

import { useState } from "react";
import Overlay from "./Overlay";
import { LEVELS, levelProgress } from "@/game/catalog";
import { useGame } from "@/game/GameProvider";
import { useAuth } from "@/contexts/AuthContext";
import { supabaseClient } from "@/lib/supabase-client";

const HANDLE_RE = /^[a-z0-9_]{3,20}$/i;

/** Level-up moment: the ladder, the new rank, what it unlocks. L5 Staff unlocks a Hall of Fame handle. */
export default function LevelUp({ from, reason, onClose }: { from: number; reason?: string; onClose: () => void }) {
  const { xp, flags, setFlag } = useGame();
  const { user } = useAuth();
  const p = levelProgress(xp);
  const prev = LEVELS[Math.max(0, Math.min(from, LEVELS.length - 1))];
  const hofUnlocked = p.index >= 4;
  const savedHandle = typeof flags["hof:handle"] === "string" ? (flags["hof:handle"] as string) : "";
  const [handle, setHandle] = useState(savedHandle);
  const [showMeta, setShowMeta] = useState(flags["hof:showMeta"] !== false);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "local">(savedHandle ? "saved" : "idle");
  const valid = HANDLE_RE.test(handle);
  const into = p.next ? xp - p.level.min : 0;
  const span = p.next ? p.next.min - p.level.min : 0;

  const claim = async () => {
    if (!valid) return;
    setState("saving");
    setFlag("hof:handle", handle);
    setFlag("hof:showMeta", showMeta);
    if (user) {
      try {
        const { error } = await supabaseClient.from("user_profiles").update({ handle }).eq("id", user.id);
        setState(error ? "local" : "saved");
        return;
      } catch {
        setState("local");
        return;
      }
    }
    setState("local");
  };

  return (
    <Overlay labelledBy="lvl-h" onClose={onClose} className="max-w-[640px] border border-line-strong bg-surface">
      <div className="flex flex-col gap-4 border-b border-line px-5 pb-5 pt-6 sm:px-7">
        <div className="flex flex-wrap justify-between gap-2 font-mono text-xs tracking-label">
          <span className="text-signal-text">LEVEL UP{reason ? ` · ${reason.toUpperCase()}` : ""}</span>
          <span className="text-fg-3">{xp.toLocaleString()} XP</span>
        </div>
        <div aria-hidden className="grid grid-cols-6 gap-1.5">
          {LEVELS.map((l, i) => (
            <span key={l.code} className="flex flex-col gap-1.5">
              <span className={`h-2 ${i < p.index ? "bg-fg" : i === p.index ? "animate-hk-pulse bg-signal" : "border border-dashed border-line-strong"}`} />
              <span className={`font-mono text-[10px] ${i === p.index ? "font-semibold text-signal-text" : i < p.index ? "text-fg-3" : "text-fg-4"}`}>
                {l.code}
                <span className="hidden sm:inline"> {l.name}</span>
              </span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-[26px] font-bold tracking-[-0.03em] text-fg-4 line-through decoration-2 sm:text-3xl">
            {prev.code} {prev.name}
          </span>
          <span className="font-mono text-[22px] text-signal-text" aria-hidden>
            →
          </span>
          <h2 id="lvl-h" className="font-display text-[clamp(48px,10vw,76px)] font-extrabold leading-[0.86] tracking-tightest text-fg">
            {p.level.code} {p.level.name}
            <span className="text-signal-text">.</span>
          </h2>
        </div>
        {p.next ? (
          <div className="flex flex-col gap-1.5">
            <div className="h-1.5 bg-surface-2">
              <div className="h-1.5 bg-signal" style={{ width: `${p.pct}%` }} />
            </div>
            <span className="font-mono text-xs text-fg-3">
              {into} / {span} XP into {p.level.name} · {p.next.min - xp} to {p.next.code} {p.next.name}
            </span>
          </div>
        ) : (
          <span className="font-mono text-xs text-fg-3">Max level. You beat the portfolio.</span>
        )}
      </div>

      <div className="flex flex-col gap-3.5 px-5 py-5 sm:px-7">
        <span className="font-mono text-[11px] tracking-label text-signal-text">UNLOCKED{hofUnlocked ? " · HALL OF FAME" : ""}</span>
        <span className="text-base leading-relaxed text-fg">{p.level.unlock}</span>
        {hofUnlocked && (
          <>
            <label className="flex flex-col gap-1.5 text-[13px] text-fg-3">
              Handle to show
              <span className={`flex items-center border bg-bg ${handle && !valid ? "border-bad" : "border-signal"}`}>
                <span className="pl-3 font-mono text-base text-fg-3">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value.replace(/\s/g, ""));
                    setState("idle");
                  }}
                  maxLength={20}
                  autoComplete="off"
                  className="min-h-12 min-w-0 flex-1 bg-transparent pl-0.5 pr-2 font-mono text-base text-fg outline-none"
                  aria-describedby="hof-hint"
                />
              </span>
              <span id="hof-hint" className={`text-xs ${handle && !valid ? "text-bad-text" : "text-fg-4"}`}>
                3–20 letters, numbers or underscores.
              </span>
            </label>
            <label className="flex min-h-8 items-center gap-2 text-[13px] text-fg-2">
              <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} className="h-4 w-4 accent-[var(--c-signal)]" />
              Show my level and badges next to my handle
            </label>
            {state === "saved" && <span className="font-mono text-xs text-ok">Saved · @{handle}</span>}
            {state === "local" && <span className="font-mono text-xs text-fg-3">Saved on this device as @{handle}. It goes public once your account syncs.</span>}
          </>
        )}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {hofUnlocked && state !== "saved" ? (
            <button type="button" onClick={claim} disabled={!valid || state === "saving"} className="min-h-[52px] bg-signal px-5 font-semibold text-on-signal disabled:opacity-50">
              {state === "saving" ? "Saving…" : "Claim my spot"}
            </button>
          ) : null}
          <button type="button" onClick={onClose} data-autofocus className="min-h-[52px] border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
            {hofUnlocked && state !== "saved" ? "Not now" : "Keep going"}
          </button>
          {hofUnlocked && <span className="text-xs text-fg-3">Hide it any time from your profile.</span>}
        </div>
      </div>
    </Overlay>
  );
}
