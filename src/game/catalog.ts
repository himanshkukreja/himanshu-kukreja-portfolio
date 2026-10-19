// "Level Up" — the game layer that runs across the whole site.
// Visitors earn XP for exploring; the levels are the engineering ladder.

export type Level = { min: number; code: string; name: string; unlock: string };

export const LEVELS: Level[] = [
  { min: 0, code: "L1", name: "Intern", unlock: "Everything is open. Nothing is gated." },
  { min: 100, code: "L2", name: "Junior", unlock: "The terminal learns more commands." },
  { min: 300, code: "L3", name: "SDE", unlock: "Blueprint skin and hidden post-mortem notes." },
  { min: 600, code: "L4", name: "Senior", unlock: "Director's cut notes on every case file." },
  { min: 1000, code: "L5", name: "Staff", unlock: "Your handle on the Hall of Fame." },
  { min: 1500, code: "L6", name: "Principal", unlock: "You beat the portfolio." },
];

export function levelIndex(xp: number): number {
  let i = 0;
  LEVELS.forEach((l, k) => {
    if (xp >= l.min) i = k;
  });
  return i;
}

export function levelProgress(xp: number) {
  const i = levelIndex(xp);
  const cur = LEVELS[i];
  const next = LEVELS[i + 1];
  const pct = next ? Math.round(((xp - cur.min) / (next.min - cur.min)) * 100) : 100;
  return { index: i, level: cur, next, pct };
}

export type QuestGroup = "main" | "arcade" | "play" | "read" | "arena";

export type Quest = { id: string; label: string; xp: number; group: QuestGroup; hidden?: boolean };

export const QUESTS: Quest[] = [
  // Main quests: shown in the HUD quest log
  { id: "rush", label: "Survive Tatkal Rush", xp: 150, group: "main" },
  { id: "term", label: "Open the terminal", xp: 25, group: "main" },
  { id: "root", label: "Find the hidden command", xp: 75, group: "main" },
  { id: "kill", label: "Kill the zombie process", xp: 30, group: "main" },
  { id: "replay", label: "Replay the career", xp: 30, group: "main" },
  { id: "tree", label: "Inspect every skill branch", xp: 40, group: "main" },
  { id: "star", label: "Star a repo", xp: 20, group: "main" },
  { id: "read", label: "Read a case file to the end", xp: 50, group: "main" },
  { id: "snake", label: "Play the contribution snake", xp: 25, group: "main" },
  { id: "msg", label: "Get a 201 from /api/hire", xp: 200, group: "main" },

  // Project Arcade cartridges
  { id: "arcade:sia", label: "SIA · deliver a shortlist", xp: 40, group: "arcade" },
  { id: "arcade:markdrop", label: "Markdrop · drop a doc", xp: 40, group: "arcade" },
  { id: "arcade:chukta", label: "Chukta · split it, settle it", xp: 40, group: "arcade" },
  { id: "arcade:ios-bridge", label: "iOS Bridge · tap from another OS", xp: 40, group: "arcade" },
  { id: "arcade:bridgelink", label: "BridgeLink · connect a remote phone", xp: 40, group: "arcade" },
  { id: "arcade:waygate", label: "Waygate · expose localhost", xp: 40, group: "arcade" },
  { id: "arcade:obscura", label: "Obscura · keep the original private", xp: 40, group: "arcade" },
  { id: "arcade:codeflow", label: "codeflow · write a report", xp: 40, group: "arcade" },
  { id: "arcade:all", label: "Completionist · clear every cartridge", xp: 200, group: "arcade", hidden: true },

  // Engineering Playground games
  { id: "play:cache", label: "Cache or Miss", xp: 60, group: "play" },
  { id: "play:ring", label: "Hash Ring", xp: 60, group: "play" },
  { id: "play:breaker", label: "Trip the Breaker", xp: 60, group: "play" },
  { id: "play:envelope", label: "Back of the Envelope", xp: 60, group: "play" },
  { id: "play:race", label: "Race Condition", xp: 60, group: "play" },
  { id: "play:incident", label: "Incident Commander", xp: 60, group: "play" },

  // Learn Arena: quick checks, the daily challenge, leagues and the course games (/learn/arena)
  { id: "quiz:ace", label: "First blood · ace a quick check", xp: 25, group: "arena" },
  { id: "arena:daily", label: "Play a daily challenge", xp: 30, group: "arena" },
  { id: "arena:perfect", label: "Daily challenge 5/5", xp: 50, group: "arena" },
  { id: "arena:streak3", label: "Daily streak · 3 days", xp: 40, group: "arena" },
  { id: "arena:streak7", label: "Daily streak · 7 days", xp: 100, group: "arena" },
  { id: "arena:top10", label: "Top 10 on the weekly board", xp: 100, group: "arena" },
  { id: "arena:latency", label: "Latency Ladder", xp: 40, group: "arena" },
  { id: "arena:store", label: "Pick the Store", xp: 40, group: "arena" },
  { id: "arena:outage", label: "Fix the Outage", xp: 40, group: "arena" },

  // Case files: awarded once every story's end-of-file activity is solved (src/components/stories/activities)
  { id: "cases:all", label: "Case cracker · solve every case file activity", xp: 150, group: "read", hidden: true },
];

export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const MAIN_QUESTS = QUESTS.filter((q) => q.group === "main");

export type Badge = { id: string; name: string; how: string; earned: (done: Record<string, number>) => boolean };

export const BADGES: Badge[] = [
  { id: "rush", name: "Rush survivor", how: "Win Tatkal Rush: run the 10:00 front door without a meltdown.", earned: (d) => !!d.rush },
  { id: "root", name: "Root shell", how: "Find the hidden terminal command.", earned: (d) => !!d.root },
  { id: "completionist", name: "Completionist", how: "Clear every cartridge in the Project Arcade.", earned: (d) => !!d["arcade:all"] },
  { id: "chaos", name: "Chaos engineer", how: "Clear all six Playground games.", earned: (d) => QUESTS.filter((q) => q.group === "play").every((q) => !!d[q.id]) },
  { id: "oncall", name: "On-call", how: "Read a case file to the end.", earned: (d) => !!d.read },
  { id: "cases", name: "Case cracker", how: "Solve the end-of-file activity in every case file.", earned: (d) => !!d["cases:all"] },
  { id: "firstblood", name: "First blood", how: "Ace a quick check: every answer right on the first try.", earned: (d) => !!d["quiz:ace"] },
  { id: "daily7", name: "Daily streak 7", how: "Play the Arena daily challenge seven days in a row.", earned: (d) => !!d["arena:streak7"] },
  { id: "top10", name: "Top 10", how: "Reach the top 10 of the weekly Arena leaderboard.", earned: (d) => !!d["arena:top10"] },
  { id: "arena", name: "Arena regular", how: "Clear all three Arena games.", earned: (d) => !!d["arena:latency"] && !!d["arena:store"] && !!d["arena:outage"] },
  { id: "offer", name: "Offer letter", how: "Get a Hire or better verdict in any mock interview.", earned: (d) => Object.keys(d).some((k) => k.startsWith("offer:")) },
  { id: "loops", name: "Interview ready", how: "Finish four mock interview loops.", earned: (d) => Object.keys(d).filter((k) => k.startsWith("mock:")).length >= 4 },
  { id: "snake", name: "Snake charmer", how: "Eat 500+ contributions in one game of the contribution snake.", earned: (d) => !!d["snake:500"] },
  // Certificates (/learn/certificate): claimed on the server, the XP key is `cert:course`
  { id: "certified", name: "Certified", how: "Earn the System Design Mastery certificate of completion.", earned: (d) => !!d["cert:course"] },
  // Design of the week (/learn/design-week): awarded per winning challenge as `dow:win:<slug>`
  { id: "dow", name: "Design of the week", how: "Have your design voted Design of the week by the community.", earned: (d) => !!d.dow || Object.keys(d).some((k) => k.startsWith("dow:win:")) },
];
