"use client";

/**
 * The signed-in onboarding, "Your first day": five short cards in a full-screen dialog, every one skippable.
 *   1 welcome (the learner card starts empty)   2 what do you already know (12 flip cards)   3 a quick sniff test
 *   4 pick your pace (time a day, goal, language)   5 your starting point (card, welcome bonus, recommended start,
 *   a 7-day plan, share).
 * Nothing is locked by any answer: the result only sets the recommended start and the default view. The record is
 * saved on the account (game flag `pref:dsa-onboarding`, see src/lib/dsa/onboarding/recommend.ts) when the result shows, or as
 * "skipped" when the learner leaves early.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Download, Share2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { holdAttention } from "@/lib/learn/guide/attention";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { awardDsaWelcome, DSA_START_LEVEL } from "@/lib/dsa/rewards";
import type { TopicId } from "@/lib/dsa/onboarding/puzzles";
import { FRONT_REGION, KNOW_LABEL, TOPICS, type Know } from "@/lib/dsa/onboarding/topics";
import {
  buildPlan,
  experienceOf,
  GOAL_LABEL,
  ONBOARDING_FLAG,
  pickPuzzles,
  recommendStart,
  standing,
  type Exp,
  type Goal,
  type Minutes,
  type Outline,
  type OnboardingRecord,
} from "@/lib/dsa/onboarding/recommend";
import { saveWelcome, setDsaFull, useWelcome } from "../simple/view";
import { useLang } from "../concept/widgets";
import TopicGlyph from "./Glyphs";
import IdCard, { type IdFields } from "./IdCard";
import SniffDeck from "./SniffDeck";
import "./onboarding.css";

const STEP_NAMES = ["welcome", "topics", "sniff", "pace", "result"] as const;

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

const MINUTES: { id: Minutes; label: string; line: string }[] = [
  { id: 15, label: "15 min", line: "A lesson or a problem a day" },
  { id: 30, label: "30 min", line: "A steady, comfortable pace" },
  { id: 60, label: "1 hour", line: "A fast pace" },
];
const GOALS: { id: Goal; label: string; line: string }[] = [
  { id: "placements", label: "Placements", line: "Campus hiring and online tests" },
  { id: "interviews", label: "Interviews", line: "Coding rounds at tech companies" },
  { id: "cp", label: "Competitive programming", line: "Contests and harder problems" },
];
const LANGS: { id: DsaLang; line?: string }[] = [{ id: "python", line: "Recommended: easiest to read" }, { id: "java" }, { id: "cpp" }, { id: "javascript" }];

function Pick({ label, line, on, onPick, compact = false }: { label: string; line?: string; on: boolean; onPick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={on}
      className={`flex min-h-16 w-full flex-col items-start justify-center gap-0.5 border px-4 py-3 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
        on ? "border-signal bg-[var(--c-dsa-hl,transparent)] shadow-[inset_4px_0_0_var(--c-signal)]" : "border-line-strong bg-surface hover:border-fg"
      }`}
    >
      <span className="flex w-full items-center justify-between gap-2 text-[16px] font-semibold text-fg">
        {label}
        {on ? <Check className="h-4 w-4 text-signal-text" aria-hidden /> : null}
      </span>
      {line ? <span className={`text-[13.5px] text-fg-3 ${compact ? "hidden sm:block" : ""}`}>{line}</span> : null}
    </button>
  );
}

/** A topic card: tap to flip through never heard of it, seen it, can code it (words and pips, never colour alone). */
function TopicCard({ id, know, onFlip }: { id: TopicId; know: Know; onFlip: () => void }) {
  const t = TOPICS.find((x) => x.id === id)!;
  const [n, setN] = useState(0);
  return (
    <button
      type="button"
      onClick={() => {
        setN(n + 1);
        onFlip();
      }}
      aria-label={`${t.label}: ${KNOW_LABEL[know]}. ${t.line}. Tap to change.`}
      className={`flex min-h-[150px] w-full flex-col gap-2 border p-3 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
        know === 2 ? "border-signal bg-[var(--c-dsa-hl,transparent)] shadow-[inset_0_-4px_0_var(--c-signal)]" : know === 1 ? "border-fg bg-surface" : "border-line-strong bg-surface hover:border-fg"
      }`}
    >
      <span key={n} className={n ? "ob-flip flex flex-col gap-2" : "flex flex-col gap-2"} style={{ transformOrigin: "center bottom" }}>
        <span className={know === 0 ? "opacity-70" : ""}>
          <TopicGlyph id={id} className="h-[52px] w-full" />
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-display text-[16px] font-extrabold leading-tight tracking-[-0.02em] text-fg">{t.label}</span>
          <span className="text-[12.5px] leading-snug text-fg-3">{t.line}</span>
        </span>
      </span>
      <span className="mt-auto flex flex-col gap-1 font-mono text-[11.5px] font-semibold text-fg-2">
        <span aria-hidden className="flex gap-0.5">
          {[0, 1].map((i) => (
            <span key={i} className={`h-2 w-3 ${i < know ? "bg-signal" : "border border-line-strong"}`} />
          ))}
        </span>
        <span className={know === 2 ? "text-signal-text" : ""}>{KNOW_LABEL[know]}</span>
      </span>
    </button>
  );
}

export default function OnboardingFlow({ rerun, onClose }: { rerun: boolean; onClose: () => void }) {
  const { user, profile } = useAuth();
  const { flags, setFlag } = useGame();
  const reduced = useReducedMotion();
  const guestWelcome = useWelcome();
  const [lang, setLang] = useLang();
  const prior = useMemo(() => (rerun ? (flags[ONBOARDING_FLAG] as OnboardingRecord | undefined) : undefined), [rerun, flags]);

  const [step, setStep] = useState(0);
  const [knows, setKnows] = useState<Partial<Record<TopicId, Know>>>(() => prior?.knows ?? {});
  const [sniff, setSniff] = useState<Record<string, boolean>>({});
  const [minutes, setMinutes] = useState<Minutes | null>(prior?.pace.minutes ?? null);
  const [goal, setGoal] = useState<Goal | null>(prior?.pace.goal ?? guestWelcome?.goal ?? null);
  const [pickedLang, setPickedLang] = useState<DsaLang | null>(prior?.pace.lang ?? null);
  const [outline, setOutline] = useState<Outline | null>(null);
  const [saved, setSaved] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const first = (profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || "").trim().split(/\s+/)[0] || "";
  const fullName = (profile?.full_name || (user?.user_metadata?.full_name as string | undefined) || user?.email?.split("@")[0] || "").trim();
  const no = (user?.id || "000000").replace(/-/g, "").slice(0, 6).toUpperCase();

  // the sniff test is picked once, when the topics are done
  const [puzzles, setPuzzles] = useState(() => pickPuzzles(knows));
  const claimed = TOPICS.filter((t) => (knows[t.id] ?? 0) >= 1).length;
  const codeCount = TOPICS.filter((t) => knows[t.id] === 2).length;
  const exp: Exp = experienceOf(knows, guestWelcome?.exp ?? null);
  const effLang: DsaLang = pickedLang ?? lang;
  const effMinutes: Minutes = minutes ?? 30;
  const rec = useMemo(() => recommendStart(knows, sniff, exp), [knows, sniff, exp]);

  // one attention hold while open, so the Notebook coach and the like wait
  useEffect(() => holdAttention(), []);
  // lock the page behind the dialog
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  // the outline for the plan (cheap, cached at the edge); fetched once the learner is past the topics
  useEffect(() => {
    if (step < 3 || outline) return;
    let alive = true;
    fetch("/api/dsa/onboarding")
      .then((r) => (r.ok ? (r.json() as Promise<Outline>) : null))
      .then((o) => alive && o && setOutline(o))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [step, outline]);

  // each step: announce it, move focus to its heading, count it
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    dialog.current?.querySelector<HTMLElement>("[data-ob-scroll]")?.scrollTo({ top: 0 });
    track("dsa_onboarding_step", { step: step + 1, name: STEP_NAMES[step], rerun });
  }, [step, rerun]);

  const plan = useMemo(() => (outline ? buildPlan(outline, rec.region, effMinutes) : null), [outline, rec.region, effMinutes]);
  const fallbackTitle = TOPICS.find((t) => t.region === rec.region)?.label ?? (rec.region === FRONT_REGION ? "Toolkit" : "Patterns");
  const regionTitle = outline?.regions.find((r) => r.id === (plan?.regionId ?? rec.region))?.title ?? fallbackTitle;
  const firstStop = plan?.days.flatMap((d) => d.items)[0] ?? null;

  const skip = useCallback(() => {
    if (!rerun) {
      const now = Date.now();
      const r: OnboardingRecord = { v: 1, status: "skipped", skippedAt: step, knows, sniff, pace: { minutes, goal, lang: pickedLang }, exp, start: null, at: now, updatedAt: now };
      setFlag(ONBOARDING_FLAG, r);
      saveWelcome({ exp: null, goal, skipped: true });
      track("dsa_onboarding_skipped", { step: step + 1, name: STEP_NAMES[step] });
    }
    onClose();
  }, [rerun, step, knows, sniff, minutes, goal, pickedLang, exp, setFlag, onClose]);

  // arriving at the result commits the record, the language, the default view and the welcome bonus (once each)
  const commit = useCallback(() => {
    if (saved) return;
    setSaved(true);
    const now = Date.now();
    const total = Object.keys(sniff).length;
    const r: OnboardingRecord = {
      v: 1,
      status: "done",
      knows,
      sniff,
      pace: { minutes: effMinutes, goal, lang: effLang },
      exp,
      start: rec.region,
      at: prior?.at ?? now,
      updatedAt: now,
    };
    setFlag(ONBOARDING_FLAG, r);
    setLang(effLang);
    if (exp === "experienced") setDsaFull(true);
    else if (exp === "new") setDsaFull(false);
    saveWelcome({ exp, goal, skipped: false });
    const bonus = awardDsaWelcome(flags, setFlag);
    track("dsa_onboarding_done", {
      start: rec.region,
      exp,
      claimed,
      code: codeCount,
      sniff_total: total,
      sniff_right: Object.values(sniff).filter(Boolean).length,
      minutes: effMinutes,
      goal: goal ?? "",
      lang: effLang,
      bonus,
      rerun,
    });
  }, [saved, sniff, knows, effMinutes, goal, effLang, exp, rec.region, prior, setFlag, setLang, flags, claimed, codeCount, rerun]);

  const go = (n: number) => {
    if (n === 2) {
      setPuzzles(pickPuzzles(knows));
      setSniff({});
    }
    if (n === 4) commit();
    setStep(n);
  };
  const flip = (id: TopicId) => setKnows((k) => ({ ...k, [id]: (((k[id] ?? 0) + 1) % 3) as Know }));

  // Escape leaves (a skip on the first run); Tab stays inside the dialog
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (step === 4) onClose();
        else skip();
        return;
      }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex="0"], input, select, textarea')).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = document.activeElement as HTMLElement | null;
      const f = items[0];
      const l = items[items.length - 1];
      if (e.shiftKey && (a === f || !dialog.current.contains(a) || a === heading.current)) {
        e.preventDefault();
        l.focus();
      } else if (!e.shiftKey && a === l) {
        e.preventDefault();
        f.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, skip, onClose]);

  const card: IdFields = {
    name: fullName,
    avatar: profile?.avatar_url ?? null,
    no,
    topics: step >= 2 ? codeCount : null,
    start: step >= 4 ? regionTitle : null,
    pace: step >= 4 ? `${MINUTES.find((m) => m.id === effMinutes)?.label} a day · ${DSA_LANG_LABEL[effLang]}` : null,
    goal: step >= 4 && goal ? GOAL_LABEL[goal] : null,
    level: step >= 4 ? `Level ${DSA_START_LEVEL.level} · ${DSA_START_LEVEL.name}` : null,
  };
  const cardUrl = `/api/dsa/id-card?${new URLSearchParams({ n: fullName || "New learner", s: regionTitle, k: String(codeCount), g: goal ? GOAL_LABEL[goal] : "", m: `${effMinutes} min`, no }).toString()}`;
  const [shareMsg, setShareMsg] = useState("");
  const share = async () => {
    track("dsa_onboarding_share", {});
    try {
      const blob = await (await fetch(cardUrl)).blob();
      const file = new File([blob], "dsa-mastery-learner-card.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My DSA Mastery learner card", text: "I just set up my desk at DSA Mastery." });
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
      setShareMsg("Card saved to your downloads.");
    } catch {
      /* a cancelled share sheet is not an error */
    }
  };

  const stepTitle = [
    first ? `Welcome to DSA Mastery, ${first}. Let's set up your desk.` : "Welcome to DSA Mastery. Let's set up your desk.",
    "What do you already know?",
    "A quick sniff test",
    "Pick your pace",
    "Your starting point",
  ][step];

  return (
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center bg-black/55 sm:items-center sm:p-6" data-ob-root>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-h"
        className="dsa-theme flex h-full w-full flex-col bg-bg text-fg sm:h-auto sm:max-h-[min(860px,calc(100vh-48px))] sm:max-w-[980px] sm:border sm:border-line-strong sm:shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="whitespace-nowrap font-mono text-[11px] uppercase tracking-label text-signal-text">
              Step {step + 1} of 5
            </span>
            <ol aria-label="Progress" className="m-0 flex list-none gap-1 p-0">
              {STEP_NAMES.map((n, i) => (
                <li key={n} aria-current={i === step ? "step" : undefined} className="flex">
                  <span className="sr-only">{`${n}${i < step ? ", done" : i === step ? ", current" : ""}`}</span>
                  <span aria-hidden className={`h-2 ${i === step ? "w-6 bg-signal" : i < step ? "w-2 bg-signal" : "w-2 bg-line-strong"}`} />
                </li>
              ))}
            </ol>
          </div>
          <button type="button" onClick={step === 4 ? onClose : skip} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 px-1 font-mono text-[12.5px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg [@media(pointer:coarse)]:min-h-11">
            {step === 4 ? (
              <>
                <X className="h-3.5 w-3.5" aria-hidden /> Close
              </>
            ) : (
              "Skip for now"
            )}
          </button>
        </header>

        <div data-ob-scroll className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-5 sm:px-8 sm:py-7">
          <div key={step} className="ob-card-in mx-auto flex w-full max-w-[860px] flex-col gap-5">
            <h2 id="ob-h" ref={heading} tabIndex={-1} style={{ outline: "none" }} className="m-0 font-display text-[28px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg sm:text-[38px]">
              {stepTitle}
            </h2>

            {step === 0 ? (
              <div className="grid items-center gap-6 sm:grid-cols-[1fr_auto]">
                <div className="flex flex-col gap-4">
                  <p className="m-0 max-w-[46ch] text-[16.5px] leading-relaxed text-fg-2">
                    Five short cards, about two minutes. Tell us what you already know and we will point you at the right first lesson. Skip any card, and nothing here ever locks anything.
                  </p>
                  <button type="button" onClick={() => go(1)} className="inline-flex min-h-14 w-full items-center justify-center gap-2 bg-signal px-6 text-[17px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:w-auto sm:self-start">
                    Let&apos;s go <ArrowRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                <IdCard f={card} compact />
              </div>
            ) : null}

            {step === 1 ? (
              <>
                <p className="m-0 max-w-[60ch] text-[15.5px] leading-relaxed text-fg-2">
                  Tap a card to flip it: <strong className="font-semibold text-fg">never heard of it</strong>, <strong className="font-semibold text-fg">seen it</strong>, <strong className="font-semibold text-fg">can code it</strong>. Be honest, the next step only quizzes what you claim.
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {TOPICS.map((t) => (
                    <TopicCard key={t.id} id={t.id} know={knows[t.id] ?? 0} onFlip={() => flip(t.id)} />
                  ))}
                </div>
                <p className="m-0 font-mono text-[12px] text-fg-3" aria-live="polite">
                  {claimed} marked seen or known, {codeCount} you can code
                </p>
              </>
            ) : null}

            {step === 2 ? (
              puzzles.length ? (
                <SniffDeck puzzles={puzzles} reduced={reduced} onAnswer={(id, ok) => setSniff((s) => ({ ...s, [id]: ok }))} onFinish={() => go(3)} />
              ) : (
                <div className="flex max-w-[520px] flex-col gap-4 border border-line bg-surface p-5">
                  <p className="m-0 text-[16px] leading-relaxed text-fg-2">You marked every topic as new, so there is nothing to test yet. That is a perfectly good place to start: we begin at the very beginning.</p>
                  <button type="button" onClick={() => go(3)} className="inline-flex min-h-12 items-center justify-center gap-2 self-start bg-signal px-6 text-[16px] font-semibold text-on-signal hover:opacity-90">
                    Pick my pace <ArrowRight className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              )
            ) : null}

            {step === 3 ? (
              <>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 font-mono text-[12px] uppercase tracking-label text-fg-3">Time a day</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {MINUTES.map((m) => (
                      <Pick key={m.id} label={m.label} line={m.line} compact on={minutes === m.id} onPick={() => setMinutes(m.id)} />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 font-mono text-[12px] uppercase tracking-label text-fg-3">What are you preparing for?</legend>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {GOALS.map((g) => (
                      <Pick key={g.id} label={g.label} line={g.line} on={goal === g.id} onPick={() => setGoal(g.id)} />
                    ))}
                  </div>
                </fieldset>
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="mb-2 font-mono text-[12px] uppercase tracking-label text-fg-3">Language</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {LANGS.map((l) => (
                      <Pick key={l.id} label={DSA_LANG_LABEL[l.id]} line={l.line} compact on={effLang === l.id} onPick={() => setPickedLang(l.id)} />
                    ))}
                  </div>
                </fieldset>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => go(4)} className="inline-flex min-h-14 w-full items-center justify-center gap-2 bg-signal px-6 text-[17px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal sm:w-auto">
                    Show my starting point <ArrowRight className="h-5 w-5" aria-hidden />
                  </button>
                  <span className="font-mono text-[12px] text-fg-3">You can change all of this later.</span>
                </div>
              </>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
                <div className="flex flex-col gap-4">
                  <div className="relative">
                    <IdCard f={card} />
                  </div>
                  <span className="ob-stamp inline-flex items-center gap-2 self-start border-2 border-signal px-3 py-1.5 font-mono text-[12px] font-semibold uppercase tracking-label text-signal-text">
                    <Check className="h-4 w-4" aria-hidden /> Welcome bonus unlocked
                  </span>
                  <p className="m-0 font-mono text-[12px] text-fg-3">Your answers stay on your account. Redo this any time from the menu.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={share} className="inline-flex min-h-11 items-center gap-2 border border-line-strong bg-surface px-4 text-[14px] font-semibold text-fg hover:border-fg">
                      <Share2 className="h-4 w-4" aria-hidden /> Share my card
                    </button>
                    <a href={cardUrl} download="dsa-mastery-learner-card.png" className="inline-flex min-h-11 items-center gap-2 px-2 font-mono text-[12.5px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
                      <Download className="h-4 w-4" aria-hidden /> Save image
                    </a>
                  </div>
                  <p role="status" className="m-0 min-h-4 font-mono text-[12px] text-fg-3">
                    {shareMsg}
                  </p>
                </div>

                <div className="flex min-w-0 flex-col gap-5">
                  <section aria-labelledby="ob-start-h" className="flex flex-col gap-2 border border-signal bg-[var(--c-dsa-hl,transparent)] p-4 shadow-[inset_4px_0_0_var(--c-signal)]">
                    <span id="ob-start-h" className="font-mono text-[11.5px] uppercase tracking-label text-signal-text">
                      Recommended start
                    </span>
                    <span className="font-display text-[26px] font-extrabold leading-[1.05] tracking-[-0.03em] text-fg">{regionTitle}</span>
                    <p className="m-0 text-[15px] leading-snug text-fg-2">{rec.reason}</p>
                    <ul aria-label="Your answers" className="m-0 flex list-none flex-wrap gap-1.5 p-0 pt-1">
                      {TOPICS.filter((t) => (knows[t.id] ?? 0) > 0).map((t) => {
                        const st = standing(t.id, knows, sniff);
                        return (
                          <li key={t.id} className="border border-line-strong px-2 py-0.5 font-mono text-[11.5px] text-fg-2">
                            {t.label}: {st === "known" ? "solid" : st === "shaky" ? "worth a refresh" : "seen it"}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <section aria-labelledby="ob-plan-h" className="flex flex-col gap-2">
                    <h3 id="ob-plan-h" className="m-0 font-mono text-[12px] font-normal uppercase tracking-label text-fg-3">
                      Your first 7 days · {MINUTES.find((m) => m.id === effMinutes)?.label} a day
                    </h3>
                    {plan ? (
                      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                        {plan.days.map((d) => (
                          <li key={d.day} className="grid grid-cols-[48px_1fr] items-baseline gap-3 border-t border-line pt-1.5 text-[14px]">
                            <span className="font-mono text-[12px] text-signal-text">Day {d.day}</span>
                            <span className="min-w-0 text-fg-2">
                              {d.items.length ? d.items.map((n) => n.title).join(" · ") : d.note || "Free day"}
                              {d.items.length ? <span className="ml-2 font-mono text-[11.5px] text-fg-3">~{d.minutes} min</span> : null}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="m-0 text-[14px] text-fg-3">Building your plan…</p>
                    )}
                  </section>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link
                      href={firstStop?.href || "/dsa"}
                      onClick={() => {
                        track("dsa_onboarding_start", { to: firstStop?.id ?? "hub" });
                        onClose();
                      }}
                      className="inline-flex min-h-14 flex-1 items-center justify-center gap-2 bg-signal px-6 text-[17px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                    >
                      Start here <ArrowRight className="h-5 w-5" aria-hidden />
                    </Link>
                    <Link href="/dsa" onClick={onClose} className="inline-flex min-h-14 flex-1 items-center justify-center border border-line-strong bg-surface px-6 text-[16px] font-semibold text-fg hover:border-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                      See the whole map
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {step === 1 || step === 3 ? (
          <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-6">
            <button type="button" onClick={() => go(step - 1 === 2 ? 1 : step - 1)} className="inline-flex min-h-11 items-center gap-1.5 font-mono text-[12.5px] text-fg-2 hover:text-fg">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            {step === 1 ? (
              <button type="button" onClick={() => go(2)} className="inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-6 text-[16px] font-semibold text-on-signal hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal">
                {claimed ? "Test me" : "Next"} <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
