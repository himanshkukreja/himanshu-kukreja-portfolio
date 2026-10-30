"use client";

/**
 * The DOM layer of a page: clips as cards with a link back to their source, snips as images (signed URLs via
 * snipUrl), text boxes as text (a textarea while being edited). Laid out in page units inside the page's scaled
 * layer, with the same metrics as the canvas renderer (geometry.ts CLIP / TEXT).
 */
import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { snipUrl } from "@/lib/learn/ink/client";
import { CLIP, TEXT } from "@/lib/learn/ink/geometry";
import { SHEET, type InkTheme } from "@/lib/learn/ink/render";
import { LIMITS, type PageItem } from "@/lib/learn/ink/types";

function SnipImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let off = false;
    snipUrl(path)
      .then((u) => !off && setUrl(u))
      .catch(() => !off && setFailed(true));
    return () => {
      off = true;
    };
  }, [path]);
  if (failed) return <span className="grid h-full w-full place-items-center font-mono text-[14px] text-fg-3">image unavailable</span>;
  if (!url) return <span className="block h-full w-full animate-pulse bg-surface-2" />;
  // eslint-disable-next-line @next/next/no-img-element -- a private signed URL, not an optimisable asset
  return <img src={url} alt={alt} draggable={false} className="block h-full w-full select-none object-contain" />;
}

function TextBox({ item, theme, editing, onText, onDone }: { item: Extract<PageItem, { kind: "text" }>; theme: InkTheme; editing: boolean; onText: (t: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(item.text);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [draft, editing]);
  const style = { fontSize: TEXT.font, lineHeight: `${TEXT.line}px`, padding: TEXT.pad, color: SHEET[theme].text } as const;
  if (!editing)
    return (
      <div className="whitespace-pre-wrap break-words" style={style}>
        {item.text}
      </div>
    );
  return (
    <textarea
      ref={ref}
      value={draft}
      aria-label="Text box"
      maxLength={LIMITS.textChars}
      onChange={(e) => {
        setDraft(e.target.value);
        onText(e.target.value);
      }}
      onBlur={onDone}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
      }}
      rows={1}
      placeholder="Type…"
      className="block w-full resize-none overflow-hidden border-0 bg-transparent outline outline-2 outline-dashed outline-signal placeholder:text-fg-4"
      style={style}
    />
  );
}

type Props = {
  items: PageItem[];
  theme: InkTheme;
  /** links and text boxes take pointer input (text and lasso tools); otherwise the pen draws over them */
  interactive: boolean;
  editingId: string | null;
  onText: (id: string, text: string) => void;
  onDoneEditing: (id: string) => void;
};

function PageItems({ items, theme, interactive, editingId, onText, onDoneEditing }: Props) {
  const c = SHEET[theme];
  return (
    <div className="absolute left-0 top-0" style={{ width: 0, height: 0 }}>
      {items.map((it) => {
        const pe = interactive || it.id === editingId ? "auto" : "none";
        if (it.kind === "snip")
          return (
            <div key={it.id} data-ink-item={it.id} className="absolute" style={{ left: it.x, top: it.y, width: it.w, height: it.h, border: `1.5px solid ${c.cardLine}`, background: c.card, pointerEvents: "none" }}>
              <SnipImage path={it.path} alt={`Snip from ${it.source.title}`} />
            </div>
          );
        if (it.kind === "clip")
          return (
            <div
              key={it.id}
              data-ink-item={it.id}
              className="absolute"
              style={{ left: it.x, top: it.y, width: it.w, padding: CLIP.pad, background: c.card, border: `1.5px solid ${c.cardLine}`, boxShadow: "inset 4px 0 0 #FF6B2B", pointerEvents: "none" }}
            >
              <Link
                href={it.source.href}
                className="block truncate font-mono font-semibold uppercase hover:underline"
                style={{ fontSize: 14, lineHeight: `${CLIP.head - 6}px`, height: CLIP.head, color: c.muted, letterSpacing: "0.04em", pointerEvents: pe }}
                title={`Open ${it.source.title}`}
              >
                Clip · {it.source.title} ↗
              </Link>
              <p className="m-0 whitespace-pre-wrap break-words" style={{ fontSize: CLIP.font, lineHeight: `${CLIP.line}px`, color: c.text }}>
                {it.text}
              </p>
            </div>
          );
        return (
          <div key={it.id} data-ink-item={it.id} data-ink-text className="absolute" style={{ left: it.x, top: it.y, width: it.w, pointerEvents: pe }}>
            <TextBox item={it} theme={theme} editing={editingId === it.id} onText={(t) => onText(it.id, t)} onDone={() => onDoneEditing(it.id)} />
          </div>
        );
      })}
    </div>
  );
}

export default memo(PageItems);
