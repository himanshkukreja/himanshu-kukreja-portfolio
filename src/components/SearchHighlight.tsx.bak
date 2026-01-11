"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function SearchHighlight() {
  const searchParams = useSearchParams();
  const highlight = searchParams.get("highlight");

  useEffect(() => {
    if (!highlight) return;

    // Wait for content to render
    const timer = setTimeout(() => {
      highlightAndScroll(highlight);
    }, 500);

    return () => clearTimeout(timer);
  }, [highlight]);

  return null; // This component doesn't render anything
}

function highlightAndScroll(searchQuery: string) {
  // Clean up the search query
  const query = searchQuery.trim().toLowerCase();
  if (!query) return;

  // Find the markdown content container
  const contentContainer = document.querySelector(".markdown-content, [class*='markdown'], article, main");
  if (!contentContainer) {
    console.warn("[SearchHighlight] Content container not found");
    return;
  }

  // Get all text nodes in the content
  const walker = document.createTreeWalker(
    contentContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        // Skip script and style tags
        const parent = node.parentElement;
        if (!parent || parent.tagName === "SCRIPT" || parent.tagName === "STYLE") {
          return NodeFilter.FILTER_REJECT;
        }
        // Only accept nodes with actual text content
        return node.textContent && node.textContent.trim().length > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    }
  );

  const textNodes: Node[] = [];
  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  let firstMatch: HTMLElement | null = null;

  // Search through text nodes and highlight matches
  textNodes.forEach((textNode) => {
    const text = textNode.textContent || "";
    const lowerText = text.toLowerCase();
    const index = lowerText.indexOf(query);

    if (index !== -1) {
      const parent = textNode.parentElement;
      if (!parent) return;

      // Split the text into parts: before, match, after
      const before = text.substring(0, index);
      const match = text.substring(index, index + query.length);
      const after = text.substring(index + query.length);

      // Create highlight span
      const highlightSpan = document.createElement("mark");
      highlightSpan.textContent = match;
      highlightSpan.className = "search-highlight";
      highlightSpan.style.cssText = `
        background: linear-gradient(90deg, #fbbf24, #f59e0b);
        color: #000;
        padding: 2px 4px;
        border-radius: 3px;
        font-weight: 500;
        animation: highlightPulse 2s ease-in-out;
      `;

      // Replace text node with highlighted version
      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      fragment.appendChild(highlightSpan);
      if (after) fragment.appendChild(document.createTextNode(after));

      parent.replaceChild(fragment, textNode);

      // Store first match for scrolling
      if (!firstMatch) {
        firstMatch = highlightSpan;
      }
    }
  });

  // Scroll to first match with smooth animation
  if (firstMatch) {
    // Add CSS animation
    const style = document.createElement("style");
    style.textContent = `
      @keyframes highlightPulse {
        0%, 100% {
          background: linear-gradient(90deg, #fbbf24, #f59e0b);
          transform: scale(1);
        }
        50% {
          background: linear-gradient(90deg, #f59e0b, #fbbf24);
          transform: scale(1.05);
        }
      }

      .search-highlight {
        transition: all 0.3s ease;
      }
    `;
    document.head.appendChild(style);

    // Scroll with offset for better visibility
    const matchElement = firstMatch as HTMLElement;
    const elementPosition = matchElement.getBoundingClientRect().top + window.scrollY;
    const offsetPosition = elementPosition - 150; // Offset from top

    window.scrollTo({
      top: offsetPosition,
      behavior: "smooth",
    });

    // Remove highlight after 5 seconds
    setTimeout(() => {
      document.querySelectorAll(".search-highlight").forEach((mark) => {
        const parent = mark.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
          parent.normalize(); // Merge adjacent text nodes
        }
      });
    }, 5000);
  } else {
    console.log("[SearchHighlight] No matches found for:", searchQuery);
  }
}
