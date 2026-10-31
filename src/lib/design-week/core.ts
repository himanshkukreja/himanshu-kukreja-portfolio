/**
 * Design of the week: types, limits, phase logic, permission + vote rules and the store-agnostic
 * service the API routes call. Pure: no value imports (only `import type`), so it runs in the
 * browser (countdowns, editor limits), on the server, and under `node --test` with a mock store
 * (scripts/tests/design-week.test.mjs).
 *
 * Phases (per challenge, every timestamp configurable by the admin):
 *   draft     status "draft": invisible to learners
 *   upcoming  published, before starts_at: brief teaser + countdown, no submissions yet
 *   open      starts_at … submissions_close_at: write, autosave, submit, edit
 *   voting    submissions_close_at … ends_at: gallery, signed-in learners vote
 *   judging   after ends_at: counts revealed, admin confirms the winners
 *   closed    status "closed": winners featured (hub card, archive, winner's /u/<handle>)
 * status "open" / "voting" force that phase regardless of the clock (admin override).
 * Default weekly rhythm (weeklySchedule): opens Monday 09:00 IST, submissions until Saturday
 * 09:00 IST, voting Saturday–Monday 09:00 IST, winners Monday.
 */
import type { ShareSettings } from "../share/model";

/* ------------------------------------------------------------------ types */

export type ChallengeStatus = "draft" | "scheduled" | "open" | "voting" | "closed";
export type Phase = "draft" | "upcoming" | "open" | "voting" | "judging" | "closed";
export type SubmissionStatus = "draft" | "submitted" | "hidden" | "removed";
export type ReportReason = "spam" | "plagiarism" | "offensive" | "personal-info" | "off-topic" | "other";
export type ReportStatus = "open" | "dismissed" | "actioned";

export const CHALLENGE_STATUSES: ChallengeStatus[] = ["draft", "scheduled", "open", "voting", "closed"];
export const SUBMISSION_STATUSES: SubmissionStatus[] = ["draft", "submitted", "hidden", "removed"];
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: "spam", label: "Spam or advertising" },
  { id: "plagiarism", label: "Copied from someone else" },
  { id: "offensive", label: "Abusive or offensive" },
  { id: "personal-info", label: "Shares someone's personal information" },
  { id: "off-topic", label: "Not a design for this challenge" },
  { id: "other", label: "Something else" },
];

export type Challenge = {
  id: string;
  slug: string;
  title: string;
  /** one line for cards */
  summary: string;
  briefMd: string;
  constraints: string[];
  rubric: string[];
  /** "week-01-data-at-scale/day-03-rate-limiting-at-scale" */
  relatedLessons: string[];
  startsAt: string;
  submissionsCloseAt: string;
  /** voting closes */
  endsAt: string;
  status: ChallengeStatus;
  maxVotesPerUser: number;
  showLiveCounts: boolean;
  /** ordered: winner first */
  featuredSubmissionIds: string[];
  winnersAnnouncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChallengeInput = Pick<
  Challenge,
  "slug" | "title" | "summary" | "briefMd" | "constraints" | "rubric" | "relatedLessons" | "startsAt" | "submissionsCloseAt" | "endsAt" | "status" | "maxVotesPerUser" | "showLiveCounts"
>;

export type Submission = {
  id: string;
  challengeId: string;
  userId: string;
  title: string;
  bodyMd: string;
  status: SubmissionStatus;
  showAuthor: boolean;
  voteCount: number;
  reportCount: number;
  editCount: number;
  submittedAt: string | null;
  moderationNote: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Report = {
  id: string;
  submissionId: string;
  challengeId: string;
  reporterId: string;
  reason: ReportReason;
  note: string;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
};

/** What voter eligibility is decided from. */
export type Standing = { accountCreatedAt: string | null; lessonsCompleted: number };

/** Public author line. Never carries the user id or email. */
export type Author = { anonymous: boolean; handle: string | null; name: string | null; avatar: string | null; initials: string };

export type AuthorSource = { share: ShareSettings | null; fullName: string | null; avatarUrl: string | null };

export type VoteResult = "ok" | "duplicate" | "limit" | "closed" | "own" | "missing";

export interface DowStore {
  kind: "supabase" | "fixtures";
  ready(): Promise<{ ready: boolean; missing: string[] }>;
  listChallenges(): Promise<Challenge[]>;
  getChallenge(id: string): Promise<Challenge | null>;
  getChallengeBySlug(slug: string): Promise<Challenge | null>;
  insertChallenge(c: ChallengeInput, createdBy: string | null): Promise<Challenge>;
  updateChallenge(id: string, patch: Partial<Omit<Challenge, "id" | "createdAt" | "updatedAt">>): Promise<Challenge | null>;
  deleteChallenge(id: string): Promise<void>;
  listSubmissions(challengeId: string | null, statuses?: SubmissionStatus[]): Promise<Submission[]>;
  listSubmissionsByUser(userId: string): Promise<Submission[]>;
  getSubmission(id: string): Promise<Submission | null>;
  getUserSubmission(challengeId: string, userId: string): Promise<Submission | null>;
  insertSubmission(s: Pick<Submission, "challengeId" | "userId" | "title" | "bodyMd" | "status" | "showAuthor" | "submittedAt">): Promise<Submission>;
  updateSubmission(id: string, patch: Partial<Omit<Submission, "id" | "challengeId" | "userId" | "createdAt" | "updatedAt">> & { moderatedBy?: string | null }): Promise<Submission | null>;
  deleteSubmission(id: string): Promise<void>;
  votesByUser(challengeId: string, userId: string): Promise<string[]>;
  addVote(challengeId: string, submissionId: string, userId: string): Promise<VoteResult>;
  removeVote(submissionId: string, userId: string): Promise<boolean>;
  voteTotals(challengeId: string | null): Promise<{ votes: number; voters: number; byChallenge: Record<string, { votes: number; voters: number }> }>;
  addReport(r: Pick<Report, "submissionId" | "challengeId" | "reporterId" | "reason" | "note">): Promise<"ok" | "duplicate">;
  reportsByUserSince(userId: string, sinceIso: string): Promise<number>;
  listReports(filter: { status?: ReportStatus; challengeId?: string; submissionId?: string }): Promise<Report[]>;
  resolveReports(ids: string[], status: Exclude<ReportStatus, "open">, by: string | null): Promise<void>;
  standing(userId: string): Promise<Standing>;
  authors(userIds: string[]): Promise<Record<string, AuthorSource>>;
}

/* ------------------------------------------------------------------ limits */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const LIMITS = {
  titleMin: 3,
  titleMax: 120,
  /** characters of markdown */
  bodyMax: 40_000,
  /** a submitted design needs at least this much text */
  bodyMinToSubmit: 300,
  mermaidMax: 8,
  mermaidCharsMax: 8_000,
  reportNoteMax: 500,
  reportsPerDay: 10,
  /** distinct open reports that hide a submission until an admin reviews it */
  autoHideReports: 3,
  /** voters need an account this old … */
  voteAccountAgeMs: 3 * DAY,
  /** … or at least this many completed lessons */
  voteLessonsMin: 1,
  editsPerSubmission: 5_000,
  featuredMax: 3,
  challenge: { titleMax: 140, summaryMax: 280, briefMax: 20_000, listItemMax: 300, listMax: 12, relatedMax: 8 },
} as const;

/** Per-instance sliding windows (best effort; the DB enforces the hard rules). */
export const RATES = {
  save: { limit: 90, windowMs: 10 * MIN },
  preview: { limit: 60, windowMs: 10 * MIN },
  vote: { limit: 40, windowMs: 10 * MIN },
  report: { limit: 10, windowMs: HOUR },
  admin: { limit: 600, windowMs: 10 * MIN },
} as const;

export const XP = { submit: 40, featured: 100, win: 250 } as const;

/* ------------------------------------------------------------------ errors */

export type DowErrorCode =
  | "not-found"
  | "unauthorized"
  | "forbidden"
  | "phase"
  | "invalid"
  | "conflict"
  | "own"
  | "not-eligible"
  | "limit"
  | "rate"
  | "moderated"
  | "tables-missing";

export class DowError extends Error {
  status: number;
  code: DowErrorCode;
  fields?: Record<string, string>;
  constructor(status: number, code: DowErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/* ------------------------------------------------------------------ phases */

const t = (iso: string | null | undefined) => {
  const v = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(v) ? v : NaN;
};

export function phaseOf(c: Pick<Challenge, "status" | "startsAt" | "submissionsCloseAt" | "endsAt">, now: number = Date.now()): Phase {
  if (c.status === "draft") return "draft";
  if (c.status === "closed") return "closed";
  if (c.status === "open") return "open";
  if (c.status === "voting") return "voting";
  if (now < t(c.startsAt)) return "upcoming";
  if (now < t(c.submissionsCloseAt)) return "open";
  if (now < t(c.endsAt)) return "voting";
  return "judging";
}

export const PHASE_LABEL: Record<Phase, string> = {
  draft: "Draft",
  upcoming: "Opens soon",
  open: "Submissions open",
  voting: "Voting open",
  judging: "Picking winners",
  closed: "Closed",
};

export const canSubmitIn = (p: Phase) => p === "open";
export const canVoteIn = (p: Phase) => p === "voting";
/** the gallery is public from voting on; during submissions designs stay private (no copying) */
export const galleryVisibleIn = (p: Phase) => p === "voting" || p === "judging" || p === "closed";
/** counts stay hidden while voting (no herding, nothing to brigade towards) unless the admin opts in */
export const countsVisible = (c: Pick<Challenge, "showLiveCounts">, p: Phase) => p === "judging" || p === "closed" || (p === "voting" && c.showLiveCounts);

/** The next moment the countdown points at. */
export function nextDeadline(c: Pick<Challenge, "status" | "startsAt" | "submissionsCloseAt" | "endsAt">, now: number = Date.now()): { label: string; at: string } | null {
  return deadlineFor(phaseOf(c, now), c, now);
}

/** Same, from an already computed phase (views don't carry the status). */
export function deadlineFor(p: Phase, c: Pick<Challenge, "startsAt" | "submissionsCloseAt" | "endsAt">, now: number = Date.now()): { label: string; at: string } | null {
  const future = (iso: string) => t(iso) > now;
  if (p === "upcoming") return { label: "opens in", at: c.startsAt };
  if (p === "open" && future(c.submissionsCloseAt)) return { label: "submissions close in", at: c.submissionsCloseAt };
  if (p === "voting" && future(c.endsAt)) return { label: "voting closes in", at: c.endsAt };
  return null;
}

/** IST is UTC+05:30 with no DST. */
const IST_MS = 330 * MIN;

/** Monday (YYYY-MM-DD, IST) of the week after `now` (or this Monday if it's before 09:00 IST Monday). */
export function nextMondayIst(now: number = Date.now()): string {
  const ist = new Date(now + IST_MS);
  const dow = ist.getUTCDay(); // 0 = Sunday
  const beforeNine = ist.getUTCHours() < 9;
  const add = dow === 1 && beforeNine ? 0 : (8 - dow) % 7 || 7;
  const d = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + add));
  return d.toISOString().slice(0, 10);
}

const istAt = (day: string, hour: number, addDays = 0) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + addDays, hour, 0, 0) - IST_MS).toISOString();
};

/** Default weekly rhythm from a Monday: Mon 09:00 IST open → Sat 09:00 voting → next Mon 09:00 voting closes. */
export function weeklySchedule(monday: string): Pick<Challenge, "startsAt" | "submissionsCloseAt" | "endsAt"> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(monday)) throw new DowError(400, "invalid", "Pick a Monday (YYYY-MM-DD).");
  return { startsAt: istAt(monday, 9), submissionsCloseAt: istAt(monday, 9, 5), endsAt: istAt(monday, 9, 7) };
}

/** Which challenge the page leads with, and whose winners are "last week's". */
export function pickCurrent<C extends Pick<Challenge, "status" | "startsAt" | "submissionsCloseAt" | "endsAt" | "featuredSubmissionIds" | "winnersAnnouncedAt">>(
  challenges: C[],
  now: number = Date.now()
): { current: C | null; lastClosed: C | null; upcoming: C | null } {
  const live = challenges.filter((c) => c.status !== "draft");
  const byStartDesc = [...live].sort((a, b) => t(b.startsAt) - t(a.startsAt));
  const active = byStartDesc.find((c) => ["open", "voting", "judging"].includes(phaseOf(c, now))) || null;
  const upcoming = [...live].filter((c) => phaseOf(c, now) === "upcoming").sort((a, b) => t(a.startsAt) - t(b.startsAt))[0] || null;
  const closed = byStartDesc.filter((c) => phaseOf(c, now) === "closed");
  const lastClosed = closed.find((c) => c.featuredSubmissionIds.length > 0) || closed[0] || null;
  return { current: active || upcoming || lastClosed, lastClosed, upcoming };
}

/* ------------------------------------------------------------------ validation */

const str = (v: unknown) => (typeof v === "string" ? v : "");
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
const isIso = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LESSON_REF_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-zA-Z0-9-]*$/;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function list(v: unknown, max: number, itemMax: number): string[] {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split("\n") : [];
  return arr
    .map((x) => clean(str(x)).trim())
    .filter(Boolean)
    .slice(0, max)
    .map((x) => x.slice(0, itemMax));
}

/** Admin challenge form → a valid ChallengeInput, or field errors. `base` fills omitted fields (PATCH). */
export function validateChallenge(raw: Record<string, unknown>, base?: ChallengeInput): { ok: true; value: ChallengeInput } | { ok: false; errors: Record<string, string> } {
  const L = LIMITS.challenge;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);
  const pick = <K extends keyof ChallengeInput>(k: K, fallback: ChallengeInput[K]) => (has(k) ? raw[k] : base ? base[k] : fallback);
  const errors: Record<string, string> = {};
  const title = clean(str(pick("title", ""))).trim();
  const slug = str(pick("slug", "")).trim() || slugify(title);
  const v: ChallengeInput = {
    title,
    slug,
    summary: clean(str(pick("summary", ""))).trim(),
    briefMd: clean(str(pick("briefMd", ""))),
    constraints: list(pick("constraints", []), L.listMax, L.listItemMax),
    rubric: list(pick("rubric", []), L.listMax, L.listItemMax),
    relatedLessons: list(pick("relatedLessons", []), L.relatedMax, 160),
    startsAt: str(pick("startsAt", "")),
    submissionsCloseAt: str(pick("submissionsCloseAt", "")),
    endsAt: str(pick("endsAt", "")),
    status: str(pick("status", "draft")) as ChallengeStatus,
    maxVotesPerUser: Number(pick("maxVotesPerUser", 3)),
    showLiveCounts: pick("showLiveCounts", false) === true,
  };
  if (v.title.length < 3 || v.title.length > L.titleMax) errors.title = `Title: 3–${L.titleMax} characters.`;
  if (!SLUG_RE.test(v.slug) || v.slug.length > 80) errors.slug = "Slug: lowercase letters, digits and single hyphens.";
  if (v.summary.length > L.summaryMax) errors.summary = `Summary: at most ${L.summaryMax} characters.`;
  if (v.briefMd.length > L.briefMax) errors.briefMd = `Brief: at most ${L.briefMax.toLocaleString("en-US")} characters.`;
  if (v.relatedLessons.some((r) => !LESSON_REF_RE.test(r))) errors.relatedLessons = "Related lessons: one week-folder/lesson-slug per line.";
  if (!CHALLENGE_STATUSES.includes(v.status)) errors.status = "Unknown status.";
  if (!Number.isInteger(v.maxVotesPerUser) || v.maxVotesPerUser < 1 || v.maxVotesPerUser > 20) errors.maxVotesPerUser = "Votes per learner: 1–20.";
  if (!isIso(v.startsAt)) errors.startsAt = "Pick when submissions open.";
  if (!isIso(v.submissionsCloseAt)) errors.submissionsCloseAt = "Pick when submissions close.";
  if (!isIso(v.endsAt)) errors.endsAt = "Pick when voting closes.";
  if (!errors.startsAt && !errors.submissionsCloseAt && t(v.startsAt) >= t(v.submissionsCloseAt)) errors.submissionsCloseAt = "Submissions must close after they open.";
  if (!errors.submissionsCloseAt && !errors.endsAt && t(v.submissionsCloseAt) >= t(v.endsAt)) errors.endsAt = "Voting must close after submissions close.";
  if (Object.keys(errors).length) return { ok: false, errors };
  v.startsAt = new Date(t(v.startsAt)).toISOString();
  v.submissionsCloseAt = new Date(t(v.submissionsCloseAt)).toISOString();
  v.endsAt = new Date(t(v.endsAt)).toISOString();
  return { ok: true, value: v };
}

/** Counts what the renderer will do with a body (the sanitizer in ./sanitize.ts is authoritative). */
export function lintBody(md: string): { chars: number; words: number; mermaid: number; images: number; html: number; warnings: string[] } {
  const fences = [...md.matchAll(/^ {0,3}(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)^ {0,3}\1[ \t]*$/gm)];
  const mermaid = fences.filter((m) => m[2].toLowerCase() === "mermaid");
  const outside = fences.reduce((s, m) => s.replace(m[0], ""), md);
  const images = (outside.match(/!\[[^\]]*\]\s*[([]/g) || []).length;
  const html = (outside.match(/<\/?[a-zA-Z][^>]*>/g) || []).length;
  const warnings: string[] = [];
  if (md.length > LIMITS.bodyMax) warnings.push(`Too long: ${md.length.toLocaleString("en-US")} of ${LIMITS.bodyMax.toLocaleString("en-US")} characters.`);
  if (mermaid.length > LIMITS.mermaidMax) warnings.push(`Up to ${LIMITS.mermaidMax} Mermaid diagrams render; the rest show as code.`);
  if (mermaid.some((m) => m[3].length > LIMITS.mermaidCharsMax)) warnings.push(`A Mermaid diagram is over ${LIMITS.mermaidCharsMax.toLocaleString("en-US")} characters; it shows as code.`);
  if (images) warnings.push("Images aren't shown. Draw it with a Mermaid diagram instead.");
  if (html) warnings.push("Raw HTML isn't rendered. Use markdown.");
  return { chars: md.length, words: (md.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length, mermaid: mermaid.length, images, html, warnings };
}

export function validateSubmission(input: { title: string; bodyMd: string }, forSubmit: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.title.length > LIMITS.titleMax) errors.title = `Title: at most ${LIMITS.titleMax} characters.`;
  if (input.bodyMd.length > LIMITS.bodyMax) errors.bodyMd = `Your design is over ${LIMITS.bodyMax.toLocaleString("en-US")} characters. Trim it a little.`;
  if (forSubmit) {
    if (input.title.trim().length < LIMITS.titleMin) errors.title = "Give your design a title.";
    if (input.bodyMd.trim().length < LIMITS.bodyMinToSubmit) errors.bodyMd = `Write at least ${LIMITS.bodyMinToSubmit} characters before submitting.`;
  }
  return errors;
}

/* ------------------------------------------------------------------ rules */

export type Eligibility = { ok: true } | { ok: false; reason: "new-account"; message: string };

/** Anti-abuse: a vote needs a completed lesson or an account at least three days old. */
export function voteEligibility(s: Standing, now: number = Date.now()): Eligibility {
  if (s.lessonsCompleted >= LIMITS.voteLessonsMin) return { ok: true };
  const created = t(s.accountCreatedAt);
  if (Number.isFinite(created) && now - created >= LIMITS.voteAccountAgeMs) return { ok: true };
  return { ok: false, reason: "new-account", message: "Finish one lesson to unlock voting (or come back when your account is three days old). It keeps the votes honest." };
}

/** Can this viewer read this submission? Public: submitted + gallery phase. Authors: always. Admins: always. */
export function canRead(s: Pick<Submission, "status" | "userId">, phase: Phase, viewer: { id: string | null; admin?: boolean }): boolean {
  if (viewer.admin) return true;
  if (viewer.id && viewer.id === s.userId) return true;
  return s.status === "submitted" && galleryVisibleIn(phase);
}

/** Top `n` visible submissions by votes; ties go to the earlier submission. */
export function preselectWinners(subs: Submission[], n: number = LIMITS.featuredMax): string[] {
  return subs
    .filter((s) => s.status === "submitted")
    .sort((a, b) => b.voteCount - a.voteCount || t(a.submittedAt || a.createdAt) - t(b.submittedAt || b.createdAt))
    .slice(0, n)
    .map((s) => s.id);
}

export type Award = { key: string; xp: number; label: string };

/** XP keys a learner has earned (awardOnce on the client makes them idempotent). */
export function awardsFor(userId: string, challenges: Challenge[], mine: Submission[]): Award[] {
  const out: Award[] = [];
  for (const s of mine) {
    if (s.userId !== userId) continue;
    const c = challenges.find((x) => x.id === s.challengeId);
    if (!c) continue;
    if (s.submittedAt && s.status !== "removed") out.push({ key: `dow:submit:${c.slug}`, xp: XP.submit, label: `Design submitted · ${c.title}` });
    if (c.status !== "closed" || s.status !== "submitted") continue;
    const at = c.featuredSubmissionIds.indexOf(s.id);
    if (at === 0) out.push({ key: `dow:win:${c.slug}`, xp: XP.win, label: `Design of the week · ${c.title}` });
    else if (at > 0) out.push({ key: `dow:feat:${c.slug}`, xp: XP.featured, label: `Featured design · ${c.title}` });
  }
  return out;
}

/** Wins that light up the badge on /u/<handle>: { slug → announced at (ms) }. */
export function winsFor(userId: string, challenges: Challenge[], mine: Submission[]): { slug: string; title: string; at: number }[] {
  return challenges
    .filter((c) => c.status === "closed" && c.featuredSubmissionIds.length)
    .flatMap((c) => {
      const s = mine.find((x) => x.id === c.featuredSubmissionIds[0] && x.userId === userId && x.status === "submitted");
      return s ? [{ slug: c.slug, title: c.title, at: t(c.winnersAnnouncedAt || c.updatedAt) || Date.now() }] : [];
    });
}

/** Display name for an author, per their share settings (and the per-submission opt-out). */
export function authorOf(src: AuthorSource | undefined, showAuthor: boolean): Author {
  const anon: Author = { anonymous: true, handle: null, name: null, avatar: null, initials: "AL" };
  const share = src?.share;
  if (!showAuthor || !share || !share.enabled || !share.handle) return anon;
  const full = clean(src?.fullName || "")
    .trim()
    .slice(0, 60);
  const mode = share.visibility.name;
  let name: string | null = null;
  if (full && mode === "full") name = full;
  else if (full && mode === "first") {
    const parts = full.split(/\s+/).filter(Boolean);
    name = `${parts[0].slice(0, 18)}${parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : ""}`;
  }
  // An https photo, or one of the built-in cartoons (/avatars/<group>/<id>.svg; see lib/avatars/catalog).
  const avatar = name && share.visibility.avatar && /^(https:\/\/\S+|\/avatars\/(people|mascots)\/[a-z0-9-]{1,32}\.svg)$/.test(src?.avatarUrl || "") ? src!.avatarUrl! : null;
  const initials =
    (name || share.handle)
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0]!.toUpperCase())
      .join("") || "LR";
  return { anonymous: false, handle: share.handle, name, avatar, initials };
}

export function excerptOf(md: string, n = 180): string {
  const text = md
    .replace(/^ {0,3}(`{3,}|~{3,})[\s\S]*?^ {0,3}\1[ \t]*$/gm, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > n ? `${text.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : text;
}

export function diagramCount(md: string): number {
  return Math.min(LIMITS.mermaidMax, (md.match(/^ {0,3}(`{3,}|~{3,})[ \t]*mermaid\b/gim) || []).length);
}

/* ------------------------------------------------------------------ rate limit */

/** Sliding-window limiter, in memory (per server instance). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  /** true = allowed (and counted) */
  hit(key: string, now: number = Date.now()): boolean {
    const from = now - this.windowMs;
    const arr = (this.hits.get(key) || []).filter((x) => x > from);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5_000) {
      for (const [k, v] of this.hits) if (!v.some((x) => x > from)) this.hits.delete(k);
    }
    return true;
  }
}

/* ------------------------------------------------------------------ service */

export type Actor = { id: string };
export type Clock = { now: () => number };
const sysClock: Clock = { now: () => Date.now() };

async function challengeOr404(store: DowStore, slugOrId: { slug?: string; id?: string }): Promise<Challenge> {
  const c = slugOrId.id ? await store.getChallenge(slugOrId.id) : await store.getChallengeBySlug(slugOrId.slug || "");
  if (!c || c.status === "draft") throw new DowError(404, "not-found", "That challenge doesn't exist.");
  return c;
}

export type SaveInput = { title?: unknown; bodyMd?: unknown; showAuthor?: unknown; action?: unknown; baseUpdatedAt?: unknown };

/**
 * Autosave / submit / withdraw the actor's own submission. Only while submissions are open.
 * action: "save" (keeps the current status) | "submit" | "withdraw" (back to draft).
 */
export async function saveSubmission(store: DowStore, actor: Actor, slug: string, input: SaveInput, clock: Clock = sysClock): Promise<{ submission: Submission; first: boolean }> {
  const c = await challengeOr404(store, { slug });
  const phase = phaseOf(c, clock.now());
  if (!canSubmitIn(phase)) throw new DowError(409, "phase", phase === "upcoming" ? "Submissions haven't opened yet." : "Submissions are closed for this challenge.");
  const action = input.action === "submit" || input.action === "withdraw" ? input.action : "save";
  const existing = await store.getUserSubmission(c.id, actor.id);
  if (existing && existing.status === "removed") throw new DowError(403, "moderated", "This submission was removed by a moderator.");
  if (existing && typeof input.baseUpdatedAt === "string" && input.baseUpdatedAt && input.baseUpdatedAt !== existing.updatedAt) {
    throw new DowError(409, "conflict", "This design changed in another tab. Reload to get the latest version.");
  }
  if (existing && existing.editCount >= LIMITS.editsPerSubmission) throw new DowError(429, "rate", "Too many saves on this design.");
  const title = typeof input.title === "string" ? clean(input.title).trim().slice(0, LIMITS.titleMax + 1) : (existing?.title ?? "");
  const bodyMd = typeof input.bodyMd === "string" ? clean(input.bodyMd).replace(/\r\n?/g, "\n") : (existing?.bodyMd ?? "");
  const showAuthor = typeof input.showAuthor === "boolean" ? input.showAuthor : (existing?.showAuthor ?? true);
  const willBeSubmitted = action === "submit" || (action === "save" && existing?.status === "submitted");
  const errors = validateSubmission({ title, bodyMd }, willBeSubmitted && existing?.status !== "hidden");
  if (Object.keys(errors).length) throw new DowError(400, "invalid", Object.values(errors)[0], errors);

  const nowIso = new Date(clock.now()).toISOString();
  let status: SubmissionStatus = existing?.status ?? "draft";
  if (status !== "hidden") {
    if (action === "submit") status = "submitted";
    else if (action === "withdraw") status = "draft";
  }
  const submittedAt = status === "submitted" || status === "hidden" ? (existing?.submittedAt ?? nowIso) : null;
  const first = action === "submit" && !existing?.submittedAt;
  if (!existing) {
    const submission = await store.insertSubmission({ challengeId: c.id, userId: actor.id, title, bodyMd, status, showAuthor, submittedAt });
    return { submission, first };
  }
  const submission = await store.updateSubmission(existing.id, { title, bodyMd, status, showAuthor, submittedAt, editCount: existing.editCount + 1 });
  if (!submission) throw new DowError(404, "not-found", "That submission is gone.");
  return { submission, first };
}

/** Delete your own submission (only while submissions are open). */
export async function deleteOwnSubmission(store: DowStore, actor: Actor, slug: string, clock: Clock = sysClock): Promise<void> {
  const c = await challengeOr404(store, { slug });
  if (!canSubmitIn(phaseOf(c, clock.now()))) throw new DowError(409, "phase", "Submissions are closed; this design stays in the archive.");
  const s = await store.getUserSubmission(c.id, actor.id);
  if (!s) return;
  if (s.status === "removed" || s.status === "hidden") throw new DowError(403, "moderated", "A moderator is reviewing this submission.");
  await store.deleteSubmission(s.id);
}

export type VoteOutcome = { voted: boolean; votes: string[]; remaining: number };

/** Vote (on = true) or take a vote back. Signed-in, eligible, not your own, voting phase, capped per challenge. */
export async function castVote(store: DowStore, actor: Actor, submissionId: string, on: boolean, clock: Clock = sysClock): Promise<VoteOutcome> {
  const s = await store.getSubmission(submissionId);
  if (!s || s.status !== "submitted") throw new DowError(404, "not-found", "That design isn't open for votes.");
  const c = await challengeOr404(store, { id: s.challengeId });
  const now = clock.now();
  if (!canVoteIn(phaseOf(c, now))) throw new DowError(409, "phase", "Voting isn't open for this challenge.");
  if (s.userId === actor.id) throw new DowError(403, "own", "You can't vote for your own design.");
  const mine = await store.votesByUser(c.id, actor.id);
  const has = mine.includes(s.id);
  if (!on) {
    if (has) await store.removeVote(s.id, actor.id);
    const votes = mine.filter((x) => x !== s.id);
    return { voted: false, votes, remaining: Math.max(0, c.maxVotesPerUser - votes.length) };
  }
  if (has) return { voted: true, votes: mine, remaining: Math.max(0, c.maxVotesPerUser - mine.length) };
  const el = voteEligibility(await store.standing(actor.id), now);
  if (!el.ok) throw new DowError(403, "not-eligible", el.message);
  if (mine.length >= c.maxVotesPerUser) throw new DowError(409, "limit", `You've used all ${c.maxVotesPerUser} votes for this challenge. Take one back to move it.`);
  const r = await store.addVote(c.id, s.id, actor.id);
  if (r === "limit") throw new DowError(409, "limit", `You've used all ${c.maxVotesPerUser} votes for this challenge.`);
  if (r === "own") throw new DowError(403, "own", "You can't vote for your own design.");
  if (r === "closed") throw new DowError(409, "phase", "Voting isn't open for this challenge.");
  if (r === "missing") throw new DowError(404, "not-found", "That design isn't open for votes.");
  const votes = r === "duplicate" ? mine : [...mine, s.id];
  return { voted: true, votes, remaining: Math.max(0, c.maxVotesPerUser - votes.length) };
}

/** Report a submission. One report per learner per submission; 3 distinct open reports hide it for review. */
export async function reportSubmission(
  store: DowStore,
  actor: Actor,
  submissionId: string,
  input: { reason?: unknown; note?: unknown },
  clock: Clock = sysClock
): Promise<{ reported: true; already: boolean; hidden: boolean }> {
  const s = await store.getSubmission(submissionId);
  if (!s || (s.status !== "submitted" && s.status !== "hidden")) throw new DowError(404, "not-found", "That design isn't public.");
  const c = await challengeOr404(store, { id: s.challengeId });
  if (!galleryVisibleIn(phaseOf(c, clock.now()))) throw new DowError(404, "not-found", "That design isn't public.");
  if (s.userId === actor.id) throw new DowError(403, "own", "You can't report your own design.");
  const reason = REPORT_REASONS.find((r) => r.id === input.reason)?.id;
  if (!reason) throw new DowError(400, "invalid", "Pick a reason.");
  const note = clean(str(input.note)).trim();
  if (note.length > LIMITS.reportNoteMax) throw new DowError(400, "invalid", `Note: at most ${LIMITS.reportNoteMax} characters.`);
  const since = new Date(clock.now() - DAY).toISOString();
  if ((await store.reportsByUserSince(actor.id, since)) >= LIMITS.reportsPerDay) throw new DowError(429, "rate", "You've sent a lot of reports today. Thanks; we'll look at them.");
  const r = await store.addReport({ submissionId: s.id, challengeId: c.id, reporterId: actor.id, reason, note });
  const open = await store.listReports({ submissionId: s.id, status: "open" });
  const distinct = new Set(open.map((x) => x.reporterId)).size;
  let hidden = s.status === "hidden";
  const patch: Parameters<DowStore["updateSubmission"]>[1] = { reportCount: open.length };
  if (s.status === "submitted" && distinct >= LIMITS.autoHideReports) {
    patch.status = "hidden";
    patch.moderationNote = `Hidden automatically after ${distinct} reports, pending review.`;
    patch.moderatedAt = new Date(clock.now()).toISOString();
    patch.moderatedBy = null;
    hidden = true;
  }
  await store.updateSubmission(s.id, patch);
  return { reported: true, already: r === "duplicate", hidden };
}

export type ModAction = "hide" | "remove" | "restore";

/** Admin moderation. Hiding/removing a featured design drops it from the featured list. */
export async function moderate(store: DowStore, admin: Actor, submissionId: string, action: ModAction, note: string, clock: Clock = sysClock): Promise<Submission> {
  const s = await store.getSubmission(submissionId);
  if (!s) throw new DowError(404, "not-found", "That submission doesn't exist.");
  if (!["hide", "remove", "restore"].includes(action)) throw new DowError(400, "invalid", "Unknown action.");
  const at = new Date(clock.now()).toISOString();
  const open = await store.listReports({ submissionId: s.id, status: "open" });
  let status: SubmissionStatus;
  if (action === "restore") status = s.submittedAt ? "submitted" : "draft";
  else status = action === "hide" ? "hidden" : "removed";
  const moderationNote = clean(note).trim().slice(0, LIMITS.reportNoteMax) || (action === "restore" ? null : action === "hide" ? "Hidden by a moderator." : "Removed by a moderator.");
  const next = await store.updateSubmission(s.id, { status, moderationNote, moderatedAt: at, moderatedBy: admin.id, reportCount: 0 });
  if (open.length) await store.resolveReports(open.map((r) => r.id), action === "restore" ? "dismissed" : "actioned", admin.id);
  if (action !== "restore") {
    const c = await store.getChallenge(s.challengeId);
    if (c && c.featuredSubmissionIds.includes(s.id)) await store.updateChallenge(c.id, { featuredSubmissionIds: c.featuredSubmissionIds.filter((x) => x !== s.id) });
  }
  if (!next) throw new DowError(404, "not-found", "That submission doesn't exist.");
  return next;
}

/** Admin: confirm the featured designs (winner first) and close the challenge. */
export async function confirmWinners(store: DowStore, admin: Actor, challengeId: string, ids: unknown, clock: Clock = sysClock): Promise<Challenge> {
  const c = await store.getChallenge(challengeId);
  if (!c) throw new DowError(404, "not-found", "That challenge doesn't exist.");
  const phase = phaseOf(c, clock.now());
  if (!["voting", "judging", "closed"].includes(phase)) throw new DowError(409, "phase", "Winners can be picked once voting has started.");
  const list = Array.isArray(ids) ? [...new Set(ids.filter((x): x is string => typeof x === "string"))] : [];
  if (!list.length) throw new DowError(400, "invalid", "Pick at least one design.");
  if (list.length > LIMITS.featuredMax) throw new DowError(400, "invalid", `Feature at most ${LIMITS.featuredMax} designs.`);
  const subs = await store.listSubmissions(c.id, ["submitted"]);
  const ok = new Set(subs.map((s) => s.id));
  const bad = list.filter((x) => !ok.has(x));
  if (bad.length) throw new DowError(400, "invalid", "Only visible designs from this challenge can be featured.");
  const next = await store.updateChallenge(c.id, { featuredSubmissionIds: list, status: "closed", winnersAnnouncedAt: c.winnersAnnouncedAt || new Date(clock.now()).toISOString() });
  if (!next) throw new DowError(404, "not-found", "That challenge doesn't exist.");
  void admin;
  return next;
}

/* ------------------------------------------------------------------ stats */

export type ChallengeStats = { submitted: number; drafts: number; hidden: number; removed: number; participants: number; votes: number; voters: number; openReports: number };

export function statsOf(subs: Submission[], votes: { votes: number; voters: number } | undefined, openReports: number): ChallengeStats {
  return {
    submitted: subs.filter((s) => s.status === "submitted").length,
    drafts: subs.filter((s) => s.status === "draft").length,
    hidden: subs.filter((s) => s.status === "hidden").length,
    removed: subs.filter((s) => s.status === "removed").length,
    participants: new Set(subs.filter((s) => s.submittedAt).map((s) => s.userId)).size,
    votes: votes?.votes ?? 0,
    voters: votes?.voters ?? 0,
    openReports,
  };
}

/** All-time participation: learners who submitted, and how many came back for another week. */
export function participation(subs: Submission[]): { participants: number; repeat: number; submissions: number } {
  const per = new Map<string, Set<string>>();
  subs
    .filter((s) => s.submittedAt && s.status !== "removed")
    .forEach((s) => {
      const set = per.get(s.userId) || new Set<string>();
      set.add(s.challengeId);
      per.set(s.userId, set);
    });
  return { participants: per.size, repeat: [...per.values()].filter((x) => x.size >= 2).length, submissions: [...per.values()].reduce((a, x) => a + x.size, 0) };
}
