import "server-only";
import matter from "gray-matter";
import { unstable_cache } from "next/cache";
import { DSA_CONTENT_TAG, dsaFresh, readDsa, dsaItem, dsaItemKey } from "./content";
import { conceptHref, getConceptIndex, getStepLabels } from "./load";
import { stepOf, stepRank } from "./steps";
import type { DsaDeck, DsaRevCard } from "./revise";

/**
 * The pattern decks on /dsa/revise (server): one deck per built concept, read from its lesson.md. Nothing is written
 * here: the cards are the lesson's reviewCards, its invariant, its signals, its key points and its mistake-museum
 * exhibits (`:::example[Exhibit n: …]{kind="wrong-approach"}`, the closing paragraph being the explanation). Cached
 * with the DSA content (tag dsa-content); fresh on every read in development with DSA_LOCAL_DIR.
 */

type LessonFront = {
  title?: string;
  invariant?: string;
  keyPoints?: string[];
  signals?: string[];
  reviewCards?: { front?: string; back?: string }[];
};

/** Markdown → one line of plain text (inline code keeps its text, emphasis and links lose their marks). */
function plain(md: string): string {
  return md
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function pitfallsOf(md: string): { title: string; why: string }[] {
  const out: { title: string; why: string }[] = [];
  const re = /^:::example\[([^\]]+)\]\{kind="wrong-approach"\}\s*\n([\s\S]*?)\n:::\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md))) {
    const title = plain(m[1]).replace(/^Exhibit\s+\d+\s*:\s*/i, "");
    // paragraphs outside code fences; the last one explains what goes wrong
    const body = m[2].replace(/```[\s\S]*?```/g, "");
    const paras = body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith(":::") && !p.startsWith("|"));
    const why = plain(paras[paras.length - 1] || "");
    if (title && why) out.push({ title, why });
  }
  return out;
}

function deckCards(title: string, f: LessonFront, md: string): DsaRevCard[] {
  const cards: DsaRevCard[] = [];
  (f.reviewCards || []).forEach((c, i) => {
    if (c?.front && c?.back) cards.push({ id: `card-${i + 1}`, kind: "card", front: plain(c.front), back: plain(c.back) });
  });
  if (f.invariant) cards.push({ id: "invariant", kind: "invariant", front: `${title}: what is the invariant, in one sentence?`, back: plain(f.invariant) });
  const signals = (f.signals || []).map((s) => plain(String(s))).filter(Boolean);
  if (signals.length) cards.push({ id: "signals", kind: "signals", front: `Which words in a problem statement point to ${title.toLowerCase()}?`, back: signals.join(", "), points: signals });
  const ideas = (f.keyPoints || []).map((k) => plain(String(k))).filter(Boolean);
  if (ideas.length) cards.push({ id: "ideas", kind: "ideas", front: `${title}: the key ideas`, back: ideas.join(" "), points: ideas });
  pitfallsOf(md).forEach((p, i) => cards.push({ id: `pitfall-${i + 1}`, kind: "pitfall", front: `${title}, mistake: ${p.title}. What goes wrong?`, back: p.why }));
  return cards;
}

async function load(): Promise<DsaDeck[]> {
  const [concepts, labels] = await Promise.all([getConceptIndex(), getStepLabels().catch(() => ({}))]);
  const built = concepts.filter((c) => c.status === "built").sort((a, b) => stepRank(labels, a.module) - stepRank(labels, b.module) || a.order - b.order);
  const decks = await Promise.all(
    built.map(async (c): Promise<DsaDeck | null> => {
      const md = await readDsa(`resources/modules/${c.module}/${c.id}/lesson.md`);
      if (!md) return null;
      const { data, content } = matter(md, {});
      const f = data as LessonFront;
      const title = f.title || c.title;
      const cards = deckCards(title, f, content);
      if (!cards.length) return null;
      return { concept: c.id, module: c.module, moduleCode: stepOf(labels, c.module).label, title, href: conceptHref(c.id), cards };
    }),
  );
  return decks.filter((d): d is DsaDeck => !!d);
}

const cachedLoad = unstable_cache(dsaItem(load), ["dsa-revise-decks-v2", dsaItemKey(load)], { revalidate: 604800, tags: [DSA_CONTENT_TAG] });

export function getDsaDecks(): Promise<DsaDeck[]> {
  return dsaFresh() ? load() : cachedLoad();
}
