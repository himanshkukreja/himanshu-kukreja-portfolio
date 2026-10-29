"use client";

/**
 * /learn/search: the course chat, with instant results beside it.
 *
 * - Typing shows instant results right away (deterministic smart search, no AI, for everyone).
 * - Ask (or Enter) starts or continues the conversation with the course tutor (signed in): answers with
 *   sources, lecture moments at the second, learning paths to save, practice questions graded against the
 *   course's own answers, and next steps from your progress.
 * - Desktop: the results sit in a rail beside the chat. Phones: a Chat / Results switch.
 * - Links: ?q= opens with those results (and the text in the box); ?q=…&ask=1 sends it to the tutor; the
 *   full grouped results page is ?q=…&view=results.
 *
 * The page shell is static (ISR); everything per learner loads here, on the client.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquarePlus, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import SmartSearch from "@/components/learn/search/SmartSearch";
import ExampleGallery from "@/components/learn/search/ExampleGallery";
import { SEARCH_EXAMPLES, type SearchExample } from "@/lib/search/smart/examples";
import { isNaturalQuery } from "@/lib/search/smart/text";
import { track } from "@/lib/track";
import ChatComposer, { type ComposerHandle } from "./ChatComposer";
import ChatThread from "./ChatThread";
import ResultsRail from "./ResultsRail";
import { ChatFinePrint, QuotaLine } from "./ChatMeta";
import { useCourseChat } from "./useCourseChat";

/** Conversation starters: what the tutor can do (and the AI examples from the search examples). */
const STARTERS = [
  "What should I learn next?",
  "Quiz me on caching",
  "Make me a 2-week plan for a system design interview",
  "Show me the lecture moment on consistent hashing",
  ...SEARCH_EXAMPLES.filter((x) => x.ai).map((x) => x.text).slice(0, 3),
  "Where are the mock interviews?",
];

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
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const ai = useAiStatus();
  const uid = dev ? "dev" : user?.id ?? null;
  const chat = useCourseChat(uid, { devHeaders });
  const canChat = dev || (!!user && !!ai?.features["course-chat"]);
  const [text, setText] = useState(q);
  const [tab, setTab] = useState<"chat" | "results">("chat");
  const [count, setCount] = useState<number | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastAsk = [...chat.conv.messages].reverse().find((m) => m.role === "user" && !m.answerTo)?.text ?? "";
  const railQ = useDebounced(text.trim() || q || lastAsk, 280);
  const empty = chat.conv.messages.length === 0;

  // a new ?q= (a link, the header box) replaces what's in the box
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setText(q);
  }

  const ask = useCallback(
    (t: string) => {
      const v = t.trim();
      if (!v) return;
      if (!uid) return openAuthModal();
      if (!canChat) return;
      setText("");
      setTab("chat");
      void chat.send(v);
      track("chat_ask", { q_len: v.length, natural: isNaturalQuery(v) });
    },
    [canChat, chat, openAuthModal, uid],
  );

  // ?q=…&ask=1 (the header box's "Ask" row): send it once, then keep only ?q= so a reload doesn't send it again
  const sentFor = useRef("");
  useEffect(() => {
    if (!asked || !q || sentFor.current === q || loading) return;
    if (!dev && (!user || !ai)) return;
    sentFor.current = q;
    // the URL asked for it (?ask=1): send once, as if the learner pressed Ask
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canChat) ask(q);
    router.replace(`/learn/search?q=${encodeURIComponent(q)}${dev ? "&preview=1" : ""}`, { scroll: false });
  }, [asked, q, loading, user, ai, canChat, ask, router, dev]);

  const search = useCallback(() => {
    const v = text.trim();
    if (!v) return;
    setTab("results");
    router.replace(`/learn/search?q=${encodeURIComponent(v)}${dev ? "&preview=1" : ""}`, { scroll: false });
  }, [text, router, dev]);

  // keep the newest message in view while it streams
  useEffect(() => {
    if (!chat.busy) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [chat.draft, chat.busy, chat.conv.messages.length]);

  const pick = (x: SearchExample) => {
    if (x.ai && canChat) ask(x.text);
    else {
      setText(x.text);
      setTab("results");
    }
  };

  const hint = !uid ? (
    <>
      Results appear as you type, for everyone.{" "}
      <button type="button" onClick={openAuthModal} className="underline decoration-line-strong underline-offset-2 hover:text-fg-2">
        Sign in free
      </button>{" "}
      to chat with the course tutor.
    </>
  ) : !canChat ? (
    ai ? "The tutor is resting right now. Instant results still work." : "Checking the tutor…"
  ) : (
    <>Enter to ask · Shift+Enter for a new line · the search button shows results only</>
  );

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-40 pt-16 sm:px-6 lg:pb-16 lg:pt-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <section aria-label="Course tutor" className={`flex min-w-0 flex-col gap-5 ${tab === "results" ? "max-lg:hidden" : ""}`}>
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-label text-signal-text">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                Learn · ask the course
                {ai?.preview && <span className="border border-line-strong px-1.5 py-px text-fg-3">admin preview</span>}
              </span>
              <span className="flex items-center gap-3">
                {canChat && <QuotaLine quota={chat.quota} />}
                {!empty && (
                  <button type="button" onClick={chat.reset} className="inline-flex min-h-9 items-center gap-1.5 border border-line-strong px-2.5 font-mono text-[12px] text-fg-2 hover:text-fg">
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                    New chat
                  </button>
                )}
              </span>
            </div>
            {empty && (
              <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-tightest text-fg">
                What do you want to learn<span className="text-signal-text">?</span>
              </h1>
            )}
            {empty && (
              <p className="m-0 max-w-[640px] text-[16px] leading-relaxed text-fg-2">
                Ask in plain words. The tutor answers from the course with its sources, finds the exact second in a lecture, builds a path you can save, quizzes you on the course&apos;s own questions and
                suggests what to do next from your progress.
              </p>
            )}
          </header>

          {!empty && (
            <div className="flex flex-col gap-6">
              <ChatThread
                conv={chat.conv}
                status={chat.status}
                draft={chat.draft}
                onAnswer={(qref, a) => void chat.send(a, { answerTo: qref })}
                onSave={chat.savePath}
                actions={{ feedback: chat.feedback, share: true, onRate: chat.rate }}
                mock={{ onNext: chat.nextPhase, onEnd: () => void chat.send("End the interview and score me.", { mockEnd: true }), onLeave: chat.leaveMock }}
              />
              {chat.fallback && (
                <button type="button" onClick={() => setTab("results")} className="self-start font-mono text-[12px] text-fg-3 underline decoration-line-strong underline-offset-2 lg:hidden">
                  See the instant results →
                </button>
              )}
              <div ref={endRef} />
            </div>
          )}

          <div className={`${empty ? "" : "sticky bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] z-20 bg-bg pb-2 pt-2 lg:bottom-0 lg:pb-4"}`}>
            <ChatComposer
              ref={composer}
              value={text}
              onChange={setText}
              onAsk={() => ask(text)}
              onSearch={search}
              onStop={chat.stop}
              busy={chat.busy}
              canAsk={canChat || !uid}
              autoFocus={empty && !q}
              hint={hint}
            />
          </div>

          {empty && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Try</span>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {STARTERS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      onClick={() => (canChat ? ask(s) : uid ? setText(s) : openAuthModal())}
                      className="min-h-10 border border-dashed border-line-strong px-3 text-left text-[14px] text-fg-2 hover:border-fg-3 hover:text-fg"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canChat && <ChatFinePrint memory={chat.memory} />}

          {empty && (
            <details className="group border-t border-line pt-4">
              <summary className="cursor-pointer list-none font-mono text-[12px] uppercase tracking-label text-fg-3 hover:text-fg">
                <span className="group-open:hidden">+ what instant search finds</span>
                <span className="hidden group-open:inline">− what instant search finds</span>
              </summary>
              <div className="mt-4">
                <ExampleGallery onPick={pick} signedIn={!!user} compact />
              </div>
            </details>
          )}
        </section>

        <aside aria-label="Instant results" className={`min-w-0 lg:sticky lg:top-[calc(var(--hk-header-h,61px)+16px)] lg:max-h-[calc(100dvh-var(--hk-header-h,61px)-32px)] lg:overflow-y-auto ${tab === "chat" ? "max-lg:hidden" : ""}`}>
          <ResultsRail q={railQ} headers={devHeaders} onCount={setCount} />
        </aside>
      </div>

      {/* phones: switch between the chat and the results */}
      <div role="tablist" aria-label="Show" className="fixed inset-x-0 top-[calc(var(--hk-header-h,61px))] z-30 flex border-b border-line bg-bg/95 backdrop-blur lg:hidden">
        {(["chat", "results"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-10 flex-1 font-mono text-[12px] uppercase tracking-label ${tab === t ? "text-fg shadow-[inset_0_-2px_0_var(--c-signal)]" : "text-fg-3"}`}
          >
            {t}
            {t === "results" && count !== null ? ` ${count}` : ""}
          </button>
        ))}
      </div>
    </main>
  );
}
