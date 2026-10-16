/**
 * Every number the guide quotes, imported from the code that enforces it, so the page can't drift
 * from the product. Only modules without "use client" can be imported here (the guide renders on
 * the server); the reading rules live in a client module and are rendered by <ReadingFact/>.
 */
import { LEVELS, QUEST_BY_ID } from "@/game/catalog";
import { LEARN_XP } from "@/lib/learn/types";
import { DAILY_N, DAILY_SECONDS, LEAGUE_RULES, POINTS, POINTS_TABLE } from "@/lib/learn/arena/shared";
import { BOSS_XP } from "@/components/learn/boss/shared";
import { ACTIVITY_XP, ACTIVITY_SLUGS, PASS_RATIO } from "@/components/stories/activities/types";
import { LEITNER_INTERVALS, REVIEW_XP_PER_CARD } from "@/lib/learn/review";
import { PRACTICE_GAMES } from "@/lib/learn/arena/games";
import { PART_INFO, partsFor } from "@/components/learn/progress/scope";

export { LEVELS, LEARN_XP, DAILY_N, DAILY_SECONDS, LEAGUE_RULES, POINTS, POINTS_TABLE, BOSS_XP, LEITNER_INTERVALS, REVIEW_XP_PER_CARD, PART_INFO, partsFor };

/** src/components/learn/quiz/QuizHydrator.tsx (a client module): QUIZ_XP and STAGE_ACE_XP. */
export const QUIZ_XP = 5;
export const STAGE_ACE_XP = 10;
/** src/components/learn/trial/engine.ts: passMark = ceil(n × 0.8), COOLDOWN_MS = 10 min. */
export const TRIAL_PASS_PCT = 80;
export const TRIAL_COOLDOWN_MIN = 10;
/** src/components/learn/boss/BossDebrief.tsx: PASS = 0.7 of the rubric. */
export const BOSS_PASS_PCT = 70;
/** src/components/stories/DebriefCard.tsx: DEBRIEF_XP. */
export const DEBRIEF_XP = 50;

export const CASE_ACTIVITY_XP = ACTIVITY_XP;
export const CASE_ACTIVITY_PASS_PCT = Math.round(PASS_RATIO * 100);
export const CASE_ACTIVITIES = ACTIVITY_SLUGS.length;

export const quest = (id: string) => QUEST_BY_ID[id]?.xp ?? 0;

export const ARENA_GAMES = PRACTICE_GAMES.filter((g) => g.kind === "arena");
export const PLAY_GAMES = PRACTICE_GAMES.filter((g) => g.kind === "play");

/** Leaderboard points for one daily challenge, at most. */
export const DAILY_POINTS_MAX = POINTS.dailyCorrect * DAILY_N + POINTS.dailyPerfect + POINTS.dailySpeedMax;
/** XP for one daily challenge (DailyChallenge.tsx: correct × 5 + 10 for a perfect run), at most. */
export const DAILY_XP_PER_RIGHT = 5;
export const DAILY_XP_PERFECT = 10;

export const BOX_EVERY = LEITNER_INTERVALS.map((d) => (d === 1 ? "every day" : d >= 30 ? `about monthly (${d} days)` : `every ${d} days`));
