/**
 * Content-gap radar (/admin/gaps): what people search for or ask the tutor about that the course doesn't
 * cover well, grouped into topics and ranked by demand. Pure types shared by the sources, the report,
 * the API and the dashboard.
 */
import type { Kind } from "@/lib/search/smart/types";

/** How well the course covered one ask, as the asking feature saw it. null = not known. */
export type GapScope = "covered" | "partial" | "none" | "off_topic";

/**
 * One ask, as every source hands it to the radar. This is the adapter contract: a source maps its own rows
 * to these and nothing else leaves it.
 */
export type GapEvent = {
  source: GapSourceId;
  /** UTC day, YYYY-MM-DD */
  day: string;
  /** the query, already normalised with normaliseQuery (lib/admin/gaps/text.ts); never the raw text */
  q: string;
  /** an opaque per-learner key (a hash), only for counting unique learners; null = unknown */
  user: string | null;
  scope: GapScope | null;
  /** search-index doc ids the search returned or the answer cited, best first (at most 5) */
  top: string[];
};

export type GapSourceId = "smart-search" | "chat";

export type GapSourceStatus = {
  id: string;
  label: string;
  /** ok: read · missing: its table isn't there yet (migration not applied) · error: read failed · off: not used */
  status: "ok" | "missing" | "error" | "off";
  events: number;
  note?: string;
};

/** A source of asks. `load` never throws: a missing table is { status: "missing", events: [] }. */
export interface GapSource {
  id: string;
  label: string;
  load(since: Date): Promise<{ status: GapSourceStatus["status"]; events: GapEvent[]; note?: string }>;
}

export type GapLabel = "gap" | "thin" | "covered";

export type GapMaterial = { id: string; kind: Kind; title: string; sub: string; href: string };

export type GapTopic = {
  key: string;
  /** what the topic is called: a concept's term, a synonym group's head word, or the most asked wording */
  label: string;
  /** how the queries were grouped */
  via: "concept" | "synonym" | "new-words" | "words";
  conceptId: string | null;
  count: number;
  users: number;
  /** asks per source */
  bySource: Partial<Record<GapSourceId, number>>;
  /** share of asks (with a known scope) that came back partial or with nothing: 0..1, null = none known */
  gapShare: number | null;
  examples: { q: string; n: number }[];
  closest: GapMaterial[];
  verdict: GapLabel;
  /** why the verdict, in a line */
  why: string;
  firstDay: string;
  lastDay: string;
};

export type GapReport = {
  generatedAt: string;
  days: number;
  sample: boolean;
  sources: GapSourceStatus[];
  totals: { asks: number; users: number; topics: number; offTopic: number; gap: number; thin: number; covered: number };
  topics: GapTopic[];
  /** the search index couldn't be loaded: "closest material" and the engine half of the verdict are missing */
  engineError?: string;
};
