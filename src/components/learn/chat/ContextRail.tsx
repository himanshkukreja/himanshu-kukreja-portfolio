"use client";

/**
 * The right side of /learn/chat: what helps next to the conversation, instead of empty space. In a conversation,
 * what the last answer brought comes first (its sources, its learning path or plan with Save); then the instant
 * results for what is typed (or was last asked), what is due for review and the learner's progress
 * (GET /api/learn/ai/chat/context, cached), and quick actions. A rail on wide screens, a sheet on smaller ones.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, CalendarPlus, Check, CircleHelp, Clock, Flame, Mic, Route, Sparkles, Target } from "lucide-react";
import { userFetch } from "@/components/learn/progress/userFetch";
import { atClock } from "@/lib/search/smart/engine";
import { KIND_LABEL } from "@/lib/search/smart/types";
import { citedRefs, type ChatSource } from "@/lib/ai/chat/text";
import { buildIcsForPath } from "./planIcs";
import ResultsRail from "./ResultsRail";
import SourceIcon from "./SourceIcon";
import type { Conversation } from "./useCourseChat";

type Ctx = {
  due: { kind: string; title: string; href: string; why: string; minutes: number }[];
  progress: { xp: number; streak: number; lessonsDone: number; lessonsTotal: number; week: { code: string; title: string } | null; next: { title: string; href: string; code: string; minutes: number } | null } | null;
};

export const QUICK_ACTIONS = [
  { label: "Quiz me", ask: "Quiz me on what I've been learning.", icon: CircleHelp },
  { label: "Start a mock", ask: "Start a mock interview with me.", icon: Mic },
  { label: "Make a plan", ask: "Make me a 2-week study plan for a system design interview.", icon: Route },
  { label: "What next?", ask: "What should I learn next?", icon: Target },
] as const;

const CACHE = "hk.chat.ctx";
/** due reviews and progress for the signed-in learner, kept 5 minutes in this tab */
function cached(uid: string | null): Ctx | null {
  try {
    const hit = JSON.parse(sessionStorage.getItem(CACHE) || "null") as { uid: string; at: number; v: Ctx } | null;
    return hit && hit.uid === uid && Date.now() - hit.at < 5 * 60_000 ? hit.v : null;
  } catch {
    return null;
  }
}
function useChatContext(uid: string | null): Ctx | null {
  const [ctx, setCtx] = useState<Ctx | null>(() => (typeof window === "undefined" ? null : cached(uid)));
  useEffect(() => {
    if (!uid || uid === "dev" || cached(uid)) return;
    let off = false;
    userFetch("/api/learn/ai/chat/context")
      .then((r) => (r.ok ? (r.json() as Promise<Ctx>) : null))
      .then((v) => {
        if (off || !v) return;
        setCtx(v);
        try {
          sessionStorage.setItem(CACHE, JSON.stringify({ uid, at: Date.now(), v }));
        } catch {
          /* blocked */
        }
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [uid]);
  return ctx;
}

const H = ({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) => (
  <h2 className="m-0 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
    {icon}
    {children}
  </h2>
);

function Source({ s, n }: { s: ChatSource; n: number }) {
  return (
    <li>
      <Link href={s.href} className="group flex min-h-11 min-w-0 items-start gap-2.5 border border-line bg-bg px-3 py-2.5 hover:border-fg-3">
        <span className="mt-0.5 grid h-5 min-w-5 shrink-0 place-items-center border border-line-strong font-mono text-[10.5px] font-semibold text-signal-text">{n}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-fg-3">
            <SourceIcon kind={s.kind} className="h-3 w-3 text-signal-text" />
            {s.kind === "guide" ? "Site help" : KIND_LABEL[s.kind].tag}
            {s.kind === "moment" && s.at >= 0 && (
              <span className="inline-flex items-center gap-1 text-fg-2">
                <Clock className="h-3 w-3" aria-hidden />
                {atClock(s.at)}
              </span>
            )}
          </span>
          <span className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-fg group-hover:underline">{s.title}</span>
        </span>
      </Link>
    </li>
  );
}

export default function ContextRail({
  conv,
  q,
  headers,
  uid,
  canChat,
  onAsk,
  onSave,
  onNavigate,
  onSignIn,
}: {
  conv: Conversation;
  q: string;
  headers?: Record<string, string>;
  uid: string | null;
  canChat: boolean;
  onAsk: (text: string) => void;
  onSave: (pref: string) => void;
  /** a link was followed (close the sheet) */
  onNavigate?: () => void;
  onSignIn?: () => void;
}) {
  const ctx = useChatContext(uid);
  // the sources of the latest answer that cited any (an interviewer's line or a quiz prompt cites none)
  const refsOf = (m: Conversation["messages"][number]) => (m.cites ?? citedRefs(m.text)).filter((r) => conv.sources[r]);
  const lastAnswer = [...conv.messages].reverse().find((m) => m.role === "assistant" && m.text && !m.error && refsOf(m).length > 0);
  const cited = lastAnswer ? refsOf(lastAnswer).map((r) => conv.sources[r]) : [];
  const pathRef = [...conv.messages].reverse().flatMap((m) => [...(m.paths ?? [])].reverse())[0];
  const path = pathRef ? conv.paths[pathRef] : null;
  const pathSaved = path && (path.saved === "saved" || path.saved === "updated");

  const quick = canChat && (
    <section aria-label="Quick actions" className="flex flex-col gap-2">
      <H icon={<Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />}>Quick actions</H>
      <div className="grid grid-cols-2 gap-1.5">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} type="button" onClick={() => onAsk(a.ask)} className="flex min-h-11 items-center gap-2 border border-line-strong bg-bg px-2.5 text-left text-[13.5px] font-semibold text-fg-2 hover:border-signal hover:text-fg">
            <a.icon className="h-4 w-4 shrink-0 text-signal-text" aria-hidden />
            {a.label}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6" onClick={(e) => (e.target as HTMLElement).closest("a") && onNavigate?.()}>
      {cited.length > 0 && (
        <section aria-label="This answer's sources" className="flex flex-col gap-2">
          <H>Sources of the last answer</H>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {cited.slice(0, 6).map((s, i) => (
              <Source key={s.id} s={s} n={i + 1} />
            ))}
          </ul>
        </section>
      )}

      {path && (
        <section aria-label={`Learning path: ${path.title}`} className="flex flex-col gap-2.5 border border-line-strong bg-bg p-3">
          <H icon={<Route className="h-3.5 w-3.5 text-signal-text" aria-hidden />}>{path.plan ? "Your study plan" : "Your learning path"}</H>
          <span className="font-display text-[17px] font-bold leading-tight text-fg">{path.title}</span>
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {path.steps.slice(0, 6).map((st, i) => {
              const src = conv.sources[st.ref];
              if (!src) return null;
              return (
                <li key={st.ref}>
                  <Link href={src.href} className="flex min-h-9 items-start gap-2 py-1 text-[13px] leading-snug text-fg-2 hover:text-fg">
                    <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center bg-signal font-mono text-[11px] font-bold text-on-signal">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      {st.date && <span className="mr-1 font-mono text-[11px] text-signal-text">{new Date(`${st.date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })}</span>}
                      {src.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap gap-1.5">
            {pathSaved ? (
              <Link href="/learn/saved" className="inline-flex min-h-10 items-center gap-1.5 border border-ok px-3 font-mono text-[12px] text-fg">
                <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> Saved · open
              </Link>
            ) : (
              <button type="button" onClick={() => onSave(path.pref)} className="inline-flex min-h-10 items-center gap-1.5 bg-signal px-3 font-mono text-[12px] font-semibold text-on-signal">
                <Bookmark className="h-3.5 w-3.5" aria-hidden /> Save path
              </button>
            )}
            {path.plan && path.steps.some((x) => x.date) && (
              <button
                type="button"
                onClick={() => {
                  const ics = buildIcsForPath(path, conv.sources);
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                  a.download = `${path.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "study-plan"}.ics`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                className="inline-flex min-h-10 items-center gap-1.5 border border-line-strong px-3 font-mono text-[12px] text-fg-2 hover:text-fg"
              >
                <CalendarPlus className="h-3.5 w-3.5" aria-hidden /> .ics
              </button>
            )}
          </div>
        </section>
      )}


      {!conv.messages.length && quick}

      {!uid && (
        <section aria-label="Sign in" className="flex flex-col gap-2.5 border border-line-strong bg-bg p-3.5">
          <H icon={<Sparkles className="h-3.5 w-3.5 text-signal-text" aria-hidden />}>The tutor</H>
          <p className="m-0 text-[13.5px] leading-relaxed text-fg-2">Sign in free to get answers with their sources, learning paths you can save, quizzes from the course and what to review next. Your chats are kept for 90 days, on every device.</p>
          {onSignIn && (
            <button type="button" onClick={onSignIn} className="min-h-11 self-start bg-signal px-4 text-[14px] font-semibold text-on-signal">
              Sign in free
            </button>
          )}
        </section>
      )}

      <ResultsRail q={q} headers={headers} />

      {ctx && ctx.due.length > 0 && (
        <section aria-label="Due for review" className="flex flex-col gap-2">
          <H icon={<Clock className="h-3.5 w-3.5 text-signal-text" aria-hidden />}>Due for review</H>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {ctx.due.map((d) => (
              <li key={d.href + d.title}>
                <Link href={d.href} className="group flex min-h-11 flex-col gap-0.5 border-l-2 border-signal bg-bg py-2 pl-3 pr-2 hover:bg-surface-2">
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold text-fg group-hover:underline">{d.title}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-fg-4">{d.minutes} min</span>
                  </span>
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-fg-3">{d.why}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ctx?.progress && (
        <section aria-label="Your progress" className="flex flex-col gap-2.5">
          <H>Your progress</H>
          <div className="grid grid-cols-3 border border-line bg-bg">
            {[
              { k: "XP", v: ctx.progress.xp.toLocaleString() },
              { k: "streak", v: `${ctx.progress.streak}d`, icon: <Flame className="h-3 w-3 text-signal-text" aria-hidden /> },
              { k: "lessons", v: `${ctx.progress.lessonsDone}/${ctx.progress.lessonsTotal}` },
            ].map((x, i) => (
              <div key={x.k} className={`flex flex-col gap-0.5 px-3 py-2 ${i ? "border-l border-line" : ""}`}>
                <span className="font-display text-[18px] font-bold leading-none text-fg">{x.v}</span>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-fg-4">
                  {x.icon}
                  {x.k}
                </span>
              </div>
            ))}
          </div>
          <div aria-hidden className="h-1 bg-surface-2">
            <div className="h-full bg-signal" style={{ width: `${Math.round((100 * ctx.progress.lessonsDone) / Math.max(1, ctx.progress.lessonsTotal))}%` }} />
          </div>
          {ctx.progress.next && (
            <Link href={ctx.progress.next.href} className="group flex min-h-11 items-center gap-2 border border-line-strong bg-bg px-3 py-2 hover:border-fg-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-4">up next{ctx.progress.next.code ? ` · ${ctx.progress.next.code}` : ""}</span>
                <span className="truncate text-[13.5px] font-semibold text-fg group-hover:underline">{ctx.progress.next.title}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
            </Link>
          )}
        </section>
      )}

      {conv.messages.length > 0 && quick}
    </div>
  );
}
