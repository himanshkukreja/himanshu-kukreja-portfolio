"use client";

/**
 * The player's Share button: a link to this lecture that starts at the current moment (?t=<seconds>,
 * which the player seeks to on load), or from the start. Copy, the system share sheet where there is
 * one, and WhatsApp / LinkedIn / X. Playing needs an account (the first minute is free); a signed-in
 * learner's link carries their share token (s=…), so whoever opens it can watch all of it without one.
 */
import { useEffect, useRef, useState } from "react";
import { Share2 } from "lucide-react";
import { track } from "@/lib/track";

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export default function LectureShare({ slug, title, time, chapter, getToken, className = "" }: { slug: string; title: string; time: number; chapter: string; getToken?: () => Promise<string | null>; className?: string }) {
  const [open, setOpen] = useState(false);
  // the moment is taken when the panel opens, so the link doesn't drift while it's being shared
  const [at, setAt] = useState(0);
  const [fromHere, setFromHere] = useState(true);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const start = fromHere && at >= 5 ? Math.floor(at) : 0;
  const qs = [token ? `s=${token}` : "", start ? `t=${start}` : ""].filter(Boolean).join("&");
  const url = `${typeof window === "undefined" ? "https://www.himanshukukreja.in" : window.location.origin}/learn/lectures/${slug}${qs ? `?${qs}` : ""}`;
  const text = start ? `${title}: watch from ${fmt(start)} (${chapter})` : title;
  const sent = (channel: string) => track("lecture_share", { quest: slug, at: start, channel });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      sent("copy");
    } catch {
      // the field stays selectable for a manual copy
    }
  };
  const native = async () => {
    try {
      await navigator.share({ title, text, url });
      sent("native");
    } catch {
      // dismissed
    }
  };
  const links = [
    ["WhatsApp", `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`],
    ["LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`],
    ["X", `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`],
  ] as const;

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setAt(time);
          setFromHere(time >= 5);
          setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
          if (!open && getToken) void getToken().then(setToken).catch(() => setToken(null));
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Share this lecture"
        aria-label="Share this lecture"
        className="grid h-10 min-w-9 shrink-0 place-items-center px-1.5 font-mono text-xs text-fg-2 hover:text-fg sm:min-w-10 sm:px-2"
      >
        <Share2 className="h-4 w-4 sm:hidden" aria-hidden />
        <span className="hidden sm:inline">share</span>
      </button>
      {open && (
        <div role="dialog" aria-label="Share this lecture" className="absolute bottom-full right-0 z-40 mb-2 flex w-[min(340px,calc(100vw-32px))] flex-col gap-3 border border-line-strong bg-surface p-4 shadow-[0_12px_40px_rgba(0,0,0,0.45)]">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">share this lecture</span>
          {at >= 5 && (
            <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-fg-2">
              <input type="checkbox" checked={fromHere} onChange={(e) => setFromHere(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff6b2b]" />
              <span>
                Start at <strong className="font-mono text-fg">{fmt(at)}</strong> · {chapter}
              </span>
            </label>
          )}
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Link" className="min-h-10 w-full border border-line bg-bg px-2.5 font-mono text-[12px] text-fg" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copy()} className="min-h-10 bg-signal px-3.5 font-mono text-xs font-semibold text-on-signal">
              {copied ? "copied ✓" : "copy link"}
            </button>
            {canShare && (
              <button type="button" onClick={() => void native()} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
                share…
              </button>
            )}
            {links.map(([name, href]) => (
              <a key={name} href={href} target="_blank" rel="noopener noreferrer" onClick={() => sent(name.toLowerCase())} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg-2 hover:text-fg">
                {name}
              </a>
            ))}
          </div>
          <span className="text-[12px] leading-snug text-fg-3">
            {token ? "Anyone with this link can watch all of it, no sign-in needed." : "Others get the first minute free. Sign in before sharing so your link plays in full for anyone."}
          </span>
        </div>
      )}
    </div>
  );
}
