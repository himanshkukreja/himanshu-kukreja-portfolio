import Link from "next/link";
import { Prompt, container, h2Class, primaryBtn } from "./ui";

const GAMES = [
  { week: "W04 · caching", name: "Cache or Miss", hook: "Beat LRU at eviction." },
  { week: "W01 · data at scale", name: "Hash Ring", hook: "Add a node, move the fewest keys." },
  { week: "W02 · failure-first", name: "Trip the Breaker", hook: "You can’t see the service while it’s open." },
  { week: "W00 · foundations", name: "Back of the Envelope", hook: "Estimate WhatsApp-scale in 10 seconds." },
  { week: "W05 · consistency", name: "Race Condition", hook: "Double-book a seat, then fix it." },
  { week: "W10 · production", name: "Incident Commander", hook: "The pager just went off." },
];

export default function GamesTeaser() {
  return (
    <section aria-labelledby="play-h" className="border-y border-line bg-raised">
      <div className={`${container} flex flex-col gap-6 py-12 sm:py-16`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Prompt>ls ~/playground</Prompt>
            <h2 id="play-h" className={h2Class}>
              Break things on purpose
            </h2>
          </div>
          <Link href="/play" className={primaryBtn}>
            Open the Playground →
          </Link>
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))]">
          {GAMES.map((g) => (
            <li key={g.name} className="flex">
              <Link
                href="/play"
                className="flex w-full flex-col gap-2 border border-line bg-bg p-3 text-fg no-underline hover:border-line-strong hover:bg-surface sm:min-h-[132px] sm:p-4"
              >
                <span className="font-mono text-[11px] text-fg-3">{g.week}</span>
                <span className="font-display text-lg font-bold leading-[1.05] tracking-[-0.02em] sm:text-xl">{g.name}</span>
                <span className="text-[13px] leading-snug text-fg-2">{g.hook}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
