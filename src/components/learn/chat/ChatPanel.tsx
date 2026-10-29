"use client";

/**
 * The course chat as a panel on any Learn page: docked on the right on a computer (the page makes room, as
 * "Ask this lesson" did: html.hk-ask-open in globals.css) and a sheet on a phone. Same conversation as
 * /learn/chat. It knows the page: each message carries where the learner is (the lesson and the section on
 * screen, the lecture and its second, the selected text), so "explain this section" just works.
 *
 * On a lesson it takes over from "Ask this lesson": the lesson's free saved answers ("questions learners
 * ask") come first, then the quick asks, and the lesson stays the tutor's grounding through its tools.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, History, MessageSquarePlus, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { useLessonFaq } from "@/components/learn/ai/useLessonFaq";
import { matchFaq } from "@/lib/learn/faq/parse";
import { track } from "@/lib/track";
import ChatComposer, { type ComposerHandle } from "./ChatComposer";
import ChatHistory, { useChatHistory } from "./ChatHistory";
import { useKeyboardInset } from "./ui";
import ChatThread from "./ChatThread";
import { NewMessagePill, useFollow } from "./ChatLive";
import { ChatFinePrint, QuotaLine } from "./ChatMeta";
import { clearHeldSelection, heldPassage, readPageContext } from "./pageContext";
import { useCourseChat } from "./useCourseChat";

const LESSON_RE = /^\/learn\/([^/]+)\/([^/]+)\/([^/?#]+)/;

const QUICK = [
  { label: "explain this section", ask: "Explain the section I'm reading, simply." },
  { label: "quiz me on this", ask: "Quiz me on this page." },
  { label: "a real example", ask: "Give me one concrete real-world example of the idea on this page." },
  { label: "say it in an interview", ask: "How would I say the main idea of this page in an interview, in 3-4 sentences?" },
  { label: "in Hinglish", ask: "Explain the section I'm reading in Hinglish." },
];

export default function ChatPanel({ open, onClose, initial, pathname }: { open: boolean; onClose: () => void; initial: { q?: string; send?: boolean; key: number } | null; pathname: string }) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  // `next dev` only: localStorage hk.chat.devPreview = "1" opens the panel's chat without signing in (screenshots)
  const [dev] = useState(() => {
    try {
      return process.env.NODE_ENV === "development" && window.localStorage.getItem("hk.chat.devPreview") === "1";
    } catch {
      return false;
    }
  });
  const uid = dev ? "dev" : user?.id ?? null;
  const devHeaders = useMemo(() => (dev ? { "x-smart-preview": "1" } : undefined), [dev]);
  const chat = useCourseChat(uid, { page: readPageContext, devHeaders });
  const canChat = dev || (!!user && !!ai?.features["course-chat"]);
  const [text, setText] = useState("");
  // a passage attached by "Ask the tutor" on a selection: shown above the box, sent with the next message
  const [attached, setAttached] = useState("");
  const composer = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lesson = LESSON_RE.exec(pathname);
  const isLesson = !!lesson && !/^(design-week|revise)$/.test(lesson[1]);
  const faq = useLessonFaq(isLesson ? lesson![2] : null, isLesson ? lesson![3] : "");
  // the panel's History view (the same list as the sidebar on /learn/chat)
  const [showHistory, setShowHistory] = useState(false);
  const history = useChatHistory(uid, !dev && !!user && open);
  // phones: the sheet rides on top of the on-screen keyboard (iOS doesn't move fixed things for it)
  const kb = useKeyboardInset();

  // desktop: the panel docks right and the page makes room for it
  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add("hk-ask-open");
    return () => document.documentElement.classList.remove("hk-ask-open");
  }, [open]);

  const send = useCallback(
    (t: string) => {
      const v = t.trim();
      if (!v || !canChat) return;
      setText("");
      void chat.send(v);
      // the page context (with the passage) was read as the message went out; it goes once
      clearHeldSelection();
      setAttached("");
      track("chat_ask", { from: "panel", page: pathname.split("/").slice(0, 3).join("/") });
    },
    [canChat, chat, pathname],
  );

  // opened with a question (or a quick ask): put it in the box, or send it
  const handled = useRef(0);
  useEffect(() => {
    if (!open || !initial || handled.current === initial.key) return;
    handled.current = initial.key;
    // an open request from outside the panel (an event): attach its passage, then send it or put it in the box
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttached(heldPassage());
    if (initial.q && initial.send && canChat) send(initial.q);
    else if (initial.q) setText(initial.q);
  }, [open, initial, canChat, send]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => composer.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) clearHeldSelection();
  }, [open]);

  // the newest text stays in view while the learner is at the bottom (scrolled up: a "new message" pill)
  const follow = useFollow(scrollRef, contentRef, false, `${open}:${showHistory}`);
  const followTo = follow.toBottom;
  useEffect(() => {
    if (open && !showHistory) requestAnimationFrame(() => followTo(false));
  }, [open, showHistory, followTo]);
  const liveId = chat.live?.id;
  useEffect(() => {
    if (liveId) requestAnimationFrame(() => followTo(true));
  }, [liveId, followTo]);

  if (!open) return null;
  const empty = chat.conv.messages.length === 0;
  const dup = text.trim() && faq ? matchFaq(faq.items, text) : null;

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-end bg-black/40 lg:pointer-events-none lg:top-[var(--hk-header-h,61px)] lg:items-stretch lg:bg-transparent lg:!pb-0"
      style={kb ? { paddingBottom: kb } : undefined}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <aside
        data-chat-panel
        role="dialog"
        aria-modal="false"
        aria-label="Ask the course"
        className="flex max-h-[min(88dvh,calc(100%-12px))] w-full min-w-0 flex-col border-t border-line-strong bg-surface shadow-[0_-12px_40px_rgba(0,0,0,0.5)] md:mx-auto md:max-w-[640px] md:border-x lg:pointer-events-auto lg:mx-0 lg:max-h-none lg:max-w-none lg:w-[var(--hk-ask-w)] lg:border-l lg:border-r-0 lg:border-t-0 lg:shadow-none"
      >
        <header className="flex items-start justify-between gap-2 border-b border-line py-2 pl-4 pr-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> ask the course
              {ai?.preview && <span className="border border-line-strong px-1.5 text-fg-3">admin preview</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {canChat && <QuotaLine quota={chat.quota} />}
              <Link href="/learn/chat" onClick={onClose} className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-3 hover:text-fg">
                full page <ExternalLink className="h-3 w-3" aria-hidden />
              </Link>
            </span>
          </div>
          <span className="flex shrink-0 items-center">
            {uid && (
              <button
                type="button"
                onClick={() => setShowHistory((h) => !h)}
                aria-label={showHistory ? "Back to the chat" : "Chat history"}
                aria-pressed={showHistory}
                title={showHistory ? "Back to the chat" : "History"}
                className={`relative grid h-11 w-11 place-items-center hover:text-fg ${showHistory ? "text-signal-text" : "text-fg-3"}`}
              >
                {showHistory ? <ArrowLeft className="h-[18px] w-[18px]" aria-hidden /> : <History className="h-[18px] w-[18px]" aria-hidden />}
                {!showHistory && history.threads.length > 0 && <span aria-hidden className="absolute right-2.5 top-2.5 h-1.5 w-1.5 bg-signal" />}
              </button>
            )}
            {!empty && !showHistory && (
              <button type="button" onClick={chat.reset} aria-label="New chat" title="New chat" className="grid h-11 w-11 place-items-center text-fg-3 hover:text-fg">
                <MessageSquarePlus className="h-[18px] w-[18px]" aria-hidden />
              </button>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center text-fg-3 hover:text-fg">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </span>
        </header>

        {showHistory && uid ? (
          <div className="flex min-h-0 flex-1 flex-col pb-[env(safe-area-inset-bottom,0px)] lg:pb-0">
            <ChatHistory
              uid={uid}
              sync={!dev && !!user}
              variant="panel"
              busy={chat.busy}
              beforeSwitch={chat.stop}
              onNew={() => {
                chat.reset();
                setShowHistory(false);
              }}
              onOpened={() => setShowHistory(false)}
            />
          </div>
        ) : (
        <>
        <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div ref={contentRef} className="flex flex-col gap-4 px-4 py-4">
          {empty && (
            <p className="m-0 text-[14px] leading-relaxed text-fg-2">
              Ask about this page or anything in the course. The tutor knows where you are, answers with sources, finds lecture moments, quizzes you and builds paths you can save.
            </p>
          )}
          {empty && canChat && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick asks">
              {QUICK.map((x) => (
                <button key={x.label} type="button" onClick={() => send(x.ask)} className="min-h-10 border border-line-strong px-2.5 font-mono text-[11.5px] text-fg-2 hover:border-signal hover:text-fg [@media(pointer:coarse)]:min-h-11">
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {empty && faq && (
            <div className="flex flex-col gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">questions learners ask · free</span>
              {faq.items.slice(0, 5).map((it) => (
                <button key={it.q} type="button" onClick={() => chat.addSaved(it.q, `${it.a}${it.section ? ` (from: ${it.section})` : ""}`)} className="border border-line px-3 py-2 text-left text-[14px] text-fg-2 hover:border-fg-3 hover:text-fg">
                  {it.q}
                </button>
              ))}
            </div>
          )}
          {!empty && <ChatThread
                conv={chat.conv}
                status={chat.status}
                draft={chat.draft}
                live={chat.live}
                onStop={chat.stop}
                onAsk={canChat ? (t) => (track("chat_followup", { from: "panel" }), send(t)) : undefined}
                onAnswer={(qref, a) => void chat.send(a, { answerTo: qref })}
                onSave={chat.savePath}
                actions={{ feedback: chat.feedback, share: true, onRate: chat.rate }}
                mock={{ onNext: chat.nextPhase, onEnd: () => void chat.send("End the interview and score me.", { mockEnd: true }), onLeave: chat.leaveMock }}
              />}
        </div>
        </div>
        {follow.unseen && !empty && <NewMessagePill onClick={() => follow.toBottom()} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2" />}
        </div>

        <footer className={`flex flex-col gap-2 border-t border-line px-4 pt-3 lg:pb-3 ${kb ? "pb-2" : "pb-[calc(env(safe-area-inset-bottom,0px)+12px)]"}`}>
          {!user && !dev ? (
            <button type="button" onClick={openAuthModal} className="min-h-12 bg-signal px-4 text-[15px] font-semibold text-on-signal">
              Sign in free to ask
            </button>
          ) : !canChat ? (
            <p className="m-0 text-[14px] text-fg-3">{ai ? "The tutor is resting right now. Search the course from the box at the top." : "Checking the tutor…"}</p>
          ) : (
            <>
              <ChatComposer ref={composer} id="chat-panel-input" value={text} onChange={setText} onAsk={() => send(text)} onStop={chat.stop} busy={chat.busy} canAsk compact placeholder={isLesson ? "Ask about this lesson, or anything…" : "Ask the course…"} />
              {attached && (
                <p className="m-0 flex items-start gap-2 border-l-2 border-signal pl-2 text-[13px] text-fg-3">
                  <span className="min-w-0 flex-1">
                    <span className="mr-1 font-mono text-[10.5px] uppercase tracking-label text-signal-text">passage</span>&ldquo;{attached.slice(0, 180)}
                    {attached.length > 180 ? "…" : ""}&rdquo;
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearHeldSelection();
                      setAttached("");
                    }}
                    aria-label="Don't attach this passage"
                    className="-my-2 grid h-9 w-9 shrink-0 place-items-center text-fg-4 hover:text-fg"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </p>
              )}
              {dup && (
                <button
                  type="button"
                  onClick={() => {
                    chat.addSaved(dup.q, `${dup.a}${dup.section ? ` (from: ${dup.section})` : ""}`);
                    setText("");
                  }}
                  className="border border-ok/60 px-3 py-2 text-left text-[13px] text-fg-2 hover:border-ok"
                >
                  Already answered: <strong className="text-fg">{dup.q}</strong> · read it free
                </button>
              )}
            </>
          )}
          <ChatFinePrint memory={chat.memory} history={uid ? history.remote : undefined} className={kb ? "hidden" : empty ? "" : "max-md:hidden"} />
        </footer>
        </>
        )}
      </aside>
    </div>
  );
}
