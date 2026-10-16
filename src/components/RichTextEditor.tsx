"use client";

import { useRef, useState, useEffect } from "react";
import { Bold, Italic, Code, Link as LinkIcon, List, ListOrdered, Quote, Undo, Redo, Eye, Edit3 } from "lucide-react";
import styles from "@/components/learn/lesson/richtext.module.css";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string, plainText: string) => void;
  placeholder?: string;
  minHeight?: string;
  autoFocus?: boolean;
};

type Tool = { onClick: () => void; icon: React.ComponentType<{ className?: string }>; title: string; disabled?: boolean };

function ToolbarButton({ onClick, icon: Icon, title, disabled = false }: Tool) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="grid min-h-10 min-w-10 place-items-center text-fg-3 hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}

/**
 * Small contentEditable editor for comments (lessons and stories). onChange gets the HTML and
 * the plain text. Setting `value` back to "" clears the editor (after posting).
 */
export default function RichTextEditor({ value, onChange, placeholder = "Write your comment…", minHeight = "120px", autoFocus = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [hasSelection, setHasSelection] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!el.innerHTML && value) el.innerHTML = value;
    else if (value === "" && el.innerHTML) el.innerHTML = ""; // parent reset after posting
  }, [value]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  const handleInput = () => {
    const el = editorRef.current;
    if (!el) return;
    setLocalValue(el.innerHTML);
    onChange(el.innerHTML, el.innerText);
  };

  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      const inEditor = !!sel && sel.rangeCount > 0 && !!editorRef.current?.contains(sel.anchorNode);
      setHasSelection(inEditor && (sel?.toString().length ?? 0) > 0);
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // typing "f" must not toggle the reader's focus mode
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") e.stopPropagation();
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [showPreview]);

  useEffect(() => {
    if (!showPreview && editorRef.current && localValue) editorRef.current.innerHTML = localValue;
    // only when switching back from preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview]);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  const execCommand = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    editorRef.current?.focus();
    handleInput();
  };

  const insertCodeBlock = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "// code";
    pre.appendChild(code);
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(pre);
      pre.parentNode?.insertBefore(document.createElement("br"), pre.nextSibling);
      const r = document.createRange();
      r.selectNodeContents(code);
      sel.removeAllRanges();
      sel.addRange(r);
    } else {
      editor.appendChild(pre);
      editor.appendChild(document.createElement("br"));
    }
    editor.focus();
    handleInput();
  };

  const openLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current?.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    savedRange.current = range.cloneRange();
    const parentA = range.commonAncestorContainer.parentElement?.closest("a");
    setLinkUrl(parentA ? parentA.href : "https://");
    setLinkOpen(true);
  };

  const applyLink = () => {
    const range = savedRange.current;
    let url = linkUrl.trim();
    setLinkOpen(false);
    if (!range || !url || url === "https://") return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const existing = range.commonAncestorContainer.parentElement?.closest("a");
    if (existing && editorRef.current?.contains(existing)) {
      existing.href = url;
    } else {
      const text = range.toString();
      if (!text) return;
      const a = document.createElement("a");
      a.href = url;
      a.textContent = text;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      range.deleteContents();
      range.insertNode(a);
      const sel = window.getSelection();
      const after = document.createRange();
      after.setStartAfter(a);
      after.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(after);
    }
    editorRef.current?.focus();
    handleInput();
  };

  return (
    <div className="relative border border-line-strong bg-bg">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface p-1">
        <ToolbarButton onClick={() => execCommand("bold")} icon={Bold} title="Bold (Ctrl+B)" />
        <ToolbarButton onClick={() => execCommand("italic")} icon={Italic} title="Italic (Ctrl+I)" />
        <ToolbarButton onClick={() => execCommand("insertUnorderedList")} icon={List} title="Bullet list" />
        <ToolbarButton onClick={() => execCommand("insertOrderedList")} icon={ListOrdered} title="Numbered list" />
        <ToolbarButton onClick={() => execCommand("formatBlock", "blockquote")} icon={Quote} title="Quote" />
        <ToolbarButton onClick={insertCodeBlock} icon={Code} title="Code block" />
        <ToolbarButton onClick={openLink} icon={LinkIcon} title="Insert link (select text first)" disabled={!hasSelection} />
        <span aria-hidden className="mx-1 h-6 w-px bg-line" />
        <ToolbarButton onClick={() => execCommand("undo")} icon={Undo} title="Undo" />
        <ToolbarButton onClick={() => execCommand("redo")} icon={Redo} title="Redo" />
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          aria-pressed={showPreview}
          className={`inline-flex min-h-10 items-center gap-1.5 px-3 font-mono text-xs ${showPreview ? "bg-fg text-bg" : "text-fg-2 hover:bg-surface-2"}`}
        >
          {showPreview ? <Edit3 className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
          {showPreview ? "edit" : "preview"}
        </button>
      </div>

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-2 py-2">
          <label className="flex min-w-0 flex-1 items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Link</span>
            <input
              ref={linkInputRef}
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setLinkOpen(false);
                  editorRef.current?.focus();
                }
              }}
              placeholder="example.com"
              className="min-h-10 min-w-0 flex-1 border border-line-strong bg-bg px-2 text-base text-fg outline-none focus:border-signal"
            />
          </label>
          <button type="button" onClick={applyLink} className="min-h-10 bg-signal px-3 text-sm font-semibold text-on-signal">
            Add link
          </button>
          <button type="button" onClick={() => setLinkOpen(false)} className="min-h-10 border border-line-strong px-3 text-sm text-fg">
            Cancel
          </button>
        </div>
      )}

      {showPreview ? (
        <div className={`prose ${styles.rich} overflow-auto p-3 text-[15px] leading-relaxed text-fg-2`} style={{ minHeight }}>
          {localValue ? <div dangerouslySetInnerHTML={{ __html: localValue }} /> : <p className="m-0 text-fg-4">{placeholder}</p>}
        </div>
      ) : (
        <div
          ref={editorRef}
          data-ph-mask
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder}
          onInput={handleInput}
          className={`prose ${styles.rich} ${styles.editor} overflow-auto p-3 text-base leading-relaxed text-fg outline-none`}
          style={{ minHeight }}
          data-placeholder={placeholder}
          suppressContentEditableWarning
        />
      )}
    </div>
  );
}
