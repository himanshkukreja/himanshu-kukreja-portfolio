/**
 * Renders a page's typed version (the Markdown notes-convert writes) line by line, the way the page was written:
 * headings, bullets and numbers with their nesting, continuation lines under a bullet, clip quotes, diagram lines.
 * Everything is escaped first, so model output can never inject HTML (same rule as AiText).
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code class="bg-surface-2 px-1 font-mono text-[0.92em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-fg">$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[\?\]/g, '<span class="bg-signal/15 px-0.5 font-mono text-[0.9em] text-signal-text" title="the AI couldn&#39;t read this word">[?]</span>');

export function notesHtml(md: string, page = false): string {
  const out: string[] = [];
  let lastIndent = 0;
  for (const raw of md.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      out.push('<div class="h-2" aria-hidden="true"></div>');
      lastIndent = 0;
      continue;
    }
    const indent = (raw.match(/^\s*/)?.[0].length ?? 0) / 2;
    const line = raw.trim();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const big = h[1].length === 1;
      // the Text view of a page reads like a page: a real title and section heads
      const size = page ? (big ? "font-display text-[24px] font-extrabold tracking-[-0.02em] mb-1" : "font-display text-[18.5px] font-bold tracking-[-0.01em] mt-3") : big ? "text-[17px] font-semibold" : "text-[15.5px] font-semibold";
      out.push(`<p class="m-0 ${size} mt-1 leading-snug text-fg">${inline(h[2])}</p>`);
      lastIndent = 0;
      continue;
    }
    const b = line.match(/^([-*•]|\d+[.)])\s+(.*)$/);
    const pad = (n: number) => `padding-left:${Math.min(n, 6) * 1.1}rem`;
    if (b) {
      const mark = /\d/.test(b[1]) ? esc(b[1]) : "•";
      out.push(`<div class="flex gap-2" style="${pad(indent)}"><span aria-hidden="true" class="shrink-0 ${/\d/.test(b[1]) ? "font-mono text-[0.9em] text-fg-3" : "text-signal-text"}">${mark}</span><span class="min-w-0">${inline(b[2])}</span></div>`);
      lastIndent = indent + 1;
      continue;
    }
    if (line.startsWith(">")) {
      out.push(`<blockquote class="m-0 border-l-2 border-signal pl-3 text-fg-2" style="${pad(indent)}">${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }
    if (/^diagram:/i.test(line)) {
      out.push(`<p class="m-0 border border-line bg-surface px-2 py-1 font-mono text-[12.5px] leading-relaxed text-fg-2" style="${pad(indent)}">${inline(line)}</p>`);
      continue;
    }
    // a continuation line under a bullet keeps the bullet's indent
    out.push(`<p class="m-0" style="${pad(Math.max(indent, indent > 0 ? lastIndent : 0))}">${inline(line)}</p>`);
  }
  return out.join("");
}

export default function NotesMd({ md, page = false, className = "" }: { md: string; page?: boolean; className?: string }) {
  return <div className={`flex flex-col ${page ? "gap-1.5 text-[16.5px] leading-[1.7] text-fg" : "gap-1 text-[14.5px] leading-relaxed text-fg-2"} ${className}`} dangerouslySetInnerHTML={{ __html: notesHtml(md, page) }} />;
}
