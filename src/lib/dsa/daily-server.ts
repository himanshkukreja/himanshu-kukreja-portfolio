import "server-only";
import { addDays } from "@/lib/learn/arena/shared";
import { getConceptIndex, getProblemIndex } from "./load";
import { dsaDailyNumber, pickDaily, type DsaDailyDay } from "./daily";

/**
 * The daily problem for a run of IST days (server): the pick (src/lib/dsa/daily.ts) over the released problem index,
 * with the summary the hub card, /dsa/daily and the problem room show. `days` counts back from `day` (inclusive).
 */
export async function dsaDailyDays(day: string, days = 1): Promise<DsaDailyDay[]> {
  const [bank, concepts] = await Promise.all([getProblemIndex(), getConceptIndex().catch(() => [])]);
  const byId = new Map(bank.map((p) => [p.id, p]));
  const conceptTitle = new Map(concepts.map((c) => [c.id, c.title]));
  const out: DsaDailyDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(day, -i);
    if (dsaDailyNumber(date) < 1) break;
    const p = byId.get(pickDaily(date, bank) || "");
    if (!p) continue;
    out.push({
      date,
      number: dsaDailyNumber(date),
      problem: { id: p.id, title: p.title, level: p.level, concept: p.concept, conceptTitle: conceptTitle.get(p.concept) || "", patterns: p.patterns, minutes: p.minutes, line: p.line },
    });
  }
  return out;
}
