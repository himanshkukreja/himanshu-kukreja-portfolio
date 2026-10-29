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
 */
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAiStatus } from "@/components/learn/ai/useAiStatus";
import { COURSE_CHAT_EVENT, openCourseChat, TUTOR_OPEN_EVENT, type OpenChatDetail } from "./openChat";
import { holdContext } from "./pageContext";

const ChatPanel = dynamic(() => import("./ChatPanel"), { ssr: false });

const isLesson = (p: string) => /^\/learn\/(?!(?:design-week|revise)\/)[^/]+\/[^/]+\/[^/]+/.test(p);
const NO_FAB = /^\/learn\/(?:search|shorts$|canvas\/|mock\/(?!peers)[^/]+|arena\/(?!leaderboard|daily)[^/]+)/;

export default function ChatDock() {
  const pathname = usePathname() || "";
  const { user } = useAuth();
  const ai = useAiStatus();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [initial, setInitial] = useState<{ q?: string; send?: boolean; key: number } | null>(null);

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
    window.addEventListener(COURSE_CHAT_EVENT, on);
    window.addEventListener(TUTOR_OPEN_EVENT, tutor);
    return () => {
      window.removeEventListener(COURSE_CHAT_EVENT, on);
      window.removeEventListener(TUTOR_OPEN_EVENT, tutor);
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
      {fab && (
        <button
          type="button"
          data-chat-fab
          data-ask-fab
          onClick={() => openCourseChat()}
          aria-label="Ask the course tutor"
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+84px)] right-3 z-40 flex h-12 items-center gap-2 bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal shadow-[0_6px_24px_rgba(0,0,0,0.35)] transition-[bottom,transform] duration-200 hover:brightness-110 lg:bottom-6 lg:right-6"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Ask
        </button>
      )}
      {mounted && !onSearch && <ChatPanel open={open} onClose={() => setOpen(false)} initial={initial} pathname={pathname} />}
    </>
  );
}
