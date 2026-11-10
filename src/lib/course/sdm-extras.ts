import "server-only";
/**
 * What an SDM lesson needs to render the two DSA directives it borrows: `:::tabs` (code in several languages) and
 * `::clip[id]` (a short in-article video). The renderer is told to honour only those two (DsaRenderOpts.only), so every
 * other SDM block keeps its meaning. Returns undefined for a lesson that uses neither, so the common page is untouched.
 *
 * Clips: resources/clips/<lecture id>.json (the DSA clips format: { lesson, clips: [{ id, caption, scene, steps }] }),
 * resolved into one-scene lectures. Their media sits at lectures/clips--<lesson week>--<slug>--<clip>/ on the lecture
 * host; a clip with no media (or media from another script) hides itself in the browser (LessonClip), so a lesson whose
 * clips are not recorded yet reads as if it had none.
 */
import { fetchMarkdownContent, isContentMissing } from "@/lib/github";
import { lectureMediaBase, lectureHash } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import { resolveDsaClip, type RawClips } from "@/lib/dsa/lecture";
import type { DsaRenderOpts } from "./detect/dsa";
import type { ConceptPage } from "@/lib/dsa/types";
import { SDM_DSA_ONLY, sdmClipQuest, usesSdmExtras } from "./sdm-extras-shared";

export { SDM_DSA_ONLY, sdmClipQuest, usesSdmExtras };
export type SdmClips = NonNullable<ConceptPage["clips"]>;

/** The lesson's clips as the browser's data (id, caption, media base, script hash, narration). Never throws. */
export async function sdmClips(week: string, slug: string, md: string): Promise<SdmClips> {
  if (!/^::clip\[/m.test(md)) return {};
  let raw: RawClips | null = null;
  try {
    raw = JSON.parse(await fetchMarkdownContent(`resources/clips/${lessonLectureId(week, slug)}.json`)) as RawClips;
  } catch (e) {
    if (!isContentMissing(e) && process.env.NODE_ENV !== "production") console.warn(`[clips] ${week}/${slug}:`, (e as Error).message);
    return {};
  }
  const media = lectureMediaBase();
  const out: SdmClips = {};
  for (const clip of raw?.clips ?? []) {
    const l = resolveDsaClip(clip, null, { module: week, concept: slug, title: slug });
    if (!l) continue;
    const quest = sdmClipQuest(week, slug, clip.id);
    const { dsa: _dsa, ...rest } = l;
    void _dsa;
    const lec = { ...rest, quest };
    out[clip.id] = { id: clip.id, caption: clip.caption, base: media ? `${media.replace(/\/$/, "")}/${quest}/` : null, v: lectureHash(lec), say: lec.scenes.flatMap((sc) => sc.steps.map((st) => st.say)) };
  }
  return out;
}

/** Render options for a lesson that uses tabs or clips, plus the clips for the page's hydrator. undefined: the lesson uses neither. */
export async function sdmRenderExtras(week: string, slug: string, md: string): Promise<{ dsa: DsaRenderOpts; clips: SdmClips } | undefined> {
  if (!usesSdmExtras(md)) return undefined;
  const clips = await sdmClips(week, slug, md);
  const files = Object.fromEntries(Object.values(clips).map((c) => [c.id, { caption: c.caption, files: c.base ? [`${c.base}video.mp4?v=${c.v}`, `${c.base}poster.jpg?v=${c.v}`, `${c.base}media.json`] : [] }]));
  return { dsa: { cast: {}, only: SDM_DSA_ONLY, clips: files }, clips };
}
