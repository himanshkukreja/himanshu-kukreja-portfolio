"use client";

/**
 * Compose: name, sender, subject (+ no-name fallback), preheader, tracking, and the body. Block
 * documents get a block editor (markdown text, buttons, features, callout, image, divider, raw
 * HTML); full templates (learn revamp, welcome) get HTML + plain-text editors. The tag picker inserts
 * `{{tag}}` at the cursor of the last focused field; unknown tags are listed live.
 */
import { useRef, type ChangeEvent, type FocusEvent } from "react";
import { Badge, Card, LABEL } from "@/components/admin/ui";
import { Field, btnCls, inputCls } from "@/components/admin/content/common";
import { BLOCK_LABELS, emptyBlock, newBlockId, type Block, type BlockType, type BlocksDoc, type RawDoc } from "@/lib/campaigns/render";
import { MERGE_TAGS, type TagProblem } from "@/lib/campaigns/tags";
import type { Sender, TemplateInfo } from "@/lib/campaigns/types";
import { CheckBadge, Note, Toggle, codeAreaCls, cx, textareaCls } from "./bits";
import type { Draft } from "./types";

type Target = { el: HTMLInputElement | HTMLTextAreaElement; set: (v: string) => void };
type FieldEl = HTMLInputElement | HTMLTextAreaElement;

const BLOCK_TYPES: BlockType[] = ["hero", "text", "button", "feature", "callout", "image", "divider", "html"];

export default function Composer({
  draft,
  onChange,
  senders,
  problems,
  readOnly,
  template,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  senders: Sender[];
  problems: TagProblem[];
  readOnly?: boolean;
  template?: TemplateInfo | null;
}) {
  const target = useRef<Target | null>(null);
  const sender = senders.find((s) => s.id === draft.senderId) || senders.find((s) => s.isDefault) || senders[0];

  /** value/onChange/onFocus for a text field that the tag picker can insert into */
  const bind = (value: string, set: (v: string) => void) => ({
    value,
    readOnly,
    onChange: (e: ChangeEvent<FieldEl>) => set(e.target.value),
    onFocus: (e: FocusEvent<FieldEl>) => {
      target.current = { el: e.currentTarget, set };
    },
  });

  const insert = (tag: string) => {
    if (readOnly) return;
    const t = target.current;
    const token = `{{${tag}}}`;
    if (!t || !t.el.isConnected) {
      onChange({ ...draft, subject: `${draft.subject}${draft.subject.endsWith(" ") || !draft.subject ? "" : " "}${token}` });
      return;
    }
    const el = t.el;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    t.set(el.value.slice(0, s) + token + el.value.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };

  const setDoc = (doc: Draft["doc"]) => onChange({ ...draft, doc });
  const raw = draft.doc.layout === "raw";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card label="1 · envelope" title="Sender, subject, preheader">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Field label="Campaign name (internal)">
            <input className={inputCls} value={draft.name} readOnly={readOnly} onChange={(e) => onChange({ ...draft, name: e.target.value })} maxLength={120} />
          </Field>
          <Field label="Send from" hint={sender ? <span className="flex flex-col items-start gap-1"><CheckBadge check={sender.check} /> <span>{sender.check.message}</span></span> : "No sender configured"}>
            <select className={inputCls} value={sender?.id || ""} disabled={readOnly} onChange={(e) => onChange({ ...draft, senderId: e.target.value })}>
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fromName ? `${s.fromName} <${s.fromEmail}>` : s.fromEmail}
                  {s.isDefault ? " · default" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
            <Field label="Subject" hint="Use {{first_name}} for a personal subject; the fallback below is used when a tag has no value.">
              <input className={inputCls} {...bind(draft.subject, (v) => onChange({ ...draft, subject: v }))} maxLength={300} />
            </Field>
          </div>
          <Field label="Subject when the name is unknown">
            <input className={inputCls} {...bind(draft.subjectFallback || "", (v) => onChange({ ...draft, subjectFallback: v }))} maxLength={300} placeholder="(optional)" />
          </Field>
          <Field label="Preheader (inbox preview text)" hint={raw ? "Full templates carry their own preheader inside the HTML." : undefined}>
            <input className={inputCls} {...bind(draft.preheader || "", (v) => onChange({ ...draft, preheader: v }))} maxLength={300} disabled={raw} />
          </Field>
          <div className="flex flex-wrap gap-x-6 md:col-span-2 xl:col-span-1 2xl:col-span-2">
            <Toggle on={draft.trackOpens} disabled={readOnly} onChange={(v) => onChange({ ...draft, trackOpens: v })} label="Track opens" hint="1×1 pixel per recipient" />
            <Toggle on={draft.trackClicks} disabled={readOnly} onChange={(v) => onChange({ ...draft, trackClicks: v })} label="Track clicks" hint="wraps links to our domain + socials" />
          </div>
        </div>
      </Card>

      {!readOnly && <TagPicker onInsert={insert} />}

      {problems.length > 0 && (
        <Note tone="bad" title={`${problems.length} problem${problems.length === 1 ? "" : "s"} · fix before testing or sending`}>
          <ul className="m-0 list-none p-0">
            {problems.slice(0, 8).map((p, i) => (
              <li key={i} className="break-words">
                <span className="font-mono text-xs text-fg-3">{p.where}</span> · {p.message}
              </li>
            ))}
          </ul>
        </Note>
      )}

      {draft.doc.layout === "raw" ? (
        <RawEditor doc={draft.doc} bind={bind} setDoc={setDoc} template={template} readOnly={readOnly} />
      ) : (
        <BlocksEditor doc={draft.doc} bind={bind} setDoc={setDoc} readOnly={readOnly} />
      )}
    </div>
  );
}

function TagPicker({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div className="sticky top-[calc(var(--hk-header-h,57px)+49px)] z-20 border border-line bg-surface/95 px-3 py-2 backdrop-blur lg:top-[calc(var(--hk-header-h,57px)+8px)]">
      <div className="flex items-center gap-2">
        <span className={`${LABEL} shrink-0`}>insert tag</span>
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]" role="toolbar" aria-label="Merge tags">
          {MERGE_TAGS.map((t) => (
            <button
              key={t.tag}
              type="button"
              title={`${t.label} · ${t.hint}`}
              // keep the caret in the field being edited
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onInsert(t.tag)}
              className="min-h-9 shrink-0 whitespace-nowrap border border-line-strong px-2 font-mono text-[11px] text-fg-2 hover:border-signal hover:text-signal-text"
            >
              {`{{${t.tag}}}`}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 mt-1 hidden text-[11px] text-fg-4 sm:block">
        Fallback: <code className="font-mono">{"{{first_name|there}}"}</code> · conditional: <code className="font-mono">{"{{#if first_name}}Hi {{first_name}}{{else}}Hi{{/if}}"}</code>
      </p>
    </div>
  );
}

type Bind = (value: string, set: (v: string) => void) => {
  value: string;
  readOnly?: boolean;
  onChange: (e: ChangeEvent<FieldEl>) => void;
  onFocus: (e: FocusEvent<FieldEl>) => void;
};

function RawEditor({ doc, bind, setDoc, template, readOnly }: { doc: RawDoc; bind: Bind; setDoc: (d: RawDoc) => void; template?: TemplateInfo | null; readOnly?: boolean }) {
  const pristine = template?.doc.layout === "raw" && template.doc.html === doc.html && template.doc.text === doc.text;
  return (
    <Card
      label="2 · body · full template"
      title={doc.source ? `Generated from ${doc.source}` : "Custom HTML"}
      action={
        !readOnly && template?.doc.layout === "raw" && !pristine ? (
          <button type="button" className={btnCls} onClick={() => setDoc(template.doc as RawDoc)}>
            ↺ reset to template
          </button>
        ) : pristine ? (
          <Badge tone="ok">matches template</Badge>
        ) : undefined
      }
    >
      <p className="m-0 mb-3 text-sm text-fg-3">
        This is the approved design, already converted to merge tags (<code className="font-mono text-xs">{"{{first_name}}"}</code>, <code className="font-mono text-xs">{"{{email}}"}</code>,{" "}
        <code className="font-mono text-xs">{"{{unsubscribe_url}}"}</code>). Edit with care; the preview updates as you type.
      </p>
      <div className="grid gap-4 2xl:grid-cols-2">
        <Field label={`HTML · ${(doc.html.length / 1024).toFixed(1)} KB`}>
          <textarea className={codeAreaCls} rows={18} spellCheck={false} {...bind(doc.html, (v) => setDoc({ ...doc, html: v }))} />
        </Field>
        <Field label="Plain-text version">
          <textarea className={codeAreaCls} rows={18} spellCheck={false} {...bind(doc.text, (v) => setDoc({ ...doc, text: v }))} />
        </Field>
      </div>
    </Card>
  );
}

const FIELD_META: Record<string, { label: string; area?: boolean; mono?: boolean; rows?: number }> = {
  eyebrow: { label: "Eyebrow" },
  title: { label: "Title" },
  md: { label: "Text · markdown", area: true, rows: 5 },
  label: { label: "Label" },
  url: { label: "Link", mono: true },
  tag: { label: "Tag" },
  src: { label: "Image URL (https)", mono: true },
  alt: { label: "Alt text" },
  href: { label: "Link (optional)", mono: true },
  html: { label: "HTML", area: true, mono: true, rows: 6 },
};

function BlocksEditor({ doc, bind, setDoc, readOnly }: { doc: BlocksDoc; bind: Bind; setDoc: (d: BlocksDoc) => void; readOnly?: boolean }) {
  const setBlock = (i: number, b: Block) => setDoc({ ...doc, blocks: doc.blocks.map((x, j) => (j === i ? b : x)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= doc.blocks.length) return;
    const blocks = [...doc.blocks];
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setDoc({ ...doc, blocks });
  };
  const add = (t: BlockType) => setDoc({ ...doc, blocks: [...doc.blocks, emptyBlock(t)] });

  return (
    <Card label="2 · body · blocks" title="Content blocks" bodyClassName="flex flex-col gap-3 p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Top bar label">
          <input className={inputCls} {...bind(doc.topLabel, (v) => setDoc({ ...doc, topLabel: v }))} maxLength={60} />
        </Field>
        <Field label="Footer (an Unsubscribe link is always added)">
          <input className={inputCls} {...bind(doc.footer, (v) => setDoc({ ...doc, footer: v }))} maxLength={2000} />
        </Field>
      </div>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {doc.blocks.map((b, i) => (
          <li key={b.id} className="border border-line bg-bg">
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                <span className="text-signal-text">{String(i + 1).padStart(2, "0")}</span> · {BLOCK_LABELS[b.type]}
              </span>
              {!readOnly && (
                <span className="flex items-center">
                  <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    ↑
                  </IconBtn>
                  <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === doc.blocks.length - 1}>
                    ↓
                  </IconBtn>
                  <IconBtn label="Duplicate" onClick={() => setDoc({ ...doc, blocks: [...doc.blocks.slice(0, i + 1), { ...b, id: newBlockId() }, ...doc.blocks.slice(i + 1)] })}>
                    ⧉
                  </IconBtn>
                  <IconBtn label="Delete block" onClick={() => setDoc({ ...doc, blocks: doc.blocks.filter((_, j) => j !== i) })} danger>
                    ×
                  </IconBtn>
                </span>
              )}
            </div>
            {b.type !== "divider" && (
              <div className={cx("grid gap-3 p-3", b.type !== "text" && b.type !== "html" && "sm:grid-cols-2")}>
                {Object.keys(b)
                  .filter((k) => k !== "id" && k !== "type")
                  .map((k) => {
                    const meta = FIELD_META[k] || { label: k };
                    const value = (b as unknown as Record<string, string>)[k] ?? "";
                    const set = (v: string) => setBlock(i, { ...b, [k]: v } as Block);
                    const wide = meta.area || (b.type === "feature" && k === "md");
                    return (
                      <div key={k} className={cx(wide && "sm:col-span-2")}>
                        <Field label={meta.label}>
                          {meta.area ? (
                            <textarea className={meta.mono ? codeAreaCls : textareaCls} rows={meta.rows || 4} spellCheck={!meta.mono} {...bind(value, set)} />
                          ) : (
                            <input className={cx(inputCls, meta.mono && "font-mono text-[13px]")} spellCheck={!meta.mono} {...bind(value, set)} />
                          )}
                        </Field>
                      </div>
                    );
                  })}
              </div>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && (
        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>add block</span>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_TYPES.map((t) => (
              <button key={t} type="button" className={btnCls} onClick={() => add(t)}>
                + {BLOCK_LABELS[t].toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function IconBtn({ children, label, onClick, disabled, danger }: { children: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cx("grid h-10 w-10 place-items-center font-mono text-sm disabled:opacity-30", danger ? "text-fg-3 hover:text-bad-text" : "text-fg-3 hover:text-fg")}
    >
      {children}
    </button>
  );
}
