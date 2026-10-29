"use client";

/**
 * You → Tutor memory: what the course chat remembers about your learning between chats (goals, level, topics
 * studied and found hard, how you like answers, recent practice results, a line per past chat), with Clear
 * and an on/off switch. The learner's own row only (/api/learn/ai/chat/memory, verified session).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Brain, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";
import { isEmptyMemory, type ChatMemory } from "@/lib/ai/chat/memory-model";

type State = { available: boolean; paused: boolean; memory: ChatMemory };

function Group({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {items.map((x) => (
          <li key={x} className="border border-line-strong px-2.5 py-1 text-[14px] text-fg-2">
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TutorMemory() {
  const { user, loading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [s, setS] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    userFetch("/api/learn/ai/chat/memory")
      .then(async (r) => {
        if (!r.ok) throw new Error("Couldn't load what the tutor remembers.");
        setS((await r.json()) as State);
      })
      .catch((e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const clear = async () => {
    setBusy(true);
    const r = await userFetch("/api/learn/ai/chat/memory", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirm(false);
    if (r?.ok) {
      track("chat_memory", { action: "clear" });
      load();
    } else setErr("Couldn't clear it just now. Try again.");
  };
  const toggle = async (paused: boolean) => {
    setBusy(true);
    const r = await userFetch("/api/learn/ai/chat/memory", { method: "PATCH", body: JSON.stringify({ paused }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      track("chat_memory", { action: paused ? "off" : "on" });
      load();
    } else setErr("Couldn't change it just now. Try again.");
  };

  const m = s?.memory;
  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-7 px-4 pb-32 pt-10 sm:px-6">
      <section aria-labelledby="tm-title" className="flex flex-col gap-3.5">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ tutor memory</span>
        <h1 id="tm-title" className="m-0 font-display text-[clamp(40px,6.5vw,80px)] font-extrabold leading-[0.92] tracking-tightest text-fg">
          What the tutor remembers<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[660px] text-[17px] leading-relaxed text-fg-2">
          So a new chat can pick up where you left off, the{" "}
          <Link href="/learn/search" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
            course tutor
          </Link>{" "}
          keeps short notes about your learning: your goals, your level, what you studied and found hard, how you like answers, recent practice results and a line about each chat. Only learning
          notes: no contact details, no links. You can clear them or switch memory off at any time.
        </p>
      </section>

      {loading ? null : !user ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-dashed border-line-strong px-4 py-4">
          <span className="text-[15px] text-fg-2">The tutor and its memory are for signed-in learners.</span>
          <button type="button" onClick={openAuthModal} className="min-h-11 bg-signal px-4 font-semibold text-on-signal">
            Sign in free
          </button>
        </div>
      ) : err ? (
        <p className="m-0 text-fg-3" role="status">
          {err}
        </p>
      ) : !s ? (
        <p className="m-0 font-mono text-[13px] text-fg-3">loading…</p>
      ) : !s.available ? (
        <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[15px] text-fg-2">Memory isn&apos;t switched on for the course yet. The tutor still knows your progress and the page you are on in every chat.</p>
      ) : (
        <>
          <section aria-label="Memory switch" className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface px-4 py-3.5">
            <span className="flex items-center gap-2.5 text-[15px] text-fg">
              <Brain className="h-4 w-4 text-signal-text" aria-hidden />
              {s.paused ? "Memory is off: the tutor doesn't keep notes between chats." : "Memory is on: the tutor keeps notes between chats."}
            </span>
            <button type="button" disabled={busy} onClick={() => toggle(!s.paused)} className={`min-h-10 px-3.5 font-mono text-[12.5px] ${s.paused ? "bg-signal font-semibold text-on-signal" : "border border-line-strong text-fg-2 hover:text-fg"}`}>
              {s.paused ? "Turn memory on" : "Turn memory off (and forget)"}
            </button>
          </section>

          {m && !isEmptyMemory(m) ? (
            <section aria-label="What it remembers" className="flex flex-col gap-5 border border-line-strong bg-surface p-5">
              {m.goals.length > 0 && <Group label="your goals" items={m.goals} />}
              {m.level && <Group label="your level" items={[m.level]} />}
              <Group label="how you like answers" items={m.prefs} />
              <Group label="studied" items={m.studied} />
              <Group label="found hard" items={m.struggles} />
              <Group label="recent practice" items={m.quiz} />
              {m.sessions.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">past chats</span>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {m.sessions.map((x) => (
                      <li key={`${x.at}${x.chat}`} className="flex gap-3 text-[14px] text-fg-2">
                        <span className="shrink-0 font-mono text-[12px] text-fg-4">{x.at}</span>
                        {x.summary}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                {confirm ? (
                  <>
                    <span className="text-[14px] text-fg-2">Forget all of this? It can&apos;t be undone.</span>
                    <button type="button" disabled={busy} onClick={clear} className="min-h-10 bg-bad px-3.5 font-mono text-[12.5px] font-semibold text-white">
                      Yes, clear it
                    </button>
                    <button type="button" onClick={() => setConfirm(false)} className="min-h-10 border border-line-strong px-3.5 font-mono text-[12.5px] text-fg-2">
                      Keep it
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirm(true)} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3.5 font-mono text-[12.5px] text-fg-2 hover:border-bad hover:text-bad">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear memory
                  </button>
                )}
                {m.updatedAt > 0 && <span className="font-mono text-[11px] text-fg-4">updated {new Date(m.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
              </div>
            </section>
          ) : (
            !s.paused && <p className="m-0 border border-dashed border-line-strong px-4 py-4 text-[15px] text-fg-3">Nothing yet. Chat with the tutor for a few messages and its notes show up here.</p>
          )}
          <p className="m-0 text-[12px] leading-relaxed text-fg-4">
            The notes are written by a small AI model (Anthropic&apos;s Claude) from your chats and kept with your account; only you and the site can read them. Your chat messages themselves are kept 90
            days to stop abuse and improve the tutor, then deleted.
          </p>
        </>
      )}
    </main>
  );
}
