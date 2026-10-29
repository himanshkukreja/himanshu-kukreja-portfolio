"use client";

/**
 * "Design it first" on a capstone (boss lesson). Right before the first solution phase, a panel with
 * the capstone's own brief (its whiteboard and requirements) and a button to the design canvas, whose
 * board for this capstone (prompt key capstone:<week>) starts with the title and the requirements on a
 * sticky note. Until the learner has saved a design or pressed "Skip, show me the solution", the
 * solution phases are folded: the first shows as a short blurred teaser, the rest collapse to nothing.
 * After that: "Compare with my design" (their drawing next to the capstone's architecture) and the
 * canvas AI review.
 *
 * Rules the fold keeps:
 * - Visual only, client only. The server HTML is never folded (crawlers and no-JS readers get it all);
 *   the stage sections stay in the DOM untouched (no attribute or text change), so search, Listen,
 *   highlights and the stage tracker read them as before. The fold is a stylesheet keyed on
 *   html[data-df-gate] and the stage ids.
 * - Any way of reaching into the solution opens it for this visit (not remembered): a #hash, ?at= or
 *   ?highlight= link, the stage rail / contents / resume jumps (layout.ts announceJump), an in-page
 *   link, keyboard focus moving into it, Listen reading it, and printing.
 * - Boss mode brings its own reveal-as-you-go, so the fold and the panel step aside while it's open.
 *
 * Remembered per capstone in the game flags (designFirst:<week>, synced to the account), set here on
 * skip and by the canvas editor once the learner has drawn something.
 */
import "./designFirst.css";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ChevronDown, Columns2, PenTool } from "lucide-react";
import { useGame } from "@/game/GameProvider";
import { REVEAL_EVENT } from "@/components/learn/lesson/layout";
import { designFirstFlag, readDesignFirst, type DesignFirstMeta, type DesignFirstState, type ReqGroup } from "@/lib/learn/designFirst";
import { track } from "@/lib/track";

const CompareDesign = dynamic(() => import("./CompareDesign"), { ssr: false });

const GAME_KEY = "hk.game.v1";
const MOUNT_ID = "design-it-first";
const STAGE = 'section[data-sd="stage"]';

type Props = { meta: DesignFirstMeta; week: string; title: string; contentRef: React.RefObject<HTMLDivElement | null> };

/** The flag as this browser's game copy holds it now (another tab, e.g. the canvas, may have set it). */
function storedFlag(key: string): DesignFirstState | null {
  try {
    const raw = window.localStorage.getItem(GAME_KEY);
    return raw ? readDesignFirst((JSON.parse(raw) as { flags?: Record<string, unknown> }).flags?.[key]) : null;
  } catch {
    return null;
  }
}

export default function DesignFirst({ meta, week, title, contentRef }: Props) {
  const { flags, setFlag, hydrated } = useGame();
  const flagKey = designFirstFlag(week);
  const fromGame = readDesignFirst(flags[flagKey]);
  const [fromOtherTab, setFromOtherTab] = useState<DesignFirstState | null>(null);
  const state = fromGame?.s === "designed" ? fromGame : fromOtherTab?.s === "designed" ? fromOtherTab : fromGame || fromOtherTab;
  // opened for this visit by a link or jump into the solution (not remembered)
  const [visitOpen, setVisitOpen] = useState(false);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [comparing, setComparing] = useState(false);
  const gated = meta.gated;
  const gatedSet = useMemo(() => new Set(gated), [gated]);
  const folded = hydrated && !state && !visitOpen;
  const foldedRef = useRef(folded);
  useEffect(() => {
    foldedRef.current = folded;
  }, [folded]);
  const headRef = useRef<HTMLHeadingElement>(null);

  /** Is this element (or the stage section it sits in) part of the folded solution? */
  const inSolution = useCallback(
    (el: Element | null) => {
      const sec = el?.closest(STAGE) as HTMLElement | null;
      return !!sec && gatedSet.has(sec.id);
    },
    [gatedSet],
  );

  /** Unfold for this visit, synchronously (a jump measuring the layout right after sees it open). */
  const openForVisit = useCallback(() => {
    foldedRef.current = false;
    document.documentElement.removeAttribute("data-df-gate");
    setVisitOpen(true);
  }, []);

  /* ---------- the mount: a chrome-marked node right before the first solution stage, kept there
     when the reader re-renders the article (highlights re-inject the HTML) */
  useEffect(() => {
    const root = contentRef.current;
    if (!root || !gated.length) return;
    let node: HTMLElement | null = null;
    const place = () => {
      const first = document.getElementById(gated[0]);
      if (!first || !root.contains(first)) return;
      if (node && node.isConnected && node.nextElementSibling === first) return;
      if (!node || !node.isConnected) {
        node = document.createElement("div");
        node.id = MOUNT_ID;
        node.className = "df-mount";
        // chrome: not part of the lesson text (highlight offsets, Listen, Ask AI and search skip it)
        node.setAttribute("data-sd-chrome", "");
        setMount(node);
      }
      first.parentElement?.insertBefore(node, first);
    };
    place();
    const mo = new MutationObserver(() => place());
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      node?.remove();
    };
  }, [contentRef, gated]);

  /* ---------- the fold itself */
  useEffect(() => {
    const html = document.documentElement;
    if (folded) html.setAttribute("data-df-gate", "on");
    else html.removeAttribute("data-df-gate");
    return () => html.removeAttribute("data-df-gate");
  }, [folded]);

  /* ---------- arriving with a link into the solution, or a #design-it-first from the canvas */
  useEffect(() => {
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (params.has("at") || params.has("highlight")) return openForVisit();
      if (!hash || hash === MOUNT_ID) return;
      const target = document.getElementById(hash);
      // an id in the solution, or a reader hash (bookmark-, note-, comment-…) that may point anywhere
      if (!target || inSolution(target)) openForVisit();
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [inSolution, openForVisit]);

  useEffect(() => {
    if (!mount || window.location.hash !== `#${MOUNT_ID}`) return;
    const t = window.setTimeout(() => mount.scrollIntoView({ block: "start" }), 250);
    return () => window.clearTimeout(t);
  }, [mount]);

  /* ---------- any other way into the solution opens it for this visit */
  useEffect(() => {
    const root = contentRef.current;
    const onJump = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; el?: Element }>).detail || {};
      const el = d.el ?? (d.id ? document.getElementById(d.id) : null);
      if (el && (gatedSet.has((el as HTMLElement).id) || inSolution(el))) openForVisit();
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || a.pathname !== window.location.pathname) return;
      const id = decodeURIComponent(a.hash.slice(1));
      if (id && id !== MOUNT_ID && inSolution(document.getElementById(id))) openForVisit();
    };
    const onFocus = (e: FocusEvent) => {
      if (inSolution(e.target as Element)) openForVisit();
    };
    window.addEventListener(REVEAL_EVENT, onJump);
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("beforeprint", openForVisit);
    // Listen marks the block it's reading: reaching the solution opens it
    const mo = root
      ? new MutationObserver((records) => {
          if (!foldedRef.current) return;
          for (const r of records) {
            const t = r.target as HTMLElement;
            if (t.classList?.contains("reading-highlight") && inSolution(t)) return openForVisit();
          }
        })
      : null;
    if (root) mo?.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
    return () => {
      window.removeEventListener(REVEAL_EVENT, onJump);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus);
      window.removeEventListener("beforeprint", openForVisit);
      mo?.disconnect();
    };
  }, [contentRef, gatedSet, inSolution, openForVisit]);

  /* ---------- the canvas may have set the flag in another tab: pick it up when this one comes back */
  useEffect(() => {
    const read = () => {
      if (document.visibilityState !== "visible") return;
      const f = storedFlag(flagKey);
      if (f) setFromOtherTab(f);
    };
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [flagKey]);

  const skip = () => {
    setFlag(flagKey, { s: "skipped", at: Date.now() });
    track("design_first", { action: "skip", week });
    window.requestAnimationFrame(() => headRef.current?.focus({ preventScroll: true }));
  };

  const canvasHref = `/learn/canvas/${encodeURIComponent(meta.key)}`;
  const solutionCss = useMemo(() => foldCss(gated), [gated]);

  return (
    <>
      {/* the fold, as a stylesheet: nothing in the article is changed */}
      <style>{solutionCss}</style>
      {mount &&
        createPortal(
          <section aria-labelledby="df-h" className="df-panel flex flex-col gap-4 border border-signal bg-surface p-4 font-sans sm:p-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center border border-signal text-signal-text">
                {state ? <Check className="h-4 w-4" /> : <PenTool className="h-4 w-4" strokeWidth={1.75} />}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                design it first{state ? (state.s === "designed" ? " · your design is saved" : " · skipped") : " · before the solution"}
              </span>
            </div>

            {/* the full panel until they've designed or skipped (an open-for-this-visit jump keeps it, so the
                page doesn't shift under the jump) */}
            {!state ? (
              <>
                <h2 id="df-h" ref={headRef} tabIndex={-1} className="m-0 font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-fg outline-none sm:text-[30px]">
                  Sketch your own design before you read this one<span className="text-signal-text">.</span>
                </h2>
                <p className="max-w-[680px] text-[15px] leading-relaxed text-fg-2">
                  This is the question you&apos;d get in the room. Spend ten minutes drawing your answer on the design canvas: the boxes, the arrows, where the data lives. Then read the capstone&apos;s design and compare the two. Your board starts with the requirements on a sticky note.
                </p>
                <Brief meta={meta} />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  <Link
                    href={canvasHref}
                    onClick={() => track("design_first", { action: "open_canvas", week })}
                    className="inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110"
                  >
                    Open the canvas <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    onClick={skip}
                    className="inline-flex min-h-12 items-center justify-center border border-line-strong px-5 text-[15px] text-fg hover:border-fg-3"
                  >
                    Skip, show me the solution
                  </button>
                </div>
                <p className="text-[12px] leading-snug text-fg-4">
                  {folded
                    ? `${gated.length > 1 ? `The solution (${gated.length} sections below) stays folded` : "The solution below stays folded"} until you save a design or skip. It's still on the page: search, Listen and links into it open it.`
                    : "The solution is open below for this visit, because you jumped into it. It folds again next time, until you save a design or skip."}
                </p>
              </>
            ) : (
              <>
                <h2 id="df-h" ref={headRef} tabIndex={-1} className="m-0 font-display text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-fg outline-none sm:text-[26px]">
                  {state?.s === "designed" ? "Now hold yours up against the capstone's" : `Design ${title.replace(/^Design\s+/i, "")} yourself`}
                  <span className="text-signal-text">.</span>
                </h2>
                <p className="max-w-[680px] text-[15px] leading-relaxed text-fg-2">
                  {state?.s === "designed"
                    ? "Open your drawing next to the capstone's architecture, see what you missed, and ask for an AI review of the gaps."
                    : "The solution is open below. You can still draw your own answer on the canvas any time, then compare it with this one."}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                  {state?.s === "designed" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setComparing(true);
                          track("design_first", { action: "compare", week });
                        }}
                        className="inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110"
                      >
                        <Columns2 className="h-4 w-4" aria-hidden /> Compare with my design
                      </button>
                      <Link href={canvasHref} className="inline-flex min-h-12 items-center justify-center gap-2 border border-line-strong px-5 text-[15px] text-fg hover:border-fg-3">
                        Edit my design <PenTool className="h-4 w-4" aria-hidden />
                      </Link>
                    </>
                  ) : (
                    <>
                      <Link href={canvasHref} className="inline-flex min-h-12 items-center justify-center gap-2 border border-line-strong px-5 text-[15px] text-fg hover:border-fg-3">
                        Draw it on the canvas <PenTool className="h-4 w-4" aria-hidden />
                      </Link>
                      <button type="button" onClick={() => setComparing(true)} className="inline-flex min-h-12 items-center justify-center gap-2 px-2 text-[14px] text-fg-3 underline underline-offset-4 hover:text-fg">
                        Compare with my design
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>,
          mount,
        )}
      {comparing && <CompareDesign meta={meta} title={title} onClose={() => setComparing(false)} />}
    </>
  );
}

/** The fold for this capstone's solution stages, keyed on the html attribute (boss mode switches it off). */
function foldCss(ids: string[]): string {
  if (!ids.length) return "";
  const on = 'html[data-df-gate="on"]:not(:has([data-boss-mode]))';
  const sel = (id: string) => `${on} ${STAGE}[id="${id.replace(/["\\]/g, "")}"]`;
  const [first, ...rest] = ids;
  return [
    `${sel(first)}{max-height:15rem;overflow:hidden;filter:blur(5px);pointer-events:none;user-select:none;-webkit-user-select:none;-webkit-mask-image:linear-gradient(to bottom,#000 10%,transparent 95%);mask-image:linear-gradient(to bottom,#000 10%,transparent 95%)}`,
    rest.length ? `${rest.map(sel).join(",")}{max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important}` : "",
  ].join("\n");
}

/** The capstone's own brief: its whiteboard, then the requirement groups (heads, first items). */
function Brief({ meta }: { meta: DesignFirstMeta }) {
  const [all, setAll] = useState(false);
  const short = (gs: ReqGroup[]) => (all ? gs : gs.slice(0, 5));
  const more = meta.functional.length > 5 || meta.nonFunctional.length > 5 || meta.functional.concat(meta.nonFunctional).some((g) => g.items.length > 2);
  return (
    <div className="flex flex-col gap-4 border border-line bg-bg p-4">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">the problem</span>
        <strong className="text-[17px] leading-snug text-fg">{meta.title}</strong>
        {meta.problem.map((p, i) => (
          <p key={i} className="text-[14px] leading-relaxed text-fg-2">
            {p}
          </p>
        ))}
        {meta.bullets.length > 0 && (
          <ul className="flex flex-col gap-1">
            {meta.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-[14px] leading-snug text-fg-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 bg-signal" />
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(meta.functional.length > 0 || meta.nonFunctional.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {(
            [
              ["functional", meta.functional],
              ["non-functional", meta.nonFunctional],
            ] as const
          ).map(([label, gs]) =>
            gs.length ? (
              <div key={label} className="flex min-w-0 flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label} requirements</span>
                <ul className="flex flex-col gap-1.5">
                  {short(gs).map((g, i) => (
                    <li key={i} className="text-[13.5px] leading-snug text-fg-2">
                      {g.head && <strong className="text-fg">{g.head}</strong>}
                      {g.head && g.items.length > 0 && <span className="text-fg-4"> · </span>}
                      {(all ? g.items : g.items.slice(0, 2)).join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </div>
      )}
      {more && (
        <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className="inline-flex items-center gap-1.5 self-start font-mono text-[12px] text-signal-text">
          {all ? "fewer details" : "all the requirements"} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${all ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}
