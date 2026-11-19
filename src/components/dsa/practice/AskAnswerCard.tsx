"use client";

/**
 * The AI answer above the Practice results, for a question typed in the box: loading, the answer (2 to 5 sentences with the
 * lessons and problems it came from), a soft sign-in card for a guest, or a quiet note when it could not answer. The state
 * comes from cardState (src/lib/dsa/search/ask.ts); the small print opens the tutor with the question ready to send.
 */
import Link from "next/link";
import { BookOpen, Code2, Lock, Sparkles } from "lucide-react";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { track } from "@/lib/track";
import type { AskAnswer, CardState } from "@/lib/dsa/search/ask";

const RING = "bg-[linear-gradient(115deg,var(--c-signal),var(--c-line-strong)_50%,var(--c-signal))] p-px rounded-[16px]";
const KICK = "inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-signal-text";

export default function AskAnswerCard({ state, question, ask, message, onSignIn }: { state: CardState; question: string; ask?: AskAnswer; message: string; onSignIn: () => void }) {
  if (state === "none") return null;
  const tutor = () => {
    track("dsa_practice_ask_tutor", { from: "answer-card" });
    openCourseChat({ q: question, send: false });
  };

  if (state === "guest")
    return (
      <section aria-label="AI answer" className={RING}>
        <div className="flex flex-col gap-2.5 bg-raised p-4 sm:p-5 rounded-[15px]">
          <span className={KICK}>
            <Lock className="h-3.5 w-3.5" aria-hidden />
            free for now
          </span>
          <p className="m-0 text-[16px] font-semibold text-fg">Sign in free to get AI answers</p>
          <p className="m-0 max-w-[60ch] text-[14px] leading-relaxed text-fg-2">Questions like this one get a short answer from the course, with the lessons and problems to open next. The problems that match are below.</p>
          <button type="button" onClick={onSignIn} className="min-h-11 self-start bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-text rounded-[10px]">
            Sign in free
          </button>
        </div>
      </section>
    );

  if (state === "loading")
    return (
      <section aria-label="AI answer" aria-busy="true" className={RING}>
        <div className="flex flex-col gap-3 bg-surface p-4 sm:p-5 rounded-[15px]">
          <span className={KICK}>
            <Sparkles className="h-3.5 w-3.5 motion-safe:animate-pulse" aria-hidden />
            Reading the course…
          </span>
          <div className="flex flex-col gap-2" aria-hidden>
            <span className="h-3 w-full bg-surface-2 motion-safe:animate-pulse rounded-full" />
            <span className="h-3 w-[92%] bg-surface-2 motion-safe:animate-pulse rounded-full" />
            <span className="h-3 w-[64%] bg-surface-2 motion-safe:animate-pulse rounded-full" />
          </div>
        </div>
      </section>
    );

  if (state === "error" || state === "empty")
    return (
      <section aria-label="AI answer" className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-surface px-4 py-3 rounded-[14px]">
        <span className={KICK}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          AI answer
        </span>
        <p className="m-0 min-w-0 flex-1 text-[14px] leading-relaxed text-fg-2">
          {state === "empty" ? "That one isn't about data structures or algorithms, so there is no answer to give. The matching problems are below." : message || "The AI answer is resting for a moment. The matching problems are below."}
        </p>
        {state === "error" ? (
          <button type="button" onClick={tutor} className="min-h-10 font-mono text-[12px] text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
            Ask the tutor
          </button>
        ) : null}
      </section>
    );

  const links = ask?.links ?? [];
  return (
    <section aria-label="AI answer" className={RING}>
      <div className="flex flex-col gap-3 bg-surface p-4 sm:p-5 rounded-[15px]">
        <span className={KICK}>
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Answer from the course
        </span>
        <p className="m-0 max-w-[72ch] text-[15.5px] leading-[1.65] text-fg">{ask?.text}</p>
        {links.length ? (
          <ul aria-label="Where to read more" className="m-0 flex list-none flex-wrap gap-2 p-0">
            {links.map((l) => (
              <li key={l.href} className="min-w-0 max-w-full">
                <Link
                  href={l.href}
                  onClick={() => track("dsa_practice_answer_link", { kind: l.kind })}
                  className="inline-flex min-h-10 max-w-full items-center gap-2 border border-line-strong bg-surface-2 px-3 py-1.5 text-[13.5px] font-medium text-fg hover:border-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text rounded-[10px]"
                >
                  {l.kind === "problem" ? <Code2 className="h-4 w-4 shrink-0 text-signal-text" aria-hidden /> : <BookOpen className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />}
                  <span className="min-w-0 truncate">{l.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="m-0 font-mono text-[11.5px] leading-relaxed text-fg-3">
          AI answer · may be imperfect ·{" "}
          <button type="button" onClick={tutor} className="text-signal-text underline decoration-line-strong underline-offset-4 hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal-text">
            Ask the tutor for more
          </button>
        </p>
      </div>
    </section>
  );
}
