/** Response of GET /api/learn/progress (the signed-in learner's own summary). */
export type TrialScore = { part: number; correct: number; answered: number; total: number; passed: boolean; attempts?: number };

export type ProgressSummary = {
  rows: Record<string, unknown>[];
  streaks: { date: string; lessons: number; seconds: number }[];
  profile: { currentStreak: number; longestStreak: number; totalSeconds: number; lessonsCompleted: number; learningGoal: string | null } | null;
  notebook: { highlights: number; notes: number; bookmarks: number };
  trials: Record<string, TrialScore[]>;
  trialSource: "attempts" | "answers" | "none";
  mcqAnswered: number;
};
