import { getCourseMap } from "@/lib/learn/course";
import { getMasteryData } from "@/lib/concepts/mastery-data";
import MasteryMap from "@/components/learn/concepts/MasteryMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Concept map · Learn · Himanshu Kukreja",
  description: "Every concept in System Design Mastery, coloured by how well you know it, with a two-minute refresher for each.",
};

export default async function MasteryPage() {
  const [map, data] = await Promise.all([getCourseMap(), getMasteryData()]);
  if (!map) return null;
  if (!data) {
    return (
      <main className="mx-auto flex max-w-[760px] flex-col gap-3 px-4 pb-32 pt-12 sm:px-6">
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">concept map</span>
        <h1 className="font-display text-[34px] font-extrabold leading-none tracking-[-0.04em] text-fg">The concept map is on its way</h1>
        <p className="text-[15px] leading-relaxed text-fg-2">The concept catalogue couldn&apos;t be loaded right now. Your progress is safe; try again in a minute.</p>
      </main>
    );
  }
  return <MasteryMap data={data} map={map} />;
}
