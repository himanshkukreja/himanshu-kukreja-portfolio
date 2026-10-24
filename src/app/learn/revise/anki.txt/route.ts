import { getRevisionWeeks } from "@/lib/learn/revision/load";
import type { RevCard } from "@/lib/learn/revision/parse";

// Static, refreshed daily and on content pushes: every revision card as an Anki import file.
export const revalidate = 86400;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// a field may not contain tabs or newlines (they separate fields and notes)
const field = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
const tag = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function back(c: RevCard): string {
  switch (c.kind) {
    case "idea":
    case "ask":
      return esc(c.text);
    case "numbers":
      return `<ul>${c.items.map((i) => `<li><b>${esc(i.value)}</b> ${esc(i.label)}</li>`).join("")}</ul>`;
    case "mistakes":
      return `<ul>${c.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
    case "tradeoff":
      return (
        `<table><tr>${c.head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` +
        c.rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join("")}</tr>`).join("") +
        `</table>${c.note ? `<p>${esc(c.note)}</p>` : ""}`
      );
  }
}

/**
 * Anki: File → Import this file. Tab-separated, HTML on, one note per card: front (world, lesson,
 * card title), back (the card), tags (world, lesson, kind). Anki 2.1.55+ reads the header lines.
 */
export async function GET() {
  const weeks = await getRevisionWeeks().catch(() => []);
  const lines = ["#separator:tab", "#html:true", "#tags column:3", "#deck:System Design Mastery"];
  for (const w of weeks) {
    for (const l of w.lessons) {
      for (const c of l.cards) {
        const front = `<small>W${w.code} · ${esc(l.label)}</small><br>${esc(c.title)}`;
        const tags = ["sdm", `w${w.code}`, tag(l.slug), c.kind].join(" ");
        lines.push([field(front), field(back(c)), tags].join("\t"));
      }
    }
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="system-design-mastery-anki.txt"',
    },
  });
}
