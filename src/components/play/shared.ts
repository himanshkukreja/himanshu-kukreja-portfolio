export type GameKey = "cache" | "ring" | "breaker" | "env" | "race" | "inc";

/** Called by a game when the player clears it. `v` is the numeric score used to keep the best run, `t` is its label. */
export type WinFn = (v: number, t: string) => void;

export type GameProps = {
  onWin: WinFn;
  /** False while another game's tab is selected (the game stays mounted so progress survives a switch). */
  active: boolean;
};

export type GameMeta = {
  key: GameKey;
  quest: string;
  code: string;
  name: string;
  hook: string;
  week: string;
  caseFile: string;
  caseHref: string;
  rules: string;
  lesson: string;
  /** Whether a higher score is a better run (for the persisted "best"). */
  higherIsBetter: boolean;
};

/**
 * Hash Ring win threshold. The artboard says "no node owns more than 7 keys", but with the fixed
 * 24 keys and nodes at 20/140/250 degrees the arcs owned by n1 (9 keys) and n2 (8 keys) can't
 * both be split by a single new node, so a max load of 7 is unreachable at any angle. 8 is the
 * lowest threshold that some candidate spot (0, 270 or 315 degrees) can clear.
 */
export const RING_MAX_LOAD = 8;

export const GAMES: GameMeta[] = [
  {
    key: "cache",
    quest: "play:cache",
    code: "G-01",
    name: "Cache or Miss",
    hook: "Beat LRU at eviction.",
    week: "Week 04 · Caching patterns",
    caseFile: "",
    caseHref: "",
    rules:
      "A cache holds 3 keys. Requests arrive one at a time. On a miss with a full cache you choose which key to evict. Finish with at least as many hits as LRU would get.",
    lesson:
      "Eviction policy is a bet about the future. LRU bets on recency; when you know access patterns, you can do better.",
    higherIsBetter: true,
  },
  {
    key: "ring",
    quest: "play:ring",
    code: "G-02",
    name: "Hash Ring",
    hook: "Add a node, move the fewest keys.",
    week: "Week 01 · Partitioning deep dive",
    caseFile: "",
    caseHref: "",
    rules: `Three cache nodes share 24 keys on a consistent-hash ring. Place a 4th node so no node owns more than ${RING_MAX_LOAD} keys.`,
    lesson:
      "With hash mod N, going from 3 to 4 nodes moves most keys and cold-starts the whole cache. A ring moves only one arc.",
    higherIsBetter: false,
  },
  {
    key: "breaker",
    quest: "play:breaker",
    code: "G-03",
    name: "Trip the Breaker",
    hook: "You can’t see the service while it’s open.",
    week: "Week 02 · Circuit breakers",
    caseFile: "",
    caseHref: "",
    rules:
      "Thirty ticks of traffic to a bank API. Closed + healthy +1, closed + failing −3 (threads block for 3.5 s), open + failing +1, open + healthy −1. While open you are blind: use a half-open probe. Score 18+.",
    lesson: "A fast error beats a slow error, and half-open is how a breaker learns it is safe to close.",
    higherIsBetter: true,
  },
  {
    key: "env",
    quest: "play:envelope",
    code: "G-04",
    name: "Back of the Envelope",
    hook: "Estimate WhatsApp-scale in seconds.",
    week: "Week 00 · Back-of-the-envelope estimation",
    caseFile: "",
    caseHref: "",
    rules: "Five estimates. Pick the right order of magnitude. Get 4 of 5 to clear.",
    lesson:
      "Interviews and design reviews reward being roughly right fast: 86,400 s a day, 1 KB, 1 Gbps ≈ 125 MB/s.",
    higherIsBetter: true,
  },
  {
    key: "race",
    quest: "play:race",
    code: "G-05",
    name: "Race Condition",
    hook: "Double-book a seat, then fix it.",
    week: "Week 05 · Consistency models",
    caseFile: "CASE-010 · The Tatkal Gamble",
    caseHref: "/stories/irctc-tatkal-500-seats-2-million-users",
    rules:
      "Mission 1: interleave thread A and B so both pay for the one seat. Mission 2: turn on the row lock and try to break it again.",
    lesson:
      "Read-check-write without a lock is a race. SELECT … FOR UPDATE (or an atomic decrement) makes the check and the write one step.",
    higherIsBetter: true,
  },
  {
    key: "inc",
    quest: "play:incident",
    code: "G-06",
    name: "Incident Commander",
    hook: "The pager just went off.",
    week: "Week 10 · Incident management",
    caseFile: "CASE-004 · Cache poisoning",
    caseHref: "/stories/cdn-cache-poisoning-disaster",
    rules:
      "Four pages, one action each. The right first move costs 4 minutes; a wrong one costs 25. Finish under 40 minutes of downtime.",
    lesson: "Mitigate first, diagnose second. Rollback is the most underrated button in production.",
    higherIsBetter: false,
  },
];

// Shared class strings (Tailwind tokens; work in light + dark). Sizes (min-h, text size) are added at the call site.
export const BTN_PRIMARY =
  "px-5 bg-signal text-on-signal font-mono font-semibold text-sm disabled:cursor-not-allowed disabled:opacity-[0.45]";
export const BTN_GHOST =
  "px-4 border border-line-strong bg-transparent text-fg font-mono text-[13px] hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-[0.45]";
export const BTN_INVERT =
  "px-[18px] bg-fg text-bg font-mono font-semibold text-sm disabled:cursor-not-allowed disabled:opacity-[0.45]";
export const MSG_BOX = "border border-line bg-bg px-3.5 py-3 text-fg";
export const META = "font-mono text-[13px] text-fg-3";
