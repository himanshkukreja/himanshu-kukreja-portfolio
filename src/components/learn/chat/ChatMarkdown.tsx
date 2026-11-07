"use client";

/**
 * A tutor answer as React elements (never HTML from the model): paragraphs, lists, **bold**, *italic*, `code`,
 * fenced code, "###" section labels, small tables, "> **Key takeaway:** …" callouts, ```mermaid diagrams (ChatDiagram),
 * and citations [[s3]] as small numbered chips that link to the resource. A chip only renders for a ref the page
 * knows (sent by the server from a tool result), with the index's own link. Also renders the in-lesson Ask AI
 * panels' answers (no refs there: their [Section] citations stay text).
 */
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CircleHelp, Lightbulb, Mic, Quote } from "lucide-react";
import type { ChatSource } from "@/lib/ai/chat/text";
import { REF_RE } from "@/lib/ai/chat/text";
import { splitTables, type MdTable } from "@/components/learn/ai/mdTable";
import ChatDiagram, { DiagramPending } from "./ChatDiagram";
import SourceIcon from "./SourceIcon";

/** `caret`: a blinking block at the end of the text (while it is being revealed). */
type Props = { text: string; sources?: Record<string, ChatSource>; order?: string[]; className?: string; caret?: boolean };

// the caret rides at the very end of the text as an invisible mark, so it lands inside the last block (a paragraph, a list item, code)
const CARET = "⁣";
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
    // a bold line may carry its citation ("**The answer in one line [[s2]].**")
    else if (t.startsWith("**")) out.push(<strong key={`${key}b${i++}`} className="font-semibold text-fg">{inline(t.slice(2, -2), sources, order, `${key}b${i}`)}</strong>);
    else if (t.startsWith("[[")) {
      const refs = [...t.matchAll(REF_RE)].flatMap((x) => x[1].split(",").map((r) => r.trim().toLowerCase()));
      out.push(<Cite key={`${key}r${i++}`} refs={refs} sources={sources} order={order} />);
    } else out.push(<em key={`${key}i${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(<Fragment key={`${key}t${i++}`}>{withCaret(text.slice(last), `${key}k${i}`)}</Fragment>);
  return out;
}

/** a list line: "- x", "* x", "• x", "1. x" or "1) x" (the number is group 1) */
const LIST_RE = /^\s*(?:[-*•]|(\d+)[.)])\s+/;
const HEADING_RE = /^\s*#{1,6}\s+/;
const QUOTE_RE = /^\s*>\s?/;
/** a callout's label: "> **Key takeaway:** …" (the colon inside or outside the bold) */
const CALLOUT_RE = /^\*\*\s*(key takeaway|takeaway|quick check|in an interview,? say|interview tip|remember)\s*:?\s*\*\*\s*:?\s*/i;

type Fence = { lang: string; code: string; closed: boolean };
/** The text split into prose and fenced blocks (``` lines); a fence still being written is `closed: false`. */
function splitFences(t: string): (string | Fence)[] {
  const out: (string | Fence)[] = [];
  let prose: string[] = [];
  let fence: { lang: string; lines: string[] } | null = null;
  for (const line of t.split("\n")) {
    const bare = line.replace(CARET, "");
    if (!fence) {
      const m = /^\s*```\s*([\w-]*)\s*$/.exec(bare);
      if (!m) {
        prose.push(line);
        continue;
      }
      if (prose.length) out.push(prose.join("\n"));
      prose = [];
      fence = { lang: m[1].toLowerCase(), lines: [] };
    } else if (/^\s*```\s*$/.test(bare)) {
      out.push({ lang: fence.lang, code: fence.lines.join("\n"), closed: true });
      fence = null;
    } else fence.lines.push(line);
  }
  if (fence) out.push({ lang: fence.lang, code: fence.lines.join("\n"), closed: false });
  else if (prose.length) out.push(prose.join("\n"));
  return out;
}

function Table({ t, sources, order, k }: { t: MdTable; sources: Record<string, ChatSource>; order: string[]; k: string }) {
  const al = (i: number) => (t.align[i] ? { textAlign: t.align[i]! } : undefined);
  return (
    <div className="max-w-full overflow-x-auto overscroll-x-contain border border-line [-webkit-overflow-scrolling:touch]" role="region" aria-label="Table" tabIndex={0}>
      <table className="m-0 w-full border-collapse text-[0.9em] leading-snug">
        <thead>
          <tr>
            {t.head.map((h, i) => (
              <th key={i} scope="col" style={al(i)} className="whitespace-nowrap border-b border-line-strong bg-surface-2 px-2.5 py-1.5 text-left text-[0.92em] font-semibold text-fg">
                {inline(h, sources, order, `${k}h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) =>
                i === 0 ? (
                  <th key={i} scope="row" style={al(i)} className="min-w-[6.5rem] border-t border-line px-2.5 py-1.5 text-left align-top font-medium text-fg">
                    {inline(c, sources, order, `${k}r${ri}c${i}`)}
                  </th>
                ) : (
                  <td key={i} style={al(i)} className="min-w-[6.5rem] border-t border-line px-2.5 py-1.5 align-top text-fg-2">
                    {inline(c, sources, order, `${k}r${ri}c${i}`)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "> **Key takeaway:** …" as a box in the theme's tokens; "Quick check" and "In an interview, say" get their own label. */
function Callout({ lines, sources, order, k }: { lines: string[]; sources: Record<string, ChatSource>; order: string[]; k: string }) {
  const first = lines[0] ?? "";
  const m = CALLOUT_RE.exec(first);
  const kind = m ? m[1].toLowerCase() : "";
  // the label stands alone in the box, so "**Key takeaway:** the cache…" reads "The cache…"
  const rest = m ? first.slice(m[0].length) : "";
  const body = m ? [rest.charAt(0).toLocaleUpperCase() + rest.slice(1), ...lines.slice(1)] : lines;
  const look = kind.startsWith("quick")
    ? { label: "quick check", Icon: CircleHelp }
    : kind.startsWith("in an interview") || kind === "interview tip"
      ? { label: "in an interview, say", Icon: Mic }
      : kind
        ? { label: "key takeaway", Icon: Lightbulb }
        : null;
  if (!look)
    return (
      <blockquote className="m-0 flex gap-2 border-l-2 border-line-strong pl-3 text-fg-2">
        <Quote className="mt-1 h-3.5 w-3.5 shrink-0 text-fg-4" aria-hidden />
        <span className="min-w-0">
          {body.map((l, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(l, sources, order, `${k}-${j}`)}
            </Fragment>
          ))}
        </span>
      </blockquote>
    );
  return (
    <aside aria-label={look.label} className="m-0 flex flex-col gap-1 border border-line border-l-[3px] border-l-signal bg-surface-2 px-3.5 py-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-label text-signal-text">
        <look.Icon className="h-3.5 w-3.5" aria-hidden />
        {look.label}
      </span>
      <p className="m-0 text-fg">
        {body.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, sources, order, `${k}-${j}`)}
          </Fragment>
        ))}
      </p>
    </aside>
  );
}

const NONE: Record<string, ChatSource> = {};

export default function ChatMarkdown({ text, sources = NONE, order = [], className = "", caret = false }: Props) {
  const blocks: ReactNode[] = [];
  const parts = splitFences(`${text.replace(/\r\n/g, "\n").replace(/\s+$/, "")}${caret ? CARET : ""}`);
  parts.forEach((part, pi) => {
    if (typeof part !== "string") {
      const isMermaid = part.lang === "mermaid";
      // a diagram is drawn only once its fence has closed (a half-written one would only fail to parse)
      if (isMermaid && part.closed) return blocks.push(<ChatDiagram key={`p${pi}`} code={part.code.replace(CARET, "")} />);
      if (!part.closed && (isMermaid || (part.lang && "mermaid".startsWith(part.lang)))) return blocks.push(<DiagramPending key={`p${pi}`} />);
      if (!part.closed && !part.lang && !part.code.replace(CARET, "").trim()) return;
      const code = part.code.replace(/\n$/, "");
      blocks.push(
        <pre key={`p${pi}`} className="m-0 overflow-x-auto border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed text-fg-2">
          {withCaret(code, `p${pi}c`)}
        </pre>,
      );
      return;
    }
    part.split(/\n{2,}/).forEach((para, k) => {
      const all = para.split("\n").filter((l) => l.trim());
      // a table may sit right under a lead-in line, in the same paragraph
      splitTables(all).forEach((chunk, ti) => {
        if ("table" in chunk) return blocks.push(<Table key={`p${pi}-${k}-t${ti}`} t={chunk.table} sources={sources} order={order} k={`p${pi}-${k}-t${ti}`} />);
        // a block can mix a lead-in line, a label, a callout and a list ("**Fixes it with a ring:**" then "- …" lines):
        // split it into runs; an indented line after an item continues that item
        const runs: { kind: "p" | "ul" | "ol" | "h" | "q"; lines: string[]; start: number }[] = [];
        for (const l of chunk.lines) {
          const m = l.match(LIST_RE);
          const last = runs[runs.length - 1];
          if (HEADING_RE.test(l)) runs.push({ kind: "h", lines: [l.replace(HEADING_RE, "").replace(/^\*\*(.+)\*\*$/, "$1")], start: 1 });
          else if (QUOTE_RE.test(l)) {
            const body = l.replace(QUOTE_RE, "");
            if (last?.kind === "q") last.lines.push(body);
            else runs.push({ kind: "q", lines: [body], start: 1 });
          } else if (m) {
            const kind = m[1] ? "ol" : "ul";
            if (last?.kind === kind) last.lines.push(l.slice(m[0].length));
            else runs.push({ kind, lines: [l.slice(m[0].length)], start: m[1] ? Number(m[1]) : 1 });
          } else if (last && (last.kind === "ul" || last.kind === "ol") && /^\s{2,}\S/.test(l)) last.lines[last.lines.length - 1] += ` ${l.trim()}`;
          else if (last?.kind === "p") last.lines.push(l);
          else runs.push({ kind: "p", lines: [l], start: 1 });
        }
        runs.forEach((r, ri) => {
          const key = `p${pi}-${k}-${ti}-${ri}`;
          if (r.kind === "h") {
            blocks.push(
              <h3 key={key} className="m-0 -mb-1.5 font-display text-[15px] font-semibold leading-snug text-fg">
                {inline(r.lines[0], sources, order, key)}
              </h3>,
            );
            return;
          }
          if (r.kind === "q") return blocks.push(<Callout key={key} lines={r.lines} sources={sources} order={order} k={key} />);
          if (r.kind === "p") {
            blocks.push(
              <p key={key} className="m-0">
                {r.lines.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(l, sources, order, `${key}-${j}`)}
                  </Fragment>
                ))}
              </p>,
            );
            return;
          }
          const items = r.lines.map((l, j) => <li key={`${key}-${j}`}>{inline(l, sources, order, `${key}-${j}`)}</li>);
          // a numbered list the model split with blank lines ("1. …\n\n2. …") keeps counting from its own number
          blocks.push(
            r.kind === "ol" ? (
              <ol key={key} start={r.start !== 1 ? r.start : undefined} className="m-0 flex list-decimal flex-col gap-1 pl-5">
                {items}
              </ol>
            ) : (
              <ul key={key} className="m-0 flex list-disc flex-col gap-1 pl-5">
                {items}
              </ul>
            ),
          );
        });
      });
    });
  });
  return <div className={`flex min-w-0 flex-col gap-3 break-words text-[15.5px] leading-relaxed text-fg-2 [overflow-wrap:anywhere] ${className}`}>{blocks}</div>;
}
