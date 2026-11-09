import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen } from "lucide-react";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getDsaShort } from "@/lib/dsa/load";
import { listDsaShorts } from "@/lib/dsa/media";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import ShortRecord from "@/components/learn/lecture/ShortRecord";
import ShortPlayer from "@/components/learn/war/ShortPlayer";
import DsaCrumbs from "@/components/dsa/DsaCrumbs";

// /dsa/shorts/<id>: one DSA short's own page (the video, its transcript, the full lecture and the lesson, "keep
// swiping" into the feed). ?record=1 is the MP4 exporter's view: the 9:16 stage (scripts/lecture/export.mjs), which
// works before the short is published. Staging only until launch.

export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

const transcript = (l: NonNullable<Awaited<ReturnType<typeof getDsaShort>>>) => l.scenes.map((sc) => sc.steps.map((st) => st.say.trim()).join(" ")).filter(Boolean);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const l = await getDsaShort((await params).id).catch(() => null);
  if (!l) return { title: "Not found" };
  return { title: `${l.title} · Short · DSA Mastery`, description: transcript(l).join(" ").slice(0, 155), alternates: { canonical: `/dsa/shorts/${l.quest}` }, robots: { index: false, follow: false } };
}

export default async function DsaShortPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const l = await getDsaShort(id);
  if (!l) notFound();
  const s = (await listDsaShorts({ includeUnpublished: true }).catch(() => [])).find((x) => x.id === l.quest) ?? null;
  const paras = transcript(l);
  return (
    <ShortRecord lecture={l} source={lectureHash(l)} mediaBase={lectureMediaBase()}>
      <div className="dsa-theme">
        <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-4 pb-32 pt-6 sm:px-6 sm:pt-10 lg:flex-row lg:items-start lg:pb-20">
          <div className="mx-auto w-full max-w-[360px] shrink-0 lg:sticky lg:top-24 lg:mx-0">
            {s?.recorded ? (
              <ShortPlayer short={s} />
            ) : (
              <div className="grid aspect-[9/16] w-full place-items-center border border-dashed border-line-strong bg-surface p-6 text-center text-[14px] text-fg-3">The video for this short is being recorded.</div>
            )}
          </div>
          <article className="flex min-w-0 flex-1 flex-col gap-5">
            <DsaCrumbs items={[{ href: "/dsa", label: "Learn" }, { href: "/dsa/shorts", label: "Shorts" }, { label: l.short?.label || "Short" }]} />
            <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">{l.title}</h1>
            <div className="flex flex-wrap gap-2">
              <Link href={`/dsa/shorts?v=${encodeURIComponent(l.quest)}`} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
                keep swiping →
              </Link>
              {s?.full && (
                <Link href={s.full} className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
                  ▶ full lecture
                </Link>
              )}
              {s?.article && (
                <Link href={s.article} className="inline-flex min-h-11 items-center gap-2 border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
                  <BookOpen className="h-3.5 w-3.5 text-signal-text" aria-hidden /> read the lesson
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
      </div>
    </ShortRecord>
  );
}
