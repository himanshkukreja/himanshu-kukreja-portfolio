/**
 * "Connected to what you've done" (owner-approved 12 Nov 2026): a small panel on System Design lessons, LLD case studies
 * and DSA Mastery lessons and problems that links the page to what this learner has done (or is about to do) in the other
 * course. Deterministic, no AI: the links are the content's own (DSA lessons' and problems' `:::realsystems{sdm lab}`
 * boxes, and the code labs' lesson lists), filtered by the learner's real progress. Nothing relevant: no lines (the panel
 * hides). Pure, so the route and the Node tests share it.
 *
 *   SDM lesson / LLD case   DSA concepts that link here (directly, or through a lab that teaches this lesson):
 *                           "You solved 3 Sliding window problems in DSA Mastery: Rate limiting at scale uses the same idea"
 *                           and labs of this lesson the learner passed that a DSA concept links:
 *                           "Your LRU cache lab used Linked lists from DSA Mastery"
 *   DSA concept / problem   the System Design lessons and labs it links that the learner read, passed or has next:
 *                           "You read Caching patterns in System Design Mastery: it runs on this"
 */

export type IndexConcept = { id: string; title: string; href: string; sdm: string[]; labs: string[] };
export type IndexLab = { id: string; title: string; href: string; lessons: string[] };
export type LinkIndex = { concepts: IndexConcept[]; labs: IndexLab[]; lessons: Record<string, { title: string; href: string }> };

export type LinkProgress = {
  /** System Design and LLD lessons finished ("week/slug") */
  sdmDone: Set<string>;
  /** the next few System Design lessons ("week/slug"): the course's next and the plan's coming days */
  sdmNext: Set<string>;
  labsDone: Set<string>;
  /** DSA concepts whose lesson is finished */
  dsaDone: Set<string>;
  /** solved problems per DSA concept */
  dsaSolved: Map<string, number>;
  /** DSA concepts up next */
  dsaNext: Set<string>;
};

export type LinkCtx =
  | { kind: "sdm"; key: string; title: string }
  | { kind: "dsa-concept"; id: string }
  | { kind: "dsa-problem"; id: string; concept: string; sdm: string[]; labs: string[] };

export type Connection = { text: string; href: string; state: "done" | "next" };

export const MAX_CONNECTIONS = 3;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const clean = (p: string) => p.replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");

/** The lesson keys a path names ("labs/<id>" is a lab, not a lesson). */
const lessonKeyOf = (p: string) => {
  const c = clean(p);
  return c.startsWith("labs/") ? null : c;
};
const labOf = (p: string) => {
  const c = clean(p);
  return c.startsWith("labs/") ? c.slice(5) : null;
};

export function connections(ctx: LinkCtx, ix: LinkIndex, pr: LinkProgress): Connection[] {
  const out: (Connection & { rank: number })[] = [];
  const seen = new Set<string>();
  const add = (c: Connection, rank: number) => {
    if (seen.has(c.href)) return;
    seen.add(c.href);
    out.push({ ...c, rank });
  };

  if (ctx.kind === "sdm") {
    const key = clean(ctx.key);
    // labs that teach this lesson
    const labsHere = ix.labs.filter((l) => l.lessons.some((x) => clean(x) === key));
    const labIds = new Set(labsHere.map((l) => l.id));
    const linked = ix.concepts.filter((c) => c.sdm.some((p) => lessonKeyOf(p) === key) || c.labs.some((id) => labIds.has(id)) || c.sdm.some((p) => labIds.has(labOf(p) ?? "")));
    for (const c of linked) {
      const n = pr.dsaSolved.get(c.id) ?? 0;
      if (n > 0) add({ text: `You solved ${plural(n, `${c.title} problem`)} in DSA Mastery: ${ctx.title} uses the same idea.`, href: c.href, state: "done" }, 100 + n);
      else if (pr.dsaDone.has(c.id)) add({ text: `You finished the DSA lesson on ${c.title}: ${ctx.title} builds on it.`, href: c.href, state: "done" }, 90);
      else if (pr.dsaNext.has(c.id)) add({ text: `Coming up in DSA Mastery: ${c.title}, the structure under this lesson.`, href: c.href, state: "next" }, 40);
    }
    for (const l of labsHere) {
      if (!pr.labsDone.has(l.id)) continue;
      const c = linked.find((x) => x.labs.includes(l.id) || x.sdm.some((p) => labOf(p) === l.id));
      if (c) add({ text: `Your ${l.title} lab used ${c.title} from DSA Mastery.`, href: l.href, state: "done" }, 80);
    }
  } else {
    const c = ix.concepts.find((x) => x.id === (ctx.kind === "dsa-concept" ? ctx.id : ctx.concept));
    const paths = [...new Set([...(ctx.kind === "dsa-problem" ? ctx.sdm : []), ...(c?.sdm ?? [])].map(clean))];
    const labs = new Set([...(ctx.kind === "dsa-problem" ? ctx.labs : []), ...(c?.labs ?? []), ...paths.map(labOf).filter((x): x is string => !!x)]);
    const what = ctx.kind === "dsa-concept" ? "this lesson's idea" : "this problem's idea";
    paths.forEach((p, i) => {
      const k = lessonKeyOf(p);
      const l = k ? ix.lessons[k] : null;
      if (!k || !l) return;
      if (pr.sdmDone.has(k)) add({ text: `You read ${l.title} in System Design Mastery: it runs on ${what}.`, href: l.href, state: "done" }, 100 - i);
      else if (pr.sdmNext.has(k)) add({ text: `Coming up in System Design Mastery: ${l.title} uses ${what}.`, href: l.href, state: "next" }, 40 - i);
    });
    for (const id of labs) {
      const l = ix.labs.find((x) => x.id === id);
      if (l && pr.labsDone.has(id)) add({ text: `Your ${l.title} lab used ${what}.`, href: l.href, state: "done" }, 90);
    }
  }
  return out
    .sort((a, b) => b.rank - a.rank)
    .slice(0, MAX_CONNECTIONS)
    .map(({ rank: _r, ...c }) => (void _r, c));
}
