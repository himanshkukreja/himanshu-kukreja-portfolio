import Link from "next/link";
import { notFound } from "next/navigation";
import { getWarRoom } from "@/lib/learn/war/load";
import { breadcrumbs, JsonLd } from "@/lib/seo/jsonld";
import WarRoomPlayer from "@/components/learn/war/WarRoomPlayer";
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
  const r = await getWarRoom((await params).slug);
  if (!r) return { title: "Not Found" };
  const title = `${r.title} · War room · System Design Mastery`;
  const description = `A ${r.sev} incident to play as the on-call engineer: ${r.decisions} calls, the escalation, the postmortem, and the real incident it is modelled on. Free.`;
  return { title, description, alternates: { canonical: r.href }, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } };
}

export default async function WarRoomPage({ params }: Props) {
  const r = await getWarRoom((await params).slug);
  if (!r) notFound();
  return (
    <main className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-12">
      <JsonLd
        data={breadcrumbs([
          { name: "War stories", path: "/learn/war-stories" },
          { name: r.title, path: r.href },
        ])}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
        <Link href="/learn/war-stories" className="hover:text-fg">
          War stories
        </Link>
        <span aria-hidden>/</span>
        <span className="text-signal-text">war room</span>
      </nav>
      <header className="flex flex-col gap-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span className="bg-bad px-1.5 py-0.5 font-semibold text-white">{r.sev}</span> · {r.company} · {r.starts}
        </span>
        <h1 className="m-0 font-display text-[clamp(32px,6vw,52px)] font-extrabold leading-[1] tracking-[-0.04em] text-fg">
          {r.title}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 text-[13px] text-fg-3">Fictional company and people. Modelled on a real public postmortem, named at the end.</p>
      </header>
      <WarRoomPlayer room={r} />
    </main>
  );
}
