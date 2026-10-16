import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isValidHandle } from "@/lib/share/handle";
import { achievementFor, COURSE_NAME, withRef } from "@/lib/share/model";
import { getPublicProfile } from "@/lib/share/stats";
import { Avatar, StartCta } from "@/components/share/PublicProfile";
import RefCapture from "@/components/share/RefCapture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string; achievement: string }> };

const ID = /^[a-z0-9-]{2,40}$/;

async function load(handle: string, id: string) {
  if (!isValidHandle(handle) || !ID.test(id)) return null;
  const p = await getPublicProfile(handle).catch(() => null);
  if (!p) return null;
  return { p, a: achievementFor(p, id) };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle, achievement } = await params;
  const r = await load(handle, achievement);
  if (!r) notFound();
  const who = r.p.name || `@${r.p.handle}`;
  const title = r.a ? `${who} · ${r.a.title}` : who;
  const description = r.a ? `${r.a.sub}. ${who} on ${COURSE_NAME}, the free system design course. Can you do it too?` : `${who} on ${COURSE_NAME}.`;
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `/u/${r.p.handle}/a/${achievement}` },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** One achievement, big. Not earned (yet) or hidden → the learner's page; unpublished → 404. */
export default async function AchievementPage({ params }: Params) {
  const { handle, achievement } = await params;
  const r = await load(handle, achievement);
  if (!r) notFound();
  const { p, a } = r;
  if (!a) redirect(`/u/${p.handle}`);
  const who = p.name ? p.name.split(" ")[0] : `@${p.handle}`;

  return (
    <main className="mx-auto flex max-w-[960px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-14">
      <RefCapture handle={p.handle} />
      <section aria-labelledby="ach-h" className="flex flex-col gap-6 border border-signal bg-surface p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-signal px-2 py-1 font-mono text-[11px] font-semibold tracking-label text-on-signal">ACHIEVEMENT</span>
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-2">{a.kicker}</span>
        </div>
        <h1 id="ach-h" className="break-words font-display text-[clamp(44px,9vw,104px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
          {a.title}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-fg-2">{a.sub}</p>
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
          <Link href={`/u/${p.handle}`} className="flex min-h-12 items-center gap-3">
            <Avatar p={p} size={48} />
            <span className="flex flex-col">
              <span className="text-[17px] font-semibold text-fg">{p.name || `@${p.handle}`}</span>
              <span className="font-mono text-[12px] text-fg-3">
                {p.level ? `${p.level.code} ${p.level.name}` : "learner"}
                {p.course && p.level ? ` · ${p.course.pct}% through the course` : ""}
              </span>
            </span>
          </Link>
          <Link href={`/u/${p.handle}`} className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2">
            See {who}&apos;s full progress →
          </Link>
        </div>
      </section>
      <StartCta handle={p.handle} who={who} />
      <Link href={withRef("/learn/arena/daily", p.handle)} className="self-center font-mono text-[13px] text-signal-text underline underline-offset-4">
        or take today&apos;s 2-minute daily challenge →
      </Link>
    </main>
  );
}
