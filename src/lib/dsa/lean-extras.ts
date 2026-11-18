import "server-only";
/**
 * What a lean lesson's page shows around the lesson text: where it sits among the lessons of its group ("Street 2 of 6"), the
 * previous and next written lessons of that group, and its 60-second shorts. The same shape as lesson-extras.ts.
 */
import { liveDsaShortIds } from "./media";
import { getLeanIndex, getLeanShort, getLeanShortIds } from "./kinds-load";
import { LEAN_BRANCH_WORD } from "./kinds";
import type { LessonExtras } from "./lesson-extras";

export async function getLeanExtras(module: string, lesson: string): Promise<LessonExtras> {
  const [index, shortIds] = await Promise.all([getLeanIndex(), getLeanShortIds(module, lesson).then(liveDsaShortIds).catch(() => [] as string[])]);
  const group = index.filter((x) => x.module === module);
  const at = group.findIndex((x) => x.id === lesson);
  const me = group[at];
  const link = (x: (typeof group)[number] | undefined) => (x ? { href: x.href, title: x.title } : null);
  const shorts = (
    await Promise.all(
      shortIds.slice(0, 8).map(async (sid) => {
        const slug = sid.split("--").pop() || "";
        return { sid, l: await getLeanShort(module, lesson, slug).catch(() => null) };
      }),
    )
  )
    .filter((x) => x.l)
    .map((x) => ({ href: `/dsa/shorts/${x.sid}`, title: x.l!.title }));
  return {
    nav: { position: me ? `${LEAN_BRANCH_WORD[me.kind]} ${at + 1} of ${group.length}` : "Lesson", prev: at > 0 ? link(group[at - 1]) : null, next: at >= 0 ? link(group[at + 1]) : null },
    shorts,
    shortsHref: shortIds.length ? `/dsa/shorts?of=${encodeURIComponent(`dsa--${module}--${lesson}`)}` : null,
  };
}
