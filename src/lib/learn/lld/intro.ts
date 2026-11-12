import "server-only";
/**
 * The low-level design track's intro lecture (resources/lectures/low-level-design--lld-intro.json), played inline on
 * the LLD home as its MP4. Same shape as a DSA solution video (src/lib/dsa/media.ts solutionVideoFor): media from
 * another version of the script is ignored, the player fetches the captions itself, a chapter per scene.
 * null: no media host, no script, or not recorded yet; the page then shows the link to the lecture page instead.
 */
import { getLecture, lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";

export const LLD_INTRO = "low-level-design--lld-intro";

export type IntroVideo = { href: string; src: string; poster: string; captionsUrl: string; chapters: { title: string; at: number }[]; duration: number; title: string };

export async function lldIntroVideo(): Promise<IntroVideo | null> {
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  const l = await getLecture(LLD_INTRO).catch(() => null);
  if (!l) return null;
  const v = lectureHash(l);
  try {
    const res = await fetch(`${base}/${LLD_INTRO}/media.json`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { source?: string; duration?: number; starts?: number[]; video?: string };
    if (m.source !== v || !m.video) return null;
    const starts = m.starts || [];
    let n = 0;
    const chapters = l.scenes.map((s) => {
      const at = starts[n] ?? 0;
      n += s.steps.length;
      return { title: s.title, at: Number(at.toFixed(2)) };
    });
    return { href: `/lectures/${LLD_INTRO}`, captionsUrl: `${base}/${LLD_INTRO}/captions.vtt?v=${v}`, src: `${base}/${LLD_INTRO}/video.mp4?v=${v}`, poster: `${base}/${LLD_INTRO}/poster.jpg?v=${v}`, chapters, duration: Number(m.duration) || 0, title: l.title };
  } catch {
    return null;
  }
}
