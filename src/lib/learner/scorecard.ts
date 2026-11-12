/**
 * A mock scorecard (HLD or LLD) read as outcomes for the log, and its "compared with last time" lines (AI audit O2, O9).
 * Pure; the scorecard route and the eval share it. Each phase's LEVEL, and the rubric signal ids its MET and MISSED
 * lines name (namedItems: the grader's words matched to the phase's own rubric, never stored as words); the round's
 * level, the bar picked and the weakest phase. LLD rounds are one lld_mock row with the phase levels and the
 * checklist count; HLD rounds a mock_overall row and a mock_phase row per phase, tied by detail.run.
 */
import type { MockInterview } from "@/lib/learn/mock/types";
import { namedItems, scorecardParts, type NewEvent, type OutcomeEvent } from "./events-model";
import { compareMock, mockRuns, refEvents, type Namer } from "./feature-brief-model";

const RANK = ["none", "below-junior", "junior", "sde", "senior", "staff"];

export function scorecardOutcome(mock: Pick<MockInterview, "slug" | "kind" | "phases">, text: string, level: string | null, events: OutcomeEvent[], names: Namer, run = Date.now()): { rows: NewEvent[]; compare: string[] } {
  const parts = scorecardParts(text);
  const overall = parts.find((p) => /^overall/i.test(p.title))?.level || "";
  const phases = mock.phases
    .map((ph, i) => {
      const part = parts.find((p) => new RegExp(`^P${i + 1}\\b`).test(p.title));
      if (!part) return null;
      const items = ph.rubric.map((s) => ({ id: s.id, text: s.text }));
      const miss = /not attempted/i.test(part.missed) ? ph.rubric.map((s) => s.id) : namedItems(part.missed, items);
      const met = namedItems(part.met, items).filter((id) => !miss.includes(id));
      return { id: ph.id, title: ph.title, level: part.level || "none", miss, met };
    })
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (!overall || !phases.length) return { rows: [], compare: [] };
  const lld = mock.kind === "lld";
  const prev = mockRuns(refEvents(events, lld ? { kinds: ["lld_mock"], ref: mock.slug } : { kinds: ["mock_overall", "mock_phase"], prefix: mock.slug }))[0];
  const compare = compareMock(prev, { overall, phases }, (id) => names.item({ course: "sdm", kind: lld ? "lld_mock" : "mock_overall", ref: mock.slug, outcome: null, detail: {}, at: 0 }, id));
  const levels = Object.fromEntries(phases.map((p) => [p.id, p.level]));
  const answered = phases.filter((p) => p.level !== "none");
  const weak = answered.length ? answered.reduce((a, p) => (RANK.indexOf(p.level) < RANK.indexOf(a.level) ? p : a)).id : null;
  const checklist = parts.find((p) => p.checklist)?.checklist.match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
  const rows: NewEvent[] = lld
    ? [{ course: "sdm", kind: "lld_mock", ref: mock.slug, outcome: overall, detail: { run, phases: levels, miss: phases.flatMap((p) => p.miss), ...(level ? { target: level } : {}), ...(weak ? { weak } : {}), ...(checklist ? { cl: Number(checklist[1]), of: Number(checklist[2]) } : {}) } }]
    : [
        { course: "sdm", kind: "mock_overall", ref: mock.slug, outcome: overall, detail: { run, phases: levels, ...(level ? { target: level } : {}), ...(weak ? { weak } : {}) } },
        ...phases.map((p): NewEvent => ({ course: "sdm", kind: "mock_phase", ref: `${mock.slug}/${p.id}`, outcome: p.level, detail: { run, miss: p.miss, met: p.met } })),
      ];
  return { rows, compare };
}
