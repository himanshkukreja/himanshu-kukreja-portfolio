import "server-only";
import { istDate } from "@/lib/learn/arena/shared";
import { certStore, CertUnavailableError } from "@/lib/certificates/store";
import type { DsaProfile } from "@/lib/share/model";
import { getConceptIndex, getProblemIndex, getWorld } from "./load";
import { dsaLearnerData } from "./learner-data";
import { computeWorld } from "./map/progress";
import { dailyDaysOf, dailyStreakOf } from "./daily";
import { DSA_CERT_KIND, DSA_CERT_TRACK } from "./cert/rules";
import { DSA_LANG_LABEL, type DsaLang } from "./types";

/**
 * The DSA Mastery section of a public profile (/u/<handle>), from recorded data only (src/lib/dsa/learner-data.ts):
 * problems solved by level against the released bank, languages with an Accepted solve, concept lessons completed,
 * the Academy campus progress and the building the learner is in (computeWorld's frontier), the DSA daily streak
 * (game keys dsa:daily:<day>) and a public DSA certificate. Null when the learner hasn't done anything in DSA yet.
 */
export async function dsaProfileFor(userId: string, gameDone: Record<string, number> | null | undefined): Promise<DsaProfile | null> {
  const [data, bank, concepts, academy] = await Promise.all([dsaLearnerData(userId, gameDone ?? null), getProblemIndex(), getConceptIndex(), getWorld("academy").catch(() => null)]);
  const level = new Map(bank.map((p) => [p.id, p.level]));
  const solved = { easy: 0, medium: 0, hard: 0, total: 0 };
  for (const id of data.signals.solved) {
    const l = level.get(id);
    if (!l) continue;
    solved[l]++;
    solved.total++;
  }
  const bankBy = { easy: 0, medium: 0, hard: 0 };
  bank.forEach((p) => bankBy[p.level]++);
  const langCount = new Map<DsaLang, number>();
  for (const [id, set] of data.langs) if (level.has(id)) for (const l of set) langCount.set(l, (langCount.get(l) || 0) + 1);
  const languages = [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => DSA_LANG_LABEL[l]);
  const built = new Set(concepts.filter((c) => c.status === "built").map((c) => c.id));
  const conceptsDone = [...data.signals.concepts].filter((c) => built.has(c)).length;
  const days = dailyDaysOf(data.done);
  const streak = dailyStreakOf(days, istDate());

  let world: DsaProfile["world"] = { title: academy?.title || "Academy", building: null, pct: 0, done: 0, total: 0 };
  if (academy) {
    const prog = computeWorld(academy, data.signals);
    const region = prog.frontier ? academy.regions.find((r) => r.id === prog.frontier!.regionId) : null;
    world = { title: academy.title, building: region?.title || null, pct: prog.total ? Math.round((prog.done / prog.total) * 100) : 0, done: prog.done, total: prog.total };
  }

  let certificate: DsaProfile["certificate"] = null;
  try {
    const rows = await (await certStore()).byUser(userId);
    const c = rows.find((r) => String(r.kind) === DSA_CERT_KIND && r.world_key === DSA_CERT_TRACK && r.status === "valid" && r.is_public);
    if (c) certificate = { code: c.code, issuedAt: c.issued_at };
  } catch (e) {
    if (!(e instanceof CertUnavailableError)) console.warn("[dsa-profile] certificates:", e instanceof Error ? e.message : e);
  }

  const active = solved.total > 0 || conceptsDone > 0 || data.conceptsStarted.size > 0 || days.size > 0 || data.signals.checkpoints.size > 0;
  if (!active) return null;
  return { solved, bank: bankBy, languages, concepts: { done: conceptsDone, total: built.size }, world, daily: { current: streak.current, best: streak.best, days: days.size }, certificate };
}
