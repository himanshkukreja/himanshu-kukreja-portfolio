"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { stickyOffset } from "@/components/learn/lesson/layout";

/**
 * `?highlight=<query>` (course search results): marks the matches in the lesson for a few
 * seconds and scrolls to the first one, under the sticky header and stage rail.
 */
export default function SearchHighlight() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight");

  useEffect(() => {
    if (!highlight) return;
    let cleanup: (() => void) | undefined;
    // wait for the content (and its client-side enhancements) to render
    const timer = window.setTimeout(() => {
      cleanup = highlightAndScroll(highlight);
    }, 600);
    return () => {
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, [highlight]);

  return null;
}

const MARK_STYLE = "background: rgba(255,107,43,0.3); color: inherit; box-shadow: inset 0 -2px 0 var(--c-signal, #FF6B2B); padding: 0 1px;";

function unmark() {
  document.querySelectorAll("mark.search-highlight").forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    }
  });
}

function highlightAndScroll(searchQuery: string): (() => void) | undefined {
  const query = searchQuery.trim().toLowerCase();
  if (!query) return;

  const container = document.querySelector(".course-content, .md-content, article, main");
  if (!container) return;

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE" || parent.closest("button, [aria-hidden='true']")) {
        return NodeFilter.FILTER_REJECT;
      }
      return node.textContent && node.textContent.toLowerCase().includes(query) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);

  let first: HTMLElement | null = null;
  for (const textNode of nodes.slice(0, 200)) {
    const text = textNode.textContent || "";
    const index = text.toLowerCase().indexOf(query);
    if (index === -1 || !textNode.parentNode) continue;
    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.style.cssText = MARK_STYLE;
    mark.textContent = text.slice(index, index + query.length);
    const frag = document.createDocumentFragment();
    if (index > 0) frag.appendChild(document.createTextNode(text.slice(0, index)));
    frag.appendChild(mark);
    const after = text.slice(index + query.length);
    if (after) frag.appendChild(document.createTextNode(after));
    textNode.parentNode.replaceChild(frag, textNode);
    if (!first) first = mark;
  }

  if (!first) return;
  const top = first.getBoundingClientRect().top + window.scrollY - stickyOffset() - 48;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });

  const t = window.setTimeout(unmark, 6000);
  return () => {
    window.clearTimeout(t);
    unmark();
  };
}
