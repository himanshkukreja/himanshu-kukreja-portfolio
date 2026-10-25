/** "Questions learners ask" files (resources/lesson-faq/<folder>/<slug>.md, written by scripts/ai-batch/faq.ts). Pure. */
import matter from "gray-matter";

export type FaqItem = { q: string; a: string; section: string | null };
export type LessonFaq = { lesson: string; model: string; generated: string; items: FaqItem[] };

export function parseFaq(raw: string): LessonFaq | null {
  const { data, content } = matter(raw);
  const items = content
    .split(/^###\s+/m)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const [q, ...rest] = b.split("\n");
      let a = rest.join("\n").trim();
      const m = a.match(/\s*\[([^\]]{2,120})\]\s*$/);
      const section = m ? m[1].trim() : null;
      if (m) a = a.slice(0, m.index).trim();
      return { q: q.trim(), a, section };
    })
    // every complete answer ends with its section in brackets: one without it was cut off, so it isn't shown
    .filter((x) => x.q && x.a && x.section);
  if (!items.length) return null;
  return { lesson: String(data.lesson || ""), model: String(data.model || ""), generated: String(data.generated || ""), items };
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** The FAQ item a typed question most likely duplicates (share of the question's words it covers), or null. */
export function matchFaq(items: FaqItem[], question: string, min = 0.6): FaqItem | null {
  const q = words(question);
  if (q.size < 2) return null;
  let best: { it: FaqItem; s: number } | null = null;
  for (const it of items) {
    const w = words(`${it.q} ${it.q}`);
    let hit = 0;
    for (const x of q) if (w.has(x)) hit++;
    const s = hit / q.size;
    if (!best || s > best.s) best = { it, s };
  }
  return best && best.s >= min ? best.it : null;
}
