"use client";

/**
 * The floating "Ask" button on Learn pages and the chat panel it opens. Mounted once by the Learn layout;
 * the panel's code loads only when it is first opened.
 *
 * Where the button stays out of the way:
 * - not on /learn/chat (the chat is the page), on lessons (their own orange Ask AI pill opens this same
 *   panel), in the shorts feed, the design canvas, a mock interview room or an Arena game (full-screen tools);
 * - above the phone dock, and lifted above the Listen player strip while it shows (globals.css, [data-chat-fab]);
 * - hidden while the panel is open ([data-ask-fab]).
 *
 * The corner is shared: `companion` (the Learn layout passes the Notebook's pen button, ink/global/NotebookFab)
 * stacks above Ask in the same fixed column, so the two never overlap and move together (the Listen strip lift, the
 * docked panels' shift: [data-ask-shift]). On a case file the column sits above the reader's own Ask AI and
 * read-aloud buttons ([data-lift="case"], globals.css), and anything marked [data-dock-avoid] under it (the course
 * chat's message box on /learn/chat) lifts it clear: useClearOf.
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import { COURSE_CHAT_EVENT, openCourseChat, TUTOR_OPEN_EVENT, type OpenChatDetail } from "./openChat";
import { holdContext } from "./pageContext";

const ChatPanel = dynamic(() => import("./ChatPanel"), { ssr: false });

const isLesson = (p: string) => /^\/learn\/(?!(?:design-week|revise)\/)[^/]+\/[^/]+\/[^/]+/.test(p);
const NO_FAB = /^\/learn\/(?:search|shorts$|canvas\/|mock\/(?!peers)[^/]+|arena\/(?!leaderboard|daily)[^/]+)/;

/**
 * Lifts the corner dock above any [data-dock-avoid] element it would otherwise sit on (by its horizontal span), by
 * setting an inline `bottom`. Cheap: one querySelectorAll on resize, scroll and every 600 ms while such an element
 * is on the page; nothing at all where there is none.
 */
function useClearOf(ref: React.RefObject<HTMLDivElement | null>, pathname: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const obstacles = Array.from(document.querySelectorAll<HTMLElement>("[data-dock-avoid]"));
      el.style.removeProperty("bottom");
      if (!obstacles.length) return;
      const me = el.getBoundingClientRect();
      const vh = window.innerHeight;
      let lift = 0;
      for (const o of obstacles) {
        const r = o.getBoundingClientRect();
        if (!r.width || !r.height || r.top >= vh || r.right <= me.left || r.left >= me.right) continue;
        // only what sits under the dock's resting place
        if (r.bottom < vh - me.height - 160) continue;
        lift = Math.max(lift, vh - r.top + 12);
      }
      const base = vh - me.bottom;
      // important: wins over the stylesheet's own lifts (the Notebook's bottom split, a case file)
      if (lift > base) el.style.setProperty("bottom", `${Math.round(lift)}px`, "important");
    };
    const req = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    req();
    const iv = window.setInterval(() => document.querySelector("[data-dock-avoid]") && req(), 600);
    window.addEventListener("resize", req);
    window.visualViewport?.addEventListener("resize", req);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(iv);
      window.removeEventListener("resize", req);
      window.visualViewport?.removeEventListener("resize", req);
      el.style.removeProperty("bottom");
    };
  }, [ref, pathname]);
}

export default function ChatDock({ companion }: { companion?: React.ReactNode }) {
  const pathname = usePathname() || "";
  const { user } = useAuth();
  const ai = useAiStatus();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [initial, setInitial] = useState<{ q?: string; send?: boolean; key: number } | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  useClearOf(dockRef, pathname);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<OpenChatDetail>).detail ?? {};
      setMounted(true);
      setOpen(true);
      setInitial({ q: d.q, send: d.send, key: Date.now() });
    };
    // the shared contract other features use: tutor:open { prompt?, context?: { kind: "selection", text, href, heading? }, send? }
    const tutor = (e: Event) => {
      const d = (e as CustomEvent<{ prompt?: string; send?: boolean; context?: { kind?: string; text?: string; href?: string; heading?: string } }>).detail ?? {};
      if (d.context?.kind === "selection" && d.context.text) holdContext({ selection: d.context.text, path: d.context.href, heading: d.context.heading });
      on(new CustomEvent(COURSE_CHAT_EVENT, { detail: { q: d.prompt, send: d.send } }));
    };
    // the Notebook panel takes the same side of the screen: opening it closes the chat
    const notebook = () => setOpen(false);
    window.addEventListener(COURSE_CHAT_EVENT, on);
    window.addEventListener(TUTOR_OPEN_EVENT, tutor);
    window.addEventListener(INK_EVENTS.open, notebook);
    return () => {
      window.removeEventListener(COURSE_CHAT_EVENT, on);
      window.removeEventListener(TUTOR_OPEN_EVENT, tutor);
      window.removeEventListener(INK_EVENTS.open, notebook);
    };
  }, []);

  // a new page closes the panel on phones (it covers the page); on a computer it stays docked
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (open && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) setOpen(false);
  }

  const onSearch = pathname.startsWith("/learn/chat");
  // signed in: only when the chat is available to them; guests see it (the panel asks them to sign in)
  const available = !user || !!ai?.features["course-chat"];
  // case files (/stories/…) have their own Ask button; the panel still opens there (tutor:open from Explain / Ask the tutor)
  const fab = !open && available && !onSearch && !isLesson(pathname) && !NO_FAB.test(pathname) && !pathname.startsWith("/stories");

  return (
    <>
      <div
        ref={dockRef}
        data-chat-fab
        data-ask-shift
        data-lift={/^\/stories\/[^/]+/.test(pathname) ? "case" : undefined}
        className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] right-3 z-40 flex flex-col items-end gap-2 transition-[right] duration-200 empty:hidden lg:bottom-6 lg:right-6 [&>*]:pointer-events-auto"
      >
        {companion}
        {fab && (
          <button
            type="button"
            data-ask-fab
            onClick={() => openCourseChat()}
            aria-label="Ask the course tutor"
            title="Ask the course tutor"
            className="flex h-12 items-center gap-2 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] hover:brightness-110"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            Ask
          </button>
        )}
      </div>
      {mounted && !onSearch && <ChatPanel open={open} onClose={() => setOpen(false)} initial={initial} pathname={pathname} />}
    </>
  );
}
