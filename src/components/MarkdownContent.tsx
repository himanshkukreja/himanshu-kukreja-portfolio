"use client";

import { useEffect, useMemo, useRef } from "react";

type Props = {
  htmlContent: string;
  /**
   * Wrapper class. Defaults to "md-content" (stories / legacy markdown), or "sd-body" when the
   * HTML comes from the course renderer (it carries data-sd markers and is styled by
   * course-content.css under `.course-content`).
   */
  className?: string;
};

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true" class="copy-icon"><rect width="14" height="14" x="8" y="8"/><path d="M4 16V4h12"/></svg>`;
const CHECK_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true" class="check-icon hidden"><path d="M20 6 9 17l-5-5"/></svg>`;

export function isCourseHtml(html: string) {
  return html.includes('data-sd="stage"');
}

export default function MarkdownContent({ htmlContent, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const course = isCourseHtml(htmlContent);
  const cls = className ?? (course ? "sd-body" : "md-content");

  useEffect(() => {
    // Course HTML ships its own copy buttons (CourseEnhancer); only legacy markdown gets these.
    if (course || !ref.current) return;
    ref.current.querySelectorAll("pre").forEach((pre) => {
      if (pre.parentElement?.querySelector(":scope > .copy-button")) return;
      const wrapper = document.createElement("div");
      wrapper.className = "relative group";
      wrapper.setAttribute("data-sd-chrome-host", "");
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "copy-button absolute top-2 right-2 inline-flex items-center justify-center min-h-[36px] min-w-[36px] border border-line-strong bg-surface text-fg-3 hover:text-fg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 z-10";
      button.setAttribute("aria-label", "Copy code");
      button.setAttribute("data-sd-chrome", "");
      button.innerHTML = COPY_ICON + CHECK_ICON;
      button.addEventListener("click", () => {
        void navigator.clipboard.writeText(pre.textContent || "");
        const a = button.querySelector(".copy-icon");
        const b = button.querySelector(".check-icon");
        a?.classList.add("hidden");
        b?.classList.remove("hidden");
        window.setTimeout(() => {
          a?.classList.remove("hidden");
          b?.classList.add("hidden");
        }, 2000);
      });
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
      wrapper.appendChild(button);
    });
  }, [htmlContent, course]);

  // Stable object so parent re-renders (scroll-driven progress state) don't re-inject the article.
  const html = useMemo(() => ({ __html: htmlContent }), [htmlContent]);
  return <div ref={ref} className={cls} dangerouslySetInnerHTML={html} />;
}
