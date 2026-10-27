import Link from "next/link";
import { notFound } from "next/navigation";
import { getStory, getWarStories } from "@/lib/learn/war/load";
import { THEME_LABEL } from "@/lib/learn/war/types";
import { breadcrumbs, JsonLd } from "@/lib/seo/jsonld";
import StoryRead from "@/components/learn/war/StoryRead";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";

export const runtime = "nodejs";
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const s = await getStory((await params).slug);
  if (!s) return { title: "Not Found" };
  const title = `${s.title} · War stories`;
  return { title, description: s.hook, alternates: { canonical: s.href }, openGraph: { title, description: s.hook, type: "article" }, twitter: { card: "summary_large_image", title, description: s.hook } };
}

export default async function StoryPage({ params }: Props) {
  const s = await getStory((await params).slug);
  if (!s) notFound();
  const [{ stories }, lecture] = await Promise.all([getWarStories(), getLecture(lessonLectureId("war-stories", s.slug)).then(lectureCard).catch(() => null)]);
  const i = stories.findIndex((x) => x.slug === s.slug);
  const next = stories.length > 1 ? stories[(i + 1) % stories.length] : null;
  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 pb-24 pt-6 sm:px-6 sm:pt-12">
      <JsonLd
        data={breadcrumbs([
          { name: "War stories", path: "/learn/war-stories" },
          { name: s.title, path: s.href },
        ])}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
        <Link href="/learn/war-stories" className="hover:text-fg">
          War stories
        </Link>
        <span aria-hidden>/</span>
        <span className="text-signal-text">{THEME_LABEL[s.theme]}</span>
      </nav>
      <header className="flex flex-col gap-3">
        <h1 className="m-0 font-display text-[clamp(32px,6vw,52px)] font-extrabold leading-[1] tracking-[-0.04em] text-fg">
          {s.title}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 text-[18px] leading-relaxed text-fg-2">{s.hook}</p>
        <p className="m-0 font-mono text-xs text-fg-3">
          {s.company}
          {s.when ? ` · ${s.when}` : ""} · {s.minutes} min read · a true story, sources below
        </p>
        <SaveOfflineButton title={`War story · ${s.title}`} kind="warstory" url={s.href} className="self-start" />
      </header>
      {lecture && <LectureEntry lecture={lecture} what="The whole story" className="m-0" />}
      <article className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: s.html }} />
      <section aria-labelledby="src-h" className="flex flex-col gap-2 border-t border-line pt-5">
        <h2 id="src-h" className="m-0 font-mono text-xs uppercase tracking-label text-fg-3">
          Sources
        </h2>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {s.sources.map((src) => (
            <li key={src.url}>
              <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-[15px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                {src.label} ↗
              </a>
            </li>
          ))}
        </ul>
      </section>
      <StoryRead slug={s.slug} />
      {s.lesson && (
        <Link href={s.lesson.href} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 hover:border-fg-3 sm:px-5">
          <span className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">the idea behind it · {s.lesson.code}</span>
            <span className="text-[16px] font-semibold text-fg">{s.lesson.title}</span>
          </span>
          <span className="font-mono text-sm text-signal-text">read the lesson →</span>
        </Link>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <Link href="/learn/war-stories" className="font-mono text-xs text-fg-3 underline underline-offset-4 hover:text-fg">
          ← all war stories
        </Link>
        {next && (
          <Link href={next.href} className="text-[15px] font-semibold text-fg underline decoration-line-strong underline-offset-4 hover:decoration-signal">
            Next: {next.title} →
          </Link>
        )}
      </footer>
    </main>
  );
}
