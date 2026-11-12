"use client";

/**
 * /dsa/ask: DSA Mastery's tutor as an app, in the course chat's layout (src/components/learn/chat/SearchChat.tsx):
 *
 *   >= 1280  history sidebar (collapsible) · the conversation (760px reading width) · the sources rail
 *   1024+    history sidebar · the conversation
 *   < 1024   the conversation; history in a left drawer. The page scrolls and the box is fixed above the DSA dock, or
 *            above the on-screen keyboard while it is up.
 *
 * The same conversation machinery as the course chat (useCourseChat, ChatThread, ChatHistory) in DSA Mastery's own scope:
 * the uid "dsa:<id>" keeps its conversations, history and account sync (?course=dsa) apart from the course chat's, and
 * every message goes to /api/learn/ai/dsa/ask. Signed out: the starters and a sign-in line, as on /chat.
 * Links: ?q= opens with that text in the box; ?q=…&ask=1 asks it once.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Gauge, History, LifeBuoy, LogIn, MessageSquarePlus, Mic, PanelLeftClose, PanelLeftOpen, Sparkles, type LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import AnswerStylePicker from "@/components/learn/chat/AnswerStylePicker";
import ChatComposer, { type ComposerHandle } from "@/components/learn/chat/ChatComposer";
import ChatHistory, { useChatHistory } from "@/components/learn/chat/ChatHistory";
import ChatThread from "@/components/learn/chat/ChatThread";
import { NewMessagePill, useFollow } from "@/components/learn/chat/ChatLive";
import { ChatFinePrint, DSA_PRIVACY, QuotaLine } from "@/components/learn/chat/ChatMeta";
import SourceIcon from "@/components/learn/chat/SourceIcon";
import { openThread } from "@/components/learn/chat/history";
import { Sheet, useHeight, useKeyboardInset, useMedia } from "@/components/learn/chat/ui";
import { useCourseChat } from "@/components/learn/chat/useCourseChat";
import { citedRefs } from "@/lib/ai/chat/text";
import { whenLabel } from "@/lib/learn/chat-history";
import { track } from "@/lib/track";

const SIDEBAR_PREF = "hk.dsa.chat.sidebar";
const API = "/api/learn/ai/dsa/ask";

type Concept = { id: string; title: string; summary: string };
type Problem = { id: string; title: string; concept: string; level: string };
type Starter = { id: string; label: string; icon: LucideIcon; asks: string[] };

/** Starter questions, from the concepts and problems that are live (so every one has course material behind it). */
function starters(concepts: Concept[], problems: Problem[]): Starter[] {
  const c0 = concepts[0]?.title ?? "sliding windows";
  const c1 = concepts[1]?.title ?? "two pointers";
  const p0 = problems[0]?.title;
  return [
    { id: "learn", label: "Understand a concept", icon: BookOpen, asks: [`Explain ${c0.toLowerCase()} with a small example`, `When do I use ${c1.toLowerCase()} instead of a hash map?`, "What is a loop invariant, and why does every lesson start with one?"] },
    { id: "stuck", label: "Get unstuck on a problem", icon: LifeBuoy, asks: [p0 ? `I'm stuck on "${p0}". Give me a nudge, not the answer.` : "I'm stuck on a sliding window problem. Give me a nudge.", "How do I know when my window should shrink?", "Why does my two-pointer loop miss the last pair?"] },
    { id: "interview", label: "Coding interviews", icon: Mic, asks: ["How do I explain a sliding window solution in an interview?", "Which words in a problem signal two pointers?", "What follow-up questions do interviewers ask on window problems?"] },
    { id: "cost", label: "Complexity", icon: Gauge, asks: ["Why is a sliding window O(n) and not O(n·k)?", "How large can n be for an O(n²) solution to pass?", "What's the space cost of a counts map in a window?"] },
  ];
}

function useDockHeight(wide: boolean): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (wide) return;
    const dock = document.querySelector<HTMLElement>(".hk-dock");
    if (!dock || typeof ResizeObserver === "undefined") return;
    const set = () => setH(dock.getClientRects().length ? Math.round(dock.getBoundingClientRect().height) : 0);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(dock);
    return () => ro.disconnect();
  }, [wide]);
  return wide ? 0 : h;
}

function useGreeting(name: string | null | undefined): string | null {
  const [hour, setHour] = useState<number | null>(null);
  // client-only (the learner's own clock), refreshed every ten minutes
  useEffect(() => {
    const tick = () => setHour(new Date().getHours());
    tick();
    const t = window.setInterval(tick, 10 * 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (hour === null) return null;
  const first = (name || "").trim().split(/\s+/)[0];
  const n = first && first.length <= 24 && !first.includes("@") ? first : "";
  const part = hour >= 22 || hour < 5 ? "Up late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return n ? `${part}, ${n}` : part;
}

export default function DsaAsk({ concepts, problems }: { concepts: Concept[]; problems: Problem[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get("q") || "").trim().slice(0, 300);
  const asked = params.get("ask") === "1";
  const { user, loading, profile } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const greeting = useGreeting(user ? profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name : null);
  const uid = user?.id ? `dsa:${user.id}` : null;
  const chat = useCourseChat(uid, { api: API });
  const canChat = !!user && !!ai?.features["dsa-chat"];
  const history = useChatHistory(uid, !!user);
  const [text, setText] = useState(q);
  const [pinned, setPinned] = useState<"signin" | "resting" | null>(null);
  const [sheet, setSheet] = useState(false);
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
  const dockH = useDockHeight(wide);
  const [boxRef, boxH] = useHeight<HTMLDivElement>(wide);
  const empty = chat.conv.messages.length === 0;
  const lastAsk = [...chat.conv.messages].reverse().find((m) => m.role === "user")?.text ?? "";
  const title = empty ? "New chat" : history.threads.find((t) => t.id === chat.conv.chat)?.title || chat.conv.title || lastAsk || "Conversation";
  const groups = useMemo(() => starters(concepts, problems), [concepts, problems]);

  // every source cited in this conversation, newest answer first (the rail)
  const conv = chat.conv;
  const cited = useMemo(() => {
    const seen = new Set<string>();
    const out: { ref: string; s: (typeof conv.sources)[string] }[] = [];
    for (const m of [...conv.messages].reverse()) {
      if (m.role !== "assistant") continue;
      for (const r of m.cites ?? citedRefs(m.text)) {
        const s = conv.sources[r];
        if (!s || seen.has(s.href + s.title)) continue;
        seen.add(s.href + s.title);
        out.push({ ref: r, s });
      }
    }
    return out.slice(0, 12);
  }, [conv]);

  const toggleSidebar = () =>
    setSidebar((s) => {
      try {
        window.localStorage.setItem(SIDEBAR_PREF, s ? "0" : "1");
      } catch {
        /* blocked */
      }
      return !s;
    });

  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setText(q);
  }

  const ask = useCallback(
    (t: string) => {
      const v = t.trim();
      if (!v) return;
      if (!uid) {
        setText(v);
        setPinned("signin");
        track("dsa_ask_signed_out", { q_len: v.length });
        return;
      }
      if (!canChat) {
        setText(v);
        setPinned("resting");
        return;
      }
      setText("");
      setPinned(null);
      setSheet(false);
      void chat.send(v);
      track("dsa_ask", { q_len: v.length });
    },
    [canChat, chat, uid],
  );

  // ?q=…&ask=1: send once, then keep only ?q= so a reload doesn't send it again
  const sentFor = useRef("");
  useEffect(() => {
    if (!asked || !q || sentFor.current === q || loading || !user || !ai) return;
    sentFor.current = q;
    if (canChat) ask(q);
    router.replace(`/dsa/ask?q=${encodeURIComponent(q)}`, { scroll: false });
  }, [asked, q, loading, user, ai, canChat, ask, router]);

  const follow = useFollow(scroller, threadRef, !wide, `${wide}:${empty}`);
  const followTo = follow.toBottom;
  const liveId = chat.live?.id;
  useEffect(() => {
    if (liveId) requestAnimationFrame(() => followTo(true));
  }, [liveId, followTo]);
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
    setSheet(false);
    window.setTimeout(() => composer.current?.focus(), 40);
  }, [chat]);

  const signInLine = (
    <div className="flex flex-wrap items-center justify-between gap-2 border border-line-strong bg-surface-2 px-3 py-2.5">
      <span className="text-[14px] font-semibold text-fg">{pinned === "resting" ? "The tutor is resting right now. Try again a little later." : "Sign in free to ask the DSA tutor"}</span>
      {pinned !== "resting" && (
        <button type="button" onClick={openAuthModal} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3 text-[13.5px] font-semibold text-on-signal">
          <LogIn className="h-4 w-4" aria-hidden />
          Sign in free
        </button>
      )}
    </div>
  );

  const hint = !uid ? (
    <>
      <button type="button" onClick={openAuthModal} className="underline decoration-line-strong underline-offset-2 hover:text-fg-2">
        Sign in free
      </button>{" "}
      to ask the tutor. Lessons and problems stay open to everyone.
    </>
  ) : !canChat ? (
    ai ? "The tutor is resting right now." : "Checking the tutor…"
  ) : (
    <span className="hidden [@media(hover:hover)]:inline">Enter to ask · Shift+Enter for a new line</span>
  );

  const box = (
    <div className="flex flex-col gap-2">
      {pinned && signInLine}
      <ChatComposer
        ref={composer}
        value={text}
        onChange={(v) => {
          setText(v);
          setPinned(null);
        }}
        onAsk={() => ask(text)}
        onStop={chat.stop}
        busy={chat.busy}
        canAsk={canChat}
        autoFocus={wide && empty && !q}
        placeholder={phone ? "Ask about DSA…" : "Ask about a concept, a problem or your approach…"}
        hint={hint}
        tools={canChat ? <AnswerStylePicker from="page" /> : undefined}
      />
    </div>
  );

  const historyList = (variant: "sidebar" | "sheet") =>
    uid ? (
      <ChatHistory uid={uid} sync={!!user} onNew={newChat} onOpened={() => setSheet(false)} beforeSwitch={chat.stop} busy={chat.busy} variant={variant} />
    ) : (
      <p className="m-0 p-4 text-[14px] leading-relaxed text-fg-2">
        Your conversations show up here once you{" "}
        <button type="button" onClick={openAuthModal} className="inline font-semibold text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">
          sign in
        </button>
        . They are saved to your account for 90 days, on every device.
      </p>
    );

  const iconBtn = "grid h-11 w-11 shrink-0 place-items-center border border-transparent text-fg-3 hover:border-line-strong hover:text-fg";

  const topBar = (
    <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line bg-bg/95 px-2 backdrop-blur max-lg:sticky max-lg:top-[var(--hk-header-h,61px)] max-lg:z-20 sm:px-3">
      {wide ? (
        <button type="button" onClick={toggleSidebar} aria-label={sidebar ? "Hide chat history" : "Show chat history"} aria-expanded={sidebar} title={sidebar ? "Hide history" : "Show history"} className={iconBtn}>
          {sidebar ? <PanelLeftClose className="h-[18px] w-[18px]" aria-hidden /> : <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden />}
        </button>
      ) : (
        <button type="button" onClick={() => setSheet(true)} aria-label="Chat history" className={`${iconBtn} relative`}>
          <History className="h-[18px] w-[18px]" aria-hidden />
          {history.threads.length > 0 && <span aria-hidden className="absolute right-2 top-2 h-1.5 w-1.5 bg-signal" />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 flex-col px-1">
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3 w-3" aria-hidden />
          ask dsa mastery
          {ai?.preview && <span className="border border-line-strong px-1 text-fg-3">admin preview</span>}
        </span>
        <h1 className="m-0 truncate text-[14.5px] font-semibold leading-tight text-fg">{title}</h1>
      </div>
      {canChat && (
        <span className="hidden md:block">
          <QuotaLine quota={chat.quota} />
        </span>
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
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pb-8 pt-8 sm:px-6 lg:pt-[min(9vh,80px)]">
      <header className="flex flex-col gap-4">
        <h2 className="m-0 flex flex-col gap-2 font-display font-extrabold tracking-tightest text-fg">
          <span className="flex items-center gap-3 text-[clamp(34px,6.5vw,54px)] leading-[0.95]">
            <Sparkles className="h-[0.7em] w-[0.7em] shrink-0 text-signal-text" aria-hidden />
            <span className="min-w-0 break-words">
              {user && greeting ? greeting : "Ask DSA Mastery"}
              <span className="text-signal-text">.</span>
            </span>
          </span>
          <span className="text-[clamp(20px,3.4vw,28px)] leading-tight text-fg-3">What are you working on?</span>
        </h2>
        <p className="m-0 max-w-[620px] text-[16px] leading-relaxed text-fg-2">
          Ask about a concept, a pattern or a problem. The tutor answers from DSA Mastery&apos;s lessons, lectures and problems, with its sources, and coaches you through problems without giving the solution away.
        </p>
      </header>
      {wide && box}
      {uid && history.threads.length > 0 && (
        <section aria-labelledby="dsa-recent-h" className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="dsa-recent-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
              Recent chats
            </h3>
            {!(wide && sidebar) && (
              <button type="button" onClick={() => (wide ? toggleSidebar() : setSheet(true))} className="min-h-10 font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2 hover:text-fg">
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
      <section aria-labelledby="dsa-try-h" className="flex flex-col gap-3">
        <h3 id="dsa-try-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Try one{uid ? "" : " (sign in free)"}
        </h3>
        <ul className="m-0 grid list-none gap-2.5 p-0 sm:grid-cols-2">
          {groups.map((g) => (
            <li key={g.id} className="flex min-w-0 flex-col gap-2.5 border border-line-strong bg-surface p-3.5">
              <h4 className="m-0 flex min-w-0 items-center gap-2 text-[14.5px] font-semibold leading-snug text-fg">
                <span className="grid h-7 w-7 shrink-0 place-items-center border border-line-strong text-signal-text">
                  <g.icon className="h-4 w-4" aria-hidden />
                </span>
                {g.label}
              </h4>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {g.asks.map((x) => (
                  <li key={x} className="max-w-full">
                    <button
                      type="button"
                      onClick={() => (canChat ? ask(x) : (setText(x), composer.current?.focus(), !uid && setPinned("signin")))}
                      className="min-h-10 max-w-full break-words border border-dashed border-line-strong px-2.5 py-1.5 text-left text-[13.5px] leading-snug text-fg-2 hover:border-fg-3 hover:text-fg"
                    >
                      {x}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
      {canChat && <ChatFinePrint memory={chat.memory} history={history.remote} privacy={DSA_PRIVACY} />}
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
        onAsk={canChat ? (t) => (track("dsa_ask_followup", {}), ask(t)) : undefined}
        onAnswer={(qref, a) => void chat.send(a, { answerTo: qref })}
        onSave={chat.savePath}
        actions={{ feedback: false, share: false }}
      />
      {canChat && <ChatFinePrint memory={chat.memory} history={history.remote} privacy={DSA_PRIVACY} className="mt-2" />}
    </div>
  );

  const sourcesRail = (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="dsa-src-h" className="flex flex-col gap-2">
        <h2 id="dsa-src-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Sources in this chat
        </h2>
        {cited.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {cited.map(({ ref, s }) => (
              <li key={ref}>
                <Link href={s.href} className="group flex min-w-0 items-start gap-2.5 border border-line bg-bg px-3 py-2.5 hover:border-fg-3">
                  <SourceIcon kind={s.kind} className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-text" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-fg">{s.title}</span>
                    <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-4">{s.sub}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[13.5px] leading-relaxed text-fg-3">The lessons, lectures and problems the tutor cites show up here, so you can open them.</p>
        )}
      </section>
      <section aria-labelledby="dsa-con-h" className="flex flex-col gap-2">
        <h2 id="dsa-con-h" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
          Concepts
        </h2>
        <ul className="m-0 flex list-none flex-col p-0">
          {concepts.map((c) => (
            <li key={c.id}>
              <Link href={`/dsa/concepts/${c.id}`} className="flex min-h-10 items-center border-b border-line py-2 text-[13.5px] text-fg-2 hover:text-fg">
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
        <Link href="/dsa/problems" className="mt-1 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4">
          all problems →
        </Link>
      </section>
    </div>
  );

  /* ---------------------------------------------------------------- phones and tablets: the page scrolls */
  if (!wide)
    return (
      <main className="w-full min-w-0" style={{ paddingBottom: boxH + 12 }}>
        {topBar}
        {empty ? emptyState : thread}
        {follow.unseen && !empty && <NewMessagePill onClick={() => follow.toBottom()} className="fixed left-1/2 z-40 -translate-x-1/2" style={{ bottom: (kb > 0 ? kb : dockH) + boxH + 10 }} />}
        <div ref={boxRef} data-dock-avoid className="hk-safe-x fixed inset-x-0 z-40 border-t border-line bg-bg/95 px-3 pb-2 pt-2 backdrop-blur sm:px-6" style={{ bottom: kb > 0 ? kb : dockH }}>
          <div className="mx-auto w-full max-w-[760px]">{box}</div>
        </div>
        <Sheet open={sheet} onClose={() => setSheet(false)} side="left" label="Chat history">
          {historyList("sheet")}
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
          <div data-dock-avoid className="shrink-0 border-t border-line bg-bg px-6 pb-4 pt-3">
            <div className="mx-auto w-full max-w-[712px]">{box}</div>
          </div>
        )}
      </section>
      {rail && <aside aria-label="Sources and concepts" className="w-[320px] shrink-0 overflow-y-auto overscroll-contain border-l border-line bg-surface/60 p-5 2xl:w-[360px]">{sourcesRail}</aside>}
    </main>
  );
}
