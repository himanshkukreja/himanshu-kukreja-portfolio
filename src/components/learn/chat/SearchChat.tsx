"use client";

/**
 * /learn/chat: the course chat as an app (design notes: the chat redesign of 29 Oct 2026).
 *
 * Zones by width:
 *   >= 1280  history sidebar (collapsible) · the conversation (760px reading width) · the context rail
 *   1024+    history sidebar · the conversation; the context opens as a slide-over
 *   < 1024   the conversation; history (left drawer) and context (right slide-over, bottom sheet on phones)
 * From 1024 up the page is a fixed-height shell (each zone scrolls on its own, the box sits under the
 * conversation). Below that the page scrolls and the box is fixed above the course dock, or above the
 * on-screen keyboard while it is up (visualViewport, for iOS).
 *
 * One box, one action: typing shows instant matches as you go (in the rail, or under the box when there is no
 * rail), Enter / Ask asks the tutor. Signed out, Ask shows the instant matches and "Sign in to get an answer and a
 * learning path". The grouped results page (?view=results) is the "See all N results" link.
 * Links: ?q= opens with that text in the box (and its matches); ?q=…&ask=1 asks it once.
 *
 * The page shell is static (ISR); everything per learner loads here, on the client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, LogIn, MessageSquarePlus, PanelLeftClose, PanelLeftOpen, PanelRight, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import SmartSearch from "@/components/learn/search/SmartSearch";
import { ExampleIconView, ModeBadge } from "@/components/learn/search/ExampleGallery";
import { EXAMPLE_CATEGORIES, examplesIn, type SearchExample } from "@/lib/search/smart/examples";
import { isNaturalQuery } from "@/lib/search/smart/text";
import { whenLabel } from "@/lib/learn/chat-history";
import { track } from "@/lib/track";
import ChatComposer, { type ComposerHandle } from "./ChatComposer";
import ChatHistory, { useChatHistory } from "./ChatHistory";
import ChatThread from "./ChatThread";
import { NewMessagePill, useFollow } from "./ChatLive";
import ContextRail, { QUICK_ACTIONS } from "./ContextRail";
import { ChatFinePrint, QuotaLine } from "./ChatMeta";
import { openThread } from "./history";
import { InstantMatches } from "./ResultsRail";
import { Sheet, useHeight, useKeyboardInset, useMedia } from "./ui";
import { useCourseChat } from "./useCourseChat";

/** The example categories, the ones the tutor answers first (examples.ts; the gallery's own list). */
const CATEGORIES = [...EXAMPLE_CATEGORIES.filter((c) => c.ai), ...EXAMPLE_CATEGORIES.filter((c) => !c.ai)];
const SIDEBAR_PREF = "hk.chat.sidebar";

/**
 * The empty chat's greeting for a signed-in learner, by their own clock: "Good evening, Asha" (Claude-style).
 * Client-only (the time and the profile are only known in the browser), so the server and first paint keep
 * the plain heading; the name is the first word of the profile's (or the sign-in provider's) full name.
 */
function useGreeting(name: string | null | undefined): { hello: string; mark: "." | "?" } | null {
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    tick();
    const t = setInterval(tick, 10 * 60_000);
    return () => clearInterval(t);
  }, []);
  if (hour === null) return null;
  const first = (name || "").trim().split(/\s+/)[0];
  const n = first && first.length <= 24 && !first.includes("@") ? first : "";
  if (hour >= 22 || hour < 5) return { hello: n ? `Up late, ${n}` : "Up late", mark: "?" };
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return { hello: n ? `Good ${part}, ${n}` : `Good ${part}`, mark: "." };
}

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = window.setTimeout(() => setD(v), ms);
    return () => window.clearTimeout(t);
  }, [v, ms]);
  return d;
}

export default function SearchChat() {
  const params = useSearchParams();
  if (params.get("view") === "results") return <SmartSearch />;
  return <ChatPage />;
}

function ChatPage() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") || "").trim().slice(0, 300);
  const asked = params.get("ask") === "1";
  // `next dev` only: ?preview=1 opens the chat without signing in (screenshots, local tries)
  const dev = process.env.NODE_ENV === "development" && params.get("preview") === "1";
  const devHeaders = useMemo<Record<string, string> | undefined>(() => (dev ? { "x-smart-preview": "1" } : undefined), [dev]);
  const { user, loading, profile } = useAuth();
  const greeting = useGreeting(user ? profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name : null);
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const uid = dev ? "dev" : user?.id ?? null;
  const chat = useCourseChat(uid, { devHeaders });
  const canChat = dev || (!!user && !!ai?.features["course-chat"]);
  const history = useChatHistory(uid, !dev && !!user);
  const [text, setText] = useState(q);
  const [focused, setFocused] = useState(false);
  // Ask pressed when the tutor can't answer (signed out, or resting): keep the matches open with the reason
  const [pinned, setPinned] = useState<"signin" | "resting" | null>(null);
  const [sheet, setSheet] = useState<"history" | "context" | null>(null);
  const [sidebar, setSidebar] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(SIDEBAR_PREF) !== "0";
    } catch {
      return true;
    }
  });
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const wide = useMedia("(min-width: 1024px)");
  const rail = useMedia("(min-width: 1280px)");
  const phone = useMedia("(max-width: 767px)");
  const kb = useKeyboardInset();
  const [boxRef, boxH] = useHeight<HTMLDivElement>(wide);
  const empty = chat.conv.messages.length === 0;
  const lastAsk = [...chat.conv.messages].reverse().find((m) => m.role === "user" && !m.answerTo && !m.mockPhase)?.text ?? "";
  const railQ = useDebounced(text.trim() || q || lastAsk, 280);
  const typedQ = useDebounced(text.trim(), 220);
  const title = empty ? "New chat" : history.threads.find((t) => t.id === chat.conv.chat)?.title || lastAsk || "Conversation";

  const toggleSidebar = () =>
    setSidebar((s) => {
      try {
        window.localStorage.setItem(SIDEBAR_PREF, s ? "0" : "1");
      } catch {
        /* blocked */
      }
      return !s;
    });

  // the course dock's height (phones and tablets): the box sits on top of it
  const [dockH, setDockH] = useState(0);
  useEffect(() => {
    if (wide) return;
    const dock = document.querySelector<HTMLElement>(".hk-dock");
    if (!dock || typeof ResizeObserver === "undefined") return;
    // hidden (display: none, e.g. a lesson's own toolbar) → no rects
    const set = () => setDockH(dock.getClientRects().length ? Math.round(dock.getBoundingClientRect().height) : 0);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [wide]);

  // a new ?q= (a link, the header box) replaces what's in the box
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setText(q);
  }
  const type = (v: string) => {
    setText(v);
    setPinned(null);
  };

  const ask = useCallback(
    (t: string) => {
      const v = t.trim();
      if (!v) return;
      if (!uid) {
        setText(v);
        setPinned("signin");
        track("chat_ask_signed_out", { q_len: v.length });
        return;
      }
      if (!canChat) {
        setText(v);
        setPinned("resting");
        return;
      }
      setText("");
      setSheet(null);
      void chat.send(v);
      track("chat_ask", { q_len: v.length, natural: isNaturalQuery(v) });
    },
    [canChat, chat, uid],
  );

  // ?q=…&ask=1 (the header box's "Ask" row): send it once, then keep only ?q= so a reload doesn't send it again
  const sentFor = useRef("");
  useEffect(() => {
    if (!asked || !q || sentFor.current === q || loading) return;
    if (!dev && (!user || !ai)) return;
    sentFor.current = q;
    // the URL asked for it (?ask=1): send once, as if the learner pressed Ask
    if (canChat) ask(q);
    router.replace(`/learn/chat?q=${encodeURIComponent(q)}${dev ? "&preview=1" : ""}`, { scroll: false });
  }, [asked, q, loading, user, ai, canChat, ask, router, dev]);

  // keep the newest message in view while it is written, unless the learner scrolled up to read (then a "new
  // message" pill); the shell's own scroller from 1024 up, the page below
  const follow = useFollow(scroller, threadRef, !wide, `${wide}:${empty}`);
  const followTo = follow.toBottom;
  // a message sent (from the box, a quiz card, a quick action): follow it again
  const liveId = chat.live?.id;
  useEffect(() => {
    if (liveId) requestAnimationFrame(() => followTo(true));
  }, [liveId, followTo]);
  // a conversation opened from history starts at its end
  const seenChat = useRef(chat.conv.chat);
  useEffect(() => {
    if (seenChat.current === chat.conv.chat) return;
    seenChat.current = chat.conv.chat;
    if (!chat.conv.messages.length) {
      if (scroller.current) scroller.current.scrollTop = 0;
      return;
    }
    requestAnimationFrame(() => {
      if (wide && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
      else window.scrollTo({ top: document.documentElement.scrollHeight });
    });
    // only when the conversation itself changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.conv.chat, wide]);

  const newChat = useCallback(() => {
    chat.reset();
    setText("");
    setSheet(null);
    window.setTimeout(() => composer.current?.focus(), 40);
  }, [chat]);

  const pick = (x: SearchExample) => {
    if (x.ai && canChat) ask(x.text);
    else {
      setText(x.text);
      composer.current?.focus();
    }
  };

  const signInLine = (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-3 py-2.5">
      <span className="text-[14px] font-semibold text-fg">{pinned === "resting" ? "The tutor is resting right now. Instant matches still work." : "Sign in to get an answer and a learning path"}</span>
      {pinned !== "resting" && (
        <button type="button" onClick={openAuthModal} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3 text-[13.5px] font-semibold text-on-signal">
          <LogIn className="h-4 w-4" aria-hidden />
          Sign in free
        </button>
      )}
    </div>
  );

  // instant matches under the box, where there is no results rail: while typing, or pinned after Ask
  const showMatches = !rail && typedQ.length >= 2 && (focused || !!pinned);
  const hint = !uid ? (
    <>
      Matches appear as you type, for everyone.{" "}
      <button type="button" onClick={openAuthModal} className="underline decoration-line-strong underline-offset-2 hover:text-fg-2">
        Sign in free
      </button>{" "}
      to get answers, paths and quizzes from the tutor.
    </>
  ) : !canChat ? (
    ai ? "The tutor is resting right now. Matches still appear as you type." : "Checking the tutor…"
  ) : (
    <span className="hidden [@media(hover:hover)]:inline">Enter to ask · Shift+Enter for a new line</span>
  );

  const box = (
    <div className="relative">
      {showMatches && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-2 max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain">
          <InstantMatches q={typedQ} headers={devHeaders} prompt={pinned ? signInLine : undefined} onPick={() => setFocused(false)} />
        </div>
      )}
      <ChatComposer
        ref={composer}
        value={text}
        onChange={type}
        onAsk={() => ask(text)}
        onStop={chat.stop}
        busy={chat.busy}
        canAsk={canChat}
        autoFocus={wide && empty && !q}
        placeholder={phone ? "Ask the course…" : "Ask anything about system design…"}
        hint={hint}
        onFocusChange={(f) => (f ? setFocused(true) : window.setTimeout(() => setFocused(false), 180))}
      />
      {pinned && rail && <div className="mt-2 border border-line-strong">{signInLine}</div>}
    </div>
  );

  const historyList = (variant: "sidebar" | "sheet") =>
    uid ? (
      <ChatHistory uid={uid} sync={!dev && !!user} onNew={newChat} onOpened={() => setSheet(null)} beforeSwitch={chat.stop} busy={chat.busy} variant={variant} />
    ) : (
      <div className="flex flex-col gap-3 p-4">
        <p className="m-0 text-[14px] leading-relaxed text-fg-2">
          Your conversations show up here once you{" "}
          <button type="button" onClick={openAuthModal} className="inline font-semibold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
            sign in
          </button>
          . They are saved to your account for 90 days, on every device.
        </p>
      </div>
    );

  const context = <ContextRail conv={chat.conv} q={railQ} headers={devHeaders} uid={uid} canChat={canChat} onAsk={ask} onSave={chat.savePath} onNavigate={() => setSheet(null)} onSignIn={openAuthModal} />;

  const iconBtn = "grid h-11 w-11 shrink-0 place-items-center border border-transparent text-fg-3 hover:border-line-strong hover:text-fg";

  /* ---------------------------------------------------------------- the conversation column */
  const topBar = (
    <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line bg-bg/95 px-2 backdrop-blur max-lg:sticky max-lg:top-[var(--hk-header-h,61px)] max-lg:z-20 sm:px-3">
      {wide ? (
        <button type="button" onClick={toggleSidebar} aria-label={sidebar ? "Hide chat history" : "Show chat history"} aria-expanded={sidebar} title={sidebar ? "Hide history" : "Show history"} className={iconBtn}>
          {sidebar ? <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      ) : (
        <button type="button" data-chat-open="history" onClick={() => setSheet("history")} aria-label="Chat history" className={`${iconBtn} relative`}>
          <History className="h-[18px] w-[18px]" aria-hidden />
          {history.threads.length > 0 && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 bg-signal" />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col px-1">
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3 w-3" aria-hidden />
          ask the course
          {ai?.preview && <span className="border border-line-strong px-1 text-fg-3">admin preview</span>}
        </span>
        <h1 className="m-0 truncate text-[14.5px] font-semibold leading-tight text-fg">{title}</h1>
      </div>
      {canChat && (
        <span className="hidden md:block">
          <QuotaLine quota={chat.quota} />
        </span>
      )}
      {!rail && (
        <button type="button" data-chat-open="context" onClick={() => setSheet("context")} aria-label="Sources, results and progress" title="Sources, results and progress" className={iconBtn}>
          <PanelRight className="h-[18px] w-[18px]" aria-hidden />
        </button>
      )}
      {!empty && (
        <button type="button" onClick={newChat} aria-label="New chat" title="New chat" className={`${iconBtn} sm:flex sm:w-auto sm:items-center sm:gap-1.5 sm:border-line-strong sm:px-3 sm:font-mono sm:text-[12px]`}>
          <MessageSquarePlus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">New chat</span>
        </button>
      )}
    </div>
  );

  const emptyState = (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-8 pt-8 sm:px-6 lg:pt-[min(10vh,88px)]">
      <header className="flex flex-col gap-4">
        {user && greeting ? (
          <h2 className="m-0 flex flex-col gap-2 font-display font-extrabold tracking-tightest text-fg">
            <span className="hk-chat-in flex items-center gap-3 text-[clamp(36px,7vw,58px)] leading-[0.95]">
              <Sparkles className="h-[0.7em] w-[0.7em] shrink-0 text-signal-text" aria-hidden />
              <span className="min-w-0 break-words">
                {greeting.hello}
                <span className="text-signal-text">{greeting.mark}</span>
              </span>
            </span>
            <span className="text-[clamp(22px,3.6vw,30px)] leading-tight text-fg-3">What do you want to learn today?</span>
          </h2>
        ) : (
          <h2 className="m-0 font-display text-[clamp(36px,7vw,58px)] font-extrabold leading-[0.95] tracking-tightest text-fg">
            What do you want to learn<span className="text-signal-text">?</span>
          </h2>
        )}
        <p className="m-0 max-w-[620px] text-[16px] leading-relaxed text-fg-2">
          Ask in plain words. The tutor answers from the course with its sources, finds the exact second in a lecture, builds a path you can save, quizzes you on the course&apos;s own questions and suggests what
          to do next from your progress.
        </p>
      </header>
      {wide && box}
      {canChat && !rail && (
        <div role="group" aria-label="Quick actions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.label} type="button" onClick={() => ask(a.ask)} className="flex min-h-12 items-center gap-2 border border-line-strong bg-surface px-3 text-left text-[14px] font-semibold text-fg-2 hover:border-signal hover:text-fg">
              <a.icon className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
              {a.label}
            </button>
          ))}
        </div>
      )}
      {uid && history.threads.length > 0 && (
        <section aria-labelledby="recent-h" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="recent-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
              Recent chats
            </h3>
            {!(wide && sidebar) && (
              <button type="button" onClick={() => (wide ? toggleSidebar() : setSheet("history"))} className="min-h-10 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
                all {history.threads.length} →
              </button>
            )}
          </div>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {history.threads.slice(0, 4).map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => uid && void openThread(uid, t.id)} className="flex h-full min-h-16 w-full flex-col justify-between gap-1.5 border border-line bg-surface px-3.5 py-3 text-left hover:border-fg-3">
                  <span className="line-clamp-2 break-words text-[14.5px] font-semibold leading-snug text-fg">{t.title}</span>
                  <span className="font-mono text-[11px] text-fg-4">{whenLabel(t.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="ex-h" className="flex flex-col gap-3">
        <h3 id="ex-h" className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Try one
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
            <ModeBadge ai /> the tutor answers{uid ? "" : " (sign in free)"}
          </span>
          <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
            <ModeBadge ai={false} /> instant matches
          </span>
        </h3>
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {CATEGORIES.map((c) => (
            <li key={c.id} className={`flex min-w-0 flex-col gap-2.5 border bg-surface p-3.5 ${c.ai ? "border-line-strong" : "border-line"}`}>
              <div className="flex items-start justify-between gap-2">
                <h4 className="m-0 flex min-w-0 items-center gap-2 text-[14.5px] font-semibold leading-snug text-fg">
                  <span className="grid h-7 w-7 shrink-0 place-items-center border border-line-strong text-signal-text">
                    <ExampleIconView icon={c.icon} />
                  </span>
                  {c.label}
                </h4>
                {c.ai && <ModeBadge ai />}
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {examplesIn(c.id)
                  .slice(0, 3)
                  .map((x) => (
                    <li key={x.text} className="max-w-full">
                      <button type="button" onClick={() => pick(x)} className="min-h-10 max-w-full break-words border border-dashed border-line-strong px-2.5 py-1.5 text-left text-[13.5px] leading-snug text-fg-2 hover:border-fg-3 hover:text-fg">
                        {x.text}
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      {canChat && <ChatFinePrint memory={chat.memory} history={history.remote} />}
    </div>
  );

  const thread = (
    <div ref={threadRef} className="mx-auto flex w-full max-w-[760px] min-w-0 flex-col gap-6 px-4 pb-6 pt-6 sm:px-6">
      <ChatThread
        conv={chat.conv}
        status={chat.status}
        draft={chat.draft}
        live={chat.live}
        onStop={chat.stop}
        onAsk={canChat ? (t) => (track("chat_followup", { from: "page" }), ask(t)) : undefined}
        onAnswer={(qref, a) => void chat.send(a, { answerTo: qref })}
        onSave={chat.savePath}
        actions={{ feedback: chat.feedback, share: true, onRate: chat.rate }}
        mock={{ onNext: chat.nextPhase, onEnd: () => void chat.send("End the interview and score me.", { mockEnd: true }), onLeave: chat.leaveMock }}
      />
      {chat.fallback && !rail && (
        <button type="button" onClick={() => setSheet("context")} className="min-h-10 self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2">
          See the instant results →
        </button>
      )}
      {canChat && <ChatFinePrint memory={chat.memory} history={history.remote} className="mt-2" />}
    </div>
  );

  /* ---------------------------------------------------------------- phones and tablets: the page scrolls */
  if (!wide)
    return (
      <main className="w-full min-w-0" style={{ paddingBottom: boxH + 12 }}>
        {topBar}
        {empty ? emptyState : thread}
        {follow.unseen && !empty && <NewMessagePill onClick={() => follow.toBottom()} className="fixed left-1/2 z-40 -translate-x-1/2" style={{ bottom: (kb > 0 ? kb : dockH) + boxH + 10 }} />}
        <div ref={boxRef} className="hk-safe-x fixed inset-x-0 z-40 border-t border-line bg-bg/95 px-3 pb-2 pt-2 backdrop-blur sm:px-6" style={{ bottom: kb > 0 ? kb : dockH }}>
          <div className="mx-auto w-full max-w-[760px]">{box}</div>
        </div>
        <Sheet open={sheet === "history"} onClose={() => setSheet(null)} side="left" label="Chat history">
          {historyList("sheet")}
        </Sheet>
        <Sheet open={sheet === "context"} onClose={() => setSheet(null)} side={phone ? "bottom" : "right"} label="Sources, results and progress" width="w-[min(400px,92vw)]">
          <div className="p-4">{context}</div>
        </Sheet>
      </main>
    );

  /* ---------------------------------------------------------------- 1024 and up: the app shell */
  return (
    <main className="flex h-[calc(100dvh-var(--hk-header-h,61px))] w-full min-w-0 overflow-hidden">
      {sidebar && (
        <aside aria-label="Chat history" className="flex w-[264px] shrink-0 flex-col border-r border-line bg-surface/60">
          {historyList("sidebar")}
        </aside>
      )}
      <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
        {topBar}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scroller} data-chat-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {empty ? emptyState : thread}
          </div>
          {follow.unseen && !empty && <NewMessagePill onClick={() => follow.toBottom()} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2" />}
        </div>
        {!empty && (
          <div className="shrink-0 border-t border-line bg-bg px-6 pb-4 pt-3">
            <div className="mx-auto w-full max-w-[712px]">{box}</div>
          </div>
        )}
      </section>
      {rail ? (
        <aside aria-label="Sources, results and progress" className="w-[340px] shrink-0 overflow-y-auto overscroll-contain border-l border-line bg-surface/60 p-5 2xl:w-[380px]">
          {context}
        </aside>
      ) : (
        <Sheet open={sheet === "context"} onClose={() => setSheet(null)} side="right" label="Sources, results and progress" width="w-[400px]">
          <div className="p-4">{context}</div>
        </Sheet>
      )}
    </main>
  );
}
