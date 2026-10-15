// GitHub contribution calendar for the home page snake.
// Primary source: the public contributions fragment GitHub renders on profiles (no token needed).
// Secondary: GraphQL `contributionsCollection` when GITHUB_PERSONAL_ACCESS_TOKEN is valid.
// Last resort: a deterministic placeholder grid flagged `source: "offline"`. Never throws.

export const GITHUB_USER = "himanshkukreja";

const REVALIDATE_S = 6 * 60 * 60; // 6h
const TIMEOUT_MS = 5000;

export type ContribDay = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
/** One column of the calendar. `days[i]` is weekday i (0 = Sunday); null where the year doesn't cover it. */
export type ContribWeek = { days: (ContribDay | null)[] };

export type ContribData = {
  user: string;
  source: "github" | "graphql" | "offline";
  weeks: ContribWeek[];
  total: number;
  longestStreak: number;
  currentStreak: number;
  bestDay: { date: string; count: number } | null;
  /** ISO timestamp of when this snapshot was built. */
  fetchedAt: string;
};

const DAY_MS = 86_400_000;

function clampLevel(n: number): ContribDay["level"] {
  return Math.max(0, Math.min(4, Math.round(n))) as ContribDay["level"];
}

function utcDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lay out a flat list of days as Sunday-first week columns, and compute the summary stats. */
export function buildContrib(
  days: ContribDay[],
  source: ContribData["source"],
  totalOverride?: number
): ContribData {
  const sorted = [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)).sort((a, b) => a.date.localeCompare(b.date));
  const weeks: ContribWeek[] = [];
  if (sorted.length) {
    const first = utcDay(sorted[0].date);
    const start = first - new Date(first).getUTCDay() * DAY_MS; // back up to Sunday
    for (const d of sorted) {
      const ms = utcDay(d.date);
      const w = Math.floor((ms - start) / DAY_MS / 7);
      const wd = new Date(ms).getUTCDay();
      while (weeks.length <= w) weeks.push({ days: [null, null, null, null, null, null, null] });
      weeks[w].days[wd] = d;
    }
  }

  let longest = 0;
  let run = 0;
  let prev = -Infinity;
  let best: ContribData["bestDay"] = null;
  for (const d of sorted) {
    const ms = utcDay(d.date);
    if (d.count > 0) {
      run = ms - prev === DAY_MS ? run + 1 : 1;
      prev = ms;
      longest = Math.max(longest, run);
      if (!best || d.count > best.count) best = { date: d.date, count: d.count };
    }
  }

  // Current streak: consecutive active days ending today, or yesterday if today is still empty.
  let current = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].count > 0) current++;
    else if (i === sorted.length - 1) continue;
    else break;
  }

  const total = totalOverride ?? sorted.reduce((s, d) => s + d.count, 0);
  return {
    user: GITHUB_USER,
    source,
    weeks,
    total,
    longestStreak: longest,
    currentStreak: current,
    bestDay: best,
    fetchedAt: new Date().toISOString(),
  };
}

/** Parse GitHub's contributions HTML fragment. Exported for tests. */
export function parseContribHtml(html: string): { days: ContribDay[]; total: number | null } {
  // Counts live in <tool-tip for="contribution-day-component-R-C">N contributions on …</tool-tip>.
  const counts = new Map<string, number>();
  const tipRe = /<tool-tip\b[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  for (let m = tipRe.exec(html); m; m = tipRe.exec(html)) {
    const text = m[2].trim();
    const n = /^no\b/i.test(text) ? 0 : Number((/^([\d,]+)/.exec(text)?.[1] || "").replace(/,/g, ""));
    if (Number.isFinite(n)) counts.set(m[1], n);
  }

  const days: ContribDay[] = [];
  const tdRe = /<td\b[^>]*\bContributionCalendar-day\b[^>]*>/g;
  for (let m = tdRe.exec(html); m; m = tdRe.exec(html)) {
    const tag = m[0];
    const date = /\bdata-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
    if (!date) continue;
    const level = clampLevel(Number(/\bdata-level="(\d)"/.exec(tag)?.[1] || 0));
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    // Older markup carried data-count on the cell itself.
    const inline = /\bdata-count="(\d+)"/.exec(tag)?.[1];
    let count = inline != null ? Number(inline) : id && counts.has(id) ? counts.get(id)! : NaN;
    if (!Number.isFinite(count)) count = level === 0 ? 0 : [0, 1, 4, 8, 14][level]; // tooltip missing: estimate from level
    days.push({ date, count, level: count === 0 ? 0 : level || 1 });
  }

  const totalMatch = /([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i.exec(html.replace(/\s+/g, " "));
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, "")) : null;
  return { days, total };
}

async function fromHtml(): Promise<ContribData | null> {
  try {
    const res = await fetch(`https://github.com/users/${GITHUB_USER}/contributions`, {
      headers: { "User-Agent": "himanshukukreja.in portfolio (contribution snake)", Accept: "text/html" },
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const { days, total } = parseContribHtml(await res.text());
    if (days.length < 300) return null; // markup changed or partial page: don't show a broken year
    return buildContrib(days, "github", total ?? undefined);
  } catch {
    return null;
  }
}

const GQL = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
const GQL_LEVEL: Record<string, ContribDay["level"]> = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

async function fromGraphql(): Promise<ContribData | null> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "himanshukukreja.in portfolio" },
      body: JSON.stringify({ query: GQL, variables: { login: GITHUB_USER } }),
      next: { revalidate: REVALIDATE_S },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null; // 401 with a stale token: fall through quietly
    const json = (await res.json()) as {
      data?: {
        user?: {
          contributionsCollection?: {
            contributionCalendar?: {
              totalContributions: number;
              weeks: { contributionDays: { date: string; contributionCount: number; contributionLevel: string }[] }[];
            };
          };
        };
      };
    };
    const cal = json.data?.user?.contributionsCollection?.contributionCalendar;
    if (!cal) return null;
    const days = cal.weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: GQL_LEVEL[d.contributionLevel] ?? 0 }))
    );
    return days.length ? buildContrib(days, "graphql", cal.totalContributions) : null;
  } catch {
    return null;
  }
}

/** Deterministic stand-in year (seeded PRNG): same grid on every render, clearly marked offline. */
export function placeholderContrib(today = new Date()): ContribData {
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) % 10_000) / 10_000;
  };
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const start = end - 364 * DAY_MS;
  const days: ContribDay[] = [];
  for (let ms = start - new Date(start).getUTCDay() * DAY_MS; ms <= end; ms += DAY_MS) {
    const wd = new Date(ms).getUTCDay();
    const busy = wd === 0 || wd === 6 ? 0.35 : 0.7;
    const r = rand();
    const count = r < busy ? Math.floor(rand() * rand() * 24) + 1 : 0;
    const level = count === 0 ? 0 : count < 4 ? 1 : count < 9 ? 2 : count < 15 ? 3 : 4;
    days.push({ date: isoDay(ms), count, level: level as ContribDay["level"] });
  }
  return buildContrib(days, "offline");
}

export async function getContributions(): Promise<ContribData> {
  return (await fromHtml()) ?? (await fromGraphql()) ?? placeholderContrib();
}
