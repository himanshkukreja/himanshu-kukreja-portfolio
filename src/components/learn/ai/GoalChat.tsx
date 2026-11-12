"use client";

/**
 * The goal chat (owner-approved 12 Nov 2026; lib/learner/goal-chat-model.ts, /api/learn/ai/onboarding): a short
 * friendly AI conversation (4-6 turns, skippable) that notes the learner's target role and companies, timeline,
 * experience, how they like explanations and which course(s) in the shared memory (provenance "onboarding"), where
 * "What the AI knows" shows them with edit and forget.
 *
 *   <GoalChatButton />   "Set my goals" (the memory page, the progress page)
 *   <GoalChatNudge />    the first-chat card in an empty course or DSA chat: only for a signed-in learner whose memory is on
 *                        and holds no goals or level, who hasn't finished or skipped the chat (game flag pref:goal-chat)
 *   GOAL_CHAT_EVENT      a window event that opens the dialog from anywhere
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Target, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { aiFetch } from "./aiFetch";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { GOAL_CHAT_MAX_CHARS, GOAL_CHAT_MAX_TURNS, type GoalProfile } from "@/lib/learner/goal-chat-model";

export const GOAL_CHAT_EVENT = "hk:goal-chat";
export const GOAL_CHAT_FLAG = "pref:goal-chat";
const SAVED_EVENT = "hk:goal-chat-saved";

type Turn = { role: "user" | "assistant"; text: string };
type Saved = { goals: string[]; level: string; prefs: string[] };

/** What this device knows from DSA Mastery (its welcome and "Show everything"), so the chat doesn't ask again. */
function clientKnown(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  try {
    const w = JSON.parse(window.localStorage.getItem("dsa.welcome") || "null") as { exp?: unknown; goal?: unknown; skipped?: unknown } | null;
    if (w && typeof w.exp === "string") out.exp = w.exp;
    if (w && typeof w.goal === "string") out.goal = w.goal;
    if (window.localStorage.getItem("dsa.view") === "full") out.full = true;
  } catch {
    /* storage blocked */
  }
  return out;
}

export function openGoalChat(from: string) {
  window.dispatchEvent(new CustomEvent(GOAL_CHAT_EVENT, { detail: { from } }));
}

function GoalChatDialog({ from, onClose }: { from: string; onClose: (how: "done" | "skipped" | "closed") => void }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [profile, setProfile] = useState<GoalProfile | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const call = useCallback(async (next: Turn[]) => {
    setBusy(true);
    setErr("");
    setChips([]);
    try {
      const r = await aiFetch("/api/learn/ai/onboarding", { method: "POST", body: JSON.stringify({ turns: next, client: clientKnown() }) });
      const b = (await r.json().catch(() => ({}))) as { reply?: string; chips?: string[]; done?: boolean; profile?: GoalProfile; saved?: Saved; error?: string };
      if (!r.ok || !b.reply) throw new Error(b.error || "The goal chat didn't answer this time.");
      setTurns([...next, { role: "assistant", text: b.reply }]);
      setChips(b.chips ?? []);
      if (b.profile) setProfile(b.profile);
      if (b.done) {
        setSaved(b.saved ?? { goals: [], level: "", prefs: [] });
        track("goal_chat", { action: "done", from, turns: next.filter((t) => t.role === "user").length });
        window.dispatchEvent(new Event(SAVED_EVENT));
      }
    } catch (e) {
      setTurns(next);
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [from]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("goal_chat", { action: "open", from });
    void call([]);
  }, [call, from]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
    if (!busy && !saved) inputRef.current?.focus({ preventScroll: true });
  }, [turns, busy, saved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose(saved ? "done" : "closed");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saved]);

  const users = turns.filter((t) => t.role === "user").length;
  const send = (words: string) => {
    const w = words.trim().slice(0, GOAL_CHAT_MAX_CHARS);
    if (!w || busy || saved || users >= GOAL_CHAT_MAX_TURNS) return;
    setText("");
    void call([...turns, { role: "user", text: w }]);
  };
  const finish = async () => {
    if (!profile || busy) return;
    setBusy(true);
    const r = await aiFetch("/api/learn/ai/onboarding", { method: "POST", body: JSON.stringify({ finish: { profile }, client: clientKnown() }) }).catch(() => null);
    const b = (await r?.json().catch(() => null)) as { saved?: Saved; error?: string } | null;
    setBusy(false);
    if (!r?.ok || !b?.saved) return setErr(b?.error || "Couldn't save just now. Try again.");
    setSaved(b.saved);
    track("goal_chat", { action: "finish", from, turns: users });
    window.dispatchEvent(new Event(SAVED_EVENT));
  };
  const items = saved ? [...saved.goals, ...(saved.level ? [saved.level] : []), ...saved.prefs] : [];

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose(saved ? "done" : "closed")}>
      <section role="dialog" aria-modal="true" aria-labelledby="goal-chat-h" className="flex max-h-[92dvh] w-full max-w-[560px] flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.35)] sm:border">
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
              <Target className="h-3.5 w-3.5" aria-hidden /> your goals · about a minute
            </span>
            <h2 id="goal-chat-h" className="m-0 text-[17px] font-semibold text-fg">
              So the tutors fit what you&apos;re aiming for
            </h2>
          </div>
          <button type="button" onClick={() => onClose(saved ? "done" : "skipped")} aria-label={saved ? "Close" : "Skip for now"} className="grid h-10 w-10 shrink-0 place-items-center text-fg-3 hover:text-fg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        <div className="flex min-h-[220px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4" aria-live="polite">
          {turns.map((t, i) =>
            t.role === "assistant" ? (
              <p key={i} className="m-0 max-w-[88%] self-start border border-line bg-bg px-3 py-2 text-[15px] leading-snug text-fg">
                {t.text}
              </p>
            ) : (
              <p key={i} className="m-0 max-w-[88%] self-end bg-surface-2 px-3 py-2 text-[15px] leading-snug text-fg">
                {t.text}
              </p>
            ),
          )}
          {busy && (
            <p className="m-0 flex items-center gap-2 font-mono text-xs text-fg-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> {saved === null && turns.length ? "thinking…" : "starting…"}
            </p>
          )}
          {err && (
            <p role="alert" className="m-0 border border-bad/50 px-3 py-2 text-[14px] text-fg-2">
              {err}
            </p>
          )}
          {saved && (
            <div className="flex flex-col gap-2 border border-signal px-3 py-3">
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">noted in your memory</span>
              {items.length ? (
                <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[14.5px] text-fg-2">
                  {items.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[14.5px] text-fg-3">Nothing new to note this time.</p>
              )}
              <Link href="/memory" onClick={() => onClose("done")} className="self-start font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-4">
                Edit or forget any of it ›
              </Link>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <footer className="flex flex-col gap-2.5 border-t border-line px-4 py-3">
          {saved ? (
            <button type="button" onClick={() => onClose("done")} className="min-h-12 bg-signal px-4 text-[15px] font-semibold text-on-signal">
              Done
            </button>
          ) : (
            <>
              {chips.length > 0 && !busy && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick replies">
                  {chips.map((c) => (
                    <button key={c} type="button" onClick={() => send(c)} className="min-h-10 border border-line-strong px-3 font-mono text-[12.5px] text-fg-2 hover:border-signal hover:text-fg [@media(pointer:coarse)]:min-h-11">
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex items-stretch gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(text);
                }}
              >
                <input
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, GOAL_CHAT_MAX_CHARS))}
                  disabled={busy || !turns.length}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                  className="min-h-12 min-w-0 flex-1 border border-line-strong bg-bg px-3 text-[16px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
                />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="grid min-h-12 w-12 place-items-center bg-signal text-on-signal disabled:opacity-50">
                  <ArrowUp className="h-5 w-5" aria-hidden />
                </button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-fg-4" aria-label={`Answer ${Math.min(users + 1, GOAL_CHAT_MAX_TURNS)} of at most ${GOAL_CHAT_MAX_TURNS}`}>
                  {Array.from({ length: 5 }, (_, i) => (i < users ? "●" : "○")).join(" ")}
                </span>
                <span className="flex items-center gap-3">
                  {users >= 2 && profile && (
                    <button type="button" disabled={busy} onClick={finish} className="min-h-10 font-mono text-[12px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg">
                      save and finish
                    </button>
                  )}
                  <button type="button" onClick={() => onClose("skipped")} className="min-h-10 font-mono text-[12px] text-fg-3 hover:text-fg">
                    skip for now
                  </button>
                </span>
              </div>
            </>
          )}
          <details className="group text-[11px] leading-snug text-fg-4">
            <summary className="cursor-pointer list-none py-1 font-mono hover:text-fg-3 [&::-webkit-details-marker]:hidden">
              learning goals only · <span className="underline decoration-line-strong underline-offset-2">what&apos;s kept</span>
            </summary>
            <p className="m-0 mt-1">Your answers go to Anthropic&apos;s AI to reply and aren&apos;t kept; only the short notes above are, in your memory, where you can edit or forget them.</p>
          </details>
        </footer>
      </section>
    </div>
  );
}

let dialogOpen = false;

/** Mounts the dialog when GOAL_CHAT_EVENT fires (one host per page: the button or the nudge brings it). */
function useGoalChatHost(): React.ReactNode {
  const { setFlag } = useGame();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    // several hosts on one page (a chat panel's nudge and the page's button): the first listener takes it
    const on = (e: Event) => {
      if (dialogOpen) return;
      dialogOpen = true;
      setOpen(((e as CustomEvent).detail?.from as string) || "page");
    };
    window.addEventListener(GOAL_CHAT_EVENT, on);
    return () => window.removeEventListener(GOAL_CHAT_EVENT, on);
  }, []);
  if (!open) return null;
  return (
    <GoalChatDialog
      from={open}
      onClose={(how) => {
        if (how !== "closed") setFlag(GOAL_CHAT_FLAG, { status: how, updatedAt: Date.now() });
        if (how === "skipped") track("goal_chat", { action: "skip", from: open });
        dialogOpen = false;
        setOpen(null);
      }}
    />
  );
}

/** Whether memory can take goals (on and available), and whether this learner has none yet. */
function useGoalState(): { ready: boolean; on: boolean; eligible: boolean } {
  const { user } = useAuth();
  const [s, setS] = useState({ ready: false, on: false, eligible: false });
  useEffect(() => {
    if (!user) return;
    let off = false;
    const load = () =>
      userFetch("/api/learn/ai/onboarding")
        .then(async (r) => (r.ok ? ((await r.json()) as { available: boolean; paused: boolean; eligible: boolean }) : null))
        .then((b) => !off && setS({ ready: true, on: !!b && b.available && !b.paused, eligible: !!b?.eligible }))
        .catch(() => !off && setS({ ready: true, on: false, eligible: false }));
    void load();
    window.addEventListener(SAVED_EVENT, load);
    return () => {
      off = true;
      window.removeEventListener(SAVED_EVENT, load);
    };
  }, [user]);
  return s;
}

/** "Set my goals": opens the goal chat (the memory page, the progress page). Hidden while memory is off. */
export function GoalChatButton({ from, className = "" }: { from: string; className?: string }) {
  const { user } = useAuth();
  const host = useGoalChatHost();
  const s = useGoalState();
  // one stable shape (the button, then the host): a change of state never remounts an open dialog
  const show = !!user && s.ready && s.on;
  return (
    <>
      {show ? (
        <button type="button" onClick={() => openGoalChat(from)} className={`inline-flex min-h-10 items-center gap-2 border border-line-strong bg-surface px-3.5 font-mono text-[12.5px] text-fg-2 hover:border-signal hover:text-fg ${className}`}>
          <Target className="h-3.5 w-3.5 text-signal-text" aria-hidden /> {s.eligible ? "Set my goals" : "Update my goals"}
        </button>
      ) : null}
      {host}
    </>
  );
}

/** The first-chat card in an empty chat: a signed-in learner with memory on and no goals or level, who hasn't finished or skipped it. */
export function GoalChatNudge({ from }: { from: string }) {
  const { user } = useAuth();
  const { flags, setFlag } = useGame();
  const host = useGoalChatHost();
  const s = useGoalState();
  const answered = !!flags?.[GOAL_CHAT_FLAG];
  // one stable shape (the card, then the host): the card going when the chat saves never remounts the open dialog
  const show = !!user && s.ready && s.eligible && !answered;
  return (
    <>
      {show ? (
        <div className="flex flex-col gap-2.5 border border-line-strong bg-surface px-4 py-3.5">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Target className="h-3.5 w-3.5" aria-hidden /> new here?
        </span>
        <p className="m-0 text-[14.5px] leading-snug text-fg-2">Tell the tutor what you&apos;re aiming for (role, companies, when) and how you like explanations. About a minute, and every answer fits you after.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => openGoalChat(from)} className="min-h-10 bg-signal px-3.5 text-[14px] font-semibold text-on-signal">
            Set my goals
          </button>
          <button
            type="button"
            onClick={() => {
              setFlag(GOAL_CHAT_FLAG, { status: "skipped", updatedAt: Date.now() });
              track("goal_chat", { action: "skip", from: `${from}-nudge` });
            }}
            className="min-h-10 px-2 font-mono text-[12px] text-fg-3 hover:text-fg"
          >
            not now
          </button>
        </div>
        </div>
      ) : null}
      {host}
    </>
  );
}
