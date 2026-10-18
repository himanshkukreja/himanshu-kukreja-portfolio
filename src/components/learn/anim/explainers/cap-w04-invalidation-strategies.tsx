/**
 * Week 4 capstone (product catalog · Deep Dive 2, multi-strategy invalidation): what one change to
 * product ABC123 deletes, per data type. Price: event-driven, Redis keys first (never cached at the
 * CDN), cascade to the product page, 30 s safety-net TTL if the event is lost. Inventory: only a stock
 * status flip invalidates (57 → 56 doesn't), cascading to category listings. Description: TTL only
 * (1 hour in Redis, 60 s at the CDN), so invalidate() skips it.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 344;
const EV = { x: 20, y: 48, w: 150, h: 56 };
const IN = { x: 200, y: 48, w: 180, h: 56 };
const DB = { x: 410, y: 48, w: 170, h: 56 };
const ROW0 = 160;
const RS = 32;

type Row = { tier: "redis" | "cdn"; key: string; state: string; tone?: Tone; hot?: boolean };
type Frame = { event: string; eventTone?: Tone; lost?: boolean; strategy: string; db: string; rows: Row[]; note: string; noteTone?: Tone; inTone?: Tone; tok?: boolean };

const cached = (key: string, state = "cached", tier: Row["tier"] = "redis"): Row => ({ tier, key, state, tone: "mute" });
const gone = (key: string, hot: boolean): Row => ({ tier: "redis", key, state: "deleted", tone: "ok", hot });

function price(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const keys = ["product:ABC123:price", "price:ABC123", "product:ABC123", "product_page:ABC123"];
  const base = { event: "price.updated", strategy: "real-time · event", db: "new price" };
  const cdn: Row = { tier: "cdn", key: "prices never cached", state: "skip", tone: "mute" };
  if (step === 0)
    return { ...base, eventTone: "lit", tok: true, inTone: d(0.6) ? "lit" : undefined, rows: [...keys.map((k) => cached(k, "old price")), cdn], note: d(0.6) ? "price: < 5 s staleness" : "event from Kafka", noteTone: d(0.6) ? "lit" : undefined };
  if (step === 1)
    return { ...base, inTone: "lit", rows: [d(0.35) ? gone(keys[0], !d(0.7)) : cached(keys[0], "old price"), d(0.7) ? gone(keys[1], true) : cached(keys[1], "old price"), cached(keys[2], "old price"), cached(keys[3], "old price"), cdn], note: "1. Redis first (closest to DB)", noteTone: "lit" };
  if (step === 2)
    return { ...base, inTone: "lit", rows: [gone(keys[0], false), gone(keys[1], false), d(0.35) ? gone(keys[2], !d(0.7)) : cached(keys[2], "old price"), d(0.7) ? gone(keys[3], true) : cached(keys[3], "old price"), cdn], note: d(0.9) ? "next read reloads the new price" : "2. cascade: the product page", noteTone: d(0.9) ? "ok" : "lit" };
  return {
    ...base,
    event: "event lost",
    eventTone: "bad",
    lost: true,
    strategy: "safety net",
    inTone: "mute",
    rows: [
      { tier: "redis", key: keys[1], state: d(0.6) ? "expired" : "TTL 30 s", tone: d(0.6) ? "ok" : "warn", hot: true },
      { tier: "redis", key: keys[0], state: d(0.6) ? "expired" : "TTL 30 s", tone: d(0.6) ? "ok" : "warn" },
      cdn,
    ],
    note: "checkout always re-reads the price",
    noteTone: "ok",
  };
}

function inventory(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const base = { event: "inventory.changed", strategy: "near-time · event" };
  if (step === 0)
    return {
      ...base,
      eventTone: "lit",
      tok: true,
      db: "stock 56",
      inTone: d(0.6) ? "warn" : undefined,
      rows: [
        { tier: "redis", key: "inventory:ABC123", state: d(0.6) ? "57 (TTL 30 s)" : "57", tone: d(0.6) ? "warn" : "mute", hot: d(0.6) },
        cached("product:ABC123:inventory", "57"),
        cached("category:{id}:*", "in stock"),
      ],
      note: d(0.6) ? "no status flip → no invalidation" : "57 → 56",
      noteTone: d(0.6) ? "warn" : undefined,
    };
  if (step === 1)
    return {
      ...base,
      eventTone: "lit",
      tok: true,
      db: "stock 0",
      inTone: "lit",
      rows: [d(0.5) ? gone("inventory:ABC123", true) : cached("inventory:ABC123", "1"), d(0.7) ? gone("product:ABC123:inventory", true) : cached("product:ABC123:inventory", "1"), cached("category:{id}:*", "in stock")],
      note: "in stock → out of stock",
      noteTone: "lit",
    };
  return {
    ...base,
    db: "stock 0",
    inTone: "lit",
    rows: [gone("inventory:ABC123", false), gone("product:ABC123:inventory", false), d(0.5) ? { tier: "redis", key: "category:{id}:*", state: "deleted", tone: "ok", hot: true } : cached("category:{id}:*", "in stock")],
    note: "cascade: category listings",
    noteTone: "ok",
  };
}

function metadata(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const base = { event: "product.modified", strategy: "TTL only", db: "new text" };
  if (step === 0)
    return {
      ...base,
      eventTone: "lit",
      tok: true,
      inTone: d(0.6) ? "mute" : undefined,
      rows: [cached("product:ABC123:metadata", "old text"), { tier: "cdn", key: "/api/products/ABC123", state: "old text", tone: "mute" }],
      note: d(0.6) ? "invalidate() skips TTL-only types" : "description edited",
      noteTone: d(0.6) ? "warn" : undefined,
    };
  return {
    ...base,
    inTone: "mute",
    rows: [
      { tier: "redis", key: "product:ABC123:metadata", state: "TTL ≤ 1 h", tone: "warn", hot: true },
      { tier: "cdn", key: "/api/products/ABC123", state: "TTL ≤ 60 s", tone: "warn", hot: true },
    ],
    note: "1-hour staleness is OK here",
    noteTone: "ok",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "inventory" ? inventory(step, t) : variant === "meta" ? metadata(step, t) : price(step, t);
  const p = seg(t, 0, 0.55);
  const y0 = EV.y + EV.h / 2;
  return (
    <g>
      <Wire d={`M${EV.x + EV.w} ${y0}H${IN.x}`} dash={f.lost} />
      <Wire d={`M${IN.x + IN.w} ${y0}H${DB.x}`} dash />
      <Txt x={20} y={30} k="k" anchor="start" tone={f.lost ? "bad" : undefined}>
        {f.lost ? (narrow ? "event lost" : "the price.updated event is lost") : narrow ? f.event : `${f.event} · product ABC123`}
      </Txt>
      <Box x={EV.x} y={EV.y} w={EV.w} h={EV.h} label="Kafka" sub={f.lost ? "lost" : "event"} tone={f.eventTone} />
      <Box x={IN.x} y={IN.y} w={IN.w} h={IN.h} label={narrow ? "Invalidator" : "Invalidation"} sub={f.strategy} tone={f.inTone} />
      <Box x={DB.x} y={DB.y} w={DB.w} h={DB.h} label={narrow ? "Postgres" : "PostgreSQL"} sub={f.db} tone="ok" />
      {f.lost && <path className="iv-x" d={`M${EV.x + EV.w + 8} ${y0 - 7}l14 14m0 -14l-14 14`} />}
      {f.tok && t < 0.55 && <Token x={lerp(EV.x + EV.w, IN.x, p)} y={y0} s={11} tone="lit" />}
      <Txt x={20} y={ROW0 - 30} k="k" anchor="start" tone="mute">
        {narrow ? "cached copies" : "cached copies of ABC123"}
      </Txt>
      {f.rows.map((r, i) => {
        const y = ROW0 + i * RS;
        return (
          <g key={r.key}>
            {r.hot && <rect className="iv-hot" x={14} y={y - 20} width={W - 28} height={30} />}
            <Txt x={24} y={y} k="s" anchor="start" tone={r.tier === "cdn" ? "sky" : "lit"}>
              {r.tier}
            </Txt>
            <Txt x={narrow ? 104 : 84} y={y} k="s" anchor="start">
              {r.key}
            </Txt>
            <Txt x={W - 24} y={y} anchor="end" tone={r.tone}>
              {r.state}
            </Txt>
          </g>
        );
      })}
      <line className="iv-rule" x1={20} x2={W - 20} y1={H - 44} y2={H - 44} />
      <Txt x={20} y={H - 16} anchor="start" tone={f.noteTone}>
        {f.note}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.iv-hot{fill:none;stroke:var(--ax-accent);stroke-width:1.5}.iv-rule{stroke:var(--ax-line-soft);stroke-width:1.5}.iv-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "price",
      label: "Price",
      steps: [
        { caption: "price.updated arrives for ABC123. Prices are real-time: event-driven, under 5 s, never cached at the CDN.", tween: 1400 },
        { caption: "Closest to the database first: delete product:ABC123:price and price:ABC123 in Redis. No CDN purge needed.", tween: 1600 },
        { caption: "Cascade: delete product:ABC123 and product_page:ABC123 too, so the page reloads with the new price.", tween: 1600 },
        { caption: "If the event is lost, the 30-second safety-net TTL still expires the price. Checkout always re-reads it.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "inventory",
      label: "Inventory",
      steps: [
        { caption: "A purchase drops stock from 57 to 56. No status flip, so no invalidation; 57 may show for 30 s.", tween: 1400 },
        { caption: "The last unit sells: in stock flips to out of stock, so the inventory keys are deleted at once.", tween: 1600 },
        { caption: "Cascade: the category listings holding ABC123, category:{id}:*, are deleted too.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "meta",
      label: "Description",
      steps: [
        { caption: "A description edit is product_metadata: TTL only. invalidate() skips it: no Redis delete, no CDN purge.", tween: 1400 },
        { caption: "Redis keeps it up to 1 hour, the CDN up to 60 s. Hour-old descriptions are acceptable.", tween: 800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
