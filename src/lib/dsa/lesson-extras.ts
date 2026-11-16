import "server-only";
/**
 * What the lesson page shows around the lesson text, from the course index (Phase 2a): where this lesson sits in its
 * module ("Lesson 3 of 6"), the previous and next built lessons, and its 60-second shorts. Small and cached with the
 * rest of the DSA content (getConceptIndex, getConceptShortIds, getDsaShort).
 */
import { liveDsaShortIds } from "./media";
import { getConceptIndex, getConceptShortIds, getDsaShort, lessonHref } from "./load";

export type LessonExtras = {
  nav: { position: string; prev: { href: string; title: string } | null; next: { href: string; title: string } | null };
  shorts: { href: string; title: string }[];
  shortsHref: string | null;
};

export async function getLessonExtras(id: string, module: string): Promise<LessonExtras> {
  const [index, shortIds] = await Promise.all([getConceptIndex(), getConceptShortIds(id).then(liveDsaShortIds).catch(() => [] as string[])]);
  const built = index.filter((x) => x.status === "built");
  const at = built.findIndex((x) => x.id === id);
  const inModule = built.filter((x) => x.module === module);
  const slot = inModule.findIndex((x) => x.id === id);
  const link = (x: (typeof built)[number] | undefined) => (x ? { href: lessonHref(x), title: x.title } : null);
  const shorts = (await Promise.all(shortIds.slice(0, 8).map(async (sid) => ({ sid, l: await getDsaShort(sid).catch(() => null) }))))
    .filter((x) => x.l)
    .map((x) => ({ href: `/dsa/shorts/${x.sid}`, title: x.l!.title }));
  return {
    nav: {
      position: slot >= 0 ? `Lesson ${slot + 1} of ${inModule.length}` : "Lesson",
      prev: at > 0 ? link(built[at - 1]) : null,
      next: at >= 0 ? link(built[at + 1]) : null,
    },
    shorts,
    shortsHref: shortIds.length ? `/dsa/shorts?of=${encodeURIComponent(`dsa--${module}--${id}`)}` : null,
  };
}
