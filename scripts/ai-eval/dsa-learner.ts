/**
 * The eval's learner fixtures (dsa-chat-cases.ts LearnerFixture) as the routes' input: the learner brief, built by the
 * routes' own pure builder (lib/learner/brief-model.ts) from a profile and notes made from the fixture, so a case tests
 * exactly the <learner> block a real learner with that record and memory gets.
 */
import type { DsaNotes } from "@/lib/ai/chat/memory-model";
import { dsaAdaptLines, dsaBriefLines, learnerTurnBlock, type BriefRef } from "@/lib/learner/brief-model";
import type { DsaProfile } from "@/lib/learner/dsa-profile";
import type { DsaLang } from "@/lib/dsa/types";
import type { LearnerFixture } from "./dsa-chat-cases";

export function learnerInputs(l: LearnerFixture | undefined, lang: DsaLang | null, feature: "dsa-chat" | "dsa-tutor", ref?: BriefRef): { brief?: string } {
  if (!l) return {};
  const profile: DsaProfile = {
    lang: l.lang ?? lang,
    level: l.full ? "experienced" : (l.level ?? null),
    levelFrom: l.full ? "show-everything" : l.level ? "welcome" : null,
    goal: null,
    solved: l.solved ?? 0,
    attempted: (l.solved ?? 0) + 2,
    lessonsDone: Math.round((l.solved ?? 0) / 2),
    bits: null,
    struggles: (l.struggles ?? []).map(([concept, why]) => ({ concept, why })),
    editorialFirst: l.editorialFirst ? { n: l.editorialFirst[0], of: l.editorialFirst[1] } : { n: 0, of: 0 },
    patterns: [],
    recent: [],
  };
  const notes: DsaNotes = {
    goals: [],
    level: l.notes?.level ?? "",
    prefs: l.notes?.style ?? [],
    studied: [],
    struggles: l.notes?.struggles ?? [],
    mistakes: l.notes?.mistakes ?? [],
    sessions: (l.notes?.sessions ?? []).map((s) => ({ at: s.slice(0, 10), chat: "evalprev1", summary: s.replace(/^\d{4}-\d{2}-\d{2}:\s*/, ""), course: "dsa" as const })),
  };
  const client = { lang: l.lang ?? lang, full: !!l.full, exp: l.level ?? null };
  return { brief: learnerTurnBlock(dsaBriefLines({ feature, profile, notes, client, ref }), dsaAdaptLines({ feature, profile, notes, client, ref })) };
}
