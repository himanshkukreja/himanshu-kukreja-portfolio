import "server-only";
/**
 * Persistence for Design of the week. Server-only, service role.
 *
 *   supabase (default): dow_challenges / dow_submissions / dow_votes / dow_reports
 *     (supabase/migrations/20261018_design_of_week.sql). Until it is applied every call throws
 *     DowError 503 "tables-missing"; pages catch it and show "coming soon".
 *   fixtures (dev QA only: NODE_ENV !== "production" AND DOW_FIXTURES=1): the same interface in
 *     memory (./fixtures.ts), with `Bearer fixture.<id>` learner tokens and the admin preview
 *     header, so the learner pages and /admin?preview=1 work end to end without the database.
 */
import { supabase } from "@/lib/supabase";
import { cleanVisibility, type ShareSettings } from "@/lib/share/model";
import type { AuthorSource, Challenge, ChallengeStatus, DowStore, Report, ReportReason, ReportStatus, Standing, Submission, SubmissionStatus, VoteResult } from "./core";
import { DowError } from "./core";
import { fixtureStore } from "./fixtures";

export const TABLES = ["dow_challenges", "dow_submissions", "dow_votes", "dow_reports"] as const;

export const dowFixtures = () => process.env.NODE_ENV !== "production" && process.env.DOW_FIXTURES === "1";

type PgError = { code?: string; message?: string; details?: string | null } | null;
type Row = Record<string, unknown>;

const missing = (e: PgError) => !!e && (["42P01", "PGRST205", "42703", "PGRST204"].includes(e.code || "") || /does not exist|could not find the/i.test(`${e.message ?? ""} ${e.details ?? ""}`));

export const tablesMissing = () => new DowError(503, "tables-missing", "Design of the week isn't switched on yet: apply supabase/migrations/20261018_design_of_week.sql.");

function fail(e: PgError): never {
  if (missing(e)) throw tablesMissing();
  console.error("[design-week] db", e?.code, e?.message);
  throw new DowError(500, "invalid", "Database error.");
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const iso = (v: unknown) => (typeof v === "string" && v ? new Date(v).toISOString() : null);

function challengeFrom(r: Row): Challenge {
  return {
    id: s(r.id),
    slug: s(r.slug),
    title: s(r.title),
    summary: s(r.summary),
    briefMd: s(r.brief_md),
    constraints: strs(r.constraints),
    rubric: strs(r.rubric),
    relatedLessons: strs(r.related_lessons),
    startsAt: iso(r.starts_at) || "",
    submissionsCloseAt: iso(r.submissions_close_at) || "",
    endsAt: iso(r.ends_at) || "",
    status: (s(r.status) || "draft") as ChallengeStatus,
    maxVotesPerUser: n(r.max_votes_per_user, 3),
    showLiveCounts: r.show_live_counts === true,
    featuredSubmissionIds: strs(r.featured_submission_ids),
    winnersAnnouncedAt: iso(r.winners_announced_at),
    createdAt: iso(r.created_at) || "",
    updatedAt: iso(r.updated_at) || "",
  };
}

function submissionFrom(r: Row): Submission {
  return {
    id: s(r.id),
    challengeId: s(r.challenge_id),
    userId: s(r.user_id),
    title: s(r.title),
    bodyMd: s(r.body_md),
    status: (s(r.status) || "draft") as SubmissionStatus,
    showAuthor: r.show_author !== false,
    voteCount: n(r.vote_count),
    reportCount: n(r.report_count),
    editCount: n(r.edit_count),
    submittedAt: iso(r.submitted_at),
    moderationNote: typeof r.moderation_note === "string" ? r.moderation_note : null,
    moderatedAt: iso(r.moderated_at),
    createdAt: iso(r.created_at) || "",
    updatedAt: iso(r.updated_at) || "",
  };
}

function reportFrom(r: Row): Report {
  return {
    id: s(r.id),
    submissionId: s(r.submission_id),
    challengeId: s(r.challenge_id),
    reporterId: s(r.reporter_id),
    reason: s(r.reason) as ReportReason,
    note: s(r.note),
    status: (s(r.status) || "open") as ReportStatus,
    createdAt: iso(r.created_at) || "",
    resolvedAt: iso(r.resolved_at),
  };
}

const CH_COLS: Record<string, string> = {
  slug: "slug",
  title: "title",
  summary: "summary",
  briefMd: "brief_md",
  constraints: "constraints",
  rubric: "rubric",
  relatedLessons: "related_lessons",
  startsAt: "starts_at",
  submissionsCloseAt: "submissions_close_at",
  endsAt: "ends_at",
  status: "status",
  maxVotesPerUser: "max_votes_per_user",
  showLiveCounts: "show_live_counts",
  featuredSubmissionIds: "featured_submission_ids",
  winnersAnnouncedAt: "winners_announced_at",
};
const SUB_COLS: Record<string, string> = {
  title: "title",
  bodyMd: "body_md",
  status: "status",
  showAuthor: "show_author",
  voteCount: "vote_count",
  reportCount: "report_count",
  editCount: "edit_count",
  submittedAt: "submitted_at",
  moderationNote: "moderation_note",
  moderatedAt: "moderated_at",
  moderatedBy: "moderated_by",
};
const toDb = (patch: Record<string, unknown>, cols: Record<string, string>) => {
  const out: Row = {};
  for (const [k, v] of Object.entries(patch)) if (cols[k] && v !== undefined) out[cols[k]] = v;
  return out;
};

const SUB_LIST = "id,challenge_id,user_id,title,body_md,status,show_author,vote_count,report_count,edit_count,submitted_at,moderation_note,moderated_at,created_at,updated_at";

function supabaseStore(): DowStore {
  const ch = () => supabase.from("dow_challenges");
  const sub = () => supabase.from("dow_submissions");
  const votes = () => supabase.from("dow_votes");
  const reps = () => supabase.from("dow_reports");
  return {
    kind: "supabase",
    async ready() {
      const miss: string[] = [];
      await Promise.all(
        TABLES.map(async (name) => {
          const { error } = await supabase.from(name).select("*", { head: true, count: "exact" }).limit(1);
          if (missing(error)) miss.push(name);
        })
      );
      return { ready: !miss.length, missing: miss };
    },
    async listChallenges() {
      const { data, error } = await ch().select("*").order("starts_at", { ascending: false }).limit(300);
      if (error) fail(error);
      return (data || []).map((r) => challengeFrom(r as Row));
    },
    async getChallenge(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await ch().select("*").eq("id", id).maybeSingle();
      if (error) fail(error);
      return data ? challengeFrom(data as Row) : null;
    },
    async getChallengeBySlug(slug) {
      const { data, error } = await ch().select("*").eq("slug", slug).maybeSingle();
      if (error) fail(error);
      return data ? challengeFrom(data as Row) : null;
    },
    async insertChallenge(c, createdBy) {
      const { data, error } = await ch()
        .insert({ ...toDb(c as unknown as Record<string, unknown>, CH_COLS), created_by: createdBy && /^[0-9a-f-]{36}$/i.test(createdBy) ? createdBy : null })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505") throw new DowError(409, "conflict", "A challenge with that slug already exists.", { slug: "Slug is taken." });
        fail(error);
      }
      return challengeFrom(data as Row);
    },
    async updateChallenge(id, patch) {
      const { data, error } = await ch().update(toDb(patch as Record<string, unknown>, CH_COLS)).eq("id", id).select("*").maybeSingle();
      if (error) {
        if (error.code === "23505") throw new DowError(409, "conflict", "A challenge with that slug already exists.", { slug: "Slug is taken." });
        fail(error);
      }
      return data ? challengeFrom(data as Row) : null;
    },
    async deleteChallenge(id) {
      const { error } = await ch().delete().eq("id", id);
      if (error) fail(error);
    },
    async listSubmissions(challengeId, statuses) {
      let q = sub().select(SUB_LIST).order("created_at", { ascending: true }).limit(2000);
      if (challengeId) q = q.eq("challenge_id", challengeId);
      if (statuses?.length) q = q.in("status", statuses);
      const { data, error } = await q;
      if (error) fail(error);
      return (data || []).map((r) => submissionFrom(r as Row));
    },
    async listSubmissionsByUser(userId) {
      const { data, error } = await sub().select(SUB_LIST).eq("user_id", userId).limit(500);
      if (error) fail(error);
      return (data || []).map((r) => submissionFrom(r as Row));
    },
    async getSubmission(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await sub().select(SUB_LIST).eq("id", id).maybeSingle();
      if (error) fail(error);
      return data ? submissionFrom(data as Row) : null;
    },
    async getUserSubmission(challengeId, userId) {
      const { data, error } = await sub().select(SUB_LIST).eq("challenge_id", challengeId).eq("user_id", userId).maybeSingle();
      if (error) fail(error);
      return data ? submissionFrom(data as Row) : null;
    },
    async insertSubmission(x) {
      const { data, error } = await sub()
        .insert({ challenge_id: x.challengeId, user_id: x.userId, title: x.title, body_md: x.bodyMd, status: x.status, show_author: x.showAuthor, submitted_at: x.submittedAt })
        .select(SUB_LIST)
        .single();
      if (error) {
        if (error.code === "23505") throw new DowError(409, "conflict", "You already have a design for this challenge. Reload to keep editing it.");
        fail(error);
      }
      return submissionFrom(data as Row);
    },
    async updateSubmission(id, patch) {
      const { data, error } = await sub().update(toDb(patch as Record<string, unknown>, SUB_COLS)).eq("id", id).select(SUB_LIST).maybeSingle();
      if (error) fail(error);
      return data ? submissionFrom(data as Row) : null;
    },
    async deleteSubmission(id) {
      const { error } = await sub().delete().eq("id", id);
      if (error) fail(error);
    },
    async votesByUser(challengeId, userId) {
      const { data, error } = await votes().select("submission_id").eq("challenge_id", challengeId).eq("user_id", userId);
      if (error) fail(error);
      return (data || []).map((r) => s((r as Row).submission_id));
    },
    async addVote(challengeId, submissionId, userId): Promise<VoteResult> {
      const { error } = await votes().insert({ challenge_id: challengeId, submission_id: submissionId, user_id: userId });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      const m = error.message || "";
      if (/dow_vote_limit/.test(m)) return "limit";
      if (/dow_vote_own/.test(m)) return "own";
      if (/dow_vote_closed/.test(m)) return "closed";
      if (/dow_vote_(not_votable|wrong_challenge)/.test(m) || error.code === "23503") return "missing";
      fail(error);
    },
    async removeVote(submissionId, userId) {
      const { error, count } = await votes().delete({ count: "exact" }).eq("submission_id", submissionId).eq("user_id", userId);
      if (error) fail(error);
      return (count || 0) > 0;
    },
    async voteTotals(challengeId) {
      let q = votes().select("challenge_id,user_id").limit(100_000);
      if (challengeId) q = q.eq("challenge_id", challengeId);
      const { data, error } = await q;
      if (error) fail(error);
      const by: Record<string, { votes: number; voters: Set<string> }> = {};
      const all = new Set<string>();
      (data || []).forEach((r) => {
        const row = r as Row;
        const k = s(row.challenge_id);
        (by[k] ||= { votes: 0, voters: new Set() }).votes++;
        by[k].voters.add(s(row.user_id));
        all.add(s(row.user_id));
      });
      return {
        votes: (data || []).length,
        voters: all.size,
        byChallenge: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { votes: v.votes, voters: v.voters.size }])),
      };
    },
    async addReport(r) {
      const { error } = await reps().insert({ submission_id: r.submissionId, challenge_id: r.challengeId, reporter_id: r.reporterId, reason: r.reason, note: r.note });
      if (!error) return "ok";
      if (error.code === "23505") return "duplicate";
      fail(error);
    },
    async reportsByUserSince(userId, since) {
      const { count, error } = await reps().select("id", { count: "exact", head: true }).eq("reporter_id", userId).gte("created_at", since);
      if (error) fail(error);
      return count || 0;
    },
    async listReports(f) {
      let q = reps().select("*").order("created_at", { ascending: false }).limit(500);
      if (f.status) q = q.eq("status", f.status);
      if (f.challengeId) q = q.eq("challenge_id", f.challengeId);
      if (f.submissionId) q = q.eq("submission_id", f.submissionId);
      const { data, error } = await q;
      if (error) fail(error);
      return (data || []).map((r) => reportFrom(r as Row));
    },
    async resolveReports(ids, status, by) {
      if (!ids.length) return;
      const { error } = await reps()
        .update({ status, resolved_at: new Date().toISOString(), resolved_by: by && /^[0-9a-f-]{36}$/i.test(by) ? by : null })
        .in("id", ids);
      if (error) fail(error);
    },
    async standing(userId): Promise<Standing> {
      const [u, lp] = await Promise.all([
        supabase.auth.admin.getUserById(userId).catch(() => null),
        supabase.from("learning_progress").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "completed"),
      ]);
      return { accountCreatedAt: u?.data?.user?.created_at ?? null, lessonsCompleted: lp.error ? 0 : lp.count || 0 };
    },
    async authors(userIds) {
      const ids = [...new Set(userIds)].filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (!ids.length) return {};
      const [share, prof] = await Promise.all([
        supabase.from("share_profiles").select("user_id, enabled, handle, visibility, updated_at").in("user_id", ids),
        supabase.from("user_profiles").select("id, full_name, avatar_url").in("id", ids),
      ]);
      const out: Record<string, AuthorSource> = {};
      ids.forEach((id) => (out[id] = { share: null, fullName: null, avatarUrl: null }));
      if (!share.error) {
        ((share.data || []) as Row[]).forEach((r) => {
          const id = s(r.user_id);
          if (!out[id]) return;
          const settings: ShareSettings = { enabled: r.enabled === true, handle: s(r.handle), visibility: cleanVisibility(r.visibility), updatedAt: typeof r.updated_at === "string" ? r.updated_at : null };
          out[id].share = settings;
        });
      }
      ((prof.data || []) as Row[]).forEach((r) => {
        const id = s(r.id);
        if (!out[id]) return;
        out[id].fullName = typeof r.full_name === "string" ? r.full_name : null;
        out[id].avatarUrl = typeof r.avatar_url === "string" ? r.avatar_url : null;
      });
      return out;
    },
  };
}

let real: DowStore | null = null;

export function getStore(): DowStore {
  if (dowFixtures()) return fixtureStore();
  return (real ||= supabaseStore());
}
