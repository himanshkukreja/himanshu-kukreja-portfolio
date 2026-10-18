/**
 * Design of the week: phases, schedule, vote rules, permissions, moderation, winners, privacy and
 * the markdown sanitizer, against an in-memory mock store (no Supabase).
 *   node --test scripts/tests/design-week.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported modules.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DowError,
  LIMITS,
  RateLimiter,
  authorOf,
  awardsFor,
  canRead,
  castVote,
  confirmWinners,
  countsVisible,
  deadlineFor,
  galleryVisibleIn,
  moderate,
  nextMondayIst,
  phaseOf,
  pickCurrent,
  preselectWinners,
  reportSubmission,
  saveSubmission,
  validateChallenge,
  voteEligibility,
  weeklySchedule,
  winsFor,
  deleteOwnSubmission,
} from "../../src/lib/design-week/core.ts";
import { sanitizeDesignMarkdown, safeUrl } from "../../src/lib/design-week/sanitize.ts";

const DAY = 86_400_000;
const T0 = Date.parse("2026-10-21T06:00:00Z"); // a Wednesday
const clock = (t = T0) => ({ now: () => t });

/* ------------------------------------------------------------------ mock store */

function mockStore(seed = {}) {
  const db = { challenges: [], subs: [], votes: [], reports: [], seq: 0, standing: {}, ...seed };
  const id = (p) => `${p}-${++db.seq}`;
  const iso = () => new Date(T0).toISOString();
  return {
    db,
    kind: "fixtures",
    async ready() {
      return { ready: true, missing: [] };
    },
    async listChallenges() {
      return structuredClone(db.challenges);
    },
    async getChallenge(x) {
      return structuredClone(db.challenges.find((c) => c.id === x) ?? null);
    },
    async getChallengeBySlug(x) {
      return structuredClone(db.challenges.find((c) => c.slug === x) ?? null);
    },
    async insertChallenge(c) {
      const row = { ...c, id: id("c"), featuredSubmissionIds: [], winnersAnnouncedAt: null, createdAt: iso(), updatedAt: iso() };
      db.challenges.push(row);
      return structuredClone(row);
    },
    async updateChallenge(x, patch) {
      const c = db.challenges.find((y) => y.id === x);
      if (!c) return null;
      Object.assign(c, patch);
      return structuredClone(c);
    },
    async deleteChallenge(x) {
      db.challenges = db.challenges.filter((c) => c.id !== x);
    },
    async listSubmissions(cid, statuses) {
      return structuredClone(db.subs.filter((s) => (!cid || s.challengeId === cid) && (!statuses?.length || statuses.includes(s.status))));
    },
    async listSubmissionsByUser(u) {
      return structuredClone(db.subs.filter((s) => s.userId === u));
    },
    async getSubmission(x) {
      return structuredClone(db.subs.find((s) => s.id === x) ?? null);
    },
    async getUserSubmission(cid, u) {
      return structuredClone(db.subs.find((s) => s.challengeId === cid && s.userId === u) ?? null);
    },
    async insertSubmission(x) {
      if (db.subs.some((s) => s.challengeId === x.challengeId && s.userId === x.userId)) throw new DowError(409, "conflict", "dup");
      const row = { ...x, id: id("s"), voteCount: 0, reportCount: 0, editCount: 1, moderationNote: null, moderatedAt: null, createdAt: iso(), updatedAt: `u${db.seq}` };
      db.subs.push(row);
      return structuredClone(row);
    },
    async updateSubmission(x, patch) {
      const s = db.subs.find((y) => y.id === x);
      if (!s) return null;
      const { moderatedBy, ...rest } = patch;
      void moderatedBy;
      Object.assign(s, rest, { updatedAt: `u${++db.seq}` });
      return structuredClone(s);
    },
    async deleteSubmission(x) {
      db.subs = db.subs.filter((s) => s.id !== x);
    },
    async votesByUser(cid, u) {
      return db.votes.filter((v) => v.challengeId === cid && v.userId === u).map((v) => v.submissionId);
    },
    async addVote(cid, sid, u) {
      if (db.votes.some((v) => v.submissionId === sid && v.userId === u)) return "duplicate";
      db.votes.push({ challengeId: cid, submissionId: sid, userId: u });
      db.subs.find((s) => s.id === sid).voteCount++;
      return "ok";
    },
    async removeVote(sid, u) {
      const n = db.votes.length;
      db.votes = db.votes.filter((v) => !(v.submissionId === sid && v.userId === u));
      if (n !== db.votes.length) db.subs.find((s) => s.id === sid).voteCount--;
      return n !== db.votes.length;
    },
    async voteTotals() {
      return { votes: db.votes.length, voters: new Set(db.votes.map((v) => v.userId)).size, byChallenge: {} };
    },
    async addReport(r) {
      if (db.reports.some((x) => x.submissionId === r.submissionId && x.reporterId === r.reporterId)) return "duplicate";
      db.reports.push({ ...r, id: id("r"), status: "open", createdAt: new Date(T0).toISOString(), resolvedAt: null });
      return "ok";
    },
    async reportsByUserSince(u, since) {
      return db.reports.filter((r) => r.reporterId === u && r.createdAt >= since).length;
    },
    async listReports(f) {
      return structuredClone(db.reports.filter((r) => (!f.status || r.status === f.status) && (!f.submissionId || r.submissionId === f.submissionId) && (!f.challengeId || r.challengeId === f.challengeId)));
    },
    async resolveReports(ids, status) {
      db.reports.forEach((r) => ids.includes(r.id) && (r.status = status));
    },
    async standing(u) {
      return db.standing[u] ?? { accountCreatedAt: new Date(T0 - 30 * DAY).toISOString(), lessonsCompleted: 2 };
    },
    async authors() {
      return {};
    },
  };
}

const challenge = (o = {}) => ({
  id: "c-1",
  slug: "rate-limiter",
  title: "Design a rate limiter",
  summary: "",
  briefMd: "",
  constraints: [],
  rubric: [],
  relatedLessons: [],
  startsAt: new Date(T0 - 2 * DAY).toISOString(),
  submissionsCloseAt: new Date(T0 + 3 * DAY).toISOString(),
  endsAt: new Date(T0 + 5 * DAY).toISOString(),
  status: "scheduled",
  maxVotesPerUser: 2,
  showLiveCounts: false,
  featuredSubmissionIds: [],
  winnersAnnouncedAt: null,
  createdAt: "",
  updatedAt: "",
  ...o,
});
const sub = (o = {}) => ({
  id: "s-a",
  challengeId: "c-1",
  userId: "alice",
  title: "A",
  bodyMd: "x".repeat(400),
  status: "submitted",
  showAuthor: true,
  voteCount: 0,
  reportCount: 0,
  editCount: 1,
  submittedAt: new Date(T0 - DAY).toISOString(),
  moderationNote: null,
  moderatedAt: null,
  createdAt: new Date(T0 - DAY).toISOString(),
  updatedAt: "u0",
  ...o,
});
const voting = () => challenge({ submissionsCloseAt: new Date(T0 - DAY).toISOString(), endsAt: new Date(T0 + DAY).toISOString() });
const rejects = (p, status, code) => assert.rejects(p, (e) => e instanceof DowError && e.status === status && e.code === code);

/* ------------------------------------------------------------------ phases */

test("phaseOf follows the clock for scheduled challenges", () => {
  const c = challenge();
  assert.equal(phaseOf(c, Date.parse(c.startsAt) - 1), "upcoming");
  assert.equal(phaseOf(c, Date.parse(c.startsAt)), "open");
  assert.equal(phaseOf(c, Date.parse(c.submissionsCloseAt) - 1), "open");
  assert.equal(phaseOf(c, Date.parse(c.submissionsCloseAt)), "voting");
  assert.equal(phaseOf(c, Date.parse(c.endsAt)), "judging");
});

test("status overrides: draft, closed, forced open, forced voting", () => {
  const far = T0 + 100 * DAY;
  assert.equal(phaseOf(challenge({ status: "draft" }), T0), "draft");
  assert.equal(phaseOf(challenge({ status: "closed" }), T0), "closed");
  assert.equal(phaseOf(challenge({ status: "open" }), far), "open");
  assert.equal(phaseOf(challenge({ status: "voting" }), T0 - 100 * DAY), "voting");
});

test("visibility rules per phase", () => {
  assert.equal(galleryVisibleIn("open"), false);
  assert.equal(galleryVisibleIn("upcoming"), false);
  assert.equal(galleryVisibleIn("voting"), true);
  assert.equal(galleryVisibleIn("closed"), true);
  assert.equal(countsVisible({ showLiveCounts: false }, "voting"), false);
  assert.equal(countsVisible({ showLiveCounts: true }, "voting"), true);
  assert.equal(countsVisible({ showLiveCounts: false }, "judging"), true);
});

test("deadlines point at the next boundary", () => {
  const c = challenge();
  assert.deepEqual(deadlineFor("open", c, T0), { label: "submissions close in", at: c.submissionsCloseAt });
  assert.deepEqual(deadlineFor("voting", c, T0), { label: "voting closes in", at: c.endsAt });
  assert.equal(deadlineFor("judging", c, T0), null);
  // forced open past the configured close: no negative countdown
  assert.equal(deadlineFor("open", c, Date.parse(c.endsAt) + DAY), null);
});

test("weekly schedule: Mon 09:00 IST → Sat 09:00 → next Mon 09:00", () => {
  const s = weeklySchedule("2026-10-19");
  assert.equal(s.startsAt, "2026-10-19T03:30:00.000Z");
  assert.equal(s.submissionsCloseAt, "2026-10-24T03:30:00.000Z");
  assert.equal(s.endsAt, "2026-10-26T03:30:00.000Z");
  assert.throws(() => weeklySchedule("next monday"), DowError);
});

test("next Monday in IST", () => {
  assert.equal(nextMondayIst(Date.parse("2026-10-18T10:00:00Z")), "2026-10-19"); // Sunday
  assert.equal(nextMondayIst(Date.parse("2026-10-19T02:00:00Z")), "2026-10-19"); // Mon 07:30 IST
  assert.equal(nextMondayIst(Date.parse("2026-10-19T05:00:00Z")), "2026-10-26"); // Mon 10:30 IST
  assert.equal(nextMondayIst(Date.parse("2026-10-18T19:00:00Z")), "2026-10-19"); // Mon 00:30 IST
});

test("pickCurrent prefers the live challenge, then upcoming, then last closed", () => {
  const live = challenge({ id: "live" });
  const next = challenge({ id: "next", startsAt: new Date(T0 + 5 * DAY).toISOString(), submissionsCloseAt: new Date(T0 + 10 * DAY).toISOString(), endsAt: new Date(T0 + 12 * DAY).toISOString() });
  const old = challenge({ id: "old", status: "closed", featuredSubmissionIds: ["x"], startsAt: new Date(T0 - 9 * DAY).toISOString() });
  const draft = challenge({ id: "draft", status: "draft", startsAt: new Date(T0 + DAY).toISOString() });
  let r = pickCurrent([old, next, live, draft], T0);
  assert.equal(r.current.id, "live");
  assert.equal(r.upcoming.id, "next");
  assert.equal(r.lastClosed.id, "old");
  r = pickCurrent([old, next, draft], T0);
  assert.equal(r.current.id, "next");
  r = pickCurrent([old, draft], T0);
  assert.equal(r.current.id, "old");
});

test("validateChallenge: window order, slug, votes", () => {
  const base = { title: "Design X", slug: "", startsAt: "2026-10-19T03:30:00Z", submissionsCloseAt: "2026-10-24T03:30:00Z", endsAt: "2026-10-26T03:30:00Z" };
  const ok = validateChallenge(base);
  assert.equal(ok.ok, true);
  assert.equal(ok.value.slug, "design-x");
  assert.equal(ok.value.status, "draft");
  const bad = validateChallenge({ ...base, endsAt: "2026-10-20T00:00:00Z", maxVotesPerUser: 0, slug: "Bad Slug" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.endsAt && bad.errors.maxVotesPerUser && bad.errors.slug);
});

/* ------------------------------------------------------------------ voting */

test("vote eligibility: one lesson or a three-day-old account", () => {
  assert.equal(voteEligibility({ accountCreatedAt: new Date(T0 - 3600_000).toISOString(), lessonsCompleted: 1 }, T0).ok, true);
  assert.equal(voteEligibility({ accountCreatedAt: new Date(T0 - 4 * DAY).toISOString(), lessonsCompleted: 0 }, T0).ok, true);
  const no = voteEligibility({ accountCreatedAt: new Date(T0 - DAY).toISOString(), lessonsCompleted: 0 }, T0);
  assert.equal(no.ok, false);
  assert.equal(no.reason, "new-account");
  assert.equal(voteEligibility({ accountCreatedAt: null, lessonsCompleted: 0 }, T0).ok, false);
});

test("castVote: rules, cap, idempotency, take back", async () => {
  const st = mockStore({ challenges: [voting()], subs: [sub(), sub({ id: "s-b", userId: "bob" }), sub({ id: "s-c", userId: "carol" }), sub({ id: "s-h", userId: "dan", status: "hidden" })] });
  await rejects(castVote(st, { id: "alice" }, "s-a", true, clock()), 403, "own");
  await rejects(castVote(st, { id: "eve" }, "s-h", true, clock()), 404, "not-found");
  await rejects(castVote(st, { id: "eve" }, "nope", true, clock()), 404, "not-found");
  let r = await castVote(st, { id: "eve" }, "s-a", true, clock());
  assert.deepEqual(r, { voted: true, votes: ["s-a"], remaining: 1 });
  r = await castVote(st, { id: "eve" }, "s-a", true, clock()); // again: no double vote
  assert.equal(st.db.subs.find((s) => s.id === "s-a").voteCount, 1);
  assert.equal(r.remaining, 1);
  await castVote(st, { id: "eve" }, "s-b", true, clock());
  await rejects(castVote(st, { id: "eve" }, "s-c", true, clock()), 409, "limit");
  r = await castVote(st, { id: "eve" }, "s-a", false, clock());
  assert.deepEqual(r, { voted: false, votes: ["s-b"], remaining: 1 });
  assert.equal(st.db.subs.find((s) => s.id === "s-a").voteCount, 0);
  r = await castVote(st, { id: "eve" }, "s-c", true, clock());
  assert.equal(r.remaining, 0);
});

test("castVote: only while voting, only eligible accounts", async () => {
  const open = mockStore({ challenges: [challenge()], subs: [sub()] });
  await rejects(castVote(open, { id: "eve" }, "s-a", true, clock()), 409, "phase");
  const closed = mockStore({ challenges: [challenge({ status: "closed" })], subs: [sub()] });
  await rejects(castVote(closed, { id: "eve" }, "s-a", true, clock()), 409, "phase");
  const fresh = mockStore({ challenges: [voting()], subs: [sub()], standing: { newbie: { accountCreatedAt: new Date(T0 - 3600_000).toISOString(), lessonsCompleted: 0 } } });
  await rejects(castVote(fresh, { id: "newbie" }, "s-a", true, clock()), 403, "not-eligible");
  // taking a vote back never needs eligibility
  const r = await castVote(fresh, { id: "newbie" }, "s-a", false, clock());
  assert.equal(r.voted, false);
});

/* ------------------------------------------------------------------ submissions */

test("saveSubmission: draft, submit, edit, withdraw; own row only", async () => {
  const st = mockStore({ challenges: [challenge()] });
  const a = await saveSubmission(st, { id: "alice" }, "rate-limiter", { title: "", bodyMd: "notes" }, clock());
  assert.equal(a.submission.status, "draft");
  assert.equal(a.submission.submittedAt, null);
  await rejects(saveSubmission(st, { id: "alice" }, "rate-limiter", { action: "submit" }, clock()), 400, "invalid"); // too short, no title
  const b = await saveSubmission(st, { id: "alice" }, "rate-limiter", { title: "Token buckets", bodyMd: "y".repeat(LIMITS.bodyMinToSubmit), action: "submit" }, clock());
  assert.equal(b.submission.status, "submitted");
  assert.equal(b.first, true);
  assert.ok(b.submission.submittedAt);
  const c = await saveSubmission(st, { id: "alice" }, "rate-limiter", { title: "Token buckets v2" }, clock());
  assert.equal(c.submission.status, "submitted");
  assert.equal(c.submission.submittedAt, b.submission.submittedAt);
  assert.equal(c.first, false);
  // someone else's save makes their own row; alice's is untouched
  await saveSubmission(st, { id: "bob" }, "rate-limiter", { title: "Mine", bodyMd: "z" }, clock());
  assert.equal(st.db.subs.filter((s) => s.userId === "alice").length, 1);
  assert.equal(st.db.subs.find((s) => s.userId === "alice").title, "Token buckets v2");
  const w = await saveSubmission(st, { id: "alice" }, "rate-limiter", { action: "withdraw" }, clock());
  assert.equal(w.submission.status, "draft");
  assert.equal(w.submission.submittedAt, null);
});

test("saveSubmission: phase, size, conflicts, moderation", async () => {
  const st = mockStore({ challenges: [challenge(), challenge({ id: "c-2", slug: "voting-now", submissionsCloseAt: new Date(T0 - DAY).toISOString() })] });
  await rejects(saveSubmission(st, { id: "a" }, "voting-now", { bodyMd: "x" }, clock()), 409, "phase");
  await rejects(saveSubmission(st, { id: "a" }, "missing", { bodyMd: "x" }, clock()), 404, "not-found");
  await rejects(saveSubmission(st, { id: "a" }, "rate-limiter", { bodyMd: "x".repeat(LIMITS.bodyMax + 1) }, clock()), 400, "invalid");
  const s = await saveSubmission(st, { id: "a" }, "rate-limiter", { bodyMd: "x" }, clock());
  await rejects(saveSubmission(st, { id: "a" }, "rate-limiter", { bodyMd: "y", baseUpdatedAt: "stale" }, clock()), 409, "conflict");
  await saveSubmission(st, { id: "a" }, "rate-limiter", { bodyMd: "y", baseUpdatedAt: s.submission.updatedAt }, clock());
  st.db.subs[0].status = "removed";
  await rejects(saveSubmission(st, { id: "a" }, "rate-limiter", { bodyMd: "z" }, clock()), 403, "moderated");
  await rejects(deleteOwnSubmission(st, { id: "a" }, "rate-limiter", clock()), 403, "moderated");
  const draft = mockStore({ challenges: [challenge({ status: "draft" })] });
  await rejects(saveSubmission(draft, { id: "a" }, "rate-limiter", { bodyMd: "x" }, clock()), 404, "not-found");
});

test("canRead: public only from voting on and only submitted; authors and admins always", () => {
  const s = sub();
  assert.equal(canRead(s, "open", { id: null }), false);
  assert.equal(canRead(s, "voting", { id: null }), true);
  assert.equal(canRead({ ...s, status: "hidden" }, "voting", { id: "eve" }), false);
  assert.equal(canRead({ ...s, status: "draft" }, "closed", { id: "eve" }), false);
  assert.equal(canRead({ ...s, status: "draft" }, "open", { id: "alice" }), true);
  assert.equal(canRead({ ...s, status: "removed" }, "closed", { id: null, admin: true }), true);
});

/* ------------------------------------------------------------------ reports + moderation */

test("reports: not your own, idempotent, auto-hide at three reporters, daily cap", async () => {
  const st = mockStore({ challenges: [voting()], subs: [sub()] });
  await rejects(reportSubmission(st, { id: "alice" }, "s-a", { reason: "spam" }, clock()), 403, "own");
  await rejects(reportSubmission(st, { id: "r1" }, "s-a", { reason: "bogus" }, clock()), 400, "invalid");
  let r = await reportSubmission(st, { id: "r1" }, "s-a", { reason: "spam" }, clock());
  assert.equal(r.hidden, false);
  r = await reportSubmission(st, { id: "r1" }, "s-a", { reason: "spam" }, clock());
  assert.equal(r.already, true);
  await reportSubmission(st, { id: "r2" }, "s-a", { reason: "offensive" }, clock());
  r = await reportSubmission(st, { id: "r3" }, "s-a", { reason: "spam", note: "ads" }, clock());
  assert.equal(r.hidden, true);
  assert.equal(st.db.subs[0].status, "hidden");
  assert.equal(st.db.subs[0].reportCount, 3);
  // daily cap per reporter
  const many = mockStore({ challenges: [voting()], subs: Array.from({ length: 12 }, (_, i) => sub({ id: `s-${i}`, userId: `u${i}` })) });
  for (let i = 0; i < LIMITS.reportsPerDay; i++) await reportSubmission(many, { id: "eve" }, `s-${i}`, { reason: "spam" }, clock());
  await rejects(reportSubmission(many, { id: "eve" }, "s-11", { reason: "spam" }, clock()), 429, "rate");
  // nothing to report while designs are private
  const open = mockStore({ challenges: [challenge()], subs: [sub()] });
  await rejects(reportSubmission(open, { id: "eve" }, "s-a", { reason: "spam" }, clock()), 404, "not-found");
});

test("moderation: remove drops a featured design and actions reports; restore dismisses", async () => {
  const st = mockStore({ challenges: [challenge({ status: "closed", featuredSubmissionIds: ["s-a", "s-b"] })], subs: [sub(), sub({ id: "s-b", userId: "bob" })] });
  await reportSubmission(st, { id: "r1" }, "s-b", { reason: "spam" }, clock());
  const removed = await moderate(st, { id: "admin" }, "s-a", "remove", "", clock());
  assert.equal(removed.status, "removed");
  assert.deepEqual(st.db.challenges[0].featuredSubmissionIds, ["s-b"]);
  await moderate(st, { id: "admin" }, "s-b", "hide", "checking", clock());
  assert.equal(st.db.reports[0].status, "actioned");
  await reportSubmission(st, { id: "r2" }, "s-b", { reason: "spam" }, clock());
  const restored = await moderate(st, { id: "admin" }, "s-b", "restore", "", clock());
  assert.equal(restored.status, "submitted");
  assert.equal(st.db.reports[1].status, "dismissed");
  await rejects(moderate(st, { id: "admin" }, "s-b", "nuke", "", clock()), 400, "invalid");
});

/* ------------------------------------------------------------------ winners, awards, privacy */

test("winners: preselect by votes, confirm closes, only visible designs of this challenge", async () => {
  const subs = [sub({ id: "s1", voteCount: 3 }), sub({ id: "s2", userId: "b", voteCount: 9 }), sub({ id: "s3", userId: "c", voteCount: 9, submittedAt: new Date(T0 - 3 * DAY).toISOString() }), sub({ id: "s4", userId: "d", voteCount: 50, status: "hidden" })];
  assert.deepEqual(preselectWinners(subs), ["s3", "s2", "s1"]);
  const open = mockStore({ challenges: [challenge()], subs });
  await rejects(confirmWinners(open, { id: "admin" }, "c-1", ["s1"], clock()), 409, "phase");
  const st = mockStore({ challenges: [voting()], subs: [...subs, sub({ id: "x1", challengeId: "other", userId: "z" })] });
  await rejects(confirmWinners(st, { id: "admin" }, "c-1", ["s4"], clock()), 400, "invalid");
  await rejects(confirmWinners(st, { id: "admin" }, "c-1", ["x1"], clock()), 400, "invalid");
  await rejects(confirmWinners(st, { id: "admin" }, "c-1", ["s1", "s2", "s3", "s1x"], clock()), 400, "invalid");
  const c = await confirmWinners(st, { id: "admin" }, "c-1", ["s3", "s2"], clock());
  assert.equal(c.status, "closed");
  assert.deepEqual(c.featuredSubmissionIds, ["s3", "s2"]);
  assert.ok(c.winnersAnnouncedAt);
});

test("awards and wins", () => {
  const c = challenge({ status: "closed", featuredSubmissionIds: ["s-w", "s-f"], winnersAnnouncedAt: "2026-10-26T04:00:00.000Z" });
  const mine = [sub({ id: "s-w", userId: "w" })];
  assert.deepEqual(
    awardsFor("w", [c], mine).map((a) => a.key),
    ["dow:submit:rate-limiter", "dow:win:rate-limiter"]
  );
  assert.deepEqual(
    awardsFor("f", [c], [sub({ id: "s-f", userId: "f" })]).map((a) => a.key),
    ["dow:submit:rate-limiter", "dow:feat:rate-limiter"]
  );
  assert.deepEqual(awardsFor("d", [c], [sub({ id: "s-d", userId: "d", status: "draft", submittedAt: null })]), []);
  assert.deepEqual(winsFor("w", [c], mine), [{ slug: "rate-limiter", title: c.title, at: Date.parse(c.winnersAnnouncedAt) }]);
  assert.deepEqual(winsFor("w", [{ ...c, status: "scheduled" }], mine), []);
  assert.deepEqual(winsFor("w", [c], [{ ...mine[0], status: "removed" }]), []);
});

test("author line follows share settings and the per-design opt-out", () => {
  const share = (name, enabled = true, avatar = false) => ({ enabled, handle: "grace-h", visibility: { name, avatar, progress: true, tree: true, streak: true, scores: true, badges: true, milestones: true }, updatedAt: null });
  const src = (s) => ({ share: s, fullName: "Grace Brewster Hopper", avatarUrl: "https://example.com/a.png" });
  assert.equal(authorOf(src(null), true).anonymous, true);
  assert.equal(authorOf(src(share("full", false)), true).anonymous, true);
  assert.equal(authorOf(src(share("full")), false).anonymous, true);
  assert.equal(authorOf(src(share("full")), true).name, "Grace Brewster Hopper");
  assert.equal(authorOf(src(share("first")), true).name, "Grace H.");
  const none = authorOf(src(share("none", true, true)), true);
  assert.equal(none.name, null);
  assert.equal(none.handle, "grace-h");
  assert.equal(none.avatar, null); // no avatar without a name
  assert.equal(authorOf(src(share("full", true, true)), true).avatar, "https://example.com/a.png");
  assert.equal(authorOf(undefined, true).handle, null);
});

test("rate limiter: sliding window", () => {
  const l = new RateLimiter(2, 1000);
  assert.equal(l.hit("k", 0), true);
  assert.equal(l.hit("k", 10), true);
  assert.equal(l.hit("k", 20), false);
  assert.equal(l.hit("other", 20), true);
  assert.equal(l.hit("k", 1001), true);
});

/* ------------------------------------------------------------------ sanitizer */

test("sanitizer: unsafe links → text, safe links stay", () => {
  const { md, report } = sanitizeDesignMarkdown("Click [here](javascript:alert(1)) or [docs](https://example.com/x) or <javascript:alert(2)> and [rel](/learn).");
  assert.ok(!md.includes("javascript:alert(1)"));
  assert.ok(md.includes("[docs](https://example.com/x)"));
  assert.ok(md.includes("[rel](/learn)"));
  assert.equal(report.links, 2);
  assert.equal(safeUrl("data:text/html,x"), false);
  assert.equal(safeUrl("//evil.example.com"), false);
  assert.equal(safeUrl("mailto:a@example.com"), true);
});

test("sanitizer: images and raw HTML removed", () => {
  const { md, report, warnings } = sanitizeDesignMarkdown('Hi ![arch](https://tracker.example.com/p.png) there\n\n<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\nok <b>bold</b>');
  assert.ok(!md.includes("tracker.example.com"));
  assert.ok(md.includes("(image not shown: arch)"));
  assert.ok(!/<img|<script|<b>/i.test(md));
  assert.equal(report.images, 1);
  assert.ok(report.html >= 3);
  assert.ok(warnings.length >= 2);
});

test("sanitizer: h1 → h2, quiz fences → text, lesson-only blocks → panel", () => {
  const { md } = sanitizeDesignMarkdown("# Title\n\nSetext\n===\n\n```quiz\nq: 1\n```\n\n:::checkpoint\ninside\n:::\n\n:::callout{type=tip}\nkept\n:::\n\n::anim[cache]\n");
  assert.match(md, /^## Title/m);
  assert.match(md, /^## Setext/m);
  assert.ok(!/^# /m.test(md));
  assert.match(md, /```text\nq: 1\n```/);
  assert.match(md, /^:::panel$/m);
  assert.match(md, /^:::callout\{type=tip\}$/m);
  assert.ok(!/^::anim/m.test(md));
});

test("sanitizer: mermaid init/front-matter stripped, cap on count and size", () => {
  const one = "```mermaid\n%%{init: {'themeCSS': 'body{display:none}'}}%%\nflowchart TD\n  A-->B\n```";
  const { md } = sanitizeDesignMarkdown(one);
  assert.ok(!md.includes("themeCSS"));
  assert.match(md, /```mermaid\nflowchart TD/);
  const front = sanitizeDesignMarkdown("```mermaid\n---\nconfig:\n  theme: forest\n---\nflowchart TD\n  A-->B\n```").md;
  assert.ok(!front.includes("forest"));
  const many = Array.from({ length: 10 }, (_, i) => `\`\`\`mermaid\nflowchart TD\n  A${i}-->B\n\`\`\``).join("\n\n");
  const r = sanitizeDesignMarkdown(many);
  assert.equal(r.report.mermaid, 10);
  assert.equal(r.report.mermaidDropped, 2);
  assert.equal((r.md.match(/```mermaid/g) || []).length, 8);
  const big = sanitizeDesignMarkdown("```mermaid\nflowchart TD\n" + "  A-->B\n".repeat(2000) + "```");
  assert.equal(big.report.mermaidDropped, 1);
});

test("sanitizer: leaves ordinary markdown byte-for-byte", () => {
  const src = "## Estimates\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- item **bold** `code`\n\n```ts\nconst x = 1;\n```\n";
  assert.equal(sanitizeDesignMarkdown(src).md, src);
});
