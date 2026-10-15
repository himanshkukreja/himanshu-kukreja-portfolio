/**
 * The daily challenge (server only): DAILY_N questions per Asia/Kolkata day, the same for everyone.
 *
 * Selection is rendezvous hashing: every question in the bank gets the score hash(day | id) and the
 * lowest scores win (at most 3 from either source, preferring different weeks). Adding a question to
 * the course only changes a day's set if the new one happens to out-rank it, so a content deploy
 * mid-day almost never reshuffles the challenge. Options are shuffled with the same seed.
 */
import { getQuestionBank, type BankQuestion } from "./bank";
import { DAILY_N, DAILY_SECONDS, dailyNumber, hash32, rng, shuffled, type DailySet } from "./shared";

function pick(day: string, questions: BankQuestion[]): BankQuestion[] {
  const ranked = questions
    .filter((q) => q.prompt.length <= 400 && q.options.every((o) => o.length <= 220))
    .map((q) => ({ q, h: hash32(`${day}|${q.id}`) }))
    .sort((a, b) => a.h - b.h)
    .map((x) => x.q);
  const out: BankQuestion[] = [];
  const kinds: Record<string, number> = {};
  const weeks = new Set<string>();
  const hasBoth = ranked.some((q) => q.kind === "quiz") && ranked.some((q) => q.kind === "trial");
  // pass 1: distinct weeks + source mix; pass 2: fill up
  for (const strict of [true, false]) {
    for (const q of ranked) {
      if (out.length >= DAILY_N) break;
      if (out.includes(q)) continue;
      if (strict && weeks.has(q.week)) continue;
      if (hasBoth && (kinds[q.kind] || 0) >= DAILY_N - 2) continue;
      out.push(q);
      weeks.add(q.week);
      kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    }
  }
  return out;
}

export async function getDailySet(day: string): Promise<DailySet> {
  const bank = await getQuestionBank();
  const chosen = pick(day, bank.questions);
  return {
    date: day,
    number: dailyNumber(day),
    seconds: DAILY_SECONDS,
    questions: chosen.map((q) => {
      const order = shuffled(
        q.options.map((_, i) => i),
        rng(hash32(`${day}#${q.id}`)),
      );
      return {
        id: q.id,
        kind: q.kind,
        prompt: q.prompt,
        options: order.map((i) => q.options[i]),
        answer: order.indexOf(q.answer),
        explain: q.explain,
        source: { label: q.label, href: q.href },
      };
    }),
  };
}

/** Server re-check of a reported run: how many of `picks` (indexes into the shuffled options) are right. */
export async function verifyDaily(day: string, picks: number[]): Promise<{ correct: number; total: number }> {
  const set = await getDailySet(day);
  let correct = 0;
  set.questions.forEach((q, i) => {
    if (picks[i] === q.answer) correct++;
  });
  return { correct, total: set.questions.length };
}
