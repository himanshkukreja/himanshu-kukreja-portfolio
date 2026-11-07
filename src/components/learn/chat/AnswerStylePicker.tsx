"use client";

/**
 * The answer-style switch beside the chat's box: one small button showing the style ("Style: Tutor") over a native
 * select, so phones get their own picker and keyboards work as usual. The pick is remembered (useAnswerStyle).
 */
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ANSWER_STYLES, type AnswerStyle } from "@/lib/ai/answerStyle";
import { useAnswerStyle } from "./useAnswerStyle";

export default function AnswerStylePicker({ from = "chat", className = "" }: { from?: string; className?: string }) {
  const [style, setStyle] = useAnswerStyle();
  const cur = ANSWER_STYLES.find((s) => s.id === style) ?? ANSWER_STYLES[0];
  return (
    <label
      title={`Answer style: ${cur.hint}. Remembered for your next questions.`}
      className={`relative inline-flex min-h-8 shrink-0 items-center gap-1.5 border px-2 font-mono text-[11.5px] [@media(pointer:coarse)]:min-h-10 focus-within:border-signal hover:border-fg-3 ${style === "tutor" ? "border-line-strong text-fg-3" : "border-signal text-fg-2"} ${className}`}
    >
      <SlidersHorizontal className="h-3.5 w-3.5 text-signal-text" aria-hidden />
      <span aria-hidden>style</span>
      <span aria-hidden className="font-semibold text-fg">
        {cur.label}
      </span>
      <ChevronDown className="h-3 w-3 text-fg-4" aria-hidden />
      <select
        aria-label="Answer style"
        value={style}
        onChange={(e) => setStyle(e.target.value as AnswerStyle, from)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 text-[16px]"
      >
        {ANSWER_STYLES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}: {s.hint}
          </option>
        ))}
      </select>
    </label>
  );
}
