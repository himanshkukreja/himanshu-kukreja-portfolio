"use client";

/**
 * Guest prompt: "Save your run". Reading stays free and open; signing in only keeps progress.
 * Opens the global sign-in dialog. Hidden for signed-in visitors and after dismissal (per tab).
 */
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useGame } from "@/game/GameProvider";

type AuthPromptBannerProps = {
  variant?: "learn-page" | "lesson-page" | "notebook" | "profile";
  /** render without the dismiss button (e.g. when the page has nothing else to show a guest) */
  persistent?: boolean;
  /** "stack" for narrow columns */
  layout?: "row" | "stack";
};

const COPY: Record<NonNullable<AuthPromptBannerProps["variant"]>, { title: string; body: string }> = {
  "learn-page": {
    title: "Keep what you earn",
    body: "Reading stays free and open. Your progress lives in this browser until you sign in; then it follows you to every device.",
  },
  "lesson-page": {
    title: "Save this lesson's progress",
    body: "Stage checkpoints and XP stay in this browser. Sign in to sync them and to highlight, note and bookmark.",
  },
  notebook: {
    title: "Your notebook needs an account",
    body: "Highlights, notes and bookmarks are saved to your account so they are searchable and follow you across devices.",
  },
  profile: {
    title: "Make this profile yours",
    body: "Everything here is from this browser. Sign in to keep your streak, trials and XP on every device.",
  },
};

const PERKS = [
  ["Progress syncs", "Completed lessons and stage checkpoints, on every device."],
  ["Streaks that count", "A day counts once you finish a stage or a review."],
  ["Notes and highlights", "One searchable notebook."],
  ["Trials saved", "Misses feed your review queue."],
];

export default function AuthPromptBanner({ variant = "learn-page", persistent = false, layout = "row" }: AuthPromptBannerProps) {
  const row = layout === "row";
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { xp, hydrated } = useGame();
  const [isDismissed, setIsDismissed] = useState(false);

  if (loading || user || (isDismissed && !persistent)) return null;
  const { title, body } = COPY[variant];

  return (
    <section aria-label="Sign in to save progress" className={`relative flex flex-col gap-5 border border-line bg-raised p-5 sm:p-6 ${row ? "lg:flex-row lg:items-center lg:gap-8" : ""}`}>
      {!persistent && (
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss"
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center text-lg text-fg-3 hover:text-fg"
        >
          ×
        </button>
      )}
      <div className={`flex min-w-0 flex-col gap-2.5 ${persistent ? "" : "pr-10"} ${row ? "lg:max-w-[340px] lg:pr-0" : ""}`}>
        <span className="font-mono text-[11px] tracking-label text-signal-text">SAVE YOUR RUN</span>
        <h2 className="font-display text-[28px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[32px]">
          {title}
          <span className="text-signal-text">.</span>
        </h2>
        <p className="text-sm leading-relaxed text-fg-2">{body}</p>
      </div>
      <ul className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
        {PERKS.map(([t, d]) => (
          <li key={t} className="flex gap-2.5">
            <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center bg-fg text-[11px] text-bg">
              ✓
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-fg">{t}</span>
              <span className="text-[13px] text-fg-3">{d}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className={`flex shrink-0 flex-col gap-2.5 ${row ? "lg:w-[230px]" : "sm:max-w-[320px]"}`}>
        <button type="button" onClick={openAuthModal} className="min-h-[52px] bg-signal px-5 font-semibold text-on-signal hover:brightness-110">
          Sign in free
        </button>
        {hydrated && xp > 0 && (
          <span className="border border-dashed border-signal px-3 py-2 font-mono text-xs leading-relaxed text-signal-text">{xp} XP on this device moves to your account.</span>
        )}
      </div>
    </section>
  );
}
