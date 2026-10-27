import Link from "next/link";
import { getWarStories } from "@/lib/learn/war/load";
import { WarRoomGrid } from "@/components/learn/war/WarStoriesHub";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses).
export const revalidate = 86400;

export const metadata = {
  title: "War rooms · System Design Mastery",
  description: "You're on call: incident simulations played out in the channel, each modelled on a real public postmortem, where you make the calls.",
  alternates: { canonical: "/learn/war-stories/war-room" },
};

export default async function WarRoomsPage() {
  const { rooms } = await getWarStories();
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
        <Link href="/learn/war-stories" className="hover:text-fg">
          War stories
        </Link>
        <span aria-hidden>/</span>
        <span className="text-signal-text">War rooms</span>
      </nav>
      <header className="flex flex-col gap-4">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">❯ war room · you&apos;re on call</span>
        <h1 className="m-0 font-display text-[clamp(44px,8vw,96px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          Take the page<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[680px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          A SEV-1 plays out in the incident channel and you make the calls: what to check, what to roll back, what to tell customers. The company and people are fictional; each night is modelled on a real public
          postmortem, named at the end. Good practice for on-call and for the &ldquo;tell me about an incident&rdquo; interview question.
        </p>
        <p className="m-0 font-mono text-xs text-fg-3">
          {rooms.length} war room{rooms.length === 1 ? "" : "s"} · 8–15 minutes each · <Link href="/learn/war-stories" className="underline decoration-line-strong underline-offset-4 hover:text-fg">read the true stories →</Link>
        </p>
      </header>
      <WarRoomGrid rooms={rooms} />
    </main>
  );
}
