import "server-only";
/**
 * A lecture's or short's published media for search engines: the real length, the video file, the
 * poster, the upload date (the media.json's Last-Modified) and the chapters. Read from the media host
 * once per page render (the pages are ISR), never per visit.
 */
import { lectureMediaBase } from "@/lib/learn/lecture/load";

export type MediaInfo = { contentUrl: string; thumbnailUrl: string; duration: number; uploadDate: string; chapters: { title: string; at: number }[] };

export async function mediaInfo(id: string): Promise<MediaInfo | null> {
  const base = (lectureMediaBase() || "").replace(/\/$/, "");
  if (!/^https?:\/\//.test(base)) return null;
  try {
    const res = await fetch(`${base}/${id}/media.json`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const m = (await res.json()) as { video?: string; poster?: string; duration?: number };
    if (!m.video || !m.duration) return null;
    const chapters = await fetch(`${base}/${id}/chapters.json`, { next: { revalidate: 86400 } })
      .then((r) => (r.ok ? (r.json() as Promise<{ title: string; at: number }[]>) : []))
      .catch(() => []);
    const lm = Date.parse(res.headers.get("last-modified") || "");
    return {
      contentUrl: `${base}/${id}/${m.video}`,
      thumbnailUrl: `${base}/${id}/${m.poster || "poster.jpg"}`,
      duration: m.duration,
      uploadDate: new Date(Number.isFinite(lm) ? lm : Date.now()).toISOString(),
      chapters: Array.isArray(chapters) ? chapters.filter((c) => c && typeof c.title === "string" && Number.isFinite(c.at)) : [],
    };
  } catch {
    return null;
  }
}

/** ISO 8601 duration: 872.8 → "PT14M33S". */
export const isoDuration = (sec: number) => {
  const s = Math.max(1, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s % 60 ? `${s % 60}S` : ""}`;
};
