"use client";

/**
 * Share sheet: the learner's public link (or a one-tap "turn on my page"), prefilled text, and
 * channels — native share on phones, WhatsApp, LinkedIn, X, copy. Guests get a sign-in prompt
 * (their browser progress comes with them) and can still share the course.
 * Every channel press emits track("share_progress", { kind, channel }).
 */
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Linkedin, Lock, MessageCircle, Share2 } from "lucide-react";
import Overlay from "@/components/learn/hub/Overlay";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import { channelHref, channelLink, DEFAULT_VISIBILITY, profilePath, shareText, type ShareChannel, type ShareKind, type ShareSummary } from "@/lib/share/model";
import { saveShare, useShare } from "./useShare";

export type ShareTarget = {
  kind: ShareKind;
  /** achievement page (/u/<handle>/a/<id>) when the learner's page shows it */
  achievement?: string;
  title?: string;
  detail?: string;
  /** a link that works without a public page (e.g. today's daily challenge); gets ?ref= when there is one */
  url?: (handle: string | null) => string;
  /** replaces the generated text */
  text?: (summary: ShareSummary | null) => string;
};

const KIND_LABEL: Record<ShareKind, string> = {
  profile: "your progress",
  tree: "your skill tree",
  daily: "today's result",
  world: "world cleared",
  boss: "boss defeated",
  level: "level up",
  lesson: "lesson cleared",
  badge: "badge",
  badges: "your badges",
  leaderboard: "your rank",
  streak: "your streak",
  certificate: "your certificate",
};

const origin = () => (typeof window !== "undefined" ? window.location.origin : "https://himanshukukreja.in");
const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43Z" />
    </svg>
  );
}

function Channels({ url, text, kind, onDone }: { url: string; text: string; kind: ShareKind; onDone?: () => void }) {
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const native = useSyncExternalStore(() => () => {}, canNativeShare, () => false);
  const emit = (channel: ShareChannel) => track("share_progress", { kind, channel });
  const copy = async (what: "link" | "text") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? url : `${text}\n${url}`);
      setCopied(what);
      emit("copy");
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: "System Design Mastery", text, url: channelLink(url, "native") });
      emit("native");
      onDone?.();
    } catch {
      /* dismissed */
    }
  };
  const btn = "flex min-h-12 items-center justify-center gap-2 border border-line-strong bg-bg px-3 font-mono text-[13px] text-fg hover:bg-surface-2";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch border border-line-strong bg-bg">
        <input
          readOnly
          value={url.replace(/^https?:\/\//, "")}
          aria-label="Share link"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-12 min-w-0 flex-1 bg-transparent px-3 font-mono text-[13px] text-fg outline-none"
        />
        <button type="button" onClick={() => void copy("link")} className="flex min-w-[104px] shrink-0 items-center justify-center gap-1.5 bg-signal px-3 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
          {copied === "link" ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied === "link" ? "Copied" : "Copy link"}
        </button>
      </div>
      <div className={`grid gap-2 ${native ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        {native && (
          <button type="button" onClick={() => void nativeShare()} className={`${btn} col-span-2 border-signal sm:col-span-1`}>
            <Share2 className="h-4 w-4" aria-hidden /> Share…
          </button>
        )}
        <a href={channelHref("whatsapp", url, text)} target="_blank" rel="noopener noreferrer" onClick={() => emit("whatsapp")} className={btn} data-channel="whatsapp">
          <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp
        </a>
        <a href={channelHref("linkedin", url, text)} target="_blank" rel="noopener noreferrer" onClick={() => emit("linkedin")} className={btn} data-channel="linkedin">
          <Linkedin className="h-4 w-4" aria-hidden /> LinkedIn
        </a>
        <a href={channelHref("x", url, text)} target="_blank" rel="noopener noreferrer" onClick={() => emit("x")} className={btn} data-channel="x">
          <XLogo /> Post
        </a>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">message</span>
        <p className="m-0 whitespace-pre-line border border-line bg-surface-2 px-3 py-2.5 text-[14px] leading-relaxed text-fg-2">{text}</p>
        <button type="button" onClick={() => void copy("text")} className="self-start font-mono text-[12px] text-signal-text underline underline-offset-4">
          {copied === "text" ? "copied message + link" : "copy message + link"}
        </button>
      </div>
    </div>
  );
}

export default function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const share = useShare();
  const { openAuthModal } = useAuthModal();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [courseOnly, setCourseOnly] = useState(false);
  const settings = share.state?.settings ?? null;
  const live = !!settings?.enabled;
  const handle = live ? settings!.handle : null;
  const summary = share.state?.summary ?? null;

  const url = useMemo(() => {
    const o = origin();
    if (target.url) {
      const u = new URL(target.url(handle), o);
      if (handle) u.searchParams.set("ref", handle);
      return u.toString();
    }
    if (handle) return `${o}${profilePath(handle, target.achievement)}`;
    return `${o}/learn`;
  }, [target, handle]);
  const text = useMemo(() => (target.text ? target.text(summary) : shareText({ kind: target.kind, summary, title: target.title, detail: target.detail })), [target, summary]);
  const courseText = "Learning system design for free: System Design Mastery — 11 worlds, interview bosses, 1,000+ quick checks and a daily challenge. Come along.";

  const enable = async () => {
    if (!share.state) return;
    setBusy(true);
    setErr(null);
    try {
      await saveShare({ enabled: true, handle: settings?.handle || share.state.suggested, visibility: settings?.visibility || DEFAULT_VISIBILITY });
      track("share_enable", { from: target.kind });
    } catch (e) {
      setErr((e as Error).message || "Couldn't turn it on");
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (share.authLoading || share.loading) {
    body = <div aria-busy="true" aria-label="Loading" className="h-[180px] animate-pulse border border-line bg-surface-2" />;
  } else if (!share.signedIn) {
    body = courseOnly || target.url ? (
      <div className="flex flex-col gap-4">
        <Channels url={target.url ? url : `${origin()}/learn`} text={target.url ? text : courseText} kind={target.url ? target.kind : "profile"} />
        <p className="m-0 border-t border-line pt-3 text-[14px] text-fg-2">
          Want a link to <em>your</em> level, skill tree and scores?{" "}
          <button type="button" onClick={() => (onClose(), openAuthModal())} className="font-semibold text-signal-text underline underline-offset-4">
            Sign in to get your share link
          </button>
        </p>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 border border-dashed border-signal bg-surface-2 p-4">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">your public page · sign in</span>
          <p className="m-0 font-display text-[24px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">Sign in to get your share link.</p>
          <p className="m-0 text-[14px] leading-relaxed text-fg-2">
            A page with your level, skill tree, streak and Arena scores that friends can open without an account. Signing in is free, and the progress in this browser comes with you — import it from the
            Progress page once you&apos;re in.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => (onClose(), openAuthModal())} className="inline-flex min-h-12 items-center bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
            Sign in · it&apos;s free →
          </button>
          <button type="button" onClick={() => setCourseOnly(true)} className="inline-flex min-h-12 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2">
            Share the course instead
          </button>
        </div>
      </div>
    );
  } else if (share.error || !share.state) {
    body = (
      <p role="alert" className="m-0 border border-bad/50 bg-surface-2 p-4 text-sm text-fg-2">
        {share.error || "Couldn't load your share settings."}{" "}
        <button type="button" onClick={() => share.refresh()} className="font-semibold text-fg underline underline-offset-4">
          Retry
        </button>
      </p>
    );
  } else if (!share.state.available) {
    body = (
      <div className="flex flex-col gap-4">
        <p className="m-0 border border-line bg-surface-2 p-4 text-[14px] leading-relaxed text-fg-2">Public progress pages are switching on soon. Meanwhile, share the course:</p>
        <Channels url={target.url ? url : `${origin()}/learn`} text={target.url ? text : courseText} kind={target.kind} />
      </div>
    );
  } else if (!live && !target.url) {
    const h = settings?.handle || share.state.suggested;
    body = (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5 border border-line-strong bg-surface-2 p-4">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
            <Lock className="h-3.5 w-3.5" aria-hidden /> your page is private
          </span>
          <p className="m-0 text-[15px] leading-relaxed text-fg">
            Turn on a public page at <span className="break-all font-mono text-signal-text">{origin().replace(/^https?:\/\//, "")}/u/{h}</span> to get a link.
          </p>
          <p className="m-0 text-[13px] leading-relaxed text-fg-3">Shows your first name, level, course %, skill tree, streak, Arena scores and badges. Never your email. Change what&apos;s visible or turn it off any time.</p>
        </div>
        {err && (
          <p role="alert" className="m-0 text-sm text-bad-text">
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void enable()} disabled={busy} className="inline-flex min-h-12 items-center bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:opacity-50">
            {busy ? "Turning on…" : "Turn on & get my link →"}
          </button>
          <Link href="/learn/dashboard#share" onClick={onClose} className="inline-flex min-h-12 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2">
            Choose what&apos;s visible
          </Link>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <Channels url={url} text={text} kind={target.kind} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 font-mono text-[12px] text-fg-3">
          {handle ? (
            <a href={profilePath(handle)} target="_blank" rel="noopener noreferrer" className="text-fg-2 underline underline-offset-4 hover:text-fg">
              open my public page ↗
            </a>
          ) : (
            <span>no public page yet · the link still works</span>
          )}
          <Link href="/learn/dashboard#share" onClick={onClose} className="underline underline-offset-4 hover:text-fg">
            {handle ? "what's visible →" : "turn on my page →"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Overlay labelledBy="share-h" onClose={onClose} className="max-w-[560px] border border-line-strong bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-5 sm:px-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">share · {KIND_LABEL[target.kind]}</span>
          <h2 id="share-h" className="font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-fg">
            {target.kind === "daily" ? "Challenge a friend" : "Show your run"}
            <span className="text-signal-text">.</span>
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3 hover:text-fg">
          ×
        </button>
      </div>
      <div className="px-5 py-5 sm:px-6">{body}</div>
    </Overlay>
  );
}
