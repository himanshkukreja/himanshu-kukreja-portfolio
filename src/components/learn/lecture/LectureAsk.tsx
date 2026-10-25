"use client";

/**
 * "Ask about this moment", inside the lecture player: a panel over the right of the stage (a bottom
 * sheet on phones) that lives in the player shell, so it works in normal view, full screen and
 * picture-in-picture. The server rebuilds the paused moment from the lecture (/api/learn/ai/lecture);
 * answers can light nodes on the paused diagram ([[show]]) and offer a chip to another chapter
 * ([[jump]]). Pre-answered "Learners often ask here" questions for the chapter cost nothing.
 * The Q&A lives in the player (kept for the session), not here, so it survives closing the panel.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { track } from "@/lib/track";
import type { Lecture, LectureScene } from "@/lib/learn/lecture/types";
import { diagramNodes, LECTURE_PRESETS, stripTags, type LecturePreset } from "@/lib/learn/lecture/moment";
import { AI_PRIVACY } from "@/components/learn/ai/AskLessonPanel";
import AiFreeNote from "@/components/learn/ai/AiFreeNote";
import AiText from "@/components/learn/ai/AiText";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";

export type AskTurn = { id: number; q: string; preset?: LecturePreset; scene: string; step: number; at: number; answer?: string; error?: string; pending?: boolean; show?: string[]; jump?: string | null };
export type FaqEntry = { q: string; a: string };

const PRESETS = Object.entries(LECTURE_PRESETS) as [LecturePreset, (typeof LECTURE_PRESETS)[LecturePreset]][];
const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

type Props = {
  lecture: Lecture;
  scene: LectureScene;
  sceneNo: number;
  step: number;
  /** the paused time, seconds */
  at: number;
  /** the learner's pick on this checkpoint (null: not answered) */
  picked: number | null;
  faq: FaqEntry[] | null;
  turns: AskTurn[];
  setTurns: (f: (t: AskTurn[]) => AskTurn[]) => void;
  /** the nodes lit by an answer right now */
  shown: { scene: string; ids: string[] } | null;
  onShow: (scene: string, step: number, ids: string[]) => void;
  onJump: (scene: string) => void;
  /** where each scene starts, seconds */
  sceneAt: (id: string) => number | null;
  onClose: () => void;
  /** full screen: keep clear of the floating controls */
  fs: boolean;
};

export default function LectureAsk({ lecture, scene, sceneNo, step, at, picked, faq, turns, setTurns, shown, onShow, onJump, sceneAt, onClose, fs }: Props) {
  const status = useAiStatus();
  const { openAuthModal } = useAuthModal();
  const [q, setQ] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = turns.some((t) => t.pending);
  const canAsk = status?.signedIn && status.features["lesson-qa"];

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, []);
  // bring the newest question to the top, so its answer reads from its first line
  const last = turns.length ? `${turns[turns.length - 1].id}:${turns[turns.length - 1].pending ? 1 : 0}` : "";
  useEffect(() => {
    const el = scrollRef.current;
    const turn = el ? [...el.querySelectorAll<HTMLElement>("[data-turn]")].pop() : null;
    if (el && turn) el.scrollTo({ top: Math.max(0, turn.offsetTop - 8), behavior: "smooth" });
  }, [last]);

  const ask = async (question: string, preset?: LecturePreset) => {
    if (busy || !canAsk || (!question.trim() && !preset)) return;
    const prev = [...turns].reverse().find((t) => t.answer);
    const turn: AskTurn = { id: turns.reduce((m, x) => Math.max(m, x.id), 0) + 1, q: question.trim() || LECTURE_PRESETS[preset!].label, preset, scene: scene.id, step, at, pending: true };
    const done = (patch: Partial<AskTurn>) => setTurns((ts) => ts.map((x) => (x.id === turn.id ? { ...x, pending: false, ...patch } : x)));
    setTurns((ts) => [...ts, turn]);
    setQ("");
    track("ai_ask", { feature: "lesson-qa", mode: preset || "plain", lecture: lecture.quest, scene: scene.id });
    try {
      const res = await aiFetch("/api/learn/ai/lecture", {
        method: "POST",
        body: JSON.stringify({ slug: lecture.quest, scene: scene.id, step, question: question.trim(), preset, picked, previous: prev ? { q: prev.q, a: prev.answer } : null }),
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; show?: string[]; jump?: string | null; error?: string; creditsLeft?: number | null };
      setAiCredits(body.creditsLeft);
      if (!res.ok) return done({ error: body.error || "Something went wrong. Try again." });
      const show = Array.isArray(body.show) ? body.show : [];
      done({ answer: stripTags(body.text || ""), show, jump: body.jump ?? null });
      if (show.length) onShow(turn.scene, turn.step, show);
    } catch {
      done({ error: "You seem to be offline. Try again when you're back." });
    }
  };

  const here = faq?.length ? faq : null;
  return (
    <aside
      role="dialog"
      aria-label="Ask about this moment"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`flex select-text flex-col border-line-strong bg-surface text-left shadow-[0_0_40px_rgba(0,0,0,0.55)] max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-[85] max-sm:h-[72dvh] max-sm:border-t max-sm:pb-[env(safe-area-inset-bottom)] sm:z-40 sm:absolute sm:right-0 sm:top-0 sm:w-[max(38%,300px)] sm:animate-hk-slide sm:border-l ${fs ? "sm:bottom-[92px]" : "sm:bottom-0"}`}
    >
      <header className="flex items-start gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> ask about this moment
            {status?.preview && <span className="border border-line-strong px-1 text-fg-3">admin preview</span>}
          </span>
          <span className="truncate text-[13px] text-fg-2">
            <span className="font-mono text-[11px] tabular-nums text-fg-4">{fmt(at)}</span> · {String(sceneNo + 1).padStart(2, "0")} {scene.kind === "quiz" ? "Checkpoint" : scene.title}
          </span>
        </div>
        {turns.length > 0 && (
          <button type="button" onClick={() => setTurns(() => [])} disabled={busy} className="h-8 px-2 font-mono text-[11px] text-fg-3 hover:text-fg disabled:opacity-40" title="Clear this session's questions">
            clear
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close and carry on" title="Close (Esc)" className="grid h-8 w-8 shrink-0 place-items-center text-fg-3 hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div ref={scrollRef} className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3">
        {here && <OftenAsked key={scene.id} items={here} />}
        {turns.length === 0 && !here && (
          <p className="m-0 text-[13px] leading-snug text-fg-3">Ask about what&apos;s on screen. The answer can light up parts of the diagram, or send you to the chapter that explains it best.</p>
        )}
        {turns.map((t) => {
          const other = t.scene !== scene.id;
          const ts = lecture.scenes.find((s) => s.id === t.scene);
          const labels = t.show?.length && ts ? t.show.map((id) => diagramNodes(ts).find((n) => n.id === id)?.label ?? id) : [];
          const lit = !!t.show?.length && shown?.scene === t.scene && shown.ids.join() === t.show.join();
          const jump = t.jump ? lecture.scenes.find((s) => s.id === t.jump) : null;
          const jumpAt = jump ? sceneAt(jump.id) : null;
          return (
            <div key={t.id} data-turn className="flex flex-col gap-2">
              <div className="flex max-w-[92%] flex-col gap-0.5 self-end border border-line-strong bg-surface-2 px-2.5 py-1.5 text-[13.5px] text-fg">
                {other && <span className="font-mono text-[10px] text-fg-4">at {fmt(t.at)} · {ts?.kind === "quiz" ? "Checkpoint" : ts?.title}</span>}
                {t.q}
              </div>
              {t.pending ? (
                <p className="m-0 flex items-center gap-2 font-mono text-[11px] text-fg-3">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> looking at this moment…
                </p>
              ) : t.error ? (
                <p className="m-0 border border-bad/50 px-2.5 py-1.5 text-[13px] text-fg-2">{t.error}</p>
              ) : (
                <>
                  <AiText text={t.answer || ""} className="!gap-2 !text-[14px]" />
                  {(labels.length > 0 || (jump && jumpAt != null)) && (
                    <div className="flex flex-wrap gap-1.5">
                      {labels.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onShow(t.scene, t.step, t.show!)}
                          aria-pressed={lit}
                          className={`min-h-8 max-w-full truncate border px-2 text-left font-mono text-[11px] ${lit ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
                          title="Light these on the stage"
                        >
                          ◉ {lit ? "lit" : "show"}: {labels.join(", ")}
                        </button>
                      )}
                      {jump && jumpAt != null && (
                        <button type="button" onClick={() => onJump(jump.id)} className="min-h-8 max-w-full truncate border border-line-strong px-2 text-left font-mono text-[11px] text-fg-2 hover:border-signal hover:text-fg" title="Watch that chapter">
                          ▸ {fmt(jumpAt)} · {jump.kind === "quiz" ? "Checkpoint" : jump.title}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <footer className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
        {!status?.signedIn ? (
          <>
            <AiFreeNote className="!text-[11px]" />
            <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
              Sign in free to ask
            </button>
          </>
        ) : !status.features["lesson-qa"] ? (
          <p className="m-0 text-[13px] text-fg-3">AI is resting right now. The questions above are free.</p>
        ) : (
          <>
            <div
              className="-mx-3 flex gap-1 overflow-x-auto px-3 [mask-image:linear-gradient(90deg,#000_88%,transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Quick questions"
              onWheel={(e) => {
                if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
              }}
            >
              {PRESETS.map(([id, p]) => (
                <button key={id} type="button" disabled={busy} onClick={() => void ask("", id)} className="min-h-7 shrink-0 whitespace-nowrap border border-line-strong px-2 font-mono text-[10.5px] text-fg-2 hover:border-signal hover:text-fg disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-1.5">
              <textarea
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value.slice(0, 600))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(q);
                  }
                }}
                rows={1}
                placeholder="Ask about this moment…"
                aria-label="Your question"
                className="min-h-10 flex-1 resize-none border border-line-strong bg-bg px-2.5 py-2 text-[14px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
              />
              <button type="button" onClick={() => void ask(q)} disabled={busy || !q.trim()} className="min-h-10 bg-signal px-3 text-[14px] font-semibold text-on-signal disabled:opacity-50">
                Ask
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 font-mono text-[10.5px] text-fg-4">
              <AiFreeNote className="!text-[10.5px] !text-fg-4" />
              {status.creditsLeft !== null && <span>· {status.creditsLeft} credits left today</span>}
            </div>
          </>
        )}
        <p className="m-0 text-[10.5px] leading-snug text-fg-4">{AI_PRIVACY}</p>
      </footer>
    </aside>
  );
}

/** The chapter's pre-answered questions: tap to read, no AI call. */
function OftenAsked({ items }: { items: FaqEntry[] }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-3">learners often ask here · free</span>
      {items.map((it, k) => (
        <div key={it.q} className={`border ${open === k ? "border-line-strong bg-surface-2" : "border-line"}`}>
          <button
            type="button"
            aria-expanded={open === k}
            onClick={() => {
              setOpen(open === k ? null : k);
              if (open !== k) track("lecture_faq_open", { q: it.q.slice(0, 80) });
            }}
            className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left text-[13px] text-fg-2 hover:text-fg"
          >
            <span className="font-mono text-[11px] text-signal-text">{open === k ? "−" : "+"}</span>
            <span className="min-w-0 flex-1">{it.q}</span>
          </button>
          {open === k && <AiText text={it.a} className="!gap-2 px-2.5 pb-2.5 !text-[13.5px]" />}
        </div>
      ))}
    </div>
  );
}
