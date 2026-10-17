/**
 * Mock interviews: timed interview loops placed between the course's worlds.
 * Content: resources/mock-interviews/mock-NN-*.md in the course repo (format: README.md there).
 * Parsed and rendered on the server (load.ts), played on the client (components/learn/mock).
 * Everything here is plain JSON so it can cross the server → client boundary.
 */

export const MOCK_LEVELS = ["junior", "sde", "senior", "staff"] as const;
export type MockLevel = (typeof MOCK_LEVELS)[number];

export const LEVEL_LABEL: Record<MockLevel, string> = {
  junior: "Junior",
  sde: "SDE",
  senior: "Senior",
  staff: "Staff",
};

/** What the level means at most product companies (shown under the picker). */
export const LEVEL_HINT: Record<MockLevel, string> = {
  junior: "SDE-1 · 0–2 years",
  sde: "SDE-2 · 2–5 years",
  senior: "Senior · 5–8 years",
  staff: "Staff · 8+ years",
};

/** When a prompt arrives: at phase start, N seconds into the phase, or when the candidate first presses Done. */
export type MockTrigger = { kind: "start" } | { kind: "at"; sec: number } | { kind: "submit" };

export type MockMessage = {
  /** stable within the file: "p2.m1", "p4.c1" */
  id: string;
  trigger: MockTrigger;
  /** rendered markdown */
  html: string;
  /** plain text (feedback prompt, aria) */
  text: string;
  /** curveballs only */
  title?: string;
};

export type StudyRef = { code: string; title: string; href: string };

export type MockSignal = {
  /** "p3.s2" */
  id: string;
  level: MockLevel;
  html: string;
  text: string;
  study: StudyRef[];
};

export type MockPhase = {
  /** "p1" */
  id: string;
  n: number;
  title: string;
  minutes: number;
  prompts: MockMessage[];
  curveballs: MockMessage[];
  hints: { html: string; text: string }[];
  /** model answer, rendered with the course renderer (blocks, tables, code, Mermaid) */
  answerHtml: string;
  rubric: MockSignal[];
};

export type MockPerson = { name: string; title: string; style: string };
export type MockCompany = { name: string; tagline: string; location: string; about: string };

export type MockInterview = {
  id: string;
  slug: string;
  /** 1-based order from the file name */
  n: number;
  /** "M1" */
  code: string;
  title: string;
  /** H1 of the file */
  heading: string;
  after: string;
  afterCode: string;
  covers: string[];
  /** "W00–W02" */
  coversLabel: string;
  level: MockLevel;
  badge: string;
  company: MockCompany;
  role: string;
  interviewer: MockPerson;
  minutes: number;
  briefHtml: string;
  problemHtml: string;
  problemText: string;
  phases: MockPhase[];
  levels: Partial<Record<MockLevel, string>>;
  closing: string;
  /** hash of the source; saved scores are dropped when it changes */
  version: string;
  href: string;
};

/** Summary on the course map (hub, progress page). */
export type CourseMock = {
  id: string;
  slug: string;
  n: number;
  code: string;
  title: string;
  company: string;
  interviewer: string;
  role: string;
  after: string;
  afterCode: string;
  coversLabel: string;
  level: MockLevel;
  badge: string;
  minutes: number;
  phases: number;
  curveballs: number;
  signals: number;
  href: string;
};

export const mockHref = (slug: string) => `/learn/mock/${slug}`;
export const mockDoneKey = (id: string) => `mock:${id}`;
export const mockOfferKey = (id: string) => `offer:${id}`;
export const mockFlagKey = (id: string) => `mock:${id}`;
export const mockStoreKey = (id: string) => `hk.mock.v1:${id}`;

export function toCourseMock(m: MockInterview): CourseMock {
  return {
    id: m.id,
    slug: m.slug,
    n: m.n,
    code: m.code,
    title: m.title,
    company: m.company.name,
    interviewer: m.interviewer.name,
    role: m.role,
    after: m.after,
    afterCode: m.afterCode,
    coversLabel: m.coversLabel,
    level: m.level,
    badge: m.badge,
    minutes: m.minutes,
    phases: m.phases.length,
    curveballs: m.phases.reduce((a, p) => a + p.curveballs.length, 0),
    signals: m.phases.reduce((a, p) => a + p.rubric.length, 0),
    href: m.href,
  };
}

/** 125 → "2:05"; negative values keep their sign. */
export const mmss = (sec: number) => {
  const a = Math.floor(Math.abs(sec));
  return `${sec < 0 ? "-" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
};
