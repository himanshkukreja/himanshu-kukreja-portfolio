import "server-only";
/**
 * Page + API data for Design of the week, built on the server from the store. Only public
 * fields leave this module: no user ids, no emails, counts only when the phase allows.
 */
import { getCourseMap } from "@/lib/learn/course";
import type { CourseLesson } from "@/lib/learn/types";
import type { Award, Challenge, DowStore, Submission } from "./core";
import { authorOf, awardsFor, countsVisible, DowError, diagramCount, excerptOf, galleryVisibleIn, lintBody, nextDeadline, phaseOf, pickCurrent, voteEligibility } from "./core";
import { renderDesign } from "./render";
import { getStore } from "./store";
import type { ChallengeCard, ChallengePageData, ChallengeView, DesignWeekHome, HubSummary, MeState, RelatedLesson, SubmissionCard, SubmissionPageData, WinnersBlock } from "./views";

export const BASE = "/learn/design-week";
export const challengeHref = (slug: string) => `${BASE}/${slug}`;
export const submissionHref = (slug: string, id: string) => `${BASE}/${slug}/${id}`;

const isMissing = (e: unknown) => e instanceof DowError && e.code === "tables-missing";

async function lessonIndex(): Promise<Map<string, CourseLesson>> {
  const map = await getCourseMap().catch(() => null);
  const idx = new Map<string, CourseLesson>();
  if (!map) return idx;
  for (const w of map.weeks) {
    w.lessons.forEach((l) => idx.set(`${l.week}/${l.slug}`, l));
    if (w.boss) idx.set(`${w.boss.week}/${w.boss.slug}`, w.boss);
  }
  map.sideQuests.forEach((l) => {
    idx.set(`${l.week}/${l.slug}`, l);
    idx.set(`bonus-problems/${l.slug}`, l);
  });
  return idx;
}

function card(c: Challenge, submitted: number, now: number): ChallengeCard {
  return { id: c.id, slug: c.slug, title: c.title, summary: c.summary, phase: phaseOf(c, now), startsAt: c.startsAt, submissionsCloseAt: c.submissionsCloseAt, endsAt: c.endsAt, submitted };
}

async function view(c: Challenge, submitted: number, now: number, idx?: Map<string, CourseLesson>): Promise<ChallengeView> {
  const phase = phaseOf(c, now);
  const lessons = idx || (await lessonIndex());
  const related: RelatedLesson[] = c.relatedLessons.flatMap((r) => {
    const l = lessons.get(r);
    return l ? [{ title: l.title, href: l.href, tag: l.tag }] : [];
  });
  const brief = await renderDesign(c.briefMd, `brief:${c.id}:${c.updatedAt}`);
  return {
    ...card(c, submitted, now),
    briefHtml: brief.html,
    constraints: c.constraints,
    rubric: c.rubric,
    related,
    maxVotesPerUser: c.maxVotesPerUser,
    countsVisible: countsVisible(c, phase),
    winnersAnnouncedAt: c.winnersAnnouncedAt,
    featured: phase === "closed" ? c.featuredSubmissionIds : [],
  };
}

async function cards(store: DowStore, c: Challenge, subs: Submission[], now: number): Promise<SubmissionCard[]> {
  const phase = phaseOf(c, now);
  const show = countsVisible(c, phase);
  const visible = subs.filter((s) => s.status === "submitted");
  const authors = await store.authors(visible.map((s) => s.userId)).catch(() => ({}) as Record<string, never>);
  const featured = phase === "closed" ? c.featuredSubmissionIds : [];
  const out = visible.map<SubmissionCard>((s) => {
    const at = featured.indexOf(s.id);
    return {
      id: s.id,
      title: s.title || "Untitled design",
      excerpt: excerptOf(s.bodyMd),
      diagrams: diagramCount(s.bodyMd),
      words: lintBody(s.bodyMd).words,
      author: authorOf(authors[s.userId], s.showAuthor),
      votes: show ? s.voteCount : null,
      place: at >= 0 ? at + 1 : null,
      submittedAt: s.submittedAt,
      href: submissionHref(c.slug, s.id),
    };
  });
  if (show) out.sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || (b.votes ?? 0) - (a.votes ?? 0) || (a.submittedAt || "").localeCompare(b.submittedAt || ""));
  else out.sort((a, b) => a.id.localeCompare(b.id)); // neutral order; the browser shuffles per viewer
  return out;
}

const winnersOf = (list: SubmissionCard[]) => list.filter((s) => s.place).sort((a, b) => a.place! - b.place!);

async function visibleCounts(store: DowStore): Promise<Map<string, number>> {
  const subs = await store.listSubmissions(null, ["submitted"]);
  const m = new Map<string, number>();
  subs.forEach((s) => m.set(s.challengeId, (m.get(s.challengeId) || 0) + 1));
  return m;
}

export async function loadHome(): Promise<DesignWeekHome> {
  const store = getStore();
  const now = Date.now();
  try {
    const [all, counts, idx] = await Promise.all([store.listChallenges(), visibleCounts(store), lessonIndex()]);
    const { current, lastClosed, upcoming } = pickCurrent(all, now);
    let gallery: SubmissionCard[] = [];
    let winners: SubmissionCard[] = [];
    if (current && galleryVisibleIn(phaseOf(current, now))) {
      gallery = await cards(store, current, await store.listSubmissions(current.id, ["submitted"]), now);
      winners = winnersOf(gallery);
    }
    let last: WinnersBlock | null = null;
    if (lastClosed && lastClosed.id !== current?.id) {
      const list = await cards(store, lastClosed, await store.listSubmissions(lastClosed.id, ["submitted"]), now);
      last = { challenge: card(lastClosed, counts.get(lastClosed.id) || 0, now), winners: winnersOf(list) };
    }
    const archive = all.filter((c) => phaseOf(c, now) === "closed" && c.id !== current?.id).map((c) => card(c, counts.get(c.id) || 0, now));
    return {
      available: true,
      current: current ? await view(current, counts.get(current.id) || 0, now, idx) : null,
      gallery,
      winners,
      lastClosed: last,
      upcoming: upcoming && upcoming.id !== current?.id ? card(upcoming, 0, now) : null,
      archive,
    };
  } catch (e) {
    if (isMissing(e)) return { available: false };
    throw e;
  }
}

/** null = no such public challenge. Throws tables-missing for the page to show "coming soon". */
export async function loadChallenge(slug: string): Promise<ChallengePageData | null> {
  const store = getStore();
  const now = Date.now();
  const c = await store.getChallengeBySlug(slug);
  if (!c || c.status === "draft") return null;
  const subs = await store.listSubmissions(c.id, ["submitted"]);
  const phase = phaseOf(c, now);
  const gallery = galleryVisibleIn(phase) ? await cards(store, c, subs, now) : [];
  const all = await store.listChallenges();
  const cur = pickCurrent(all, now).current;
  return { challenge: await view(c, subs.length, now), gallery, winners: winnersOf(gallery), current: cur && cur.id !== c.id ? card(cur, 0, now) : null };
}

export async function loadSubmission(slug: string, id: string): Promise<SubmissionPageData | null> {
  const store = getStore();
  const now = Date.now();
  const [c, s] = await Promise.all([store.getChallengeBySlug(slug), store.getSubmission(id)]);
  if (!c || !s || c.status === "draft" || s.challengeId !== c.id || s.status !== "submitted") return null;
  if (!galleryVisibleIn(phaseOf(c, now))) return null;
  const [one] = await cards(store, c, [s], now);
  const count = (await store.listSubmissions(c.id, ["submitted"])).length;
  const r = await renderDesign(s.bodyMd, `sub:${s.id}:${s.updatedAt}`);
  return { challenge: await view(c, count, now), submission: { ...one, html: r.html, updatedAt: s.updatedAt } };
}

export async function loadHubSummary(): Promise<HubSummary> {
  const store = getStore();
  const now = Date.now();
  try {
    const [all, counts] = await Promise.all([store.listChallenges(), visibleCounts(store)]);
    const { current, lastClosed } = pickCurrent(all, now);
    let lastWinner: HubSummary["lastWinner"] = null;
    const closed = [lastClosed, current].find((c) => c && phaseOf(c, now) === "closed" && c.featuredSubmissionIds.length);
    if (closed) {
      const s = await store.getSubmission(closed.featuredSubmissionIds[0]);
      if (s && s.status === "submitted") {
        const [one] = await cards(store, closed, [s], now);
        lastWinner = { challengeSlug: closed.slug, challengeTitle: closed.title, submission: one };
      }
    }
    return {
      available: true,
      current: current && phaseOf(current, now) !== "closed" ? { ...card(current, counts.get(current.id) || 0, now), deadline: nextDeadline(current, now) } : null,
      lastWinner,
    };
  } catch (e) {
    if (isMissing(e)) return { available: false, current: null, lastWinner: null };
    throw e;
  }
}

export async function loadMe(userId: string, slug: string): Promise<MeState> {
  const store = getStore();
  const now = Date.now();
  const c = await store.getChallengeBySlug(slug);
  if (!c || c.status === "draft") throw new DowError(404, "not-found", "That challenge doesn't exist.");
  const [mine, votes, standing, all, allMine] = await Promise.all([
    store.getUserSubmission(c.id, userId),
    store.votesByUser(c.id, userId),
    store.standing(userId),
    store.listChallenges(),
    store.listSubmissionsByUser(userId),
  ]);
  return {
    phase: phaseOf(c, now),
    submission: mine
      ? { id: mine.id, title: mine.title, bodyMd: mine.bodyMd, status: mine.status, showAuthor: mine.showAuthor, updatedAt: mine.updatedAt, submittedAt: mine.submittedAt, moderationNote: mine.moderationNote }
      : null,
    votes,
    remaining: Math.max(0, c.maxVotesPerUser - votes.length),
    eligibility: voteEligibility(standing, now),
    awards: awardsFor(userId, all, allMine),
  };
}

export async function loadAwards(userId: string): Promise<Award[]> {
  const store = getStore();
  try {
    const [all, mine] = await Promise.all([store.listChallenges(), store.listSubmissionsByUser(userId)]);
    return awardsFor(userId, all, mine);
  } catch (e) {
    if (isMissing(e)) return [];
    throw e;
  }
}


