"use client";

/** Small shared pieces of the mock interview screens (Level Up: square corners, 1px rules, mono labels). */
import type { ReactNode } from "react";
import { LEVEL_LABEL, type MockLevel } from "@/lib/learn/mock/types";
import { MicButton } from "./Dictate";

export const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

/** Renderer output (course blocks, tables, code, Mermaid) with the course typography. */
export function CourseHtml({ html, size = 16, className = "" }: { html: string; size?: number; className?: string }) {
  if (!html) return null;
  return (
    <div className={`course-content ${className}`} style={{ ["--reader-size" as string]: `${size}px` }}>
      <div className="sd-body [&>*:last-child]:mb-0" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** Short rendered markdown (messages, hints, rubric lines) in UI typography. */
export function InlineHtml({ html, className = "" }: { html: string; className?: string }) {
  return (
    <div
      className={`[&_a]:text-signal-text [&_a]:underline [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.92em] [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_p]:m-0 [&_strong]:font-semibold [&_strong]:text-fg [&_ul]:mt-1.5 [&_ul]:list-[square] [&_ul]:pl-5 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function initials(name: string): string {
  const parts = name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export function Avatar({ name, size = "md", live = false }: { name: string; size?: "sm" | "md" | "lg"; live?: boolean }) {
  const s = size === "lg" ? "h-16 w-16 text-xl" : size === "sm" ? "h-9 w-9 text-[12px]" : "h-12 w-12 text-base";
  return (
    <span aria-hidden className={`relative grid shrink-0 place-items-center bg-fg font-mono font-semibold text-bg ${s}`}>
      {initials(name)}
      {live && <span className="absolute -bottom-1 -right-1 h-3 w-3 animate-hk-pulse border-2 border-bg bg-signal" />}
    </span>
  );
}

export function LevelChip({ level, bonus = false }: { level: MockLevel; bonus?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center px-1.5 font-mono text-[10px] font-semibold uppercase tracking-label ${
        bonus ? "border border-dashed border-signal text-signal-text" : "border border-line-strong text-fg-2"
      }`}
      title={bonus ? `${LEVEL_LABEL[level]} signal: above your target level, counts as bonus` : `Expected from ${LEVEL_LABEL[level]} level`}
    >
      {LEVEL_LABEL[level]}
      {bonus ? " · bonus" : ""}
    </span>
  );
}

export function Stat({ value, label, accent = false, suffix }: { value: ReactNode; label: string; accent?: boolean; suffix?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-bg px-3.5 py-2.5">
      <span className={`font-mono text-xl font-semibold ${accent ? "text-signal-text" : "text-fg"}`}>
        {value}
        {suffix && <span className="text-sm text-fg-3">{suffix}</span>}
      </span>
      <span className="text-xs text-fg-3">{label}</span>
    </div>
  );
}

/** A plain-text area with the course look; autosave is the parent's job. */
export function Pad({
  id,
  value,
  onChange,
  placeholder,
  rows = 10,
  mono = true,
  label,
  right,
  onKeyDown,
  inputRef,
  dictate = false,
}: {
  /** a mic button: speak and the words are appended */
  dictate?: boolean;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  mono?: boolean;
  label: string;
  right?: ReactNode;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-mono text-xs uppercase tracking-label text-fg">
          {label}
        </label>
        <span className="flex min-w-0 items-center gap-3">
          {dictate && <MicButton value={value} onChange={onChange} />}
          {right}
        </span>
      </div>
      <textarea
        id={id}
        ref={inputRef}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={!mono}
        className={`w-full resize-y border border-line-strong bg-raised p-3.5 text-[15px] leading-[1.65] text-fg outline-none placeholder:text-fg-4 focus:border-signal sm:p-4 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
