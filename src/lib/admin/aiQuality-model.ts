/**
 * The AI quality dashboard's numbers (/admin/ai/quality), from the metering rows (ai_calls) and the answer feedback
 * (chat_feedback): per feature and per day, the thumbs-up rate, the down reasons, errors, p50/p90 latency, cost, the
 * citation check's unsupported rate and the turns routed to Sonnet. Counts and aggregates only: no learner text or id
 * leaves this module. Pure: the route reads the rows.
 */
import { FEEDBACK_FEATURES, reasonOf, REASON_IDS, type FeedbackReason } from "@/lib/ai/feedback-model";

export type CallRow = { id: number; created_at: string; feature: string; model: string; status: string; cost_usd: number | null; latency_ms: number | null; cites?: { n?: number; fixed?: number; dropped?: number } | null; routed?: string | null };
export type FeedbackRow = { call_id: number; created_at: string; rating: number; wrong?: boolean | null; reason?: string | null; note?: string | null; feature?: string | null };

export type Bucket = {
  calls: number;
  ok: number;
  errors: number;
  up: number;
  down: number;
  reasons: Record<FeedbackReason, number>;
  p50: number | null;
  p90: number | null;
  cost: number;
  /** citations checked, and how many were unsupported (fixed + dropped) */
  cites: number;
  citesBad: number;
  /** turns answered by Sonnet through the routing, and hard turns that stayed on Haiku (the daily cap, the mode) */
  sonnet: number;
  routeHeld: number;
};
export type QualityStats = {
  features: { feature: string; total: Bucket; days: ({ day: string } & Bucket)[] }[];
  total: Bucket;
  days: ({ day: string } & Bucket)[];
};

const empty = (): Bucket => ({ calls: 0, ok: 0, errors: 0, up: 0, down: 0, reasons: Object.fromEntries(REASON_IDS.map((r) => [r, 0])) as Record<FeedbackReason, number>, p50: null, p90: null, cost: 0, cites: 0, citesBad: 0, sonnet: 0, routeHeld: 0 });

/** the q-th quantile (0..1) of sorted numbers, nearest rank */
export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

/** "Thumbs-up rate": ups over rated answers (ups + downs), null when nothing was rated */
export const upRate = (b: Pick<Bucket, "up" | "down">) => (b.up + b.down ? b.up / (b.up + b.down) : null);

export function qualityStats(calls: CallRow[], feedback: FeedbackRow[], since: Date, now = new Date(), features: readonly string[] = FEEDBACK_FEATURES): QualityStats {
  const dayKeys: string[] = [];
  for (let t = Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()); t <= now.getTime(); t += 86_400_000) dayKeys.push(new Date(t).toISOString().slice(0, 10));
  type Acc = { b: Bucket; lat: number[] };
  const acc = new Map<string, Acc>();
  const get = (feature: string, day: string) => {
    const k = `${feature}|${day}`;
    let a = acc.get(k);
    if (!a) acc.set(k, (a = { b: empty(), lat: [] }));
    return a;
  };
  const featureOf = new Map<number, string>();
  for (const c of calls) {
    featureOf.set(c.id, c.feature);
    if (!features.includes(c.feature)) continue;
    const day = c.created_at.slice(0, 10);
    for (const a of [get(c.feature, day), get(c.feature, "*"), get("*", day), get("*", "*")]) {
      // refusals (quota, rate, switch, too long) are the limits working, not answers: they aren't calls here
      if (c.status === "ok" || c.status === "off_topic" || c.status === "error") a.b.calls++;
      if (c.status === "ok") a.b.ok++;
      if (c.status === "error") a.b.errors++;
      a.b.cost += Number(c.cost_usd) || 0;
      if (c.status === "ok" && c.latency_ms != null) a.lat.push(Number(c.latency_ms));
      if (c.cites?.n) {
        a.b.cites += c.cites.n;
        a.b.citesBad += (c.cites.fixed ?? 0) + (c.cites.dropped ?? 0);
      }
      if (c.routed === "sonnet") a.b.sonnet++;
      else if (c.routed) a.b.routeHeld++;
    }
  }
  for (const f of feedback) {
    const feature = f.feature || featureOf.get(f.call_id);
    if (!feature || !features.includes(feature)) continue;
    const day = f.created_at.slice(0, 10);
    const reason = f.rating === -1 ? reasonOf(f) : null;
    for (const a of [get(feature, day), get(feature, "*"), get("*", day), get("*", "*")]) {
      if (f.rating === 1) a.b.up++;
      if (f.rating === -1) a.b.down++;
      if (reason) a.b.reasons[reason]++;
    }
  }
  const done = (a: Acc | undefined): Bucket => {
    if (!a) return empty();
    const s = a.lat.sort((x, y) => x - y);
    return { ...a.b, p50: quantile(s, 0.5), p90: quantile(s, 0.9) };
  };
  const used = [...new Set([...acc.keys()].map((k) => k.split("|")[0]).filter((f) => f !== "*"))];
  const order = features.filter((f) => used.includes(f));
  return {
    features: order.map((feature) => ({ feature, total: done(acc.get(`${feature}|*`)), days: dayKeys.map((day) => ({ day, ...done(acc.get(`${feature}|${day}`)) })) })),
    total: done(acc.get("*|*")),
    days: dayKeys.map((day) => ({ day, ...done(acc.get(`*|${day}`)) })),
  };
}

/** An excerpt of the AI's answer as the transcript kept it (never the learner's message): the chat's tool trace and a
 *  private plan off; a JSON review shown by its summary line. */
export function answerExcerpt(output: string | null | undefined, n = 280): string {
  let t = (output ?? "").split("\n\n— tools:")[0].replace(/<plan>[\s\S]*?<\/plan>/g, "").trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const s = [j.summary, j.verdict, j.headline].find((x) => typeof x === "string") as string | undefined;
      if (s) t = s;
    } catch {
      /* not JSON after all */
    }
  }
  t = t.replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}
