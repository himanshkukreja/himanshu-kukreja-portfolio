/**
 * Personalisation and continuity eval cases (scripts/ai-eval/personal.ts; AI audit 12 Nov 2026, O15): the course chat
 * with a learner's whole record (SDM progress, code labs, mock verdicts, quick checks, DSA Mastery) and memory, and the
 * lesson Q&A follow-up. Fixtures stand in for the learner, so no case reads a real account.
 *
 * Each turn has deterministic rule checks (`must` / `mustNot` regexes on the answer) and judged expectations
 * (`expect` / `avoid`, for the Sonnet judge).
 */

/** "mixed": mid-course SDM learner (W00-W03 cleared, W04 half way, W04 trial part 1 not passed, hard review cards) with a cleared
 *  LRU lab, a mock run twice (best Lean hire, last Lean no hire), quick checks, and 5 DSA Mastery solves with struggles.
 *  "sdm": the same SDM record without any practice or DSA. "new": nothing yet. */
export type LearnerKind = "mixed" | "sdm" | "new";

export type PersonalTurn = {
  user: string;
  /** every one must match the answer */
  must?: RegExp[];
  /** none may match */
  mustNot?: RegExp[];
  expect: string[];
  avoid?: string[];
};

export type PersonalCase =
  | { id: string; kind: "chat"; title: string; learner: LearnerKind; memory?: string[]; turns: PersonalTurn[] }
  | {
      id: string;
      kind: "lesson-qa";
      title: string;
      week: string;
      slug: string;
      /** the panel's previous exchange (the answer as the panel holds it, whole) */
      previous: { q: string; a: string };
      question: string;
      mode?: "simple" | "check";
      must?: RegExp[];
      mustNot?: RegExp[];
      expect: string[];
      avoid?: string[];
    };

/** the fixture's DSA solves (titles as the fixture index names them) */
export const DSA_SOLVED = ["Busiest stretch on the launch dashboard", "Compact the log buffer", "Best bundle of distinct products", "Fewest moves to a pickup point", "Unsend the k-th newest message"];

const NOT_SEEN = /\b(?:can(?:'|’)?t|cannot|can not|unable to) (?:see|tell|say|access|view)\b|\b(?:doesn(?:'|’)?t|does not|don(?:'|’)?t|do not|isn(?:'|’)?t|is not|aren(?:'|’)?t|are not|wasn(?:'|’)?t|weren(?:'|’)?t) (?:keep|store|record|save|show|have|kept|stored|recorded|saved|visible)\b|\bnot (?:stored|saved|kept|recorded|visible)\b|\bno record of (?:how|the runs|your runs)/i;
const NO_DSA_BLINDNESS = /no (?:coding|dsa) problems? (?:are |is )?(?:logged|recorded|tracked)|(?:doesn(?:'|’)?t|does not|don(?:'|’)?t) track (?:dsa|coding)|tracks system design, not/i;

// a real-length "Ask this lesson" answer (1,129 characters with the question: the size that failed in the audit's probe 10)
const PREV_ANSWER =
  "**Deleting is safer because two concurrent writes can leave a stale value in the cache when you update it instead.** With write-update, the cache SETs of two requests can land in the opposite order from their database commits, so the older value can win. With write-invalidate, both requests just DELETE, which is idempotent, so the next read loads the correct row from the database [2.4 Strategy 4: Write-Invalidate vs Write-Update].\n\nThe lesson's example: request A writes $90 and request B writes $80, but B's cache update happens first and A's happens later. The cache ends at $90 while the database holds $80. With write-invalidate, the cache ends empty and the next read fetches $80 [2.4 Strategy 4: Write-Invalidate vs Write-Update].\n\nWrite-update is only reasonable with a single writer per key, or with atomic operations such as INCR where order doesn't matter.\n\n> **Key takeaway:** Delete on write; the next read repopulates from the database.";

export const PERSONAL_CASES: PersonalCase[] = [
  /* ---------------------------------------------------------------- mixed SDM + DSA learner */
  {
    id: "mixed-dsa-solved",
    kind: "chat",
    title: "Mixed learner: which DSA problems have I solved",
    learner: "mixed",
    turns: [
      {
        user: "Which DSA problems have I solved so far on DSA Mastery?",
        must: [/busiest stretch/i, /compact the log buffer/i, /best bundle/i],
        mustNot: [NO_DSA_BLINDNESS],
        expect: ["Lists the learner's DSA Mastery solves from their record (5 problems, by title)", "Mentions where they struggled (several failed submits on a problem, or the concept their record shows as hard) without inventing details"],
        avoid: ["Says the course doesn't track DSA or that no coding problems are logged", "Invents problems, dates or counts not in the record"],
      },
    ],
  },
  {
    id: "mixed-plan-today",
    kind: "chat",
    title: "Mixed learner: what to do with 45 minutes",
    learner: "mixed",
    turns: [
      {
        user: "I have about 45 minutes today. What should I work on?",
        must: [/invalidation|cache stampede|stampede|w04|week 4/i],
        expect: ["Starts from the SDM lesson they have in progress (Week 4), cited", "Gives a plan for the 45 minutes (for example the next part of that lesson); may add one short DSA or revision item from their record (a DSA struggle, the trial part not passed, a hard review card)"],
        avoid: ["Ignores the lesson in progress", "Recommends something they already finished as new"],
      },
    ],
  },
  /* ---------------------------------------------------------------- weak-at with lab and DSA signals */
  {
    id: "weak-at-mixed",
    kind: "chat",
    title: "What am I weak at, with lab, mock and DSA signals",
    learner: "mixed",
    turns: [
      {
        user: "Be honest: what am I weak at right now? Be specific.",
        must: [/sliding window|fixed-size|window/i],
        mustNot: [/no (?:data|record|signal)s? (?:at all|yet)/i],
        expect: [
          "Names concrete weak spots from the record across both courses: the W04 trial part not passed or the hard review cards (cache stampede / write-invalidate races), and a DSA struggle (the sliding-window concept or the problems that took several failed submits)",
          "Doesn't present the cleared LRU lab as a weakness and doesn't invent lab failures, runs or hints",
          "May mention the mock's last verdict (Lean no hire) as a signal, without inventing which phase was weak",
        ],
        avoid: ["Invents failures, scores or mock phase details that the record doesn't have", "Answers generically, as it would for any learner"],
      },
    ],
  },
  /* ---------------------------------------------------------------- continuity questions */
  {
    id: "continuity-lab",
    kind: "chat",
    title: "How did my LRU lab go (only the outcome is stored)",
    learner: "mixed",
    turns: [
      {
        user: "How did my LRU cache lab go? Did I struggle with it?",
        must: [/clear|passed|every test/i, NOT_SEEN],
        expect: ["Says the LRU cache lab is cleared (every test passing), from the record", "Says plainly it can't see how many runs, failures or hints it took", "Offers a useful next step built on the lab (for example its interview mode, the LFU lab or the LLD round), cited"],
        avoid: ["Claims the learner struggled or didn't struggle with specific bugs, runs or hints", "Says it has no record of the lab"],
      },
    ],
  },
  {
    id: "continuity-mock",
    kind: "chat",
    title: "How did my last mock go (verdicts stored, transcript not)",
    learner: "mixed",
    turns: [
      {
        user: "How did my last mock interview go?",
        must: [/lean[ -]no[ -]hire/i],
        mustNot: [/couldn(?:'|’)?t find (?:a|any) mock|no mock (?:interview )?(?:in|on) (?:your )?record/i],
        expect: ["Names the mock and its last verdict (Lean no hire), and that the best run was Lean hire", "Says the transcript or per-phase scores aren't stored, so it can't say exactly which phase went wrong", "Suggests a concrete next step (the lessons behind the mock, or another run)"],
        avoid: ["Invents phase scores, feedback or what the learner said", "Starts a new mock unasked"],
      },
    ],
  },
  {
    id: "continuity-explain-back",
    kind: "chat",
    title: "What did I get wrong in explain-it-back (not stored)",
    learner: "mixed",
    turns: [
      {
        user: "What did I get wrong in my explain-it-back on cache-aside just now?",
        must: [NOT_SEEN, /paste|share|send|type/i],
        expect: ["Says plainly that explain-it-back answers and verdicts aren't stored where it can see them", "Asks them to paste their explanation to grade it, and may give the key points of cache-aside meanwhile, cited"],
        avoid: ["Pretends to know what the learner wrote or which verdict they got"],
      },
    ],
  },
  {
    id: "continuity-short-chat",
    kind: "chat",
    title: "Recalls a one-message chat noted when it went idle",
    learner: "sdm",
    memory: [
      "Studied or discussed: bloom filters; consistent hashing",
      "Past chats (newest first):\n  - 2026-11-11: Learner asked how bloom filters avoid false negatives in a cache lookup; tutor explained all k bits are set on insert and checked on lookup, so only false positives occur.\n  - 2026-11-08: Worked through consistent hashing and virtual nodes.",
    ],
    turns: [
      {
        user: "Yesterday I asked you about some probabilistic data structure. What was it, and what's the one thing I should remember about it?",
        must: [/bloom/i, /false (?:negative|positive)/i],
        expect: ["Recalls it was bloom filters, from the past chat", "Gives the one thing to remember (no false negatives, only false positives), correctly and briefly, cited if it uses the course"],
        avoid: ["Says it can't remember earlier chats", "Recites the whole memory"],
      },
    ],
  },
  {
    id: "continuity-new-learner-dsa",
    kind: "chat",
    title: "A new learner asks about DSA solves (none recorded)",
    learner: "new",
    turns: [
      {
        user: "Which DSA problems have I solved so far?",
        mustNot: [/busiest stretch|compact the log buffer|best bundle/i],
        expect: ["Says honestly that no DSA Mastery solves are recorded yet", "Points to a sensible place to start, without inventing a record"],
        avoid: ["Lists problems", "Claims the site doesn't have a DSA course"],
      },
    ],
  },
  /* ---------------------------------------------------------------- lesson Q&A follow-up (O16) */
  {
    id: "lessonqa-followup",
    kind: "lesson-qa",
    title: "Ask this lesson: a follow-up after a full-length answer",
    week: "week-04-caching",
    slug: "day-02-cache-invalidation",
    previous: { q: "Why delete the cache entry on a write instead of updating it?", a: PREV_ANSWER },
    question: "And what goes wrong if two writers race?",
    must: [/stale|older|old value|\$90|out of order|opposite order/i],
    mustNot: [/too long/i],
    expect: ["Answers the follow-up in the context of the previous exchange (the write-update race between two writers), from the lesson, citing its section in [brackets]", "Short: it builds on the earlier answer rather than repeating all of it"],
    avoid: ["Ignores the earlier exchange or answers a different question"],
  },
  {
    id: "lessonqa-followup-simpler",
    kind: "lesson-qa",
    title: "Ask this lesson: 'explain that more simply' after a full answer",
    week: "week-04-caching",
    slug: "day-02-cache-invalidation",
    previous: { q: "Why delete the cache entry on a write instead of updating it?", a: PREV_ANSWER },
    question: "",
    mode: "simple",
    must: [/delet|remov|invalidat/i],
    mustNot: [/too long/i],
    expect: ["Re-explains the previous answer (delete vs update on write) more simply, for a beginner", "Stays correct: deleting avoids the out-of-order race; the next read reloads from the database"],
    avoid: ["Explains a different part of the lesson"],
  },
];
