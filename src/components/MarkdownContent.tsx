"use client";

import { useEffect } from "react";

type Props = {
  htmlContent: string;
};

export default function MarkdownContent({ htmlContent }: Props) {
  useEffect(() => {
    // Add copy buttons to all pre elements
    const preElements = document.querySelectorAll(".md-content pre");

    preElements.forEach((pre) => {
      // Skip if button already exists
      if (pre.querySelector(".copy-button")) return;

      // Create wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "relative group";

      // Create button
      const button = document.createElement("button");
      button.className = "copy-button absolute top-3 right-3 p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10 flex items-center gap-2";
      button.setAttribute("aria-label", "Copy code");

      const copyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-icon text-white/60"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
      const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="check-icon text-green-400 hidden"><path d="M20 6 9 17l-5-5"/></svg>`;

      button.innerHTML = copyIcon + checkIcon;

      button.addEventListener("click", () => {
        const code = pre.textContent || "";
        navigator.clipboard.writeText(code);

        // Show check icon
        const copyIconEl = button.querySelector(".copy-icon");
        const checkIconEl = button.querySelector(".check-icon");
        if (copyIconEl && checkIconEl) {
          copyIconEl.classList.add("hidden");
          checkIconEl.classList.remove("hidden");

          setTimeout(() => {
            copyIconEl.classList.remove("hidden");
            checkIconEl.classList.add("hidden");
          }, 2000);
        }
      });

      // Wrap pre and add button
      const parent = pre.parentNode;
      if (parent) {
        parent.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);
        wrapper.appendChild(button);
      }
    });
  }, [htmlContent]);

  return (
    <div
      className="md-content"
      dangerouslySetInnerHTML={{ __html: htmlContent }}
    />
  );
}
