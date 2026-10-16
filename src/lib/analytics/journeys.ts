/**
 * Shapes of /api/admin/posthog/* (the /admin/journeys screens). Shared by the server routes, the
 * client screens and the dev preview fixtures. No runtime imports.
 */

export type PhStatus = {
  /** Server can query PostHog (personal key + project id present). */
  configured: boolean;
  /** Browser capture is on in this build (NEXT_PUBLIC_POSTHOG_KEY). */
  capture: boolean;
  /** GA4 measurement id present. */
  ga: boolean;
  region: "us" | "eu";
  uiHost: string;
  projectId: string | null;
  proxyPath: string;
  /** env vars still missing, in setup order */
  missing: string[];
};

export type NotConfigured = { configured: false; status: PhStatus };

export type StreamEvent = {
  id: string;
  t: string;
  event: string;
  /** human sentence, e.g. `Clicked "Start lesson"` */
  label: string;
  kind: TimelineKind;
  path: string | null;
  title: string | null;
  personId: string | null;
  who: string;
  identified: boolean;
  country: string | null;
  city: string | null;
  device: string | null;
  session: string | null;
};

export type LiveRes = {
  configured: true;
  live: number;
  pages: { path: string; title: string | null; n: number }[];
  events: StreamEvent[];
};

export type PersonRow = {
  id: string;
  distinctId: string;
  email: string | null;
  name: string | null;
  identified: boolean;
  firstSeen: string | null;
  lastSeen: string;
  sessions: number;
  pageviews: number;
  events: number;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  topPages: string[];
};

export type PeopleRes = { configured: true; people: PersonRow[]; days: number };

export type TimelineKind =
  | "pageview"
  | "click"
  | "rage"
  | "read"
  | "quiz"
  | "lesson"
  | "ai"
  | "share"
  | "signin"
  | "search"
  | "play"
  | "error"
  | "form"
  | "event";

export type TimelineEvent = {
  id: string;
  t: string;
  event: string;
  kind: TimelineKind;
  label: string;
  detail: string | null;
  path: string | null;
  session: string | null;
};

export type Recording = {
  id: string;
  start: string;
  end: string | null;
  duration: number;
  active: number;
  clicks: number;
  keys: number;
  errors: number;
  startUrl: string | null;
  personId: string | null;
  who: string;
  identified: boolean;
  ongoing: boolean;
  viewed: boolean;
  pages: string[];
  pageviews: number;
  rage: number;
  dead: number;
};

export type PersonInfo = {
  id: string;
  distinctId: string | null;
  email: string | null;
  name: string | null;
  identified: boolean;
  createdAt: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  appUrl: string;
};

export type PersonRes = {
  configured: true;
  person: PersonInfo;
  events: TimelineEvent[];
  recordings: Recording[];
  /** recordings couldn't be listed (e.g. missing session_recording:read scope); the timeline still works */
  recordingsError: { error: string; scope: string | null } | null;
  days: number;
  truncated: boolean;
};

export type RecordingsRes = { configured: true; recordings: Recording[]; hasNext: boolean };

export type EmbedRes = { configured: true; id: string; embedUrl: string | null; appUrl: string; shared: boolean };

export type PathsRes = {
  configured: true;
  days: number;
  sessions: number;
  entries: { path: string; title: string | null; n: number }[];
  exits: { path: string; title: string | null; n: number }[];
  paths: { steps: string[]; n: number }[];
  funnel: { key: string; label: string; n: number }[];
  pages: { path: string; title: string | null; views: number; visitors: number }[];
};

export type PageDetailRes = {
  configured: true;
  path: string;
  title: string | null;
  clicks: { text: string; tag: string | null; n: number; rage: number }[];
  depth: { pct: number; readers: number }[];
  heatmapUrl: string;
  toolbarUrl: string;
  siteUrl: string;
};

/* ───────────────────────────── /admin/live ───────────────────────────── */

export type LiveWindow = "30m" | "24h" | "7d";
export type LiveFilter = "all" | "signed" | "learn" | "recorded";

export type LiveEvent = {
  id: string;
  t: string;
  event: string;
  kind: TimelineKind;
  label: string;
  detail: string | null;
  path: string | null;
};

export type LiveSession = {
  /** $session_id (also the recording id when a replay exists) */
  id: string;
  personId: string | null;
  who: string;
  identified: boolean;
  start: string;
  last: string;
  /** seconds between first and last event */
  duration: number;
  events: number;
  pageviews: number;
  entry: { path: string; title: string | null } | null;
  current: { path: string; title: string | null } | null;
  country: string | null;
  city: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  referrer: string | null;
  /** last event < 5 min ago */
  active: boolean;
  recording: { id: string; duration: number; active: number; ongoing: boolean } | null;
  /** latest events, oldest first (capped; `events` is the full count) */
  timeline: LiveEvent[];
};

export type LiveFeedRes = {
  configured: true;
  window: LiveWindow;
  filter: LiveFilter;
  generatedAt: string;
  stats: { online: number; sessionsToday: number; peopleToday: number; eventsHour: number };
  /** events per minute, last 30 minutes (oldest first) */
  perMinute: number[];
  pages: { path: string; title: string | null; n: number }[];
  sessions: LiveSession[];
  /** older sessions exist (pass `before` = last session's `last`) */
  hasMore: boolean;
  /** replay lookup failed (e.g. missing session_recording:read): sessions still show */
  recordingsError: { error: string; scope: string | null } | null;
};

/** GET /api/admin/posthog/recordings/snapshots?id= → blob sources for our own player. */
export type SnapshotSourcesRes = {
  configured: true;
  id: string;
  /** blob_v2 sources in order (key = blob index) */
  sources: { key: number; start: string | null; end: string | null }[];
  start: string | null;
  end: string | null;
  /** blobs per chunk request (`from`..`to` inclusive, server-capped) */
  chunk: number;
};
