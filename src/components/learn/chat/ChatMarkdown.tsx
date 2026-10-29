"use client";

/**
 * A tutor answer as React elements (never HTML from the model): paragraphs, lists, **bold**, *italic*,
 * `code`, fenced code, and citations [[s3]] as small numbered chips that link to the resource. A chip only
 * renders for a ref the page knows (sent by the server from a tool result), with the index's own link.
 */
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { ChatSource } from "@/lib/ai/chat/text";
import { REF_RE } from "@/lib/ai/chat/text";
import SourceIcon from "./SourceIcon";

/** `caret`: a blinking block at the end of the text (while it is being revealed). */
type Props = { text: string; sources: Record<string, ChatSource>; order: string[]; className?: string; caret?: boolean };

// the caret rides at the very end of the text as an invisible mark, so it lands inside the last block (a paragraph, a list item, code)
const CARET = "\u2063";
const Caret = () => <span aria-hidden className="hk-caret" />;
function withCaret(t: string, key: string): ReactNode {
  if (!t.includes(CARET)) return t;
  const [a, b] = t.split(CARET);
  return (
    <Fragment key={key}>
      {a}
      <Caret />
      {b}
    </Fragment>
  );
}

// no lookbehind: older Safari can't parse it
const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*?\*(?![\w*])|\[\[[^\]]+\]\])/g;

function Cite({ refs, sources, order }: { refs: string[]; sources: Record<string, ChatSource>; order: string[] }) {
  const known = refs.filter((r) => sources[r]);
  if (!known.length) return null;
  return (
    <span className="whitespace-nowrap">
      {known.map((r) => {
        const s = sources[r];
        const n = order.indexOf(r) + 1;
        return (
          <Link
            key={r}
            href={s.href}
            title={`${s.title} · ${s.sub}`}
            aria-label={`Source ${n || ""}: ${s.title}`}
            className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center gap-0.5 border border-line-strong px-1 align-[2px] font-mono text-[10.5px] font-semibold text-signal-text no-underline hover:border-signal hover:text-fg"
          >
            <SourceIcon kind={s.kind} className="h-2.5 w-2.5" />
            {n || "·"}
          </Link>
        );
      })}
    </span>
  );
}

function inline(text: string, sources: Record<string, ChatSource>, order: string[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(<Fragment key={`${key}t${i++}`}>{withCaret(text.slice(last, m.index), `${key}k${i}`)}</Fragment>);
    const t = m[0];
    if (t.startsWith("`")) out.push(<code key={`${key}c${i++}`} className="bg-surface-2 px-1 font-mono text-[0.9em] text-fg">{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={`${key}b${i++}`} className="font-semibold text-fg">{t.slice(2, -2)}</strong>);
    else if (t.startsWith("[[")) {
      const refs = [...t.matchAll(REF_RE)].flatMap((x) => x[1].split(",").map((r) => r.trim().toLowerCase()));
      out.push(<Cite key={`${key}r${i++}`} refs={refs} sources={sources} order={order} />);
    } else out.push(<em key={`${key}i${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}t${i++}`}>{withCaret(text.slice(last), `${key}k${i}`)}</Fragment>);
  return out;
}

export default function ChatMarkdown({ text, sources, order, className = "", caret = false }: Props) {
  const blocks: ReactNode[] = [];
  const parts = `${text.replace(/\r\n/g, "\n").replace(/\s+$/, "")}${caret ? CARET : ""}`.split(/^```[\w-]*\n?/m);
  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      const code = part.replace(/```\s*$/, "").replace(/\n$/, "");
      blocks.push(
        <pre key={`p${pi}`} className="m-0 overflow-x-auto border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg-2">
          {withCaret(code, `p${pi}c`)}
        </pre>,
      );
      return;
    }
    part.split(/\n{2,}/).forEach((para, k) => {
      const lines = para.split("\n").filter((l) => l.trim());
      if (!lines.length) return;
      const key = `p${pi}-${k}`;
      if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ordered = /^\s*\d/.test(lines[0]);
        const items = lines.map((l, j) => <li key={`${key}-${j}`}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), sources, order, `${key}-${j}`)}</li>);
        blocks.push(ordered ? <ol key={key} className="m-0 flex list-decimal flex-col gap-1 pl-5">{items}</ol> : <ul key={key} className="m-0 flex list-disc flex-col gap-1 pl-5">{items}</ul>);
      } else {
        const ls = lines.map((l) => l.replace(/^#{1,6}\s+/, ""));
        blocks.push(
          <p key={key} className="m-0">
            {ls.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, sources, order, `${key}-${j}`)}
              </Fragment>
            ))}
          </p>,
        );
      }
    });
  });
  return <div className={`flex min-w-0 flex-col gap-3 break-words text-[15.5px] leading-relaxed text-fg-2 [overflow-wrap:anywhere] ${className}`}>{blocks}</div>;
}
