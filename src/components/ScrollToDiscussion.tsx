"use client";

import { MessageSquare } from "lucide-react";

export default function ScrollToDiscussion() {
  const scrollToDiscussion = () => {
    const discussionElement = document.getElementById("discussion-section");
    if (discussionElement) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      discussionElement.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  };

  return (
    <button
      type="button"
      onClick={scrollToDiscussion}
      className="group fixed bottom-[calc(env(safe-area-inset-bottom,0px)+92px)] left-4 z-40 grid h-11 w-11 place-items-center border border-line-strong bg-surface text-fg hover:border-signal hover:text-signal-text lg:bottom-6 lg:left-6"
      aria-label="Jump to discussion"
      title="Jump to discussion"
    >
      <MessageSquare className="h-4 w-4" aria-hidden />
      <span
        aria-hidden
        className="pointer-events-none absolute left-full top-1/2 ml-2 hidden -translate-y-1/2 whitespace-nowrap border border-line-strong bg-surface px-2.5 py-1.5 font-mono text-xs text-fg opacity-0 transition-opacity group-hover:opacity-100 lg:block"
      >
        Discussion
      </span>
    </button>
  );
}
