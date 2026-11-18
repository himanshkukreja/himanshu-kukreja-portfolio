/**
 * Practice's curated lists (/dsa/practice?list=<id>): the rail's entries, what each one holds, and the pure helpers the
 * page and the tests share. Import-free apart from types, so node --test can run it.
 *
 *   all                  every ready problem (the default)
 *   daily                today's problem plus the last 13 days (client: GET /api/dsa/daily)
 *   core-150             one problem per Core 150 classic (the gap-filler when there is one)
 *   interview-patterns   the 18 interview districts; each street is a section; unwritten districts say "N more with wave W"
 *   company-types        the company-type facet as sections
 *   cp-camps             the Challenge League camps: each camp is a section, each camp tent a street (the tent's lesson is its link)
 *   systems-bridge, bug-stories, mock-interviews, contests   planned: a one-line state and a link to what exists
 *   saved                the learner's Save-for-later problems (this device, or the account when signed in)
 *   build-my-list        planned (AI)
 *
 * Totals count READY content; planned content is noted next to them, never added in.
 */
import type { FilterRow } from "./problem-filters";

/* ------------------------------------------------------------------ the Core 150 classics */
/** The classic interview problems (LeetCode numbers) the list calls "the 150": the Blind 75 plus the rest of NeetCode 150. */
const BLIND_75 = [1, 3, 5, 11, 15, 19, 20, 21, 23, 33, 39, 48, 49, 53, 54, 55, 56, 57, 62, 70, 73, 76, 79, 91, 98, 100, 102, 104, 105, 121, 124, 125, 128, 133, 139, 141, 143, 152, 153, 190, 191, 198, 200, 206, 207, 208, 211, 212, 213, 217, 226, 230, 235, 238, 242, 252, 253, 261, 268, 269, 295, 297, 300, 322, 323, 338, 347, 371, 417, 424, 435, 572, 647, 1143, 271];
const NEETCODE_MORE = [
  36, 4, 7, 10, 17, 22, 25, 40, 42, 43, 45, 46, 50, 51, 66, 72, 74, 84, 90, 97, 110, 115, 127, 130, 131, 134, 136, 138, 145, 146, 150, 155, 167, 199, 202, 210, 215, 239, 287, 297, 309, 312, 329, 332, 355,
  394, 416, 435, 494, 518, 543, 567, 621, 684, 695, 703, 704, 739, 743, 763, 778, 787, 846, 853, 875, 973, 981, 1046, 1448, 1584, 1851, 1899, 2013, 678,
];

/** "lc-1", "LC 1" and "lc-0001" are the same classic */
export const classicKey = (c: string): string => c.trim().toLowerCase().replace(/^lc[\s-]*0*(\d+)$/, "lc-$1");

export const CORE_150: ReadonlySet<string> = new Set([...BLIND_75, ...NEETCODE_MORE].map((n) => `lc-${n}`));

export type ListId =
  | "all"
  | "daily"
  | "core-150"
  | "interview-patterns"
  | "company-types"
  | "cp-camps"
  | "systems-bridge"
  | "bug-stories"
  | "mock-interviews"
  | "contests"
  | "saved"
  | "build-my-list";

export type ListGroup = "library" | "curated" | "soon" | "mine";

export type ListDef = {
  id: ListId;
  label: string;
  group: ListGroup;
  /** has problems to show (or, for daily and saved, a live source) */
  ready: boolean;
  blurb: string;
  /** planned lists: the one-line state, and a link to what exists today */
  planned?: { line: string; link?: { href: string; label: string } };
};

export const LISTS: ListDef[] = [
  { id: "all", label: "All problems", group: "library", ready: true, blurb: "Every problem, in course order." },
  { id: "daily", label: "Problem of the day", group: "library", ready: true, blurb: "One problem a day, the same for everyone. Solve it the same day to keep your streak." },
  { id: "core-150", label: "Core 150", group: "curated", ready: true, blurb: "The classic interview problems, in our own wording, and the gap-fillers around them." },
  { id: "interview-patterns", label: "Interview patterns", group: "curated", ready: true, blurb: "Medium and hard problems in 18 sets, each street one skill." },
  { id: "company-types", label: "By company type", group: "curated", ready: true, blurb: "Problems written for the kind of company that asks them." },
  { id: "cp-camps", label: "CP camps", group: "curated", ready: true, blurb: "Competitive programming camps, banded by rating. Each camp tent is a lesson with its problems: fast input, stress tests, one small observation." },
  { id: "systems-bridge", label: "Systems bridge", group: "soon", ready: false, blurb: "A data structure next to the real system that uses it.", planned: { line: "Twenty stops are planned: each pairs a structure with a System Design lab. They open with the bank expansion.", link: { href: "/dsa/practice?list=all&co=infrastructure", label: "Infrastructure problems that exist today" } } },
  { id: "bug-stories", label: "Bug stories", group: "soon", ready: false, blurb: "Debug the incident instead of writing from scratch.", planned: { line: "Bug stories are coming with Phase 2. Until then the mistake museum in each lesson's Check step covers the common ones.", link: { href: "/dsa/review", label: "Open Review" } } },
  { id: "mock-interviews", label: "Mock interviews", group: "soon", ready: false, blurb: "A timed, whole-interview run with an AI interviewer.", planned: { line: "The timed coding mock arrives with Phase 2; voice comes after it. Interview mode already works on any single problem.", link: { href: "/dsa/practice?list=interview-patterns", label: "Practise the interview sets" } } },
  { id: "contests", label: "Contests", group: "soon", ready: false, blurb: "Virtual contests against a timer.", planned: { line: "Virtual contests are planned for after the camps open.", link: { href: "/dsa/practice?list=daily", label: "Do today's problem" } } },
  { id: "saved", label: "Saved", group: "mine", ready: true, blurb: "Problems you saved for later." },
  { id: "build-my-list", label: "Build my list", group: "mine", ready: false, blurb: "From the whole bank, only what you need.", planned: { line: "An AI-curated list from your gaps and your interview date is planned. Your readiness bands in Progress already point at the weakest topics.", link: { href: "/dsa/progress#readiness", label: "See your readiness" } } },
];

export const GROUP_LABEL: Record<ListGroup, string> = { library: "Library", curated: "Curated", soon: "Coming", mine: "Mine" };

const IDS = new Set<string>(LISTS.map((l) => l.id));
export const isListId = (s: string | null | undefined): s is ListId => !!s && IDS.has(s);
export const listDef = (id: ListId): ListDef => LISTS.find((l) => l.id === id) as ListDef;

/** The list named in a query string; anything else is "all". */
export function parseList(search: string | URLSearchParams): ListId {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const v = sp.get("list");
  return isListId(v) ? v : "all";
}

/** A section of a curated list: a district, a street, a company type, a camp. `links`: the lean lessons written for it (a company type's sets, a camp's tents are on the streets). */
export type Section = { id: string; title: string; hint?: string; ids: string[]; /** problems planned but not written yet */ planned?: number; /** when they open ("Opens with wave 3") */ opens?: string; /** nested streets; `href`: the lesson of a camp tent */ streets?: { id: string; title: string; ids: string[]; planned?: number; href?: string }[]; links?: { title: string; href: string }[] };
export type ListData = { sections: Section[] };
/** What the server works out once per content refresh (the lists that need the plan or the world files). */
export type PracticeLists = { "core-150": { ids: string[]; target: number; planned: number }; "interview-patterns": ListData; "company-types": ListData; "cp-camps": ListData };

/* ------------------------------------------------------------------ building the server-side lists */

/**
 * Core 150: one ready problem per Core 150 classic (src/lib/dsa/core150.ts), never one per twin: a classic's problem is the plan's
 * gap-filler when it has one, else the first of its twins in course order that is not a checkpoint or company problem.
 * planned = the rest of the target.
 */
export function coreList(problems: { id: string; classic: string[]; role?: string }[], gapIds: string[], target = 150, core: ReadonlySet<string> = CORE_150): PracticeLists["core-150"] {
  const gaps = new Set(gapIds);
  const rank = (p: { id: string; role?: string }) => (gaps.has(p.id) ? 0 : p.role === "checkpoint" || p.role === "company" ? 2 : 1);
  const pick = new Map<string, { id: string; rank: number }>();
  for (const p of problems) {
    for (const k of new Set(p.classic.map(classicKey))) {
      if (!core.has(k)) continue;
      const cur = pick.get(k);
      if (!cur || rank(p) < cur.rank) pick.set(k, { id: p.id, rank: rank(p) });
    }
  }
  const ids = [...new Set([...pick.values()].map((x) => x.id))];
  return { ids, target, planned: Math.max(0, target - ids.length) };
}

/** By company type holds only the company problems (role: company), not every problem that carries a company-type tag. */
export const companyRows = <T extends { id: string }>(problems: { id: string; role?: string }[], rows: T[]): T[] => {
  const co = new Set(problems.filter((p) => p.role === "company").map((p) => p.id));
  return rows.filter((r) => co.has(r.id));
};

type DistrictInput = { id: string; title: string; opens?: string; planned?: number; stretches: { id: string; title: string; nodes: { ref?: string; built: boolean }[]; planned?: number }[] };

/** Interview patterns from the districts of the world file: one section per district, one street per stretch with problems. */
export function districtList(regions: DistrictInput[]): ListData {
  return {
    sections: regions.map((r) => {
      const streets = r.stretches
        .map((s) => ({ id: s.id, title: s.title, ids: s.nodes.filter((n) => n.built && n.ref).map((n) => n.ref as string), planned: s.planned || 0 }))
        .filter((s) => s.ids.length || s.planned);
      return { id: r.id, title: r.title, ids: streets.flatMap((s) => s.ids), planned: r.planned || 0, opens: r.opens, streets: streets.filter((s) => s.ids.length) };
    }),
  };
}

/**
 * By company type: one section per type in the data, in the order given. `sets` are the written company-set lessons (module
 * co-<type>, src/lib/dsa/kinds.ts): each is linked from its type's section.
 */
export function companyList(rows: Pick<FilterRow, "id" | "companies">[], companies: { id: string; label: string }[], sets: { module: string; title: string; href: string }[] = []): ListData {
  return {
    sections: companies
      .map((c) => {
        const links = sets.filter((x) => x.module === `co-${c.id}`).map((x) => ({ title: x.title, href: x.href }));
        return { id: c.id, title: c.label, ids: rows.filter((r) => r.companies.includes(c.id)).map((r) => r.id), ...(links.length ? { links } : {}) };
      })
      .filter((s) => s.ids.length),
  };
}

type CampInput = { id: string; title: string; band: [number, number] | null; tents: { id: string; title: string; ids: string[]; href: string | null }[] };

/** CP camps: one section per camp ("Camp 1 · Basics, rated 800 to 1000"), one street per tent; a tent with no ready problem drops out, a camp with none says how many are planned. */
export function campList(camps: CampInput[], have: ReadonlySet<string>): ListData {
  return {
    sections: camps.map((c) => {
      const tents = c.tents.map((t) => ({ id: t.id, title: t.title, ids: t.ids.filter((i) => have.has(i)), planned: t.ids.filter((i) => !have.has(i)).length, ...(t.href ? { href: t.href } : {}) }));
      const n = c.id.match(/(\d+)$/)?.[1];
      return { id: c.id, title: `${n ? `Camp ${n} · ` : ""}${c.title}`, hint: c.band ? `rated ${c.band[0]} to ${c.band[1]}` : undefined, ids: tents.flatMap((t) => t.ids), planned: tents.reduce((a, t) => a + t.planned, 0), streets: tents.filter((t) => t.ids.length) };
    }),
  };
}

/* ------------------------------------------------------------------ what a list holds for the table */

export type ListContext = {
  rows: Pick<FilterRow, "id">[];
  saved: Set<string>;
  /** today's problem first, then the previous days; null until it loads */
  daily: string[] | null;
  lists: PracticeLists;
};

/** The problem ids a list holds, or null for "every row" (the All list). Unknown ids (not in the bank) are dropped. */
export function listIdSet(id: ListId, ctx: ListContext): Set<string> | null {
  if (id === "all") return null;
  const have = new Set(ctx.rows.map((r) => r.id));
  const keep = (ids: Iterable<string>) => new Set([...ids].filter((x) => have.has(x)));
  switch (id) {
    case "daily": return keep(ctx.daily || []);
    case "saved": return keep(ctx.saved);
    case "core-150": return keep(ctx.lists["core-150"].ids);
    case "interview-patterns": return keep(ctx.lists["interview-patterns"].sections.flatMap((s) => s.ids));
    case "company-types": return keep(ctx.lists["company-types"].sections.flatMap((s) => s.ids));
    case "cp-camps": return keep(ctx.lists["cp-camps"].sections.flatMap((s) => s.ids));
    default: return new Set();
  }
}

/** The count shown in the rail and the headline: ready problems only. Null while a client-side list (daily) is still loading. */
export function listCount(id: ListId, ctx: ListContext): number | null {
  if (id === "daily" && ctx.daily === null) return null;
  const s = listIdSet(id, ctx);
  return s ? s.size : ctx.rows.length;
}

/** "N more with wave 3": the one-line note on a district nothing is written for yet. */
export function plannedNote(s: Pick<Section, "planned" | "opens">): string {
  const n = s.planned || 0;
  if (!n) return "";
  const when = (s.opens || "").replace(/^Opens\s+/i, "");
  return `${n} more ${when ? (/^with|^at/i.test(when) ? when : `from ${when}`) : "coming"}`;
}

/** Sections of a list in the order shown, each with only the rows the filters kept (an emptied section drops out). */
export function sectionRows<T extends { id: string }>(sections: Section[], rows: T[]): { section: Section; rows: T[]; streets: { id: string; title: string; rows: T[] }[] }[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  const pick = (ids: string[]) => ids.map((i) => by.get(i)).filter((r): r is T => !!r);
  return sections.map((s) => ({ section: s, rows: pick(s.ids), streets: (s.streets || []).map((st) => ({ id: st.id, title: st.title, rows: pick(st.ids) })).filter((st) => st.rows.length) }));
}

/* ------------------------------------------------------------------ saved problems (game flags dsa:saved:<id>) */

export const SAVED_FLAG = "dsa:saved:";
/** The legacy device-only list the problem page wrote before the account sync (localStorage `dsa.saved`, a JSON array of ids). */
export const SAVED_LEGACY_KEY = "dsa.saved";

/** Saved ids from the game flags (a positive number = saved at that time; 0 or anything else = not saved) and the legacy list. */
export function savedFrom(flags: Record<string, unknown>, legacy: string[] = []): string[] {
  const out = new Set<string>(legacy);
  for (const [k, v] of Object.entries(flags)) if (k.startsWith(SAVED_FLAG) && typeof v === "number" && v > 0) out.add(k.slice(SAVED_FLAG.length));
  // an explicit un-save (0) in the flags beats the legacy entry
  for (const [k, v] of Object.entries(flags)) if (k.startsWith(SAVED_FLAG) && v === 0) out.delete(k.slice(SAVED_FLAG.length));
  return [...out].sort();
}

/* ------------------------------------------------------------------ Practice table */

/** Practice table sort: "recommended" is course order with unsolved first; the rest are problem-filters' sorts. */
export function recommendedOrder<T extends { id: string; seq: number; order: number; title: string }>(rows: T[], solved: (id: string) => boolean): T[] {
  return [...rows].sort((a, b) => Number(solved(a.id)) - Number(solved(b.id)) || a.seq - b.seq || a.order - b.order || a.title.localeCompare(b.title));
}

export const PAGE_SIZE = 50;
export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
}
