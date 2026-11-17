"use client";

/**
 * "Interview sets by company type": the home's link into Practice > By company type. Company sets (fintech, ...) are not
 * stops on the map, which stays about topics; they live in Practice, and this card is the way in from the home. It lists the
 * written sets (each a link to its lesson) and one link to the whole list; it renders nothing until a set is written.
 */
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { track } from "@/lib/track";
import { CARD_H, SIDE_CARD } from "../ui/kit";
import { useDsaProgress } from "../progress/useDsaProgress";

export type CompanySetLink = { key: string; title: string; group: string; href: string; problems: number };

export default function SetsCard({ sets }: { sets: CompanySetLink[] }) {
  const p = useDsaProgress();
  if (!sets.length) return null;
  return (
    <section aria-labelledby="dsa-sets-h" className={`${SIDE_CARD} !gap-2 !p-[18px]`} data-home-sets>
      <div className="flex items-center justify-between gap-3">
        <h2 id="dsa-sets-h" className={`${CARD_H} flex items-center gap-2`}>
          <Briefcase className="h-4 w-4 text-fg-3" aria-hidden />
          Interview sets by company type
        </h2>
        <Link href="/dsa/practice?list=company-types" onClick={() => track("dsa_sets_card", { to: "practice" })} className="shrink-0 text-[13px] text-fg-3 hover:text-fg">
          All of Practice →
        </Link>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {sets.slice(0, 3).map((s) => (
          <li key={s.key}>
            <Link href={s.href} onClick={() => track("dsa_sets_card", { to: s.key })} className="flex min-h-11 items-center gap-2.5 rounded-[10px] px-2 py-1.5 hover:bg-surface-2">
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 border-fg-3 ${p.concepts.has(s.key) ? "bg-fg-3" : "bg-surface"}`} />
              <span className="min-w-0 flex-1 text-[14px] text-fg">
                <span className="text-fg-3">{s.group}</span> · {s.title}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] text-fg-3">{s.problems} problems</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
