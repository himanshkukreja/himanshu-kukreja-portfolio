import { getContributions, GITHUB_USER, type ContribData } from "@/lib/github-contrib";
import { Prompt, container, h2Class } from "../ui";
import ContribSnake from "./ContribSnake";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WD[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

const statLabel = "font-mono text-[11px] uppercase tracking-label text-fg-3";
const statValue = "font-display text-[26px] font-extrabold leading-none tracking-[-0.04em] sm:text-[34px]";

function Stats({ data }: { data: ContribData }) {
  const offline = data.source === "offline";
  const tiles = [
    { k: "contributions", v: data.total.toLocaleString("en-US"), accent: true, sub: offline ? "placeholder year" : "last 12 months" },
    { k: "current streak", v: `${data.currentStreak}d`, sub: data.currentStreak ? "and counting" : "resting" },
    { k: "longest streak", v: `${data.longestStreak}d`, sub: "consecutive days" },
    {
      k: "busiest day",
      v: data.bestDay ? String(data.bestDay.count) : "—",
      sub: data.bestDay ? dayLabel(data.bestDay.date) : "",
    },
  ];
  return (
    <dl className="m-0 grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.k} className="flex min-w-0 flex-col gap-1.5 bg-bg px-3 py-3 sm:px-4 sm:py-3.5">
          <dt className={statLabel}>{t.k}</dt>
          <dd className={`m-0 ${statValue} ${t.accent ? "text-signal-text" : "text-fg"}`}>{t.v}</dd>
          <dd className="m-0 font-mono text-[11px] text-fg-4">{t.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ContribSection() {
  const data = await getContributions();
  const offline = data.source === "offline";
  return (
    <section id="commits" aria-labelledby="commits-h" className={`${container} flex scroll-mt-20 flex-col gap-6 py-12 sm:py-16`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Prompt>git log --graph --since=1.year --author={GITHUB_USER}</Prompt>
          <h2 id="commits-h" className={h2Class}>
            Commit history, now edible
          </h2>
        </div>
        <span className="max-w-[420px] text-[15px] text-fg-3">
          {offline ? (
            <>
              <span className="mr-1.5 border border-line-strong px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-label text-fg-2">offline</span>
              GitHub didn&rsquo;t answer, so this is a stand-in year. The snake is still hungry.
            </>
          ) : (
            <>Every square is a real day on my GitHub. The snake is eating it. Hit play and finish the job.</>
          )}
        </span>
      </div>
      <Stats data={data} />
      <ContribSnake data={data} />
    </section>
  );
}

/** Same footprint as the section while GitHub is being asked (keeps the page from jumping). */
export function ContribSectionSkeleton() {
  return (
    <section aria-hidden className={`${container} flex flex-col gap-6 py-12 sm:py-16`}>
      <div className="flex flex-col gap-3">
        <Prompt>git log --graph --since=1.year</Prompt>
        <span className={`${h2Class} text-fg-4`}>Commit history…</span>
      </div>
      <div className="h-[86px] border border-line bg-surface" />
      <div className="h-[260px] border border-line-strong bg-surface" />
    </section>
  );
}
