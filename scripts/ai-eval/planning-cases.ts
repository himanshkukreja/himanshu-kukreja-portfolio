/**
 * Fixtures for the AI planning eval (scripts/ai-eval/planning.ts, 12 Nov 2026): the optional prose on top of the plans.
 *   why       the living plan's "why this week" line (FEATURES "plan-coach"): week titles, standing, recaps
 *   company   a company plan's priorities paragraph ("plan-coach"): the facts lib/learner/planning-model.ts companyBrief makes
 *   recap     the quiet nudge's 3-minute recap ("concept-recap"), grounded in the real course text (lib/learner/planning.ts
 *             topicText) for a System Design concept and a DSA lesson, with the key points missed
 * Each case: rule checks in code, plus what the judge must find (`expect`) and must not (`avoid`).
 */
export type PlanningCase =
  | { id: string; kind: "why"; titles: string[]; status: string; days: number; left: number; expect: string[]; avoid: string[] }
  | {
      id: string;
      kind: "company";
      company: string;
      rounds: string[];
      focus: string[];
      target: string;
      bands: Partial<Record<"sdm" | "lld" | "dsa", string>>;
      weights: Record<"sdm" | "lld" | "dsa", number>;
      struggles: string[];
      first: { title: string; track: "sdm" | "lld" | "dsa"; why: string }[];
      fits: boolean;
      expect: string[];
      avoid: string[];
    }
  | { id: string; kind: "recap"; key: string; miss: number[]; expect: string[]; avoid: string[] };

export const TODAY = "2026-11-12";

export const PLANNING_CASES: PlanningCase[] = [
  {
    id: "why-behind-recap",
    kind: "why",
    titles: ["Recap: Consistent hashing", "Partitioning Deep-Dive", "Trial W01 part 1: Partitioning (Sharding)"],
    status: "behind",
    days: 3,
    left: 30,
    expect: ["says the consistent hashing recap comes first because it was missed recently", "names at most two sessions", "is one or two sentences"],
    avoid: ["invents a date, a score or a number not given", "promises an outcome", "a greeting, a list or markdown"],
  },
  {
    id: "why-on-track",
    kind: "why",
    titles: ["Caching Patterns", "Cache Invalidation", "Trial W04 part 1: Caching Patterns", "Mock interview: Bill payments and AutoPay"],
    status: "on-track",
    days: 0,
    left: 21,
    expect: ["says what the week builds toward (caching, ending in a mock or the trial)", "names at most two sessions"],
    avoid: ["invents recaps or missed topics", "says the learner is behind", "invents a number not given"],
  },
  {
    id: "why-ahead-dsa",
    kind: "why",
    titles: ["Recap: Sliding window: fixed and variable windows", "DSA lesson: Hash table internals", "Hot Keys and Skew"],
    status: "ahead",
    days: 2,
    left: 45,
    expect: ["puts the sliding window recap first and says why", "says they are ahead (2 study days)"],
    avoid: ["invents a number not given", "lists every session"],
  },
  {
    id: "company-google",
    kind: "company",
    company: "Google",
    rounds: ["Coding", "System design", "Googleyness and leadership"],
    focus: ["caching", "storage at scale", "indexing", "rate limiting and abuse prevention", "stream processing"],
    target: "2026-12-24",
    bands: { sdm: "Early days", lld: "Not started yet", dsa: "Early days" },
    weights: { sdm: 1.3, lld: 0.35, dsa: 1.35 },
    struggles: ["Consistent hashing"],
    first: [
      { title: "Recap · Consistent hashing", track: "sdm", why: "missed 2× in two weeks" },
      { title: "Hash table internals", track: "dsa", why: "the coding round: not finished yet" },
      { title: "Design a Distributed Cache", track: "sdm", why: "reported: Design a Distributed Cache" },
      { title: "Design a Rate Limiter", track: "lld", why: "reported: Design a Logger Rate Limiter" },
    ],
    fits: false,
    expect: ["DSA and system design get most of the time, because of the coding and system design rounds", "the recap of consistent hashing comes first because of recent misses", "says plainly the plan does not fit before the date"],
    avoid: ["percentages", "calls a round unimportant", "promises readiness", "invents a question or round"],
  },
  {
    id: "company-flipkart-machine-coding",
    kind: "company",
    company: "Flipkart",
    rounds: ["Machine coding", "Problem solving and data structures", "System design", "Hiring manager"],
    focus: ["inventory", "flash sales", "search", "payments"],
    target: "2027-01-20",
    bands: { sdm: "Building the foundations", lld: "Early days", dsa: "Getting there" },
    weights: { sdm: 1.0, lld: 1.25, dsa: 0.8 },
    struggles: [],
    first: [
      { title: "Design a Parking Lot", track: "lld", why: "reported: Design a Parking Lot (machine coding)" },
      { title: "Design a Flash Sale System", track: "sdm", why: "reported: Design a Flash Sale" },
      { title: "Two pointers", track: "dsa", why: "the coding round: not finished yet" },
    ],
    fits: true,
    expect: ["low-level design / machine coding gets the biggest share, because of the machine coding round and the lowest readiness", "names the first item or two and why"],
    avoid: ["mentions recaps or missed topics", "says it doesn't fit", "percentages"],
  },
  {
    id: "company-fintech-no-dsa",
    kind: "company",
    company: "Razorpay",
    rounds: ["System design", "Low-level design"],
    focus: ["payments", "idempotency", "ledgers"],
    target: "2026-12-10",
    bands: { sdm: "Getting there", lld: "Building the foundations" },
    weights: { sdm: 1.0, lld: 1.2, dsa: 0 },
    struggles: ["Idempotency keys"],
    first: [
      { title: "Recap · Idempotency keys", track: "sdm", why: "missed 3× in two weeks" },
      { title: "Idempotency in Practice", track: "sdm", why: "reported: Design a payment gateway" },
    ],
    fits: true,
    expect: ["only system design and LLD (no DSA)", "the idempotency recap comes first because it was missed recently"],
    avoid: ["mentions DSA or coding rounds", "percentages", "invents a date"],
  },
  {
    id: "recap-consistent-hashing",
    kind: "recap",
    key: "sdm:consistent-hashing",
    miss: [4],
    expect: ["after a one-line definition, the first point is the missed one (virtual nodes fix uneven arcs) and it says this is what they missed", "a concrete example", "ends with a self-check question without its answer"],
    avoid: ["facts not in the course text", "headings or bullet lists", "a greeting"],
  },
  {
    id: "recap-idempotency",
    kind: "recap",
    key: "sdm:idempotency-key",
    miss: [],
    expect: ["explains idempotency keys from the course text", "ends with a self-check question"],
    avoid: ["facts not in the course text", "headings or bullet lists"],
  },
  {
    id: "recap-dsa-sliding-window",
    kind: "recap",
    key: "dsa:fixed-and-variable-windows",
    miss: [1],
    expect: ["after a one-line definition, the first point is the missed one (the invariant)", "a concrete example (the course's, or a tiny worked one of its rule)", "ends with a self-check question"],
    avoid: ["code blocks longer than a line", "facts not in the course text", "headings"],
  },
];
