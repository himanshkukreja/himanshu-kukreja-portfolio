"use client";

/**
 * First-visit context for readers who land on a lesson from outside (search, a shared link): most of
 * them read one page and leave without knowing it is part of a free course. A small floating card
 * says where they are and offers the course map or the start. Shown once per browser, never to
 * someone who has already opened another course page; dismissible.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/track";
import { COURSE_HREF } from "@/components/site/LearnNav";
import type { ReaderMeta } from "./types";

const SEEN = "hk.learn.seen";

export default function LandingContext({ meta }: { meta: ReaderMeta }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = !!window.localStorage.getItem(SEEN);
      window.localStorage.setItem(SEEN, String(Date.now()));
    } catch {
      return; // no storage: don't risk showing it on every page
    }
    const ref = document.referrer;
    const external = !ref || new URL(ref, location.href).host !== location.host;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser-only state (storage, referrer) after mount
    if (!seen && external) setShow(true);
  }, []);
  if (!show) return null;
  const where = meta.kind === "bonus" ? "a side quest" : `${meta.shortLabel} of ${meta.weekLabel} · ${meta.weekTopic}`;
  const close = () => {
    setShow(false);
    track("landing_context", { action: "dismiss" });
  };
  return (
    // floating, not in the page flow: appearing after load must not push the lesson down (layout shift)
    <aside
      aria-label="About this course"
      className="hk-safe-x fixed inset-x-3 z-40 mx-auto flex max-w-[760px] flex-wrap items-center gap-x-4 gap-y-2 border border-signal/60 bg-surface/95 px-4 py-3 text-sm text-fg-2 shadow-lg backdrop-blur lg:inset-x-auto lg:right-6 lg:max-w-[520px]"
      // clear of the orange "Ask AI" pill and the reading bar under it (they sit up to ~124px from the bottom)
      style={{ bottom: "calc(var(--site-dock, 0px) + 132px)" }}
    >
      <p className="m-0 min-w-0 flex-[1_1_300px]">
        You&apos;re reading <span className="text-fg">{where}</span> in <span className="text-fg">System Design Mastery</span>, a free course with interview bosses, trials and mock interviews. No sign-up needed.
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <Link href={COURSE_HREF} onClick={() => track("landing_context", { action: "map" })} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-xs text-fg hover:bg-surface-2">
          course map →
        </Link>
        <Link href={`${COURSE_HREF}/week-00-foundations/foundations-part-1-basic-concepts`} onClick={() => track("landing_context", { action: "start" })} className="inline-flex min-h-10 items-center bg-signal px-3 font-mono text-xs font-semibold text-on-signal hover:brightness-110">
          start at week 0 →
        </Link>
        <button type="button" onClick={close} aria-label="Dismiss" className="grid h-10 w-10 place-items-center text-fg-3 hover:text-fg">
          ✕
        </button>
      </span>
    </aside>
  );
}
