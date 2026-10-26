/**
 * Admin learner analytics: shapes shared by the server lib (src/lib/admin/learners/*), the API
 * routes (/api/admin/learners/**, /api/admin/course/**) and the admin screens. Client-safe.
 */

export type AdminRange = "24h" | "7d" | "30d" | "90d" | "12m";

export type LessonStatus = "not_started" | "in_progress" | "completed";

/** Where a learner is right now (their latest lesson-level activity). */
export type Position = {
  week: string;
  lesson: string;
  title: string;
  /** "W02 · DAY 03" */
  tag: string;
  /** "02" (or "SQ" / "PLAN") */
  weekCode: string;
  href: string;
  /** stage id ("part-2") when known */
  stage: string | null;
  /** "Part II · Replication lag" */
  stageLabel: string | null;
  /** event = learn tracking event, column = learning_progress.last_stage, estimate = from progress % */
  stageSource: "event" | "column" | "estimate" | null;
  pct: number;
  status: LessonStatus;
  at: string;
  /** what told us: a learn event, the progress row, or a page view */
  source: "event" | "progress" | "pageview";
};

export type WeekSegment = {
  key: string;
  code: string;
  /** completed nodes (lessons + boss) */
  done: number;
  /** sum of in-progress fractions (0..n) */
  partial: number;
  total: number;
};

export type Segment = "active-now" | "at-risk" | "week-done" | "never-started" | "power";

export type Frequency = "daily" | "several/wk" | "weekly" | "occasional" | "dormant" | "new";

export type LearnerRow = {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  provider: string | null;
  isAdmin: boolean;
  signedUpAt: string | null;
  lastSignInAt: string | null;
  /** latest learning activity of any kind (null = never) */
  lastSeenAt: string | null;
  position: Position | null;
  /** completed core nodes (week lessons + bosses) / all core nodes, 0-100 */
  coursePct: number;
  completed: number;
  inProgress: number;
  /** lessons opened at all */
  touched: number;
  sideQuestsDone: number;
  weeks: WeekSegment[];
  /** capped per lesson (see TIME_CAP_SEC) */
  timeSec: number;
  activeDays30: number;
  activeDaysTotal: number;
  /** last 30 days, oldest → newest, activity count per day */
  strip30: number[];
  sessions30: number;
  frequency: Frequency;
  streak: number;
  longestStreak: number;
  mcq: { answered: number; correct: number; pct: number | null };
  notes: number;
  bookmarks: number;
  comments: number;
  device: string | null;
  country: string | null;
  city: string | null;
  segments: Segment[];
};

export type LearnersKpis = {
  learners: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  /** learners active in the selected range */
  activeInRange: number;
  /** completed lessons / learners who started anything */
  avgLessonsPerLearner: number;
  /** completed lesson rows / started lesson rows, 0-100 */
  completionRate: number;
  /** estimated engaged minutes in range / learners active in range */
  avgMinutesPerActive: number;
  newInRange: number;
};

export type LearnersSort =
  | "lastSeen"
  | "name"
  | "signedUp"
  | "progress"
  | "completed"
  | "time"
  | "frequency"
  | "streak"
  | "mcq"
  | "notes";

export type LearnersResponse = {
  generatedAt: string;
  tz: string;
  range: AdminRange;
  kpis: LearnersKpis;
  /** active learners per day over the range (day buckets in tz; hours for 24h) */
  trend: { t: string; active: number; completions: number }[];
  segments: Record<Segment | "all", number>;
  weeks: { key: string; code: string; title: string; total: number }[];
  rows: LearnerRow[];
  total: number;
  page: number;
  pageSize: number;
  /** optional migration columns/tables detected */
  features: Features;
};

export type Features = {
  stageColumns: boolean;
  gameColumns: boolean;
  trialAttempts: boolean;
  reviewCards: boolean;
  learnEvents: boolean;
  pageLeave: boolean;
};

export type LearnersSummary = {
  learners: number;
  guests: number;
  activeToday: number;
  active7d: number;
  lessonsCompleted: number;
  stagesDone: number;
  avgMinutesPerLearner: number;
  topLessons: { course: string; week: string; lesson: string; title: string; readers: number; completions: number }[];
  recent: { userId: string; name: string; email: string; lesson: string; title: string; stage: string | null; at: string }[];
};

// ------------------------------------------------------------------ drilldown

export type MapCell = {
  week: string;
  slug: string;
  code: string;
  title: string;
  kind: string;
  href: string;
  status: LessonStatus;
  pct: number;
  timeSec: number;
  startedAt: string | null;
  completedAt: string | null;
  lastAt: string | null;
  lastStage: string | null;
  visits: number;
};

export type TimelineItem =
  | {
      kind: "session";
      at: string;
      end: string;
      minutes: number;
      device: string | null;
      country: string | null;
      city: string | null;
      /** every page view, in order: how long it was open, how far it was scrolled, what happened on it */
      pages: { path: string; title: string; at: string; secs?: number; depth?: number; actions?: string[] }[];
    }
  | { kind: "started" | "completed"; at: string; week: string; lesson: string; title: string }
  | { kind: "mcq"; at: string; title: string; answered: number }
  | { kind: "note" | "bookmark" | "comment"; at: string; week: string; lesson: string; title: string; text: string }
  | { kind: "event"; at: string; name: string; title: string; detail: string };

export type McqResult = {
  assessmentId: string;
  week: string;
  slug: string;
  title: string;
  total: number;
  answered: number;
  correct: number;
  lastAt: string | null;
  parts: { n: number; title: string; total: number; answered: number; correct: number; passed: boolean }[];
  questions: { n: number; part: number; text: string; picked: string; correct: string | null; ok: boolean | null }[];
};

export type LearnerDetail = {
  generatedAt: string;
  tz: string;
  learner: LearnerRow;
  resume: { week: string; lesson: string; title: string; tag: string; href: string; stageLabel: string | null; reason: string } | null;
  map: { key: string; code: string; title: string; cells: MapCell[] }[];
  sideQuests: MapCell[];
  /** last 84 days (12 weeks), oldest → newest */
  calendar: { d: string; n: number }[];
  timeline: TimelineItem[];
  mcq: McqResult[];
  trials: { at: string; week: string; part: number; score: number; total: number; passed: boolean }[];
  notes: { id: string; week: string; lesson: string; title: string; text: string; createdAt: string }[];
  bookmarks: { id: string; week: string; lesson: string; title: string; text: string; createdAt: string }[];
  comments: { id: string; week: string; lesson: string; title: string; text: string; createdAt: string }[];
  devices: { label: string; n: number }[];
  locations: { label: string; n: number }[];
  firstVisit: { at: string; path: string; referrer: string | null; utm: string | null; device: string | null; country: string | null; city: string | null } | null;
  streakDays: { d: string; lessons: number; timeSec: number }[];
  game: { xp: number; quests: number } | null;
  features: Features;
};

// ------------------------------------------------------------------ course analytics

export type CourseLessonStat = {
  week: string;
  slug: string;
  title: string;
  tag: string;
  weekCode: string;
  order: number;
  core: boolean;
  href: string;
  /** signed-in learners who opened it (progress row or page view) */
  opened: number;
  reached50: number;
  completed: number;
  completionRate: number;
  medianTimeSec: number;
  avgPct: number;
  /** distinct guest visitors (no account) who viewed the lesson page */
  guests: number;
  views: number;
  notes: number;
  comments: number;
  bookmarks: number;
};

export type CourseAnalytics = {
  generatedAt: string;
  tz: string;
  range: AdminRange;
  lessons: CourseLessonStat[];
  weeks: { key: string; code: string; title: string; nodes: number; started: number; cleared: number; avgPct: number }[];
  hardest: { week: string; title: string; n: number; text: string; answered: number; correct: number; pct: number; topWrong: string | null }[];
  /** [dow 0=Mon..6][hour 0..23] learning activity counts in range */
  heatmap: number[][];
  stageEvents: boolean;
  learners: number;
};

export type StageDropoff = {
  week: string;
  lesson: string;
  title: string;
  source: "events" | "columns" | "none";
  stages: { id: string; label: string; title: string; minutes: number; reached: number; done: number }[];
};
