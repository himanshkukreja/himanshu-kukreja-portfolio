/**
 * Realistic "in use" learner state for the guide screenshots (scripts/guide/shoot.mjs).
 *
 * Persona: about three weeks in. World 00 Parts 1-3 cleared, Part 4 (Networking) in progress at
 * Part II, trial parts 1-2 passed and part 3 failed once, a 2-day daily-challenge streak, a few
 * review cards due, one case file read and its end-of-file activity solved. Practice: the revision
 * decks of Parts 1-3 done, two failed runs on the token bucket lab, a study plan to an interview in
 * eight weeks.
 *
 * Every value uses the app's real storage keys and shapes (see src/components/learn/progress/
 * localData.ts for the list). Nothing here talks to a server.
 */
import fs from "node:fs";
import path from "node:path";

export const COURSE = "system-design-mastery";
export const W00 = "week-00-foundations";
export const W01 = "week-01-data-at-scale";
export const LESSONS = {
  p1: "foundations-part-1-basic-concepts",
  p2: "foundations-part-2-infrastructure-building-blocks",
  p3: "foundations-part-3-back-of-the-envelope-estimation",
  p4: "foundations-part-4-networking",
};
export const STORY = "irctc-tatkal-500-seats-2-million-users";

/** Same numbers as src/lib/learn/types.ts LEARN_XP and the catalog quests used below. */
const XP = { lesson: 60, stage: 10, trial: 100, quiz: 5, quizStage: 10 };
const QUEST_XP = { "quiz:ace": 25, "arena:daily": 30, "arena:perfect": 50, "arena:latency": 40, read: 50 };
const LEVEL_MIN = [0, 100, 300, 600, 1000, 1500];

const DAY = 86_400_000;
const IST = 330 * 60_000;
export const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);
const localDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const optional = (id) => /^(appendix|exercises|further-reading|resources|wrap-up|self-assessment|summary)/.test(id);

/** Real trial questions (week 0 MCQ file) for the review cards. */
export function readTrialQuestions(sdmDir) {
  const file = path.join(sdmDir, "resources", W00, "week-00-mcq-assessment.md");
  const md = fs.readFileSync(file, "utf8");
  const qs = {};
  const re = /\*\*Q(\d+)\.\s+([^*]+?)\*\*\s*\n\s*\nA\)\s*(.+?)\s*\nB\)\s*(.+?)\s*\nC\)\s*(.+?)\s*\nD\)\s*(.+?)\s*\n/g;
  let m;
  while ((m = re.exec(md))) qs[m[1]] = { q: m[2].trim(), opts: { A: m[3], B: m[4], C: m[5], D: m[6] } };
  const key = md.slice(md.indexOf("# Answer Key"));
  for (const k of key.matchAll(/^(\d+)\.\s+([A-D])\s+-\s+(.+)$/gm)) if (qs[k[1]]) Object.assign(qs[k[1]], { a: k[2], why: k[3].trim() });
  return qs;
}

/**
 * @param {object} o
 * @param {Record<string, string[]>} o.stages  stage ids per lesson slug (from the rendered pages)
 * @param {Record<string, any>} o.questions    readTrialQuestions()
 * @param {number} [o.now]
 * @param {string|null} [o.userId]             signed-in mock: claim the browser stores for this account
 */
export function buildSeed({ stages, questions, now = Date.now(), userId = null }) {
  const t = (days, hours = 0) => now - days * DAY - hours * 3_600_000;
  const done = {};
  const lessonRecs = {};

  const clear = (slug, dayAgo) => {
    const ids = stages[slug] || [];
    ids.forEach((id, i) => (done[`stage:${W00}/${slug}/${id}`] = t(dayAgo, 3 - i * 0.4)));
    done[`lesson:${W00}/${slug}`] = t(dayAgo, 0.5);
    const dwell = {};
    const seen = {};
    ids.forEach((id) => {
      dwell[id] = 360;
      seen[id] = 0xfffff;
    });
    lessonRecs[`${COURSE}/${W00}/${slug}`] = { stages: ids, last: ids[ids.length - 1] ?? null, completed: true, completedAt: t(dayAgo), max: 100, updatedAt: t(dayAgo), dwell, seen };
  };
  clear(LESSONS.p1, 18);
  clear(LESSONS.p2, 13);
  clear(LESSONS.p3, 6);

  // Part 4 in progress: preface + Part I read, reading Part II (about half seen)
  const p4 = stages[LESSONS.p4] || [];
  const p4Done = p4.slice(0, 2);
  p4Done.forEach((id, i) => (done[`stage:${W00}/${LESSONS.p4}/${id}`] = t(1 + (1 - i), 2)));
  const cur = p4[2] || p4[p4.length - 1];
  lessonRecs[`${COURSE}/${W00}/${LESSONS.p4}`] = {
    stages: p4Done,
    last: cur,
    completed: false,
    max: Math.round((p4Done.length / Math.max(1, p4.filter((s) => !optional(s)).length)) * 100),
    updatedAt: t(0, 15),
    dwell: Object.fromEntries([...p4Done.map((id) => [id, 360]), [cur, 190]]),
    seen: Object.fromEntries([...p4Done.map((id) => [id, 0xfffff]), [cur, 0x1ff]]),
  };

  // trials: parts 1 and 2 passed, part 3 failed once (rested long ago, so it can be retried)
  done[`trial:${W00}/part-1`] = t(15, 1);
  done[`trial:${W00}/part-2`] = t(10, 2);
  const trialStore = {
    parts: {
      1: { best: 13, total: 15, attempts: 1, passed: true, last: { score: 13, total: 15, passed: true, at: t(15, 1), marks: [] } },
      2: { best: 18, total: 20, attempts: 2, passed: true, last: { score: 18, total: 20, passed: true, at: t(10, 2), marks: [] } },
      3: { best: 10, total: 15, attempts: 1, passed: false, last: { score: 10, total: 15, passed: false, at: t(5, 4), marks: [] } },
    },
    runs: {},
  };

  // quick checks: a handful answered right on the first try, one block aced
  const quizIds = [
    [LESSONS.p1, 0, 0], [LESSONS.p1, 0, 1], [LESSONS.p1, 1, 0], [LESSONS.p2, 0, 0], [LESSONS.p2, 0, 1], [LESSONS.p2, 1, 0], [LESSONS.p3, 0, 0], [LESSONS.p3, 0, 1],
  ];
  quizIds.forEach(([slug, b, q], i) => (done[`quiz:${COURSE}/${W00}/${slug}:${b}:${q}`] = t(18 - i * 2, 1)));
  done["quiz:ace"] = t(18, 1);

  // arena: daily challenge yesterday (4/5) and the day before (5/5), Latency Ladder cleared
  const d1 = istDate(t(1)), d2 = istDate(t(2));
  const epoch = Date.parse("2026-10-15T00:00:00Z");
  const num = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - epoch) / DAY) + 1;
  done["arena:daily"] = t(2, 3);
  done[`daily:${d2}`] = t(2, 3);
  done["arena:perfect"] = t(2, 3);
  done[`daily:${d1}`] = t(1, 4);
  done["arena:latency"] = t(4, 2);
  const arena = {
    daily: {
      [d2]: { date: d2, number: num(d2), score: 812, correct: 5, total: 5, ms: 46_200, picks: [0, 0, 0, 0, 0], results: [true, true, true, true, true], at: t(2, 3) },
      [d1]: { date: d1, number: num(d1), score: 655, correct: 4, total: 5, ms: 52_800, picks: [0, 0, 0, 0, 0], results: [true, true, false, true, true], at: t(1, 4) },
    },
    best: { latency: 1840 },
    local: 50 + 42 + Math.round(1840 / 50),
  };

  // case file: read to the end, activity solved
  done.read = t(8, 2);
  done[`caseplay:${STORY}`] = t(8, 1);

  // review cards: real trial misses + one highlight card
  const card = (n, source, box, dueIn, lessonSlug, reviews) => {
    const q = questions[n];
    const wrong = Object.keys(q.opts).find((k) => k !== q.a);
    return {
      id: `local-guide-${n}`,
      source,
      sourceRef: `${W00}:q${n}`,
      courseId: COURSE,
      week: W00,
      lessonSlug,
      stage: null,
      front: q.q,
      back: q.opts[q.a],
      detail: { picked: source === "trial_miss" ? q.opts[wrong] : q.opts[q.a], why: q.why, context: `W00 · Trial part ${n <= 15 ? 1 : n <= 35 ? 2 : 3} · Q${n}` },
      box,
      dueAt: localDate(now + dueIn * DAY),
      lastGrade: reviews ? "good" : null,
      reviews,
      createdAt: new Date(t(10)).toISOString(),
    };
  };
  const cards = [
    card(9, "trial_miss", 1, 0, LESSONS.p1, 1),
    card(22, "trial_miss", 1, 0, LESSONS.p2, 0),
    card(26, "trial_flag", 2, 0, LESSONS.p2, 1),
    card(18, "trial_miss", 2, 2, LESSONS.p2, 1),
    card(14, "trial_miss", 3, 5, LESSONS.p1, 2),
  ];
  const reviewLog = { [localDate(t(10))]: 4, [localDate(t(7))]: 3, [localDate(t(3))]: 2, [localDate(t(1))]: 2 };
  const reviewXp = 11 * 5;

  // XP = what the done record is worth + the repeatable review grants
  let xp = reviewXp;
  for (const k of Object.keys(done)) {
    const p = k.slice(0, k.indexOf(":"));
    if (QUEST_XP[k] !== undefined) xp += QUEST_XP[k];
    else if (p === "lesson") xp += XP.lesson;
    else if (p === "stage") xp += XP.stage;
    else if (p === "trial") xp += XP.trial;
    else if (p === "quiz") xp += XP.quiz;
    else if (k === `daily:${d2}`) xp += 5 * 5 + 10;
    else if (k === `daily:${d1}`) xp += 4 * 5;
    else if (p === "caseplay") xp += 25;
  }
  done[`quizstage:${COURSE}/${W00}/${LESSONS.p1}:chapter-1`] = t(18, 1);
  xp += XP.quizStage;
  const level = LEVEL_MIN.filter((m) => xp >= m).length - 1;

  // study plan (src/lib/learn/plan/schedule.ts PlanRecord), weekdays, an hour a day, made a week ago
  const plan = {
    v: 1,
    id: "guideplan01",
    settings: {
      target: localDate(now + 54 * DAY),
      days: [0, 1, 2, 3, 4],
      minutes: 60,
      time: "20:00",
      include: { core: true, bosses: true, trials: true, sideQuests: false, mocks: true },
      mocksAt: "worlds",
      revision: 3,
      buffer: true,
      startWeek: null,
      reminder: 15,
    },
    baseStart: localDate(t(7)),
    baseAt: t(7),
    createdAt: t(7),
    updatedAt: t(7),
  };

  const flags = {
    "learn:levelSeen": level,
    "plan:sdm": plan,
    caseActivities: { [STORY]: { best: 10, max: 11, runs: 2 } },
    readStories: [STORY],
  };

  const store = {
    "hk.notrack": "1",
    theme: "light",
    "sd:coach:select": "1",
    "hk.lesson.v1": JSON.stringify(lessonRecs),
    "hk.game.v1": JSON.stringify({ xp, done, flags }),
    "hk.review.v1": JSON.stringify({ cards }),
    "hk.review.log.v1": JSON.stringify(reviewLog),
    [`hk.trial.v1:${COURSE}:${W00}`]: JSON.stringify(trialStore),
    "sd:arena:v1": JSON.stringify(arena),
    "hk.goal.v1": JSON.stringify({ unit: "minutes", perWeek: 150, target: localDate(now + 330 * DAY), setAt: t(14) }),
    "hk.guest.id": "guide-demo",
    // revision decks finished (src/components/learn/revise/store.ts) and lab runs (src/lib/learn/labs/progress.ts)
    "hk.revise.v1": JSON.stringify({
      lessons: Object.fromEntries(
        [
          [LESSONS.p1, 17, 9, 0],
          [LESSONS.p2, 12, 8, 1],
          [LESSONS.p3, 2, 7, 1],
        ].map(([slug, d, got, again]) => [`${W00}/${slug}`, { at: t(d, 1), got, again, seconds: 260 }]),
      ),
      weeks: {},
    }),
    "hk.labs.v1": JSON.stringify({ "token-bucket": { runs: 2, failedRuns: 2 } }),
  };
  if (userId) {
    store["hk.lesson.owner"] = userId;
    store["hk.game.owner"] = userId;
  }
  return { store, game: { xp, done, flags }, level, cards };
}
