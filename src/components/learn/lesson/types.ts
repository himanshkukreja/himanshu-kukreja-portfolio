import type { LessonKind, QuestMission } from "@/lib/course/types";

export type RailEntry = {
  week: string;
  slug: string;
  href: string;
  /** "D3 · Circuit Breakers" */
  label: string;
  title: string;
  kind: LessonKind;
  current: boolean;
  /** trial entries of the current week: number of parts */
  parts?: number;
};

export type RailWeek = {
  week: string;
  /** "W02" */
  code: string;
  /** "Week 02" */
  label: string;
  /** "Failure-First Design" */
  topic: string;
  entries: RailEntry[];
};

export type RailData = { prev: RailWeek | null; week: RailWeek; next: RailWeek | null };

export type ReaderStat = { value: number; label: string };

export type TrialPartLink = { part: number; title: string; questions: number; href: string };

export type NavLink = {
  week: string;
  slug: string;
  href: string;
  title: string;
  /** "Next · Week 03" */
  label: string;
  /** "DAY 04", "BOSS", "W03 PREVIEW" */
  kicker: string;
  kind: LessonKind;
  teaser?: string | null;
};

export type ReaderMeta = {
  course: string;
  week: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  kind: LessonKind;
  /** "DAY LESSON · 03" */
  kindBadge: string;
  /** "Day 03" */
  shortLabel: string;
  weekCode: string;
  weekLabel: string;
  weekTopic: string;
  readingMinutes: number;
  contentVersion: string;
  stats: ReaderStat[];
  /** side quests only: the mission brief and the interactive pieces the quest hero counts */
  quest?: QuestMeta | null;
};

export type QuestMeta = {
  mission: QuestMission | null;
  checkpoints: number;
  quizzes: number;
  /** timed interview phases (stages with a budget) */
  phases: number;
  /** minutes of interview the phases budget */
  budgetMinutes: number;
};
