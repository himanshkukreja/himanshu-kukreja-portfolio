/**
 * Fixtures for the teaching features (scripts/ai-eval/teaching.ts; owner-approved 12 Nov 2026):
 *   teach     "Teach me" (Socratic): asks before telling, one question at a time, checks the answer, never lectures, and
 *             explains once the learner asks to see it (course chat, DSA chat, Ask this lesson)
 *   restyle   "Explain it differently": the re-explanation really is in the asked-for way and differs from the first
 *   goal      the goal chat: short, one question per reply, never asks what's known, captures the profile, stops on "skip"
 * Each turn has rule checks (regexes, counts) and EXPECT / AVOID lines for a Sonnet judge.
 */
import type { Restyle } from "@/lib/ai/teaching";
import type { GoalKnown, GoalProfile } from "@/lib/learner/goal-chat-model";

export type TeachTurn = {
  user: string;
  teach?: boolean;
  restyle?: Restyle;
  /** the reply ends with a question, and has exactly one question mark (a Socratic turn) */
  oneQuestion?: boolean;
  maxWords?: number;
  /** no markdown headings, tables or bullet lists */
  noStructure?: boolean;
  must?: RegExp[];
  mustNot?: RegExp[];
  expect: string[];
  avoid?: string[];
};

export type TeachCase =
  | { id: string; kind: "chat"; title: string; turns: TeachTurn[] }
  | { id: string; kind: "dsa-chat"; title: string; turns: TeachTurn[] }
  | { id: string; kind: "lesson-qa"; title: string; week: string; slug: string; turns: TeachTurn[] }
  | { id: string; kind: "goal"; title: string; known: Partial<GoalKnown>; answers: string[]; profile: (p: GoalProfile) => string[]; maxTurns?: number; expect: string[]; avoid?: string[] };

const SOCRATIC_EXPECT = ["Asks the learner a question instead of explaining the concept", "Asks exactly one question (not two, not a list of questions)", "Does not lecture: at most one or two short sentences before the question"];
const SOCRATIC_AVOID = ["Explains the full mechanism or gives the answer before the learner has tried", "Uses headings, a table or a bullet list"];

export const TEACH_CASES: TeachCase[] = [
  {
    id: "teach-chat-cache-aside",
    kind: "chat",
    title: "Course chat, Teach me: cache-aside, guided step by step, then explained on request",
    turns: [
      { user: "Teach me how cache-aside caching works.", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, expect: SOCRATIC_EXPECT, avoid: SOCRATIC_AVOID },
      {
        user: "I think the app checks the cache first?",
        teach: true,
        oneQuestion: true,
        maxWords: 90,
        noStructure: true,
        expect: ["Tells the learner their answer is right (or partly right) in a few words", "Then asks exactly one next question that builds toward what happens on a miss or on a write"],
        avoid: ["Asks two or more questions", "Explains the whole pattern (miss path, write path and invalidation) in this reply"],
      },
      {
        user: "I don't know, just tell me.",
        teach: true,
        maxWords: 260,
        expect: ["Now gives the explanation: on a miss the app reads the database and fills the cache; on a write the app updates the database and deletes (or updates) the cache entry", "Stays brief and doesn't keep quizzing before explaining"],
        avoid: ["Refuses to explain or asks another question instead of explaining"],
      },
    ],
  },
  {
    id: "teach-chat-consistent-hashing",
    kind: "chat",
    title: "Course chat, Teach me: a why-question gets a guiding question first",
    turns: [{ user: "Why do we need consistent hashing?", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, expect: [...SOCRATIC_EXPECT, "The question is small and easy to answer (e.g. what happens to keys when a server is added with hash mod N)"], avoid: SOCRATIC_AVOID }],
  },
  {
    id: "teach-chat-wrong-answer",
    kind: "chat",
    title: "Course chat, Teach me: a wrong answer is corrected kindly, then one more question",
    turns: [
      { user: "Teach me what a write-ahead log is for.", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, expect: SOCRATIC_EXPECT, avoid: SOCRATIC_AVOID },
      { user: "Is it to make reads faster?", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, expect: ["Says kindly that this is not quite right, with a one-sentence reason", "Asks exactly one next question that points toward durability / recovering after a crash"], avoid: ["Gives the full explanation of the WAL already", "Asks two or more questions"] },
    ],
  },
  {
    id: "teach-dsa-two-pointers",
    kind: "dsa-chat",
    title: "DSA chat, Teach me: two pointers",
    turns: [{ user: "Teach me the two pointers technique.", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, mustNot: [/```/], expect: SOCRATIC_EXPECT, avoid: [...SOCRATIC_AVOID, "Shows code"] }],
  },
  {
    id: "teach-lesson-write-policies",
    kind: "lesson-qa",
    title: "Ask this lesson, Teach me: write-through vs write-back",
    week: "week-04-caching",
    slug: "day-01-caching-patterns",
    turns: [{ user: "What's the difference between write-through and write-back?", teach: true, oneQuestion: true, maxWords: 90, noStructure: true, expect: SOCRATIC_EXPECT, avoid: SOCRATIC_AVOID }],
  },
  {
    id: "restyle-chat-bloom",
    kind: "chat",
    title: "Course chat, Explain it differently: a bloom filter as an analogy, then step by step",
    turns: [
      { user: "What is a bloom filter?", expect: ["Explains what a bloom filter is (a compact set membership test: no false negatives, possible false positives)"] },
      {
        user: "Explain it differently: with an analogy.",
        restyle: "analogy",
        maxWords: 220,
        mustNot: [/```/],
        expect: ["Opens with one everyday analogy and maps its parts to the bloom filter (bits, hash functions, false positives)", "Is clearly a different explanation from the previous answer, not a rewording of it", "Says where the analogy breaks down, in a sentence"],
        avoid: ["Apologises or says 'in other words'", "Includes code"],
      },
      {
        user: "Explain it differently: step by step, with an example.",
        restyle: "steps",
        maxWords: 260,
        must: [/(^|\n)\s*(1[.)]|\*\*1)/],
        expect: ["Walks one small concrete example (specific items and bit positions or hash values) through numbered steps", "Ends with a one-line takeaway"],
        avoid: ["Uses an analogy as its main device (that was the last way)"],
      },
    ],
  },
  {
    id: "restyle-dsa-window-code",
    kind: "dsa-chat",
    title: "DSA chat, Explain it differently: code first",
    turns: [
      { user: "What is the sliding window technique?", expect: ["Explains the sliding window technique correctly"] },
      { user: "Explain it differently: code first.", restyle: "code", must: [/```/], expect: ["Leads with a short code sketch (at most about 15 lines) that shows a sliding window", "Follows it with 2-3 lines explaining what the code shows"], avoid: ["Starts with a long prose explanation before the code"] },
    ],
  },
  {
    id: "restyle-lesson-diagram",
    kind: "lesson-qa",
    title: "Ask this lesson, Explain it differently: as a diagram",
    week: "week-04-caching",
    slug: "day-02-cache-invalidation",
    turns: [
      { user: "How does cache invalidation on write work?", expect: ["Explains invalidation on write from the lesson"] },
      { user: "Explain it differently: as a diagram.", restyle: "diagram", must: [/```|mermaid|-->|->|→|\+--|\|/], expect: ["Draws a small labelled text diagram (boxes and arrows, or a mermaid diagram) of the write and invalidation flow", "Adds a few short lines that walk through the diagram"], avoid: ["Is only prose with no diagram"] },
    ],
  },
  {
    id: "goal-full",
    kind: "goal",
    title: "Goal chat: a learner who answers everything",
    known: {},
    answers: ["Hi! I'm aiming for an SDE-2 backend role, ideally at Flipkart or Swiggy.", "My interview is in about 3 weeks.", "3 years of backend work in Java, but distributed systems are new to me.", "Analogies first please, and keep it brief.", "Both courses, system design and DSA."],
    profile: (p) => [
      ...(/backend|sde/i.test(`${p.role} ${p.level}`) ? [] : ["role/level missing"]),
      ...(p.companies.some((c) => /flipkart/i.test(c)) && p.companies.some((c) => /swiggy/i.test(c)) ? [] : ["companies missing"]),
      ...(/3\s*weeks|three weeks/i.test(p.timeline) ? [] : ["timeline missing"]),
      ...(/java/i.test(p.experience) ? [] : ["experience missing"]),
      ...(p.approach === "analogies" ? [] : ["approach not analogies"]),
      ...(p.length === "brief" ? [] : ["length not brief"]),
      ...(p.courses.includes("sdm") && p.courses.includes("dsa") ? [] : ["courses not both"]),
    ],
    expect: ["Every reply is short and friendly and asks one question (one question may cover two closely related items, like role and companies, or analogy-vs-code and brief-vs-detailed, by design)", "Never asks again for something the learner already said", "Ends with a short thank-you once it knows the role, timeline, experience, style and courses"],
    avoid: ["Asks for the learner's name, email, phone or salary", "Lists several questions in one reply"],
  },
  {
    id: "goal-known-dsa",
    kind: "goal",
    title: "Goal chat: DSA's welcome already told us the experience and goal",
    known: { dsaExp: "new", dsaGoal: "placements", started: ["dsa"] },
    answers: ["I'm a final-year student going for campus placements, mostly product companies like Amazon.", "Placements start in about 2 months.", "Code first, and detailed please.", "Just DSA for now."],
    profile: (p) => [...(/2\s*months|two months/i.test(p.timeline) ? [] : ["timeline missing"]), ...(p.approach === "code" ? [] : ["approach not code"]), ...(p.length === "detailed" ? [] : ["length not detailed"]), ...(p.courses.length === 1 && p.courses[0] === "dsa" ? [] : ["courses not dsa"])],
    expect: ["Does not ask how much coding experience the learner has (DSA's welcome already said: new to coding)", "Asks one question per reply (one question may cover two closely related items, like role and companies, or analogy-vs-code and brief-vs-detailed, by design; never two unrelated items such as the timeline and the style)"],
    avoid: ["Asks about the learner's coding experience or what they're preparing for as if it were unknown"],
  },
  {
    id: "goal-skip",
    kind: "goal",
    title: "Goal chat: the learner wants to stop at once",
    known: {},
    answers: ["skip this, maybe later"],
    maxTurns: 1,
    profile: () => [],
    expect: ["Accepts it at once and wraps up kindly, without asking another question"],
    avoid: ["Pushes the learner to keep answering"],
  },
];
