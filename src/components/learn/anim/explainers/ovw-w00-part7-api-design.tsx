/**
 * Whole-lesson overview (week 0, part 7 · API design). Basketly's illustrative first year: a retry
 * that charged twice, page 1,600 at 4 s, a repeated order, ₹0 after a rename, a 504 at 60 s.
 * Contract: resources and plural nouns, a rare `:cancel` verb, safe and idempotent methods, PATCH and
 * If-Match → 412, picking a status code. Lists: offset walks 40,000 entries for page 2,000 and shifts
 * under inserts; keyset reads ~21 at any depth behind an opaque, signed token; sizing the catalog
 * list. Evolve: what breaks app 2.3, three ways to version, Stripe's change modules, RFC 9457 errors.
 * Retries & slow work: idempotency keys, 429 with Retry-After, 202 and an operation, webhooks.
 * Style: REST vs gRPC vs GraphQL, Basketly's three callers and the published examples.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}


const N: Record<string, Nd> = {
  app: nd(0, 0, "App"),
  gw: nd(1, 0, "Gateway"),
  orders: nd(2, 0, "Orders svc", "Orders"),
  pg: nd(3, 0, "PostgreSQL", "Postgres"),
  partner: nd(0, 1, "Partners", "B2B", 2),
  redis: nd(1, 1, "Redis"),
  queue: nd(2, 1, "Job queue", "Jobs"),
  worker: nd(3, 1, "Worker"),
  hooks: nd(2, 2, "Webhooks", "Hooks"),
  files: nd(3, 2, "Object store", "Storage"),
};
const E: Ed[] = [
  ["app", "gw"],
  ["partner", "gw", -30, 12],
  ["gw", "orders"],
  ["gw", "redis"],
  ["orders", "redis", 12, 0],
  ["orders", "pg"],
  ["orders", "queue"],
  ["queue", "worker"],
  ["worker", "files"],
  ["queue", "hooks"],
  ["hooks", "partner", 0, 24],
];

const F: Record<string, Fr[]> = {
  year: [
    {
      k: ["Basketly's first year (illustrative)", "Basketly's first year"],
      kt: "warn",
      on: { app: "lit", gw: 1, orders: "bad", pg: 1 },
      sub: { orders: "/createOrder" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
      ],
      chips: [
        ["W1 · /createOrder, ?page=3", "W1 · /createOrder"],
        ["M4 · retry: 2 orders, 2 charges", "M4 · two charges"],
        ["M7 · page 1,600 takes 4 s", "M7 · page 1,600: 4 s"],
        ["M8 · page 2 repeats an order", "M8 · a repeated order"],
        ["M9 · a rename: ₹0 on app 2.3", "M9 · ₹0 at checkout"],
        ["M10 · export: a 504 at 60 s", "M10 · a 504 at 60 s"],
      ],
      ctn: ["sky", "bad", "warn", "warn", "bad", "bad"],
      note: ["none was a database or cache bug: each was an API decision", "each was an API decision"],
    },
    {
      k: ["resources: nouns, not verbs", "nouns, not verbs"],
      on: { app: 1, gw: 1, orders: "lit" },
      sub: { orders: "resources" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
      ],
      chips: [
        ["GET /v1/users/{id}/orders", "GET /users/{id}/orders"],
        ["POST /v1/orders → 201", "POST /orders → 201"],
        ["PATCH /v1/orders/{id}", "PATCH /orders/{id}"],
        ["POST …/ord_8f2k:cancel", "POST …:cancel"],
      ],
      ctn: ["sky", "ok", "lit", "warn"],
      note: ["plural collections, opaque ids like ord_8f2k…, one casing", "plural, opaque ids, one casing"],
    },
    {
      k: ["methods are promises", "methods are promises"],
      on: { app: 1, gw: 1, orders: "lit", pg: 1 },
      sub: { orders: 'ETag "v17"' },
      fl: [
        ["gw", "orders"],
        ["orders", "pg"],
      ],
      chips: [
        ["GET: safe, changes nothing", "GET: safe"],
        ["PUT, DELETE: idempotent", "PUT, DELETE: idempotent"],
        ["POST: neither", "POST: neither"],
        ["PUT erases new fields: PATCH", "PATCH, not PUT"],
        ['If-Match "v17", it moved: 412', "stale If-Match: 412"],
        ['a link bot "confirms" a GET', "bots follow GETs"],
      ],
      ctn: ["ok", "sky", "warn", "lit", "bad", "warn"],
    },
    {
      k: ["status codes answer: retry?", "should I retry?"],
      on: { app: "lit", gw: 1, orders: "lit" },
      fl: [
        ["orders", "gw"],
        ["gw", "app"],
      ],
      chips: [
        ["cancel out for delivery: 409", "can't cancel: 409"],
        ["quantity: -2 → 422", "quantity -2: 422"],
        ["another user's order: 404", "not yours: 404"],
        ["stale If-Match: 412", "stale If-Match: 412"],
        ["a 3-minute export: 202", "3-min export: 202"],
        ["bad input as a 500: retried", "bad input as 500: no"],
      ],
      ctn: ["warn", "warn", "sky", "bad", "ok", "bad"],
      note: ["4xx: fix the request first (not 408, 429); 5xx: usually try later", "4xx: fix it · 5xx: try later"],
    },
  ],
  lists: [
    {
      k: ["offset: walk, then throw away", "offset pagination"],
      kt: "warn",
      on: { app: 1, gw: 1, orders: "lit", pg: "warn" },
      sub: { orders: "OFFSET n", pg: "(user_id, created_at)" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
        ["orders", "pg", "warn"],
      ],
      bars: [
        [["page 1 · 20 entries walked", "page 1 · 20"], 20, 40000, "ok"],
        [["page 100 · 2,000 walked", "page 100 · 2,000"], 2000, 40000, "sky"],
        [["page 1,000 · 20,000 walked", "page 1,000 · 20,000"], 20000, 40000, "warn"],
        [["page 2,000 · 40,000 walked", "page 2,000 · 40,000"], 40000, 40000, "bad"],
      ],
    },
    {
      k: ["deep pages cost more, and move", "cost and correctness"],
      kt: "bad",
      on: { app: 1, gw: 1, orders: "bad", pg: "warn" },
      sub: { pg: "a new order on top" },
      figs: [
        ["~40M", ["entries, all 2,000 pages", "to scroll it all"], "bad"],
        ["4 s", ["page 1,600, month 7", "page 1,600"], "warn"],
        ["O20 ×2", ["a new order shifts page 2", "page 2 repeats"], "warn"],
      ],
      note: ["cost grows with the square of depth; a delete skips an order instead", "a delete skips one instead"],
    },
    {
      k: ["cursor: say where you stopped", "keyset pagination"],
      kt: "ok",
      on: { app: 1, gw: 1, orders: "ok", pg: "ok" },
      sub: { orders: "page_token", pg: "(created_at, id) <" },
      fl: [
        ["app", "gw", "ok"],
        ["gw", "orders", "ok"],
        ["orders", "pg", "ok"],
      ],
      figs: [
        ["40,000", ["offset · page 2,000", "offset, page 2,000"], "bad"],
        ["21", ["keyset · any page", "keyset, any page"], "ok"],
      ],
      note: ["LIMIT 21 = page_size + 1; the id breaks created_at ties", "21 = 20 + 1; id breaks ties"],
    },
    {
      k: ["the token contract", "the token"],
      on: { app: "lit", gw: 1, orders: "lit" },
      sub: { orders: "next_page_token" },
      fl: [
        ["orders", "gw"],
        ["gw", "app"],
      ],
      chips: [
        ["opaque, signed, URL-safe", "opaque and signed"],
        ["empty token = the end", "empty = the end"],
        ["page_size capped, not rejected", "capped page_size"],
        ["new filter or sort: 400", "new query: 400"],
        ["Stripe 1–100, GitHub 100 max", "max 100: Stripe, GitHub"],
        ["no jump to page 50", "no page 50"],
      ],
      ctn: ["lit", "ok", "sky", "bad", "sky", "warn"],
      note: ["default to cursors; page numbers only where deep pages are cheap", "default to cursors"],
    },
    {
      k: ["sizing the catalog list (assumed)", "sizing a list"],
      on: { app: "lit", gw: "lit", pg: 1 },
      fl: [["app", "gw"]],
      figs: [
        ["~4,400", ["requests a second, peak", "peak req/s"]],
        ["~90", ["Mbps out, gzipped", "Mbps, gzipped"], "ok"],
        ["~244", ["normal requests' work", "normal requests"], "bad"],
      ],
      note: ["one crawler call at page 250 = ~244 normal requests", "one call at page 250"],
    },
  ],
  evolve: [
    {
      k: ["app 2.3 is on 30% of phones", "app 2.3: 30% of phones"],
      kt: "warn",
      on: { app: "warn", gw: 1, orders: "lit" },
      sub: { app: "v2.3", orders: "v1 response" },
      fl: [
        ["orders", "gw"],
        ["gw", "app"],
      ],
      chips: [
        ["add a response field: safe", "new field: safe"],
        ["add an enum value: careful", "new enum value: careful"],
        ["rename total: breaks, ₹0", "rename: breaks"],
        ["coupon_code required: breaks", "new required: breaks"],
        ["rupees → paise: breaks silently", "₹45.5 → 4550: silent"],
        ["clients ignore unknown fields", "tolerant reader"],
      ],
      ctn: ["ok", "warn", "bad", "bad", "bad", "sky"],
    },
    {
      k: ["three ways to version", "versioning"],
      on: { app: 1, gw: "lit", orders: 1 },
      sub: { gw: "routes /v1" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
      ],
      cols: 1,
      chips: [
        ["/v1/orders → /v2/orders · major version in the path (Google)", "/v1 in the path · Google"],
        ["Stripe-Version: 2017-05-24 · a dated header (Stripe, GitHub)", "dated header · Stripe"],
        ["?api-version=2024-05-01 · a dated query parameter (Azure)", "?api-version= · Azure"],
      ],
      ctn: ["sky", "lit", "warn"],
      note: ["GitHub keeps the previous version for at least 24 more months", "old version: 24+ months"],
    },
    {
      k: ["build the newest, walk back (Stripe, 2017)", "Stripe's change modules"],
      on: { app: 1, gw: 1, orders: "lit" },
      sub: { orders: "newest shape" },
      fl: [
        ["orders", "gw"],
        ["gw", "app"],
      ],
      chips: [
        ["pinned on the first request", "pinned on first call"],
        ["handler builds the newest shape", "build the newest"],
        ["change modules walk back in time", "walk back in time"],
        ["~100 breaking upgrades, 6 years", "~100 breaks, 6 years"],
      ],
      ctn: ["sky", "lit", "ok", "warn"],
      note: ["as of Oct 2026: monthly, no breaks since 2024-09-30.acacia", "2026: breaking majors twice a year"],
    },
    {
      k: ["RFC 9457: problem details", "error contracts"],
      kt: "bad",
      on: { app: "lit", gw: 1, orders: "bad" },
      sub: { orders: "422" },
      fl: [
        ["orders", "gw", "bad"],
        ["gw", "app", "bad"],
      ],
      chips: [
        ["type: a URI for the problem", "type: a URI"],
        ["title, status, detail, instance", "title, status, detail"],
        ["code: slot_unavailable", "code: slot_unavailable"],
        ["param: delivery_slot", "param: delivery_slot"],
        ["retryable: false", "retryable: false"],
        ["request_id: req_5d1c", "request_id"],
      ],
      ctn: ["sky", "sky", "lit", "lit", "warn", "ok"],
      note: ["clients branch on the code; people read the message", "code for clients, message for people"],
    },
  ],
  retries: [
    {
      k: ["the order that timed out", "a 4G timeout"],
      kt: "bad",
      on: { app: "bad", gw: 1, orders: "lit", pg: "lit" },
      sub: { pg: "commit at 5.2 s" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
        ["orders", "pg"],
      ],
      figs: [
        ["5 s", ["client gives up", "client gives up"], "warn"],
        ["5.2 s", ["server commits", "server commits"]],
        ["2", ["orders, 2 charges: no key", "orders, no key"], "bad"],
      ],
      note: ["the client can't tell which failure it was, so every retry must be safe", "every retry must be safe"],
    },
    {
      k: ["Idempotency-Key: one per operation", "idempotency keys"],
      kt: "ok",
      on: { app: 1, gw: 1, orders: "lit", redis: "ok", pg: 1 },
      sub: { orders: "checks the key", redis: "keys" },
      fl: [
        ["gw", "orders"],
        ["orders", "redis", "ok"],
      ],
      chips: [
        ["same key: the saved 201", "same key: saved 201"],
        ["still running: 409, retry", "running: 409"],
        ["same key, new body: error", "new body: error"],
        ["changed cart: a new key", "new cart: new key"],
      ],
      ctn: ["ok", "warn", "bad", "sky"],
      note: ["Stripe: up to 255 characters, V4 UUIDs, pruned after 24 h or more", "Stripe: pruned after 24 h+"],
    },
    {
      k: ["429 + Retry-After", "rate limits"],
      kt: "warn",
      on: { partner: "lit", gw: "warn", redis: 1 },
      sub: { gw: "429", redis: "counters" },
      fl: [
        ["partner", "gw", "warn"],
        ["gw", "redis"],
      ],
      chips: [
        ["GitHub: 5,000 an hour per user", "GitHub: 5,000/h"],
        ["60 an hour, unauthenticated", "anonymous: 60/h"],
        ["x-ratelimit-remaining: 4987", "remaining: 4987"],
        ["no Retry-After: 2^n + jitter", "else 2^n + jitter"],
        ["X-RateLimit-*: a convention", "X-RateLimit: convention"],
        ["IETF RateLimit: still a draft", "RateLimit: a draft"],
      ],
      ctn: ["sky", "sky", "lit", "ok", "mute", "warn"],
      note: ["send Retry-After with every 429, in the same error shape", "Retry-After on every 429"],
    },
    {
      k: ["slow work: 202 and an operation", "202 + an operation"],
      on: { app: "lit", gw: 1, orders: "lit", queue: "lit", worker: 1, files: "ok" },
      sub: { queue: "op_42", worker: "invoice export", files: "signed URL" },
      fl: [
        ["app", "gw"],
        ["gw", "orders"],
        ["orders", "queue"],
        ["queue", "worker"],
        ["worker", "files", "ok"],
      ],
      chips: [
        ["POST → 202, Location op_42", "202 · op_42"],
        ["Retry-After: 5", "Retry-After: 5"],
        ["GET: running, progress 40", "running, 40"],
        ["done: a link, valid 15 min", "link, 15 min"],
      ],
      ctn: ["lit", "sky", "warn", "ok"],
      note: ["a second tap, same key: the same op_42, no second export", "second tap: same op_42"],
    },
    {
      k: ["tell them it's done", "polling or webhooks"],
      kt: "ok",
      on: { app: 1, gw: 1, queue: 1, hooks: "lit", partner: "lit" },
      sub: { hooks: "signed POST" },
      fl: [
        ["queue", "hooks"],
        ["hooks", "partner"],
      ],
      cols: 1,
      chips: [
        ["NotStarted → Running → Succeeded | Failed | Canceled", "NotStarted → Running → done"],
        ["servers: a webhook, export.completed · apps: a push", "servers: webhook · apps: push"],
        ["missed it? GET /v1/operations/op_42 is the truth", "missed it? GET the operation"],
      ],
      ctn: ["sky", "lit", "ok"],
    },
  ],
  style: [
    {
      k: ["REST · gRPC · GraphQL: who calls it?", "who calls it?"],
      on: { app: "lit", partner: "lit", gw: 1, orders: "lit" },
      sub: { gw: "REST + JSON", orders: "gRPC inside" },
      fl: [
        ["partner", "gw"],
        ["app", "gw"],
        ["gw", "orders"],
      ],
      cols: 3,
      chips: [
        ["REST + JSON", "REST + JSON"],
        ["gRPC + Protobuf", "gRPC"],
        ["GraphQL", "GraphQL"],
        ["partners, browsers", "anyone"],
        ["your own services", "own services"],
        ["your own UIs", "own UIs"],
        ["chatty clients", "over-fetching"],
        ["browsers need proxy", "needs a proxy"],
        ["N+1, costly queries", "N+1, cost"],
      ],
      ctn: ["lit", "sky", "ok", "lit", "sky", "ok", "bad", "bad", "bad"],
    },
    {
      k: ["Basketly's three new callers", "three callers"],
      on: { partner: "lit", app: "lit", gw: 1, orders: "lit" },
      sub: { orders: "gRPC → pricing" },
      fl: [
        ["partner", "gw"],
        ["app", "gw"],
        ["gw", "orders"],
      ],
      cols: 1,
      chips: [
        ["merchants' inventory systems: REST + JSON, webhooks, cursors", "merchants: REST + webhooks"],
        ["pricing, 30,000 calls/s from Go and Java: gRPC, deadlines", "pricing at 30k/s: gRPC"],
        ["a home screen of six widgets: GraphQL or a BFF", "home screen: GraphQL or BFF"],
      ],
      ctn: ["lit", "sky", "ok"],
      note: ["in an interview: REST for the public API, and name what you rejected", "default to REST; name the rejected"],
    },
    {
      k: ["what the big APIs did", "published examples"],
      on: { app: 1, gw: "lit", orders: 1 },
      figs: [
        [">60%", ["DB-tier requests via REST", "GitHub, 2016"], "warn"],
        ["5,000", ["GraphQL points an hour", "points an hour"], "sky"],
        ["500,000", ["nodes max per call", "nodes per call"], "bad"],
      ],
      note: ["Netflix: gRPC + FieldMask inside; Shopify: new apps GraphQL-only", "REST out, gRPC in, GraphQL for UIs"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "year",
    label: "Contract",
    steps: [
      {
        caption:
          "Basketly (illustrative) shipped POST /createOrder, GET /getOrders?page=3 and a decimal total in week one. Within ten months: a retry charged twice, page 1,600 took 4 seconds, page 2 repeated an order, a rename showed ₹0 on app 2.3, and an export hit a 504 at 60 seconds.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Model the things, not the actions: a few standard methods on each resource, plural collections alternating with ids, opaque ids like ord_8f2k…, one casing. A real verb such as cancel stays rare and attached to its resource: POST /v1/orders/ord_8f2k:cancel.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Safe and idempotent are promises proxies and bots act on, and POST keeps neither. PUT replaces the whole resource, so an old client erases fields it never saw; PATCH with a field mask doesn't. A stale If-Match \"v17\" gets 412 Precondition Failed.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The client's first question about any code is \"should I retry?\". Cancelling an order already out for delivery is 409, quantity -2 is 422, another user's order is 404 (a 403 leaks that it exists), a stale If-Match is 412, a three-minute export is 202.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "lists",
    label: "Pagination",
    steps: [
      {
        caption: "The café has 40,000 orders, 20 to a page, served with LIMIT 20 OFFSET n. Page 2,000 skips 39,980 rows, so the database walks 40,000 index entries to keep 20: page n costs n times page 1.",
        tween: 1600,
        loop: true,
      },
      {
        caption: "Scrolling all 2,000 pages walks about 40 million entries, so cost grows with the square of depth. And offsets count positions: a new order on top pushes everything down, so page 2 starts with O20 again; a delete skips one instead.",
        tween: 1400,
      },
      {
        caption: "Keyset pagination says where you stopped: WHERE (created_at, id) < the last row seen, LIMIT 21. Every page walks about 21 entries, page 1 or page 2,000, and a new order lands above the cursor. The id tie-breaker is required.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The API hides the SQL behind an opaque, signed, URL-safe token. An empty token is the only end-of-collection signal, page_size is capped rather than rejected (Stripe 1–100, GitHub 100), and a token from another filter or sort gets a 400. The price: no jumping to page 50.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Sizing the catalog list, every number assumed: 96 million requests a day, ~4,400 a second at peak, ~90 Mbps gzipped, a handful of servers. Query shape decides the cost: keyset reads ~41 entries a page, while one OFFSET call at page 250 does the work of ~244 normal requests.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "evolve",
    label: "Versions & errors",
    steps: [
      {
        caption:
          "App 2.3 is on 30% of phones for months. Adding a response field is safe if clients ignore unknown fields; a new enum value needs care. Renaming total, making coupon_code required, or turning rupees (45.5) into paise (4550) breaks it, the last one silently.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Three ways to version: a major version in the path (Google: /v1, not v1.0), a dated header (Stripe-Version, GitHub's X-GitHub-Api-Version), or a dated api-version query parameter (Azure). GitHub supports the previous version for at least 24 more months.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Stripe (2017) pins an account to the newest version on its first request, builds every response in the newest shape, then runs change modules that walk back to the caller's version: almost a hundred breaking upgrades in six years without breaking integrations.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "RFC 9457 problem details, served as application/problem+json: type, title, status, detail and instance, plus Basketly's own code, param, retryable and request_id. Clients branch on the stable code, people read the message, and stack traces stay in the logs.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "retries",
    label: "Retries & slow work",
    steps: [
      {
        caption: "On 4G, POST /v1/orders times out on the client at 5 seconds and the server commits at 5.2. The app retries. With no key that's the preface's month 4: two orders, two charges.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Every non-idempotent POST takes a client-generated key, reused on every retry. The same key returns the saved 201; one still running gets 409, retry shortly; the same key with a different body is an error; a changed cart is a new operation with a new key.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "RFC 6585's 429 says too many requests; send Retry-After with it. GitHub allows 60 requests an hour unauthenticated and 5,000 per user, reported on every response. Clients honour Retry-After, else back off proportionally to 2^n with jitter.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A three-minute export becomes a resource: POST returns 202 with Location /v1/operations/op_42 and Retry-After: 5, a worker takes the job, and polling reads running, progress 40, then succeeded with a signed download URL valid for 15 minutes.",
        tween: 1600,
        loop: true,
      },
      {
        caption:
          "The operation runs NotStarted → Running → Succeeded, Failed or Canceled, and terminal states never change. Servers get a webhook (export.completed), mobile apps a push, and the status resource stays the truth for anyone who missed it.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "style",
    label: "REST · gRPC · GraphQL",
    steps: [
      {
        caption:
          "The question is which caller each suits. REST + JSON works for anyone and caches in HTTP and CDNs; gRPC suits your own services with generated clients and deadlines; GraphQL suits your own UIs with many screen shapes, at the cost of N+1 resolvers and costly queries.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Basketly's three new callers: merchants' inventory systems get REST + JSON with webhooks and cursors; the pricing service, called 30,000 times a second from Go and Java, gets gRPC; a home screen of six widgets gets GraphQL or a BFF with cost limits.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "GitHub added GraphQL in 2016 because REST made over 60% of its database-tier requests, then priced it: 5,000 points an hour and at most 500,000 nodes a call. Netflix uses gRPC with FieldMask between backends; Shopify's new public apps must use GraphQL since April 2025.",
        tween: 1400,
        loop: true,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
