import "server-only";
/** Admin reads/writes for /api/admin/design-week/*. Callers have already passed requireDowAdmin. */
import type { Challenge, DowStore, Report, Submission } from "./core";
import { authorOf, diagramCount, DowError, excerptOf, galleryVisibleIn, lintBody, nextMondayIst, participation, phaseOf, preselectWinners, statsOf, validateChallenge, weeklySchedule } from "./core";
import { renderDesign } from "./render";
import { challengeHref, submissionHref } from "./server";
import { getStore } from "./store";
import { TEMPLATES, templateBySlug } from "./templates";
import type { AdminChallengeRow, AdminDetail, AdminList, AdminReport, AdminSubmission, AdminSubmissionDetail } from "./views";

function rows(all: Challenge[], subs: Submission[], votes: Awaited<ReturnType<DowStore["voteTotals"]>>, reports: Report[], now: number): AdminChallengeRow[] {
  return all.map((c) =>
    Object.assign({}, c, {
      phase: phaseOf(c, now),
      stats: statsOf(
        subs.filter((s) => s.challengeId === c.id),
        votes.byChallenge[c.id],
        reports.filter((r) => r.challengeId === c.id && r.status === "open").length
      ),
    })
  );
}

function reportRows(reports: Report[], subs: Submission[], all: Challenge[]): AdminReport[] {
  return reports.map((r) => {
    const s = subs.find((x) => x.id === r.submissionId);
    const c = all.find((x) => x.id === r.challengeId);
    return { ...r, submissionTitle: s?.title || "Untitled design", submissionStatus: s?.status ?? null, challengeSlug: c?.slug || "", challengeTitle: c?.title || "" };
  });
}

export async function adminList(): Promise<AdminList> {
  const store = getStore();
  const now = Date.now();
  const base = { store: store.kind, templates: TEMPLATES.map((t) => ({ slug: t.slug, title: t.title, summary: t.summary })), nextMonday: nextMondayIst(now) };
  const { ready, missing } = await store.ready();
  if (!ready) return { ...base, ready, missing, challenges: [], openReports: [], totals: { challenges: 0, live: 0, participants: 0, repeat: 0, submissions: 0, votes: 0, voters: 0, openReports: 0 } };
  const [all, subs, votes, open] = await Promise.all([store.listChallenges(), store.listSubmissions(null), store.voteTotals(null), store.listReports({ status: "open" })]);
  const p = participation(subs);
  const challenges = rows(all, subs, votes, open, now);
  return {
    ...base,
    ready,
    missing,
    challenges,
    totals: {
      challenges: all.length,
      live: challenges.filter((c) => ["open", "voting", "judging"].includes(c.phase)).length,
      participants: p.participants,
      repeat: p.repeat,
      submissions: p.submissions,
      votes: votes.votes,
      voters: votes.voters,
      openReports: open.length,
    },
    openReports: reportRows(open, subs, all),
  };
}

async function adminSubs(store: DowStore, c: Challenge, subs: Submission[], now: number): Promise<AdminSubmission[]> {
  const authors = await store.authors(subs.map((s) => s.userId)).catch(() => ({}) as Record<string, never>);
  const visible = galleryVisibleIn(phaseOf(c, now));
  return subs
    .map<AdminSubmission>((s) => ({
      id: s.id,
      title: s.title || "Untitled design",
      status: s.status,
      showAuthor: s.showAuthor,
      voteCount: s.voteCount,
      reportCount: s.reportCount,
      editCount: s.editCount,
      submittedAt: s.submittedAt,
      updatedAt: s.updatedAt,
      moderationNote: s.moderationNote,
      author: authorOf(authors[s.userId], true),
      userRef: s.userId.slice(0, 8),
      userId: s.userId,
      excerpt: excerptOf(s.bodyMd, 140),
      words: lintBody(s.bodyMd).words,
      diagrams: diagramCount(s.bodyMd),
      href: visible && s.status === "submitted" ? submissionHref(c.slug, s.id) : null,
    }))
    .sort((a, b) => b.voteCount - a.voteCount || (a.submittedAt || "~").localeCompare(b.submittedAt || "~"));
}

export async function adminDetail(id: string): Promise<AdminDetail | null> {
  const store = getStore();
  const now = Date.now();
  const c = await store.getChallenge(id);
  if (!c) return null;
  const [subs, votes, reports, all] = await Promise.all([store.listSubmissions(c.id), store.voteTotals(c.id), store.listReports({ challengeId: c.id }), store.listChallenges()]);
  const [row] = rows([c], subs, votes, reports, now);
  return {
    challenge: row,
    submissions: await adminSubs(store, c, subs, now),
    reports: reportRows(reports, subs, all),
    preselected: c.featuredSubmissionIds.length ? c.featuredSubmissionIds : preselectWinners(subs),
    publicHref: challengeHref(c.slug),
  };
}

export async function adminSubmission(id: string): Promise<AdminSubmissionDetail | null> {
  const store = getStore();
  const s = await store.getSubmission(id);
  if (!s) return null;
  const c = await store.getChallenge(s.challengeId);
  if (!c) return null;
  const [one] = await adminSubs(store, c, [s], Date.now());
  const r = await renderDesign(s.bodyMd, `admin:${s.id}:${s.updatedAt}`);
  return { ...one, bodyMd: s.bodyMd, html: r.html, warnings: r.warnings, challengeSlug: c.slug, challengeTitle: c.title };
}

/** POST body: { template?, monday? } or full fields. Always lands as a draft. */
export async function adminCreate(body: Record<string, unknown>, by: string): Promise<Challenge> {
  const store = getStore();
  const tpl = typeof body.template === "string" ? templateBySlug(body.template) : null;
  if (body.template && !tpl) throw new DowError(400, "invalid", "Unknown template.");
  const monday = typeof body.monday === "string" && body.monday ? body.monday : nextMondayIst();
  const sch = weeklySchedule(monday);
  const raw: Record<string, unknown> = { ...(tpl || {}), ...sch, maxVotesPerUser: 3, showLiveCounts: false, ...body, status: "draft" };
  delete raw.template;
  delete raw.monday;
  if (tpl && !body.slug) {
    // the same template can run again: suffix the slug with the week
    const exists = await store.getChallengeBySlug(tpl.slug);
    if (exists) raw.slug = `${tpl.slug}-${monday.replace(/-/g, "").slice(2)}`;
  }
  const v = validateChallenge(raw);
  if (!v.ok) throw new DowError(400, "invalid", Object.values(v.errors)[0], v.errors);
  return store.insertChallenge(v.value, by);
}

export async function adminUpdate(id: string, body: Record<string, unknown>): Promise<Challenge> {
  const store = getStore();
  const c = await store.getChallenge(id);
  if (!c) throw new DowError(404, "not-found", "That challenge doesn't exist.");
  const raw = { ...body };
  if (typeof raw.monday === "string" && raw.monday) Object.assign(raw, weeklySchedule(raw.monday));
  delete raw.monday;
  const v = validateChallenge(raw, c);
  if (!v.ok) throw new DowError(400, "invalid", Object.values(v.errors)[0], v.errors);
  if (v.value.slug !== c.slug && c.status !== "draft") throw new DowError(409, "conflict", "The slug is fixed once a challenge is published (its links are out there).", { slug: "Fixed after publishing." });
  if (v.value.status === "closed" && c.status !== "closed" && !c.featuredSubmissionIds.length && body.status === "closed" && body.force !== true) {
    throw new DowError(409, "conflict", "Confirm winners to close the challenge (or close it without winners from the danger zone).");
  }
  const next = await store.updateChallenge(id, v.value);
  if (!next) throw new DowError(404, "not-found", "That challenge doesn't exist.");
  return next;
}

export async function adminDelete(id: string): Promise<void> {
  const store = getStore();
  const c = await store.getChallenge(id);
  if (!c) return;
  const subs = await store.listSubmissions(c.id, ["submitted", "hidden", "removed"]);
  if (c.status !== "draft" || subs.length) throw new DowError(409, "conflict", "Only drafts with no submissions can be deleted. Close it instead.");
  await store.deleteChallenge(id);
}
