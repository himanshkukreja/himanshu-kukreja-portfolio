/** What the Design of the week pages and APIs send to the browser. Types only. */
import type { Author, Award, Challenge, ChallengeStats, Eligibility, Phase, Report, SubmissionStatus } from "./core";

export type RelatedLesson = { title: string; href: string; tag: string };

export type ChallengeCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  phase: Phase;
  startsAt: string;
  submissionsCloseAt: string;
  endsAt: string;
  /** visible submitted designs */
  submitted: number;
};

export type ChallengeView = ChallengeCard & {
  briefHtml: string;
  constraints: string[];
  rubric: string[];
  related: RelatedLesson[];
  maxVotesPerUser: number;
  countsVisible: boolean;
  winnersAnnouncedAt: string | null;
  featured: string[];
};

export type SubmissionCard = {
  id: string;
  title: string;
  excerpt: string;
  diagrams: number;
  words: number;
  author: Author;
  /** null while counts are hidden */
  votes: number | null;
  /** 1 = winner, 2+ = featured */
  place: number | null;
  submittedAt: string | null;
  href: string;
};

export type SubmissionPageData = { challenge: ChallengeView; submission: SubmissionCard & { html: string; updatedAt: string } };

export type WinnersBlock = { challenge: ChallengeCard; winners: SubmissionCard[] };

export type DesignWeekHome =
  | { available: false }
  | { available: true; current: ChallengeView | null; gallery: SubmissionCard[]; winners: SubmissionCard[]; lastClosed: WinnersBlock | null; upcoming: ChallengeCard | null; archive: ChallengeCard[] };

export type ChallengePageData = { challenge: ChallengeView; gallery: SubmissionCard[]; winners: SubmissionCard[]; current: ChallengeCard | null };

export type HubSummary = {
  available: boolean;
  current: (ChallengeCard & { deadline: { label: string; at: string } | null }) | null;
  lastWinner: { challengeSlug: string; challengeTitle: string; submission: SubmissionCard } | null;
};

export type MySubmission = {
  id: string;
  title: string;
  bodyMd: string;
  status: SubmissionStatus;
  showAuthor: boolean;
  updatedAt: string;
  submittedAt: string | null;
  moderationNote: string | null;
};

export type MeState = {
  phase: Phase;
  submission: MySubmission | null;
  votes: string[];
  remaining: number;
  eligibility: Eligibility;
  awards: Award[];
};

/* ------------------------------------------------------------------ admin */


export type AdminChallengeRow = Challenge & { phase: Phase; stats: ChallengeStats };

export type AdminReport = Report & { submissionTitle: string; challengeSlug: string; challengeTitle: string; submissionStatus: SubmissionStatus | null };

export type AdminSubmission = {
  id: string;
  title: string;
  status: SubmissionStatus;
  showAuthor: boolean;
  voteCount: number;
  reportCount: number;
  editCount: number;
  submittedAt: string | null;
  updatedAt: string;
  moderationNote: string | null;
  author: Author;
  /** first 8 chars of the user id, for cross-referencing /admin/learners */
  userRef: string;
  userId: string;
  excerpt: string;
  words: number;
  diagrams: number;
  href: string | null;
};

export type AdminTotals = { challenges: number; live: number; participants: number; repeat: number; submissions: number; votes: number; voters: number; openReports: number };

export type AdminList = {
  ready: boolean;
  missing: string[];
  store: "supabase" | "fixtures";
  challenges: AdminChallengeRow[];
  totals: AdminTotals;
  openReports: AdminReport[];
  templates: { slug: string; title: string; summary: string }[];
  nextMonday: string;
};

export type AdminDetail = {
  challenge: AdminChallengeRow;
  submissions: AdminSubmission[];
  reports: AdminReport[];
  preselected: string[];
  publicHref: string;
};

export type AdminSubmissionDetail = AdminSubmission & { bodyMd: string; html: string; warnings: string[]; challengeSlug: string; challengeTitle: string };
