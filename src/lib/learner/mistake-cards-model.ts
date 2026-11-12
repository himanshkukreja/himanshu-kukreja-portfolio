/**
 * Mistakes → spaced-review cards (owner-approved 12 Nov 2026; the AI audit's O6). What a learner got wrong becomes a
 * short question-and-answer card in the review queue they already use (table review_cards: the SD Mastery standup,
 * DSA Mastery's Revise page), built only from the course's own content, never from the learner's words:
 *
 *   explain-back   a concept whose latest grade was partial or a misconception: "Explain <term>: what must a solid
 *                  explanation cover?" → the key points it missed (the concept catalogue's definition and refresher;
 *                  DSA's invariant and key points)
 *   mock           a phase whose latest round missed rubric signals (system design and LLD mocks): the phase's question →
 *                  the missed signals, linked to where the course teaches them
 *   lab review     a lab whose latest code review found issues or scored an area 2 or lower: the lab's own interviewer
 *                  follow-up and its answer
 *   chat quiz      a multiple-choice question answered wrong in the chat: the question → the right option and the
 *                  course's explanation
 *   DSA            a concept with repeated failed submits (3+, or on 2+ problems): its invariant and key points
 *
 * One card per thing (the `ref`, source_ref "mistake:…", deduplicates across both courses: a DSA concept's explain-back
 * and its failed submits share one card), at most MISTAKE_CARDS_PER_DAY new ones a day, newest mistakes first. Source
 * "mistake" (supabase/migrations/20261112_review_cards_mistake_source.sql); until that migration is applied the server
 * stores them under source "interview" with the same "mistake:" ref and the page shows them as mistake cards.
 *
 * Pure (no imports but types), so the server (./mistake-cards.ts), the eval and the tests share it.
 */
import type { OutcomeEvent } from "./events-model";
import type { DsaIndex, DsaLearnerRaw } from "./dsa-profile";

export const MISTAKE_PREFIX = "mistake:";
export const MISTAKE_CARDS_PER_DAY = 5;
/** only mistakes this recent make a card (older ones were likely reviewed some other way) */
export const MISTAKE_WINDOW_DAYS = 30;

export type MistakeKind = "explain" | "mock" | "lab" | "quiz" | "dsa";
export type MistakeCard = {
  /** the review card's source_ref ("mistake:explain:cache-aside", "mistake:mock:mock-03-…/p2", "mistake:dsa:two-pointers") */
  ref: string;
  kind: MistakeKind;
  course: "sdm" | "dsa";
  front: string;
  back: string;
  detail: { context?: string; short?: string; why?: string; points?: { k: string; v: string }[]; href?: string; hrefLabel?: string };
  week?: string | null;
  lessonSlug?: string | null;
  stage?: string | null;
  /** when the mistake happened (newest first) */
  at: number;
};

/** What the cards are built from: the course's own content, looked up by the server (null: not found or not loaded). */
export type MistakeContent = {
  /** an SD Mastery concept id, or "dsa:<id>" for a DSA concept: its name, key points in order (point n = miss "n") and where it's taught */
  concept: (ref: string) => { term: string; points: string[]; href?: string; week?: string; slug?: string; anchor?: string } | null;
  /** a mock by slug: its phases' questions and rubric signals (with where the course teaches each) */
  mock: (slug: string) => { code: string; title: string; phases: { id: string; title: string; question: string; signals: { id: string; text: string; study?: { title: string; href: string } }[] }[] } | null;
  /** a lab by id: its interviewer follow-ups (question and answer, plain text) */
  lab: (id: string) => { title: string; href: string; followUps: { q: string; a: string }[] } | null;
  /** a question-bank item by id: the question, the right option, the course's explanation and its lesson */
  mcq: (id: string) => { prompt: string; answer: string; explain: string; week: string; slug: string; label: string } | null;
};

const DAY = 86_400_000;
const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : t;
};
const nums = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === "string" || typeof x === "number").map(String) : []);

/** Concepts with repeated failed submits in DSA Mastery (from dsa_submissions), newest first. */
export function dsaRepeatedMistakes(raw: Pick<DsaLearnerRaw, "subs">, ix: Pick<DsaIndex, "problems">, now: number): { concept: string; fails: number; problems: number; at: number }[] {
  const per = new Map<string, { fails: number; problems: Set<string>; at: number }>();
  for (const s of raw.subs) {
    if (s.verdict === "AC") continue;
    const at = Date.parse(s.created_at);
    if (!Number.isFinite(at) || now - at > MISTAKE_WINDOW_DAYS * DAY) continue;
    const c = ix.problems.get(s.problem_id)?.concept;
    if (!c) continue;
    const e = per.get(c) ?? { fails: 0, problems: new Set<string>(), at: 0 };
    e.fails++;
    e.problems.add(s.problem_id);
    e.at = Math.max(e.at, at);
    per.set(c, e);
  }
  return [...per.entries()]
    .filter(([, e]) => e.fails >= 3 || e.problems.size >= 2)
    .map(([concept, e]) => ({ concept, fails: e.fails, problems: e.problems.size, at: e.at }))
    .sort((a, b) => b.at - a.at);
}

/** The content a set of events needs (so the server loads only that). */
export function neededContent(events: OutcomeEvent[], dsaHard: { concept: string }[], now: number): { concepts: string[]; mocks: string[]; labs: string[]; mcqs: string[] } {
  const recent = events.filter((e) => now - e.at <= MISTAKE_WINDOW_DAYS * DAY);
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    concepts: uniq([...recent.filter((e) => e.kind === "explain_back").map((e) => e.ref), ...dsaHard.map((d) => `dsa:${d.concept}`)]),
    mocks: uniq(recent.filter((e) => e.kind === "mock_phase" || e.kind === "lld_mock").map((e) => e.ref.split("/")[0])),
    labs: uniq(recent.filter((e) => e.kind === "lab_review").map((e) => e.ref)),
    mcqs: uniq(recent.filter((e) => e.kind === "chat_quiz" && e.outcome === "wrong" && e.ref.startsWith("mcq:")).map((e) => e.ref.slice(4))),
  };
}

const LAB_AREAS: [string, string][] = [
  ["c", "correctness"],
  ["x", "complexity"],
  ["e", "edge cases"],
  ["r", "readability"],
];

/**
 * Every card the learner's recent mistakes make (newest first, one per ref): the latest result of each thing decides
 * (a concept explained solidly since, or a phase that met every signal in the latest round, makes none).
 */
export function mistakeCandidates(events: OutcomeEvent[], dsaHard: { concept: string; fails: number; problems: number; at: number }[], c: MistakeContent, now: number): MistakeCard[] {
  const recent = events.filter((e) => now - e.at <= MISTAKE_WINDOW_DAYS * DAY).sort((a, b) => b.at - a.at);
  const out = new Map<string, MistakeCard>();
  const add = (card: MistakeCard | null) => {
    if (card && card.front && card.back && !out.has(card.ref)) out.set(card.ref, card);
  };
  const latest = new Set<string>();
  const firstOf = (key: string) => {
    if (latest.has(key)) return false;
    latest.add(key);
    return true;
  };

  for (const e of recent) {
    if (e.kind === "explain_back") {
      if (!firstOf(`x|${e.ref}`) || (e.outcome !== "partial" && e.outcome !== "misconception")) continue;
      const k = c.concept(e.ref);
      if (!k || !k.points.length) continue;
      const missed = nums(e.detail.miss)
        .map((n) => k.points[Number(n) - 1])
        .filter(Boolean);
      const points = (missed.length ? missed : k.points.slice(0, 2)).slice(0, 4).map((v) => ({ k: "", v: clip(v, 220) }));
      const dsa = e.ref.startsWith("dsa:");
      add({
        ref: `${MISTAKE_PREFIX}${dsa ? `dsa:${e.ref.slice(4)}` : `explain:${e.ref}`}`,
        kind: dsa ? "dsa" : "explain",
        course: dsa ? "dsa" : "sdm",
        front: `Explain ${k.term} in two or three sentences. What must a solid explanation cover?`,
        back: points[0].v,
        detail: { context: `Explain-back · ${k.term}`, short: k.term, points, ...(k.href ? { href: k.href, hrefLabel: k.term } : {}) },
        week: k.week ?? null,
        lessonSlug: k.slug ?? null,
        stage: k.anchor ?? null,
        at: e.at,
      });
    } else if (e.kind === "mock_phase" || e.kind === "lld_mock") {
      const slug = e.ref.split("/")[0];
      if (!firstOf(`m|${e.kind === "lld_mock" ? slug : e.ref}`)) continue;
      const m = c.mock(slug);
      if (!m) continue;
      // which phases: an HLD row is one phase; an LLD row holds every phase's misses (signal ids "p3.s2")
      const missByPhase = new Map<string, string[]>();
      if (e.kind === "mock_phase") {
        if (e.outcome === "none") continue;
        missByPhase.set(e.ref.split("/")[1] ?? "", nums(e.detail.miss));
      } else {
        const levels = (e.detail.phases && typeof e.detail.phases === "object" ? e.detail.phases : {}) as Record<string, unknown>;
        for (const id of nums(e.detail.miss)) {
          const ph = id.split(".")[0];
          if (levels[ph] === "none") continue;
          missByPhase.set(ph, [...(missByPhase.get(ph) ?? []), id]);
        }
      }
      for (const [phaseId, miss] of missByPhase) {
        const ph = m.phases.find((p) => p.id === phaseId);
        if (!ph || !miss.length) continue;
        const sig = miss.map((id) => ph.signals.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
        if (!sig.length) continue;
        const study = sig.find((s) => s.study)?.study;
        const points = sig.slice(0, 4).map((s) => ({ k: "", v: clip(s.text, 220) }));
        add({
          ref: `${MISTAKE_PREFIX}mock:${slug}/${phaseId}`,
          kind: "mock",
          course: "sdm",
          front: clip(ph.question || `${ph.title}: what does a strong answer cover?`, 260),
          back: points[0].v,
          detail: { context: `Mock ${m.code} · ${ph.title}`, short: `${m.code} · ${ph.title}`, why: "What a strong answer to this phase covers, from the mock's rubric.", points, ...(study ? { href: study.href, hrefLabel: study.title } : {}) },
          at: e.at,
        });
      }
    } else if (e.kind === "lab_review") {
      if (!firstOf(`l|${e.ref}`)) continue;
      const low = LAB_AREAS.filter(([key]) => {
        const v = Number(e.detail[key]);
        return Number.isFinite(v) && v > 0 && v <= (e.outcome === "issues" ? 3 : 2);
      }).map(([, name]) => name);
      if (e.outcome !== "issues" && !low.length) continue;
      const l = c.lab(e.ref);
      const f = l?.followUps.find((x) => x.q && x.a);
      if (!l || !f) continue;
      add({
        ref: `${MISTAKE_PREFIX}lab:${e.ref}`,
        kind: "lab",
        course: "sdm",
        front: clip(f.q, 260),
        back: clip(f.a, 420),
        detail: { context: `Lab · ${l.title}`, short: l.title, ...(low.length ? { why: `Your code review for this lab flagged ${low.join(" and ")}: this is the follow-up an interviewer would ask.` } : {}), href: l.href, hrefLabel: `${l.title} lab` },
        at: e.at,
      });
    } else if (e.kind === "chat_quiz") {
      if (!e.ref.startsWith("mcq:") || !firstOf(`q|${e.ref}`) || e.outcome !== "wrong") continue;
      const q = c.mcq(e.ref.slice(4));
      if (!q || !q.answer) continue;
      add({
        ref: `${MISTAKE_PREFIX}quiz:${e.ref.slice(4)}`,
        kind: "quiz",
        course: "sdm",
        front: clip(q.prompt, 300),
        back: clip(q.answer, 220),
        detail: { context: q.label, short: clip(q.prompt, 52), ...(q.explain ? { why: clip(q.explain, 420) } : {}) },
        week: q.week,
        lessonSlug: q.slug,
        at: e.at,
      });
    }
  }

  for (const d of dsaHard) {
    const k = c.concept(`dsa:${d.concept}`);
    if (!k || !k.points.length) continue;
    const points = k.points.slice(0, 4).map((v, i) => ({ k: i === 0 ? "Invariant:" : "", v: clip(v, 220) }));
    add({
      ref: `${MISTAKE_PREFIX}dsa:${d.concept}`,
      kind: "dsa",
      course: "dsa",
      front: `${k.term}: what's the invariant that keeps a solution correct, and the key ideas around it?`,
      back: points[0].v,
      detail: { context: `DSA · ${k.term}`, short: k.term, why: `Comes up because of ${d.fails} failed submit${d.fails === 1 ? "" : "s"} on ${d.problems} ${k.term} problem${d.problems === 1 ? "" : "s"} lately.`, points, ...(k.href ? { href: k.href, hrefLabel: k.term } : {}) },
      at: d.at,
    });
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

/** The new cards to add now: not already in the queue (any source), within today's allowance, newest mistakes first. */
export function pickNewCards(cands: MistakeCard[], existing: Set<string>, madeToday: number, cap = MISTAKE_CARDS_PER_DAY): MistakeCard[] {
  const room = Math.max(0, cap - madeToday);
  return cands.filter((c) => !existing.has(c.ref)).slice(0, room);
}
