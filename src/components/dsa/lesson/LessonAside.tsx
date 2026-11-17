"use client";

/**
 * The lesson's aside (300 px on wide screens; below that it folds into the end of Learn): ask the lesson, the lesson's
 * 60-second clips, "Builds on / Used later in" (only when the content has that data), "In real systems" (the lesson's
 * own SDM links plus the learner's connections) and the cheat sheet.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import ConnectedPanel from "@/components/learn/connections/ConnectedPanel";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { useAuth } from "@/contexts/AuthContext";

export type AsideLink = { href: string; title: string };
type Rs = { href: string; title: string };

const label = "m-0 font-mono text-[12px] uppercase tracking-[0.06em] text-fg-3";
const box = "flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-[18px]";
const row = "flex min-h-9 items-center gap-2 text-[14px] leading-snug text-fg underline-offset-4 hover:underline";

export default function LessonAside({
  lessonId,
  rootRef,
  shorts,
  shortsHref,
  buildsOn,
  usedLater,
  cheatsheet,
  className = "",
}: {
  lessonId: string;
  rootRef: React.RefObject<HTMLElement | null>;
  shorts: AsideLink[];
  shortsHref: string | null;
  buildsOn?: AsideLink[];
  usedLater?: AsideLink[];
  cheatsheet: string | null;
  className?: string;
}) {
  const { user } = useAuth();
  const ai = useAiStatus();
  const [q, setQ] = useState("");
  const [systems, setSystems] = useState<Rs[]>([]);
  // the same rule as the chat's floating button: guests see it (the panel asks them to sign in), others when it is on for them
  const canAsk = !user || !!ai?.features["dsa-chat"];

  // the lesson's `:::realsystems` links, read from its own box (server-rendered, so nothing is added to the lesson text)
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => {
      const seen = new Set<string>();
      const out: Rs[] = [];
      root.querySelectorAll<HTMLAnchorElement>(".dsa-realsystems .dsa-rs-links a").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (!href || seen.has(href)) return;
        seen.add(href);
        // the link's own words, without the small tag in front of them ("Lesson")
        const c = a.cloneNode(true) as HTMLElement;
        c.querySelectorAll(".dsa-tag,.dsa-rs-kind,[data-sd-chrome]").forEach((n) => n.remove());
        out.push({ href, title: (c.textContent || a.textContent || href).trim() });
      });
      setSystems((prev) => (prev.length === out.length && prev.every((p, i) => p.href === out[i].href && p.title === out[i].title) ? prev : out));
    };
    read();
    // titles arrive when the page is served; one more look after hydration is enough
    const t = window.setTimeout(read, 800);
    return () => window.clearTimeout(t);
  }, [rootRef]);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    openCourseChat(text ? { q: text, send: true } : {});
    setQ("");
  };

  return (
    <aside aria-label="About this lesson" data-focus-hide data-reader-right className={`min-w-0 flex-col gap-4 xl:sticky xl:top-[76px] xl:max-h-[calc(100vh-92px)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:pb-1 ${className}`}>
      {canAsk ? (
        <form onSubmit={ask} className={box}>
          <label htmlFor="dsa-ask-lesson" className={label}>
            Ask about this lesson
          </label>
          <input
            id="dsa-ask-lesson"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="text"
            placeholder="Ask anything about this lesson"
            className="min-h-10 w-full rounded-[10px] border border-line bg-bg px-3 text-[14px] text-fg placeholder:text-fg-4 [@media(pointer:coarse)]:min-h-11"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-fg-4">Answers from this lesson, with sources.</span>
            <button type="submit" className="inline-flex min-h-9 shrink-0 items-center rounded-[9px] bg-signal px-3 text-[13px] font-semibold text-on-signal hover:bg-[var(--c-signal-strong,var(--c-signal))]">
              Ask
            </button>
          </div>
        </form>
      ) : null}

      {shorts.length ? (
        <div className={box}>
          <p className={label}>60-second clips</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {shorts.slice(0, 4).map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={row}>
                  <span aria-hidden className="text-[11px] text-signal-text">
                    ▶
                  </span>
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
          {shortsHref && shorts.length > 4 ? (
            <Link href={shortsHref} className="text-[13px] text-fg-3 hover:text-fg">
              all {shorts.length} clips
            </Link>
          ) : null}
        </div>
      ) : null}

      {buildsOn?.length || usedLater?.length ? (
        <div className={box}>
          {buildsOn?.length ? (
            <>
              <p className={label}>Builds on</p>
              <ul className="m-0 flex list-none flex-col p-0">
                {buildsOn.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={row}>
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {usedLater?.length ? (
            <>
              <p className={`${label} mt-1`}>Used later in</p>
              <ul className="m-0 flex list-none flex-col p-0">
                {usedLater.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className={row}>
                      {l.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {systems.length ? (
        <div className={box}>
          <p className={label}>In real systems</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {systems.slice(0, 4).map((s) => (
              <li key={s.href}>
                <Link href={s.href} className={row}>
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ConnectedPanel page={`dsa-concept:${lessonId}`} />

      {cheatsheet ? (
        <Link href={cheatsheet} className="inline-flex min-h-12 items-center justify-between rounded-2xl border border-line bg-surface px-[18px] text-[14px] font-medium text-fg hover:bg-surface-2">
          Cheat sheet
          <span aria-hidden className="text-signal-text">
            →
          </span>
        </Link>
      ) : null}
    </aside>
  );
}
