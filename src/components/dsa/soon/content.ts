/**
 * The coming-soon page's copy, from the product plan (dsa-mastery-plan.md, revision 4): the 6S Loop (§3.1),
 * the lesson walk-through (§3.2), the worlds (§4.1), the platform (§7), AI (§9-11) and the SDM bridges (§12). Plain
 * international English, no slang. Nothing here promises a count or a date the plan doesn't commit to.
 */

export const LOOP: { n: string; name: string; what: string; you: string }[] = [
  { n: "01", name: "Scenario", what: "A real task in an everyday app, stated with numbers. No code yet.", you: "Decide what you would build" },
  { n: "02", name: "Struggle", what: "Solve it by hand, see a sensible first attempt, then run it at production scale.", you: "Predict the cost" },
  { n: "03", name: "See", what: "The insight, shown visually: a side-by-side race and a step-by-step trace.", you: "Predict the next steps" },
  { n: "04", name: "Shape", what: "The pattern made explicit: one invariant, a template in four languages, the complexity in plain words.", you: "Rebuild the template" },
  { n: "05", name: "Stretch", what: "Product variations, edge cases, common mistakes, and where the pattern does not apply.", you: "Work the practice ladder" },
  { n: "06", name: "Say", what: "Explain it back, rehearse a 60-second interview answer, and schedule spaced review.", you: "Explain it in your words" },
];

export type World = { n: string; name: string; track: string; division: string; body: string; status: string };

export const WORLDS: World[] = [
  {
    n: "01",
    name: "Academy",
    track: "Foundations",
    division: "The onboarding campus",
    body: "From zero to confident: complexity, arrays, hashing, recursion, sorting, searching and the core structures, one building per module.",
    status: "Opens at launch",
  },
  {
    n: "02",
    name: "Product Districts",
    track: "Interview patterns",
    division: "The product campus",
    body: "Each district is set in an everyday app, from music streaming to ride-hailing to maps, with medium and hard problems pattern by pattern.",
    status: "Opens in weekly waves",
  },
  {
    n: "03",
    name: "Career Studio",
    track: "Company prep",
    division: "A personal route to Interview Day",
    body: "Set a target company type or interview date and get a dated plan that adjusts to your results, ending in a mock interview loop.",
    status: "Runs alongside any world",
  },
  {
    n: "04",
    name: "Challenge League",
    track: "Competitive programming",
    division: "The research lab",
    body: "An ascent through rating camps, from the 800 base camp to the 2400 summit, with fast I/O and stress testing.",
    status: "First camps at launch",
  },
  {
    n: "05",
    name: "Release Train",
    track: "Revision",
    division: "A transit line, one stop a day",
    body: "7, 14 and 30-day lines for fast revision before interviews, built from what you have solved and what you missed.",
    status: "Opens at launch",
  },
  {
    n: "06",
    name: "Infrastructure",
    track: "Systems bridge",
    division: "The data centres",
    body: "A side world linking each data structure to the system that depends on it, through System Design Mastery labs.",
    status: "Side world",
  },
];

export type Feature = { tag: string; title: string; body: string; points: string[] };

export const FEATURES: Feature[] = [
  {
    tag: "AI tutor",
    title: "A tutor that teaches instead of telling",
    body: "AI at every step, inside your daily credits, designed never to hand over a full solution.",
    points: ["Hints that build on the authored ones", "An approach check before you write code", "A debugger that names the broken invariant, not the fix", "A review of your solution after it passes"],
  },
  {
    tag: "Plans",
    title: "Study plans with dates that adapt",
    body: "Tell Career Studio your target and your interview date. It builds a plan from the problem bank and adjusts it as you go.",
    points: ["Company types and reported interview topics, with sources", "Re-plans when you fall behind or move ahead", "You approve every change", "Coding mock interviews with a scorecard"],
  },
  {
    tag: "Sheets",
    title: "Curated problem sheets, made for you",
    body: "Describe what you need in a sentence. You get an ordered sheet with a reason for every problem.",
    points: ["Built from your weak patterns and time left", "Save, reorder, edit and share", "Re-curated weekly as you solve", "Spaced review scheduled for you"],
  },
  {
    tag: "Problems",
    title: "A problem platform in four languages",
    body: "Original problems, each mapped to the classic it resembles, with an editorial and a dry run you predict.",
    points: ["Python and JavaScript run in your browser", "Java and C++ run on a server judge", "Visible and hidden tests, custom input, a diff view", "Complexity measured on your own code"],
  },
  {
    tag: "Scenarios",
    title: "Everyday apps, not toy puzzles",
    body: "Every problem is an engineering task in an app you already use, with you as the engineer.",
    points: ["Food delivery, music streaming, payments, ride-hailing, online stores and more", "Requirements stated with real numbers", "A first attempt measured before it is improved", "No real company names inside problems"],
  },
  {
    tag: "Progress",
    title: "Lectures, shorts, points and leagues",
    body: "A narrated lecture and short clips for every concept, and progress you can see on the world map.",
    points: ["Points from verified solves only", "Weekly leagues, friends and cohorts", "One profile and XP total with System Design Mastery", "Verified certificates"],
  },
];

/** What one lesson looks like: the sliding-window lesson's first three beats, in plain words. No named people. */
export const WALKTHROUGH: { step: string; label: string; text: string }[] = [
  { step: "01", label: "The task", text: "You work on a music streaming app. The launch dashboard needs the busiest three-hour stretch of each day, so on-call can add capacity before it starts." },
  { step: "02", label: "The scale check", text: "Recomputing every window at dashboard scale is about 6 × 10¹¹ additions per refresh. That will not hold." },
  { step: "03", label: "The insight", text: "Neighbouring windows share almost every hour. Can we do better?" },
];

/** DSA topic → where System Design Mastery uses it (existing SDM pages, clean paths). */
export const BRIDGES: { topic: string; system: string; href: string; label: string }[] = [
  { topic: "LRU cache", system: "Cache eviction", href: "/labs/lru-cache", label: "LRU cache lab" },
  { topic: "Sliding window", system: "Rate limiting", href: "/labs/sliding-window-counter", label: "Sliding-window counter lab" },
  { topic: "Sorted ring and binary search", system: "Consistent hashing", href: "/labs/consistent-hashing-ring", label: "Hash ring lab" },
  { topic: "Tries", system: "Search autocomplete", href: "/labs/typeahead-top-k-trie", label: "Typeahead lab" },
  { topic: "Heaps and timing wheels", system: "Schedulers and retries", href: "/labs/timing-wheel-scheduler", label: "Timing wheel lab" },
  { topic: "Graphs and topological sort", system: "Workflows and pipelines", href: "/labs/saga-orchestrator", label: "Saga orchestrator lab" },
];

export const FAQ: { q: string; a: string }[] = [
  {
    q: "When does DSA Mastery launch?",
    a: "We are building and testing it now and aim to open in early 2027, with the Foundations world complete and more worlds arriving in weekly waves. Everyone on the waitlist hears first.",
  },
  {
    q: "What stays free?",
    a: "Learning stays free for everyone: lessons, lectures, traces, games and quizzes. Some practice features may become paid after the free period. Founding members keep every feature of both courses free for life.",
  },
  {
    q: "What does fair-use AI mean?",
    a: "AI features run on daily credits shared across both courses. Founding members get them every day, with a daily limit that keeps the service sustainable for everyone.",
  },
  {
    q: "Do I need System Design Mastery first?",
    a: "No. DSA Mastery starts from zero. Both courses share one account, one profile and one XP total, and lessons link to each other where a data structure powers a real system.",
  },
  {
    q: "What are the problems set in?",
    a: "Everyday apps (a food delivery app, a music streaming app, a payments app, an online store) and daily life, with you as the engineer. Problems never use a real company's name or internal systems. Company-specific prep shows only topics candidates have publicly reported, with sources, and makes no claim of insider information.",
  },
];
