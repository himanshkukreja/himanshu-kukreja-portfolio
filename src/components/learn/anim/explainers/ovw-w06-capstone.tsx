/**
 * Whole-capstone overview (weeks 1-6 capstone: a food delivery order system, as a 45-minute
 * interview). Requirements and the estimate (5M orders/day, ~230/sec at the dinner peak, ~7K
 * writes and ~60K reads/sec), the architecture (three APIs, Kafka, five workers, PostgreSQL, Redis,
 * S3), the six deep dives (outbox, idempotency, driver assignment, saga, location, rate limits),
 * then 10x scale, edge cases and the build order.
 */
import { Box, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type Node = { id: string; x: number; y: number; w: number; h: number; l: string; n: string };
const COL = { a: 6, p: 122, k: 236, w: 324, s: 460 };
const WID = { a: 100, p: 100, k: 72, w: 120, s: 132 };
const R3 = [52, 108, 164];
const NODES: Node[] = [
  ...[["Customer", "Cust"], ["Restaurant", "Rest"], ["Driver", "Driver"]].map(([l, n], i) => ({ id: `a${i}`, x: COL.a, y: R3[i], w: WID.a, h: 40, l, n })),
  ...[["Order API", "Order"], ["Rest. API", "Rest"], ["Driver API", "Driver"]].map(([l, n], i) => ({ id: `p${i}`, x: COL.p, y: R3[i], w: WID.p, h: 40, l, n })),
  { id: "k", x: COL.k, y: 44, w: WID.k, h: 172, l: "Kafka", n: "Kafka" },
  ...[["Order saga", "Order"], ["Driver match", "Match"], ["Payment", "Pay"], ["Notify", "Notify"], ["Tracking", "Track"]].map(([l, n], i) => ({ id: `w${i}`, x: COL.w, y: 44 + i * 36, w: WID.w, h: 30, l, n })),
  ...[["PostgreSQL", "Postgres"], ["Redis", "Redis"], ["S3 history", "S3"]].map(([l, n], i) => ({ id: `s${i}`, x: COL.s, y: R3[i], w: WID.s, h: 40, l, n })),
];
const mid = (id: string) => {
  const n = NODES.find((m) => m.id === id)!;
  return n.y + n.h / 2;
};

/** "a0:lit p0:ok" → tones; `dim` greys every node not named */
function Arch({ spec, dim, narrow }: { spec: string; dim: boolean; narrow: boolean }) {
  const tones: Record<string, Tone> = {};
  for (const part of spec.split(" ").filter(Boolean)) {
    const [id, tone] = part.split(":");
    tones[id] = (tone || "lit") as Tone;
  }
  const off = (id: string) => dim && !(id in tones);
  const wire = (a: string, d: string, b: string) => <Wire key={a + b} d={d} arrow tone={a in tones && b in tones ? "lit" : undefined} opacity={off(a) || off(b) ? 0.25 : 1} />;
  return (
    <g>
      {[0, 1, 2].map((i) => wire(`a${i}`, `M${COL.a + WID.a} ${mid(`a${i}`)}H${COL.p}`, `p${i}`))}
      {[0, 1, 2].map((i) => wire(`p${i}`, `M${COL.p + WID.p} ${mid(`p${i}`)}H${COL.k}`, "k"))}
      {[0, 1, 2, 3, 4].map((i) => wire("k", `M${COL.k + WID.k} ${mid(`w${i}`)}H${COL.w}`, `w${i}`))}
      {[0, 1, 2].map((i) => wire(`w${i === 0 ? 0 : i === 1 ? 1 : 4}`, `M${COL.w + WID.w} ${mid(`s${i}`)}H${COL.s}`, `s${i}`))}
      {NODES.map((n) => (
        <Box key={n.id} x={n.x} y={n.y} w={n.w} h={n.h} label={narrow ? n.n : n.l} tone={tones[n.id]} dim={off(n.id)} />
      ))}
    </g>
  );
}

function Chips({ items, t, y = 250, tone = "lit" }: { items: string[]; t: number; y?: number; tone?: Tone }) {
  const cols = items.length > 3 ? (items.length === 4 ? 2 : items.length) : items.length;
  const w = (584 - (cols - 1) * 8) / cols;
  return (
    <g>
      {items.map((l, i) => {
        const x = 8 + (i % cols) * (w + 8);
        const yy = y + Math.floor(i / cols) * 34;
        return (
          <g key={l} opacity={seg(t, 0.2 + i * 0.12, 0.45 + i * 0.12)}>
            <rect className={`ax-box ${tone}`} x={x} y={yy} width={w} height={28} />
            <Txt x={x + w / 2} y={yy + 19} k="s" tone={tone}>
              {l}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

type Beat = { spec: string; dim?: boolean; chips?: [string[], string[]]; tone?: Tone; figs?: [string, string][]; flow?: boolean };
const BEATS: Record<string, Beat[]> = {
  ask: [
    { spec: "a0 a1 a2", dim: true, chips: [["5M orders/day", "peaks: lunch + dinner", "single country"], ["5M/day", "lunch + dinner", "1 country"]] },
    { spec: "a1 a2", dim: true, chips: [["restaurant sees < 2 s", "driver < 30 s", "location 3–5 s"], ["rest < 2 s", "driver < 30 s", "loc 3–5 s"]], tone: "sky" },
    { spec: "a0", dim: true, chips: [["never lose an order", "no double charge", "no double assignment", "99.9% uptime"], ["never lost", "charged once", "1 driver, 1 order", "99.9%"]], tone: "ok" },
    { spec: "", dim: true, figs: [["230/s", "peak orders"], ["7K/s", "writes"], ["60K/s", "reads"], ["9 TB", "per year"]] },
  ],
  arch: [
    { spec: "a0 a1 a2 p0 p1 p2", chips: [["Order API: outbox, return ID", "Restaurant: WebSocket"], ["outbox, return ID", "WebSocket"]] },
    { spec: "p0 p1 p2 k w0 w1 w2 w3 w4", flow: true, chips: [["orders.created · orders.status · payments.process · notifications.send"], ["one topic per event type"]] },
    { spec: "w2:bad k:warn s0 s1 s2", chips: [["payment worker down → its events wait in Kafka"], ["payments wait in Kafka"]], tone: "warn" },
  ],
  dives: [
    { spec: "a0 p0 s0 k", chips: [["order + outbox: one transaction", "publisher polls → Kafka"], ["1 transaction", "poll → Kafka"]], tone: "ok" },
    { spec: "k w2", chips: [["timeout → retry", "same key → same result"], ["retry", "same key"]], tone: "ok" },
    { spec: "k w1 s0", chips: [["A and B both see X free", "FOR UPDATE + version: one wins"], ["both see X", "lock: 1 wins"]], tone: "ok" },
    { spec: "k w0 w2:warn", chips: [["restaurant rejects", "void the authorization", "cancel + notify"], ["rejected", "void auth", "notify"]], tone: "warn" },
    { spec: "a2 p2 k w4 s1", flow: true, chips: [["50K drivers / 3 s", "Redis GEO", "ETA cached 5 s"], ["every 3 s", "Redis GEO", "ETA 5 s"]], tone: "sky" },
    { spec: "a0 p0 s1:warn", chips: [["10 orders/hour per user", "100/min per IP", "1,000/s overall"], ["10/h user", "100/min IP", "1,000/s"]], tone: "warn" },
  ],
  scale: [
    { spec: "p0 p1 p2 s0:warn", figs: [["2,300/s", "peak at 10x"], ["by city", "shard key"]] },
    { spec: "a2:warn w1 w2:warn", chips: [["driver silent > 5 min → reassign", "capture fails after pickup → retry"], ["silent → reassign", "capture → retry"]], tone: "warn" },
    { spec: "p0 s0 w2 a1 w1 w3", chips: [["1 order flow", "2 payments", "3 restaurant", "4 driver", "5 customer"], ["1 order", "2 pay", "3 rest", "4 driver", "5 notify"]], tone: "ok" },
  ],
};
const KICK: Record<string, [string, string]> = {
  ask: ["phases 1–2 · requirements and estimation", "requirements"],
  arch: ["phase 3 · high-level design", "high-level design"],
  dives: ["phase 4 · deep dives", "deep dives"],
  scale: ["phases 5–6 · scale, edge cases, build order", "scale & decide"],
};

function Scene({ variant, step, t, clock, narrow }: SceneProps) {
  const b = BEATS[variant][Math.min(step, BEATS[variant].length - 1)];
  const flow = (k: number) => (clock * 0.4 + k / 3) % 1;
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {KICK[variant][narrow ? 1 : 0]}
      </Txt>
      <Arch spec={b.spec} dim={!!b.dim} narrow={narrow} />
      {b.flow &&
        [0, 1, 2].map((k) =>
          variant === "arch" ? (
            [0, 2, 4].map((w) => <Token key={`${k}${w}`} x={COL.k + WID.k + flow(k) * (COL.w - COL.k - WID.k)} y={mid(`w${w}`)} s={7} tone="lit" />)
          ) : (
            <Token key={k} x={COL.a + WID.a + flow(k) * (COL.p - COL.a - WID.a)} y={mid("a2")} s={7} tone="sky" />
          ),
        )}
      {b.chips && <Chips items={b.chips[narrow ? 1 : 0]} t={t} tone={b.tone} y={b.chips[0].length > 3 && b.chips[0].length !== 5 ? 236 : 254} />}
      {b.figs &&
        b.figs.map(([d, s], i) => {
          const x = (W / b.figs!.length) * (i + 0.5);
          return (
            <g key={d} opacity={seg(t, 0.1 + i * 0.18, 0.4 + i * 0.18)}>
              <Txt x={x} y={268} k="d" tone={i === 0 ? "lit" : undefined}>
                {d}
              </Txt>
              <Txt x={x} y={296} k="s">
                {s}
              </Txt>
            </g>
          );
        })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "ask",
      label: "Ask & estimate",
      steps: [
        { caption: "Design a food delivery order system: customers order, restaurants cook, drivers deliver. 5 million orders a day, peaking at lunch and dinner.", tween: 1400 },
        { caption: "Targets: the restaurant sees an order within 2 seconds, a driver is assigned within 30 seconds of confirmation, locations update every 3 to 5 s.", tween: 1400 },
        { caption: "Stripe authorizes at order time and captures at pickup. Orders are never lost, never charged twice, and a driver never gets two at once.", tween: 1400 },
        { caption: "Estimate: 58 orders/sec average, ~230 at a 4x dinner peak; ~7,000 writes and ~60,000 reads a second; 25 GB a day, about 9 TB a year.", tween: 1800 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "Three APIs: order, restaurant and driver. The Order API validates, writes to a transactional outbox and returns the order ID at once.", tween: 1200 },
        { caption: "Events flow through Kafka to five workers: the order saga, driver matching, payments, notifications and tracking, each consuming on its own.", tween: 1400, loop: true },
        { caption: "State lives in PostgreSQL, Redis and S3. If the payment worker crashes, the others keep going and payment events wait in Kafka.", tween: 1200 },
      ],
    },
    {
      id: "dives",
      label: "Deep dives",
      steps: [
        { caption: "Outbox: an order saved while the Kafka publish fails is never processed. So the order and its outbox row commit in one transaction.", tween: 1200 },
        { caption: "Idempotency: a Stripe call times out and is retried. Without a key that's a second charge; with one, the retry gets the first result.", tween: 1200 },
        { caption: "Driver assignment: orders A and B both see driver X free. A row lock plus a version check lets one win; the other tries its next driver.", tween: 1200 },
        { caption: "The order saga: if the restaurant rejects after payment is authorized, compensate. Void the authorization, cancel the order, notify the customer.", tween: 1200 },
        { caption: "Location: 50K drivers report every 3 seconds. Redis GEO finds nearby drivers, ETAs are cached for 5 s, history is written in batches.", tween: 1200, loop: true },
        { caption: "Rate limits at every layer: 10 orders an hour per user, 100 requests a minute per IP, 1,000 orders a second overall.", tween: 1200 },
      ],
    },
    {
      id: "scale",
      label: "Scale & decide",
      steps: [
        { caption: "At 10x, 50M orders a day and 2,300/sec at peak, shard by city: orders, drivers and restaurants all stay local to one city.", tween: 1200 },
        { caption: "Edge cases: a driver silent over 5 minutes is reassigned; a capture failing after pickup is retried and flagged, never blocking delivery.", tween: 1200 },
        { caption: "Build first: the order flow with its outbox, payments with idempotency, restaurant notification, nearest-driver matching, then customer updates.", tween: 1600 },
      ],
    },
  ],
  Scene,
});
