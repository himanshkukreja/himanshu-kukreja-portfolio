"use client";

/**
 * The problem room's tutor tab: DSA Mastery's AI tutor beside the editor (feature "dsa-tutor", /api/learn/ai/dsa/tutor).
 * Every message carries the learner's current code and language, the last Run/Submit result (verdict, the first failing
 * visible test's input, expected and actual output, the error; a hidden test only by name) and how many hint rungs are
 * open. Quick actions: Hint (the problem's own ladder, one rung at a time: the room opens that rung too), Debug my code,
 * Complexity, Dry run, and Review once the solution is accepted. Free questions too.
 *
 * No spoilers: the server sends the editorial and reference solution only for a learner who unlocked it, and caps code
 * in answers until then (lib/dsa/ai). The conversation is kept on this device, one per problem ("local:" scope).
 */
import { useEffect, useRef, useState } from "react";
import { Bug, Footprints, Gauge, History, Lightbulb, LogIn, Maximize2, MessageSquarePlus, Minimize2, ScanSearch, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import ChatComposer, { type ComposerHandle } from "@/components/learn/chat/ChatComposer";
import ChatThread from "@/components/learn/chat/ChatThread";
import ChatHistory, { useChatHistory } from "@/components/learn/chat/ChatHistory";
import { NewMessagePill, useFollow } from "@/components/learn/chat/ChatLive";
import { ChatFinePrint, DSA_PRIVACY, QuotaLine } from "@/components/learn/chat/ChatMeta";
import { useCourseChat } from "@/components/learn/chat/useCourseChat";
import { TUTOR_ASK, type TutorMode } from "@/lib/dsa/ai/modes";
import type { JudgeOutcome } from "@/lib/dsa/harness";
import type { DsaLang, ProblemPage } from "@/lib/dsa/types";
import { track } from "@/lib/track";

export type TutorRequest = { mode: Exclude<TutorMode, "ask">; key: number };

type Props = {
  p: ProblemPage;
  lang: DsaLang;
  /** the editor's code right now */
  code: () => string;
  last: { o: JudgeOutcome; mode: "run" | "submit" } | null;
  hintsOpen: number;
  /** the tutor gave the hint of rung n: the room opens it too */
  onHint: (n: number) => void;
  solved: boolean;
  /** a quick action asked for from elsewhere in the room (the verdict panel's "Ask the tutor why") */
  request: TutorRequest | null;
  /** Called once a request has been sent, so the room clears it. */
  onRequestHandled?: () => void;
};

const ACTIONS: { mode: Exclude<TutorMode, "ask">; label: string; icon: LucideIcon; title: string }[] = [
  { mode: "hint", label: "Hint", icon: Lightbulb, title: "The next hint, from the problem's own ladder" },
  { mode: "debug", label: "Debug my code", icon: Bug, title: "Find the bug behind the last failing test" },
  { mode: "complexity", label: "Complexity", icon: Gauge, title: "Your code's time and space, and whether it fits" },
  { mode: "dryrun", label: "Dry run", icon: Footprints, title: "Trace your code on a small input" },
  { mode: "review", label: "Review", icon: ScanSearch, title: "A code review and interview follow-ups, after an accepted solution" },
];

/** The last result as the tutor reads it: no hidden test's input ever leaves the room. */
function wireResult(last: Props["last"], p: ProblemPage) {
  if (!last) return null;
  const { o, mode } = last;
  const bad = o.cases.find((c) => !c.ok);
  const tc = bad && !bad.hidden ? p.visible.find((v) => v.name === bad.name) : undefined;
  return {
    mode,
    verdict: o.verdict,
    passed: o.passed,
    total: o.total,
    message: (o.message || "").slice(0, 1500),
    failing: bad ? { name: bad.name, hidden: bad.hidden, ...(tc ? { input: tc.input, expected: tc.output } : {}), got: bad.got ?? "", message: (bad.message || "").slice(0, 600) } : null,
  };
}

export default function ProblemTutor({ p, lang, code, last, hintsOpen, onHint, solved, request, onRequestHandled }: Props) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const uid = user?.id ? `local:dsat:${p.id}:${user.id}` : null;
  const chat = useCourseChat(uid, { api: "/api/learn/ai/dsa/tutor" });
  const canChat = !!user && !!ai?.features["dsa-tutor"];
  const [text, setText] = useState("");
  // the answers are long: "expand" opens the tutor as a large reading panel over the room (Esc or the button closes it)
  const [wide, setWide] = useState(false);
  // earlier chats on this problem: "new chat" keeps the old one in the list, and "chats" opens it
  const history = useChatHistory(uid, false);
  const [showHistory, setShowHistory] = useState(false);
  const pastChats = history.threads.length;
  useEffect(() => {
    if (!wide) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setWide(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [wide]);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const follow = useFollow(scroller, content, false, p.id);
  const followTo = follow.toBottom;
  const liveId = chat.live?.id;
  useEffect(() => {
    if (liveId) requestAnimationFrame(() => followTo(true));
  }, [liveId, followTo]);
  useEffect(() => {
    requestAnimationFrame(() => followTo(false));
  }, [followTo]);

  const accepted = solved || last?.o.verdict === "AC";
  const failing = !!last && last.o.verdict !== "AC";
  const hasCode = () => code().trim().length > 0;

  const send = async (mode: TutorMode, words: string) => {
    if (!canChat || chat.busy) return;
    // "Explain this problem simply" is about the problem, not their code: neither the code nor the last run goes with it
    const plain = mode === "explain";
    const body = { dsa: { problemId: p.id, mode, code: plain ? "" : code().slice(0, 12_000), lang, result: plain ? null : wireResult(last, p), hintsOpen } };
    track("dsa_tutor", { problem: p.id, mode, lang, verdict: last?.o.verdict ?? null });
    const ok = await chat.send(words, { body });
    // the hint came from the next rung: the room's ladder opens it too, so the two never drift apart
    if (ok && mode === "hint" && hintsOpen < p.hints.length) onHint(hintsOpen + 1);
  };

  // a quick action asked for from elsewhere in the room
  const handled = useRef(0);
  useEffect(() => {
    if (!request || handled.current === request.key || !canChat) return;
    handled.current = request.key;
    // consumed once: the room forgets it, so reopening the Tutor tab never sends it again
    onRequestHandled?.();
    void send(request.mode, TUTOR_ASK[request.mode]);
    // send reads the latest code and result itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request, canChat]);

  const ask = () => {
    const v = text.trim();
    if (!v) return;
    setText("");
    void send("ask", v);
  };

  const empty = chat.conv.messages.length === 0;

  if (!user)
    return (
      <div className="flex flex-col gap-3 border border-line bg-surface p-5">
        <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> problem tutor
        </p>
        <p className="m-0 text-[15px] leading-relaxed text-fg">
          The tutor reads your code and your last run, then gives you the next hint, finds your bug, checks your complexity or reviews your solution, without giving the answer away.
        </p>
        <button type="button" onClick={openAuthModal} className="inline-flex min-h-11 items-center gap-2 self-start bg-signal px-4 text-[15px] font-semibold text-on-signal">
          <LogIn className="h-4 w-4" aria-hidden /> Sign in free to ask
        </button>
      </div>
    );

  return (
    <>
    {wide && <div aria-hidden className="fixed inset-0 z-[60] bg-black/40" onClick={() => setWide(false)} />}
    <div
      className={
        wide
          ? "fixed inset-x-0 bottom-0 top-[var(--hk-header-h,61px)] z-[61] flex flex-col border border-line-strong bg-surface shadow-2xl sm:inset-x-[max(16px,calc(50vw-500px))] sm:bottom-4 sm:top-[calc(var(--hk-header-h,61px)+16px)]"
          : "flex h-[min(80dvh,760px)] min-h-[480px] flex-col border border-line-strong bg-surface lg:h-[calc(100dvh-var(--hk-header-h,61px)-150px)] lg:min-h-[560px]"
      }
      role={wide ? "dialog" : undefined}
      aria-modal={wide || undefined}
      aria-label={wide ? "Problem tutor" : undefined}
      data-dsa-tutor
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> problem tutor
          {ai?.preview && <span className="border border-line-strong px-1 text-fg-3">admin preview</span>}
        </span>
        {canChat && <QuotaLine quota={chat.quota} />}
        {canChat && pastChats > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-pressed={showHistory}
            className="ml-auto inline-flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[11.5px] text-fg-3 hover:text-fg [@media(pointer:coarse)]:min-h-11"
          >
            <History className="h-3.5 w-3.5" aria-hidden /> chats ({pastChats})
          </button>
        )}
        <button
          type="button"
          onClick={() => setWide((w) => !w)}
          aria-pressed={wide}
          className={`${canChat && pastChats > 0 ? "" : "ml-auto "}inline-flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[11.5px] text-fg-3 hover:text-fg [@media(pointer:coarse)]:min-h-11`}
        >
          {wide ? <Minimize2 className="h-3.5 w-3.5" aria-hidden /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden />}
          {wide ? "close" : "expand"}
        </button>
        {!empty && (
          <button type="button" onClick={chat.reset} disabled={chat.busy} className="inline-flex min-h-9 items-center gap-1.5 px-1.5 font-mono text-[11.5px] text-fg-3 hover:text-fg disabled:opacity-50 [@media(pointer:coarse)]:min-h-11">
            <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden /> new chat
          </button>
        )}
      </div>
      <div role="group" aria-label="Ask the tutor to" className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
        {ACTIONS.map((a) => {
          const off = !canChat || chat.busy || (a.mode === "review" && !accepted) || (a.mode !== "hint" && !hasCode());
          const lead = (a.mode === "debug" && failing) || (a.mode === "review" && accepted && !failing);
          return (
            <button
              key={a.mode}
              type="button"
              disabled={off}
              title={a.mode === "review" && !accepted ? "Opens after an accepted submit" : a.title}
              onClick={() => void send(a.mode, TUTOR_ASK[a.mode])}
              className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border px-2.5 font-mono text-[12px] disabled:opacity-40 [@media(pointer:coarse)]:min-h-11 ${lead ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:border-signal hover:text-fg"}`}
            >
              <a.icon className="h-3.5 w-3.5" aria-hidden />
              {a.label}
            </button>
          );
        })}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div ref={content} className="flex flex-col gap-4 px-3 py-4 sm:px-4">
            {showHistory && uid ? (
              <ChatHistory
                uid={uid}
                sync={false}
                variant="panel"
                busy={chat.busy}
                beforeSwitch={chat.stop}
                onNew={() => {
                  chat.reset();
                  setShowHistory(false);
                }}
                onOpened={() => setShowHistory(false)}
              />
            ) : empty ? (
              <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-fg-2">
                <p className="m-0">
                  {failing
                    ? `Your last ${last?.mode === "submit" ? "submit" : "run"} didn't pass. Ask the tutor to debug it: it reads your code and the failing test.`
                    : accepted
                      ? "Accepted. Ask for a review: cleaner code, the edge cases and the follow-ups an interviewer would ask."
                      : "Stuck? Ask for the next hint, or run your code first and ask the tutor to debug it. It reads your code, never writes the solution for you."}
                </p>
                <p className="m-0 text-[13px] text-fg-3">
                  Hints follow the problem&apos;s own ladder ({hintsOpen}/{p.hints.length} open). The editorial stays locked until you solve it, fail three submits or reveal it.
                </p>
              </div>
            ) : (
              <ChatThread conv={chat.conv} status={chat.status} draft={chat.draft} live={chat.live} onStop={chat.stop} onAnswer={() => {}} onSave={() => {}} actions={{ feedback: chat.feedback, share: false, onRate: chat.rate, feature: "dsa-tutor" }} />
            )}
          </div>
        </div>
        {follow.unseen && !empty && <NewMessagePill onClick={() => follow.toBottom()} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2" />}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-line px-3 pb-2 pt-2.5">
        {canChat ? (
          <ChatComposer ref={composer} id={`dsa-tutor-${p.id}`} value={text} onChange={setText} onAsk={ask} onStop={chat.stop} busy={chat.busy} canAsk compact placeholder="Ask about this problem or your code…" />
        ) : (
          <p className="m-0 text-[14px] text-fg-3">{ai ? "The tutor is resting right now. Run, Submit and the hint ladder still work." : "Checking the tutor…"}</p>
        )}
        <ChatFinePrint memory={chat.memory} privacy={DSA_PRIVACY} />
      </div>
    </div>
    </>
  );
}
