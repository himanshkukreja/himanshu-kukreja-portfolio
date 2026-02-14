"use client";

import { MessageSquare } from "lucide-react";

export default function ScrollToDiscussion() {
  const scrollToDiscussion = () => {
    const discussionElement = document.getElementById("discussion-section");
    if (discussionElement) {
      discussionElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <button
      onClick={scrollToDiscussion}
      className="fixed bottom-6 lg:bottom-20 left-6 z-40 p-3 bg-purple-500 hover:bg-purple-600 text-white rounded-full shadow-lg transition-all group"
      aria-label="Scroll to discussion"
      title="Jump to discussion"
    >
      <MessageSquare className="w-5 h-5" />
      <span className="absolute left-full ml-3 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Discussion
      </span>
    </button>
  );
}
