import Link from "next/link";
import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import { TRACKS, trackBySlug } from "@/lib/learn/tracks";
import { resolveTrack } from "@/components/learn/tracks/resolve";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push.
export const revalidate = 86400;
export const dynamicParams = false;
export function generateStaticParams() {
  return TRACKS.map((t) => ({ company: t.slug }));
}

type Props = { params: Promise<{ company: string }> };

export async function generateMetadata({ params }: Props) {
  const t = trackBySlug((await params).company);
  if (!t) return { title: "Not Found" };
  return {
    title: `${t.company} system design prep track · System Design Mastery`,
    description: `A free system design prep path for ${t.company}: ${t.focus.join(", ")}. Lessons, real-system case studies and a mock interview, in order.`,
    alternates: { canonical: `/learn/tracks/${t.slug}` },
  };
}

export default async function TrackPage({ params }: Props) {
  const t = trackBySlug((await params).company);
  if (!t) notFound();
  const map = await getCourseMap(COURSE_ID);
  if (!map) notFound();
  const r = resolveTrack(map, t);
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <Link href="/learn/tracks" className="font-mono text-xs uppercase tracking-label text-fg-3 hover:text-fg">
          ← all company tracks
        </Link>
        <h1 className="font-display text-[40px] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg sm:text-[56px]">
          {t.company} prep track<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2">
          {t.company} builds {t.builds}. These stops cover the systems behind that, in the order to study them. Built from the products, not from leaked questions.
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {t.focus.map((f) => (
            <li key={f} className="border border-line-strong px-2.5 py-1 font-mono text-xs text-fg-2">
              {f}
            </li>
          ))}
        </ul>
      </header>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {r.items.map((it, i) => (
          <li key={it.lesson.href}>
            <Link href={it.lesson.href} className="flex items-start gap-4 border border-line bg-surface p-4 hover:border-fg-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong font-mono text-sm text-fg">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                  {it.lesson.tag} · {it.lesson.minutes} min
                </span>
                <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg">{it.lesson.title}</span>
                <span className="text-[15px] text-fg-2">{it.why}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {r.mock && (
        <Link href={r.mock.href} className="flex flex-col gap-1 border border-signal p-5 hover:bg-surface-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">then the mock interview</span>
          <span className="font-display text-[22px] font-bold text-fg">
            {r.mock.title} · {r.mock.company}
          </span>
          <span className="text-sm text-fg-2">Timed, with curveballs and a levelled rubric. Or practise it with a real person on peer mocks.</span>
        </Link>
      )}
    </main>
  );
}
