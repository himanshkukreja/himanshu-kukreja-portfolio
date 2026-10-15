"use client";

import { Fragment } from "react";
import { inlineTokens } from "@/lib/course/detect/quiz-parse";

/** Inline markdown from the question bank (`code`, **strong**, *em*, links) as React nodes. */
export default function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((t, i) => {
        if (t.t === "code")
          return (
            <code key={i} className="border border-line bg-surface-2 px-1 py-px font-mono text-[0.86em]">
              {t.v}
            </code>
          );
        if (t.t === "strong") return <strong key={i}>{t.v}</strong>;
        if (t.t === "em") return <em key={i}>{t.v}</em>;
        if (t.t === "link") return <Fragment key={i}>{t.v}</Fragment>;
        return <Fragment key={i}>{t.v}</Fragment>;
      })}
    </>
  );
}
