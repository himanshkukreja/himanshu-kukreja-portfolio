import type { Metadata } from "next";
import { controlMap, isLive, questKey, shortKey } from "@/lib/learn/controls";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getShort, lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import { listShorts } from "@/lib/learn/shorts/load";
import { SHORT_CATEGORIES } from "@/lib/learn/shorts/types";
import { JsonLd, breadcrumbs, videoObject } from "@/lib/seo/jsonld";
import { isoDuration, mediaInfo } from "@/lib/seo/video";
import ShortRecord from "@/components/learn/lecture/ShortRecord";
import ShortPlayer from "@/components/learn/war/ShortPlayer";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const [l, all] = await Promise.all([getShort(id), listShorts().catch(() => [])]);
  if (!l) return null;
  return { l, s: all.find((x) => x.id === l.quest) ?? null };
}

/** The narration, one paragraph per scene: the transcript search engines (and readers) get. */
const transcript = (l: NonNullable<Awaited<ReturnType<typeof getShort>>>) => l.scenes.map((sc) => sc.steps.map((st) => st.say.trim()).join(" ")).filter(Boolean);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await load((await params).id);
  if (!r) return { title: "Not Found" };
  const { l, s } = r;
  const description = transcript(l).join(" ").replace(/\s+/g, " ").slice(0, 155).replace(/\s\S*$/, "…");
  const title = `${l.title} · Short`;
  return {
    title,
    description,
    alternates: { canonical: `/learn/shorts/${l.quest}` },
    openGraph: { title, description, type: "video.other", ...(s ? { images: [{ url: s.poster, width: 1080, height: 1920, alt: l.title }], videos: [{ url: s.src, type: "video/mp4", width: 1080, height: 1920 }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(s ? { images: [s.poster] } : {}) },
  };
}

/**
 * A short's own address. Visitors and search engines get its watch page: the video, the transcript,
 * the full lecture and article, and "keep swiping" into the feed at this short. The exporter records
 * the portrait stage here with ?record=1 (ShortRecord switches on the client).
 */
export default async function ShortPage({ params }: Props) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const { l, s } = r;
  // hidden or scheduled in /admin/publishing (itself or its side quest): not a page
  const controls = await controlMap();
  if (!isLive(controls.get(shortKey(l.quest))) || (l.short?.of && !isLive(controls.get(questKey(l.short.of))))) notFound();
  const media = await mediaInfo(l.quest);
  const paras = transcript(l);
  const cat = s ? SHORT_CATEGORIES.find((c) => c.id === s.category)?.label : null;
  const path = `/learn/shorts/${l.quest}`;
  return (
    <ShortRecord lecture={l} source={lectureHash(l)} mediaBase={lectureMediaBase()}>
      {media && (
        <JsonLd
          data={[
            videoObject({ name: l.title, description: paras.join(" ").slice(0, 2000), path, thumbnailUrl: media.thumbnailUrl, contentUrl: media.contentUrl, uploadDate: media.uploadDate, duration: isoDuration(media.duration) }),
            breadcrumbs([
              { name: "Learn", path: "/learn" },
              { name: "Shorts", path: "/learn/shorts" },
              { name: l.title, path },
            ]),
          ]}
        />
      )}
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pb-32 pt-6 sm:px-6 sm:pt-10 lg:flex-row lg:items-start lg:pb-20">
        {s && (
          <div className="mx-auto w-full max-w-[360px] shrink-0 lg:sticky lg:top-24 lg:mx-0">
            <ShortPlayer short={s} />
          </div>
        )}
        <article className="flex min-w-0 flex-1 flex-col gap-5">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs text-fg-3">
            <Link href="/learn/shorts" className="hover:text-fg">
              shorts
            </Link>
            <span aria-hidden>›</span>
            <span className="text-signal-text">{cat ? cat.toLowerCase() : "short"}</span>
          </nav>
          <div className="flex flex-col gap-2">
            {s && <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">{s.label}</span>}
            <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">{l.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/learn/shorts?v=${encodeURIComponent(l.quest)}`} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
              keep swiping →
            </Link>
            {s?.full && (
              <Link href={s.full} className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
                ▶ full lecture
              </Link>
            )}
            {s?.article && (
              <Link href={s.article} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
                <BookOpen className="h-3.5 w-3.5 text-signal-text" aria-hidden /> read it
              </Link>
            )}
          </div>
          <section aria-labelledby="transcript-h" className="flex flex-col gap-3 border-t border-line pt-5">
            <h2 id="transcript-h" className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">
              transcript
            </h2>
            {paras.map((p, i) => (
              <p key={i} className="m-0 text-[16px] leading-relaxed text-fg-2">
                {p}
              </p>
            ))}
          </section>
        </article>
      </main>
    </ShortRecord>
  );
}
