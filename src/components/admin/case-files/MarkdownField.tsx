"use client";

/**
 * The story body editor: a plain textarea (markdown stays markdown) with a toolbar that inserts the
 * site's components (chapters, ::: blocks, Mermaid with the semantic classes, tables, sources, image
 * upload), a status bar (line/column, words, the current line's problems), problem ticks along the
 * edge, and `goToLine` for the checks list.
 */
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { SNIPPETS, type Snippet } from "@/lib/case-files/template";
import type { Problem } from "@/lib/case-files/types";
import { cx } from "./client";

export type MarkdownFieldHandle = { goToLine: (line: number) => void; insert: (text: string, block?: boolean) => void; focus: () => void };

type Props = {
  value: string;
  onChange: (v: string) => void;
  problems: Problem[];
  readOnly?: boolean;
  onUploadImage?: (file: File) => Promise<string>;
  words: number;
  minutes: number;
};

const GROUPS: { id: Snippet["group"]; label: string }[] = [
  { id: "text", label: "text" },
  { id: "blocks", label: "blocks" },
  { id: "diagram", label: "diagram" },
];

const MarkdownField = forwardRef<MarkdownFieldHandle, Props>(function MarkdownField({ value, onChange, problems, readOnly, onUploadImage, words, minutes }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [uploading, setUploading] = useState<string | null>(null);

  const lines = useMemo(() => value.split("\n").length, [value]);
  const byLine = useMemo(() => {
    const m = new Map<number, Problem[]>();
    for (const p of problems) if (p.line) m.set(p.line, [...(m.get(p.line) || []), p]);
    return m;
  }, [problems]);
  const here = byLine.get(cursor.line) || [];

  const updateCursor = () => {
    const el = ta.current;
    if (!el) return;
    const before = el.value.slice(0, el.selectionStart);
    const ls = before.split("\n");
    setCursor({ line: ls.length, col: ls[ls.length - 1].length + 1 });
  };

  /** Accurate scroll for wrapped lines: measure the text before the line in a mirror with the textarea's box. */
  const scrollToOffset = (offset: number) => {
    const el = ta.current;
    if (!el) return;
    const cs = window.getComputedStyle(el);
    const mirror = document.createElement("div");
    for (const k of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth", "boxSizing", "whiteSpace", "wordBreak", "overflowWrap", "tabSize"] as const)
      mirror.style[k] = cs[k];
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.width = `${el.clientWidth}px`;
    mirror.textContent = el.value.slice(0, offset) + "​";
    document.body.appendChild(mirror);
    const y = mirror.scrollHeight;
    mirror.remove();
    el.scrollTop = Math.max(0, y - el.clientHeight / 3);
  };

  const goToLine = (line: number) => {
    const el = ta.current;
    if (!el) return;
    const ls = el.value.split("\n");
    const n = Math.max(1, Math.min(line, ls.length));
    const start = ls.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
    el.focus({ preventScroll: true });
    el.setSelectionRange(start, start + ls[n - 1].length);
    scrollToOffset(start);
    updateCursor();
  };

  const insert = (text: string, block = false) => {
    const el = ta.current;
    if (!el || readOnly) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const v = el.value;
    let chunk = text;
    if (block) {
      // blocks sit on their own lines with a blank line before and after (remark-directive needs it)
      const before = v.slice(0, s);
      const after = v.slice(e);
      const pre = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
      const post = after.startsWith("\n\n") || after.length === 0 ? "" : after.startsWith("\n") ? "\n" : "\n\n";
      chunk = pre + text.replace(/\n$/, "") + "\n" + post;
    }
    const next = v.slice(0, s) + chunk + v.slice(e);
    onChange(next);
    // select the first {{placeholder}} of what was inserted, so typing replaces it
    requestAnimationFrame(() => {
      const at = next.indexOf("{{", s);
      const end = at >= 0 ? next.indexOf("}}", at) : -1;
      el.focus();
      if (at >= 0 && end > at && end < s + chunk.length) el.setSelectionRange(at, end + 2);
      else el.setSelectionRange(s + chunk.length, s + chunk.length);
      updateCursor();
    });
  };

  const wrap = (left: string, right = left, placeholder = "text") => {
    const el = ta.current;
    if (!el || readOnly) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const sel = el.value.slice(s, e) || placeholder;
    const next = el.value.slice(0, s) + left + sel + right + el.value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + left.length, s + left.length + sel.length);
    });
  };

  useImperativeHandle(ref, () => ({ goToLine, insert, focus: () => ta.current?.focus() }));

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      wrap("**");
    } else if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      wrap("*");
    } else if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      wrap("[", "](https://)", "link text");
    } else if (e.key === "Tab" && !e.shiftKey && !mod) {
      // keep focus in the editor: Tab indents (lists, mermaid)
      e.preventDefault();
      insert("  ");
    }
  };

  const pickImage = () => fileRef.current?.click();
  const onFile = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file || !onUploadImage) return;
    setUploading(file.name);
    try {
      const url = await onUploadImage(file);
      insert(`![{{Alt text: what the figure shows, with its labels}}](${url})\n`, true);
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const errLines = useMemo(() => [...byLine.entries()].map(([l, ps]) => ({ line: l, error: ps.some((p) => p.level === "error") })), [byLine]);

  return (
    <div className="flex min-h-0 flex-col border border-line bg-surface">
      {/* toolbar */}
      <div role="toolbar" aria-label="Insert" className="flex items-stretch gap-0 overflow-x-auto border-b border-line [scrollbar-width:thin]">
        <ToolBtn label="B" title="Bold (⌘B)" onClick={() => wrap("**")} disabled={readOnly} className="font-bold" />
        <ToolBtn label="I" title="Italic (⌘I)" onClick={() => wrap("*")} disabled={readOnly} className="italic" />
        <ToolBtn label="link" title="Link (⌘K)" onClick={() => wrap("[", "](https://)", "link text")} disabled={readOnly} />
        <ToolBtn label="`code`" title="Inline code" onClick={() => wrap("`")} disabled={readOnly} />
        {GROUPS.map((g) => (
          <span key={g.id} className="flex items-stretch border-l border-line">
            <span className="hidden items-center px-2 font-mono text-[10px] uppercase tracking-label text-fg-4 sm:flex">{g.label}</span>
            {SNIPPETS.filter((s) => s.group === g.id).map((s) => (
              <ToolBtn key={s.id} label={s.label.toLowerCase()} title={s.hint ? `${s.label}: ${s.hint}` : s.label} onClick={() => insert(s.text, s.block)} disabled={readOnly} />
            ))}
          </span>
        ))}
        <span className="flex items-stretch border-l border-line">
          <ToolBtn label={uploading ? "uploading…" : "+ image"} title="Upload an image (PNG/JPEG/WebP, ≤ 6 MB) and insert it" onClick={pickImage} disabled={readOnly || !onUploadImage || !!uploading} />
        </span>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/gif" hidden onChange={onFile} />
      </div>

      <div className="relative flex min-h-0 flex-1">
        <textarea
          ref={ta}
          value={value}
          readOnly={readOnly}
          onChange={(e) => {
            onChange(e.target.value);
            updateCursor();
          }}
          onKeyDown={onKeyDown}
          onKeyUp={updateCursor}
          onClick={updateCursor}
          onSelect={updateCursor}
          spellCheck
          aria-label="Story markdown"
          className="min-h-[60vh] w-full flex-1 resize-y bg-bg px-4 py-3 pr-5 font-mono text-[13px] leading-[1.65] text-fg [tab-size:2] focus:outline-none"
        />
        {/* problem ticks: where in the story the problems are */}
        <div aria-hidden className="pointer-events-none absolute inset-y-1 right-0.5 w-1.5">
          {errLines.map((x) => (
            <span key={x.line} className={cx("absolute right-0 h-[3px] w-1.5", x.error ? "bg-bad" : "bg-signal")} style={{ top: `${((x.line - 1) / Math.max(1, lines)) * 100}%` }} />
          ))}
        </div>
      </div>

      {/* status bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line px-3 py-1.5 font-mono text-[11px] text-fg-3">
        <span>
          Ln {cursor.line}, Col {cursor.col} · {lines} lines · {words.toLocaleString("en-IN")} words · ~{minutes} min
        </span>
        {here.length > 0 ? (
          <span className={cx("min-w-0 truncate", here.some((p) => p.level === "error") ? "text-bad-text" : "text-signal-text")} title={here.map((p) => p.message).join("\n")}>
            L{cursor.line}: {here[0].message}
            {here.length > 1 ? ` (+${here.length - 1})` : ""}
          </span>
        ) : (
          <span className="text-fg-4">⌘S save · ⌘B bold · ⌘K link</span>
        )}
      </div>
    </div>
  );
});

export default MarkdownField;

function ToolBtn({ label, title, onClick, disabled, className }: { label: string; title: string; onClick: () => void; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      className={cx("min-h-10 shrink-0 whitespace-nowrap px-2.5 font-mono text-[12px] text-fg-2 hover:bg-surface-2 hover:text-fg disabled:opacity-40", className)}
    >
      {label}
    </button>
  );
}
