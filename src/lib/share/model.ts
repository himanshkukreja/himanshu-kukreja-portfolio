/**
 * Share-my-progress: shapes shared by the public page (/u/<handle>), its OG cards, the settings
 * panel, the share sheet and the API. Pure — safe on the server and in the browser.
 */

export const SITE_ORIGIN = "https://himanshukukreja.in";
export const COURSE_NAME = "System Design Mastery";

/* ------------------------------------------------------------------ visibility */

export type NameMode = "full" | "first" | "none";

export type Visibility = {
  /** "full" = full name, "first" = "Himanshu K.", "none" = handle only (anonymous) */
  name: NameMode;
  avatar: boolean;
  /** level, XP, course %, lessons completed, per-week bars */
  progress: boolean;
  /** the skill tree / world map */
  tree: boolean;
  streak: boolean;
  /** Arena: league, rank, weekly points, best daily, daily streak */
  scores: boolean;
  badges: boolean;
  milestones: boolean;
};

export const DEFAULT_VISIBILITY: Visibility = {
  name: "first",
  avatar: false,
  progress: true,
  tree: true,
  streak: true,
  scores: true,
  badges: true,
  milestones: true,
};

export const VISIBILITY_KEYS = ["progress", "tree", "streak", "scores", "badges", "milestones"] as const;
export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];

export function cleanVisibility(v: unknown): Visibility {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const out: Visibility = { ...DEFAULT_VISIBILITY };
  if (o.name === "full" || o.name === "first" || o.name === "none") out.name = o.name;
  if (typeof o.avatar === "boolean") out.avatar = o.avatar;
  for (const k of VISIBILITY_KEYS) if (typeof o[k] === "boolean") out[k] = o[k] as boolean;
  return out;
}

export type ShareSettings = { enabled: boolean; handle: string; visibility: Visibility; updatedAt: string | null };

/** GET /api/learn/share */
export type ShareState = {
  /** false until the 20261016_share_profiles migration is applied */
  available: boolean;
  settings: ShareSettings | null;
  suggested: string;
  /** what the share text needs; null when the stats couldn't be built */
  summary: ShareSummary | null;
};

export type ShareSummary = {
  levelCode: string;
  levelName: string;
  xp: number;
  pct: number;
  streak: number;
  lessonsDone: number;
  worldsCleared: number;
  leagueCode: string | null;
  leagueName: string | null;
  leagueRank: number | null;
};

/* ------------------------------------------------------------------ public profile */

export type TreeLesson = { status: "not_started" | "in_progress" | "completed" };

export type ProfileWeek = { key: string; code: string; title: string; badge: string; pct: number; cleared: boolean; started: boolean; bossDone: boolean };

export type Milestone = { id: string; label: string; at: number; achievement?: string };

export type PublicProfile = {
  handle: string;
  /** display name per the name setting; null = anonymous */
  name: string | null;
  avatar: string | null;
  initials: string;
  since: string | null;
  level: { index: number; code: string; name: string; xp: number; pct: number; next: { code: string; name: string; toGo: number } | null } | null;
  course: {
    title: string;
    pct: number;
    nodesDone: number;
    nodesTotal: number;
    lessonsDone: number;
    lessonsTotal: number;
    worldsCleared: number;
    worldsTotal: number;
    bossesDone: number;
    trialPartsPassed: number;
    weeks: ProfileWeek[];
  } | null;
  /** read-only skill tree: per-lesson status + per-week passed trial parts */
  tree: { lessons: Record<string, TreeLesson>; boss: string[]; trials: Record<string, number[]>; currentWeek: string | null } | null;
  streak: { current: number; best: number } | null;
  arena: {
    tier: number;
    leagueCode: string;
    leagueName: string;
    rank: number | null;
    leaguePlayers: number;
    weekPoints: number;
    allTime: number;
    globalRank: number | null;
    dailyStreak: number;
    bestDaily: { correct: number; total: number; score: number; date: string; number: number } | null;
  } | null;
  badges: { id: string; name: string; how: string }[] | null;
  milestones: Milestone[] | null;
  /** achievement ids that have a share page (/u/<handle>/a/<id>) */
  achievements: string[];
  updatedAt: number;
};

/* ------------------------------------------------------------------ achievements */

export type Achievement = { id: string; kicker: string; title: string; sub: string };

/** World / boss ids use the week code ("world-03", "boss-02"); level ids the level number ("level-3"). */
export function achievementFor(p: PublicProfile, id: string): Achievement | null {
  if (!p.achievements.includes(id)) return null;
  let m: RegExpMatchArray | null;
  if ((m = id.match(/^world-(\d{2})$/))) {
    const w = p.course?.weeks.find((x) => x.code === m![1]);
    if (!w) return null;
    return { id, kicker: `World ${w.code} · cleared`, title: `World ${w.code} cleared`, sub: `${w.title} · badge: ${w.badge}` };
  }
  if ((m = id.match(/^boss-(\d{2})$/))) {
    const w = p.course?.weeks.find((x) => x.code === m![1]);
    if (!w) return null;
    return { id, kicker: `Week ${w.code} · interview boss`, title: `Beat the Week ${Number(w.code)} boss`, sub: w.title };
  }
  if ((m = id.match(/^level-(\d)$/)) && p.level) {
    return { id, kicker: "Level up", title: `${p.level.code} ${p.level.name}`, sub: `${p.level.xp.toLocaleString("en-US")} XP on the engineering ladder` };
  }
  if (id === "streak" && p.streak) {
    return { id, kicker: "Streak", title: `${p.streak.current}-day streak`, sub: `best ${p.streak.best} days · learning every day` };
  }
  if (id === "daily" && p.arena?.bestDaily) {
    const d = p.arena.bestDaily;
    return { id, kicker: `Daily challenge #${d.number}`, title: `${d.correct}/${d.total} · ${d.score} pts`, sub: "best daily challenge run · same five questions for everyone that day" };
  }
  if (id === "league" && p.arena) {
    const a = p.arena;
    return { id, kicker: "Arena · this week", title: a.rank ? `#${a.rank} in ${a.leagueCode} ${a.leagueName}` : `${a.leagueCode} ${a.leagueName} league`, sub: `${a.weekPoints} points this week` };
  }
  if ((m = id.match(/^badge-([a-z0-9-]+)$/))) {
    const b = p.badges?.find((x) => x.id === m![1]);
    if (!b) return null;
    return { id, kicker: "Badge unlocked", title: b.name, sub: b.how };
  }
  return null;
}

/* ------------------------------------------------------------------ share copy + links */

export type ShareKind = "profile" | "tree" | "daily" | "world" | "boss" | "level" | "lesson" | "badge" | "badges" | "leaderboard" | "streak" | "certificate";

export type ShareContext = {
  kind: ShareKind;
  summary?: ShareSummary | null;
  /** world/boss code ("03"), lesson title, badge name, daily grid… */
  title?: string;
  detail?: string;
};

const pctPart = (s?: ShareSummary | null) => (s ? `${s.levelCode} · ${s.pct}% through ${COURSE_NAME}` : COURSE_NAME);

/** Prefilled text for the share sheet (no URL; the sheet appends it per channel). */
export function shareText(c: ShareContext): string {
  const s = c.summary;
  const hook = "1,000+ quick checks, daily challenges.";
  switch (c.kind) {
    case "world":
      return `I just cleared World ${c.title} of ${COURSE_NAME}${c.detail ? ` (${c.detail})` : ""}. ${s ? `${s.pct}% through. ` : ""}Your move.`;
    case "boss":
      return `I beat the Week ${Number(c.title) || c.title} interview boss in ${COURSE_NAME}${c.detail ? ` · ${c.detail}` : ""}. Think you can?`;
    case "level":
      return `Just hit ${c.title || (s ? `${s.levelCode} ${s.levelName}` : "a new level")} in ${COURSE_NAME}. ${hook} Catch me if you can.`;
    case "lesson":
      return `Cleared "${c.title}" · ${pctPart(s)}. ${hook} Join me?`;
    case "badge":
      return `Unlocked the "${c.title}" badge in ${COURSE_NAME}. ${hook} Can you get it too?`;
    case "badges":
      return `My ${COURSE_NAME} badges so far · ${pctPart(s)}. Can you beat my streak?`;
    case "daily":
      return `${c.detail || `Today's ${COURSE_NAME} daily challenge`}\nCan you beat my score? Same five questions for everyone today.`;
    case "leaderboard":
      return s?.leagueRank
        ? `I'm #${s.leagueRank} in the ${s.leagueCode} ${s.leagueName} league this week on ${COURSE_NAME}. Think you can catch me?`
        : `I'm on the ${COURSE_NAME} weekly leaderboard. Think you can catch me?`;
    case "streak":
      return `${s?.streak || 0}-day learning streak on ${COURSE_NAME}. ${hook} Can you beat my streak?`;
    case "certificate":
      return `I earned the ${COURSE_NAME} ${c.title || "certificate of completion"}. Verify it here:`;
    case "tree":
      return `My ${COURSE_NAME} skill tree · ${pctPart(s)}${s?.worldsCleared ? ` · ${s.worldsCleared} world${s.worldsCleared === 1 ? "" : "s"} cleared` : ""}. ${hook} Can you beat my streak?`;
    default:
      return `I'm ${pctPart(s)} — ${hook} Can you beat my streak?`;
  }
}

export type ShareChannel = "copy" | "native" | "whatsapp" | "linkedin" | "x";

/** Adds utm tags for the channel (copy/native stay clean). */
export function channelLink(url: string, channel: ShareChannel): string {
  if (channel === "copy" || channel === "native") return url;
  const u = new URL(url);
  u.searchParams.set("utm_source", channel);
  u.searchParams.set("utm_medium", "share");
  return u.toString();
}

export function channelHref(channel: Exclude<ShareChannel, "copy" | "native">, url: string, text: string): string {
  const link = channelLink(url, channel);
  if (channel === "whatsapp") return `https://wa.me/?text=${encodeURIComponent(`${text}\n${link}`)}`;
  if (channel === "linkedin") return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`;
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
}

export const profilePath = (handle: string, achievement?: string | null) => `/u/${handle}${achievement ? `/a/${achievement}` : ""}`;

/** Links on the public page carry the referrer. */
export const withRef = (path: string, handle: string) => `${path}${path.includes("?") ? "&" : "?"}ref=${encodeURIComponent(handle)}`;
