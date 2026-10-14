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

export type QuestGroup = "main" | "arcade" | "play" | "read";

export type Quest = { id: string; label: string; xp: number; group: QuestGroup; hidden?: boolean };

export const QUESTS: Quest[] = [
  // Main quests: shown in the HUD quest log
  { id: "rush", label: "Survive Tatkal Rush", xp: 150, group: "main" },
  { id: "term", label: "Open the terminal", xp: 25, group: "main" },
  { id: "root", label: "Find the hidden command", xp: 75, group: "main" },
  { id: "kill", label: "Kill the zombie process", xp: 30, group: "main" },
  { id: "replay", label: "Replay the career", xp: 30, group: "main" },
  { id: "star", label: "Star a repo", xp: 20, group: "main" },
  { id: "read", label: "Read a case file to the end", xp: 50, group: "main" },
  { id: "msg", label: "Get a 201 from /api/hire", xp: 200, group: "main" },

  // Project Arcade cartridges
  { id: "arcade:sia", label: "SIA · deliver a shortlist", xp: 40, group: "arcade" },
  { id: "arcade:markdrop", label: "Markdrop · drop a doc", xp: 40, group: "arcade" },
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
];

export const QUEST_BY_ID: Record<string, Quest> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

export const MAIN_QUESTS = QUESTS.filter((q) => q.group === "main");

export type Badge = { id: string; name: string; how: string; earned: (done: Record<string, number>) => boolean };

export const BADGES: Badge[] = [
  { id: "rush", name: "Rush survivor", how: "Beat Tatkal Rush with zero double bookings.", earned: (d) => !!d.rush },
  { id: "root", name: "Root shell", how: "Find the hidden terminal command.", earned: (d) => !!d.root },
  { id: "completionist", name: "Completionist", how: "Clear every cartridge in the Project Arcade.", earned: (d) => !!d["arcade:all"] },
  { id: "chaos", name: "Chaos engineer", how: "Clear all six Playground games.", earned: (d) => QUESTS.filter((q) => q.group === "play").every((q) => !!d[q.id]) },
  { id: "oncall", name: "On-call", how: "Read a case file to the end.", earned: (d) => !!d.read },
];
