/**
 * Renders an AI answer: plain Markdown subset (paragraphs, lists, **bold**, *italic*, inline code,
 * fenced code). Everything is escaped first, so model output can never inject HTML.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code class="bg-surface-2 px-1 font-mono text-[0.92em]">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-fg">$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");

export function aiHtml(md: string): string {
  const out: string[] = [];
  const blocks = md.replace(/\r\n/g, "\n").split(/\n```[a-z]*\n?|```/);
  blocks.forEach((b, i) => {
    if (i % 2 === 1) {
      out.push(`<pre class="overflow-x-auto border border-line bg-surface-2 p-3 font-mono text-[12.5px] leading-relaxed">${esc(b.replace(/\n$/, ""))}</pre>`);
      return;
    }
    for (const para of b.split(/\n{2,}/)) {
      const lines = para.split("\n").filter((l) => l.trim());
      if (!lines.length) continue;
      if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
        const ordered = /^\s*\d/.test(lines[0]);
        out.push(`<${ordered ? "ol" : "ul"} class="my-0 flex flex-col gap-1 pl-5 ${ordered ? "list-decimal" : "list-disc"}">${lines.map((l) => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      } else if (/^#{1,4}\s/.test(lines[0])) {
        out.push(`<p class="m-0 font-semibold text-fg">${inline(lines[0].replace(/^#+\s*/, ""))}</p>${lines.length > 1 ? `<p class="m-0">${lines.slice(1).map(inline).join("<br/>")}</p>` : ""}`);
      } else out.push(`<p class="m-0">${lines.map(inline).join("<br/>")}</p>`);
    }
  });
  return out.join("");
}

export default function AiText({ text, className = "" }: { text: string; className?: string }) {
  return <div className={`flex flex-col gap-3 text-[15px] leading-relaxed text-fg-2 ${className}`} dangerouslySetInnerHTML={{ __html: aiHtml(text) }} />;
}
