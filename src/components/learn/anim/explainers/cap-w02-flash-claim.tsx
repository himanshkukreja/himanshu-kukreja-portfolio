/**
 * Week 2 capstone (MegaMart flash sale, Phase 4 · the claim flow): rate limit, idempotency check and
 * the atomic Lua claim (DECR inventory, SET claim EX 180, ZADD expiry + 60 s grace), then
 * claim_events; two users racing for the last unit; and a lost response retried, then a claim that
 * expires and returns its unit to the pool.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 312;
const UA = { x: 20, y: 52, w: 110, h: 52 };
const US = { x: 20, y: 90, w: 110, h: 52 };
const UB = { x: 20, y: 128, w: 110, h: 52 };
const API = { x: 156, y: 86, w: 124, h: 60 };
const KF = { x: 156, y: 200, w: 124, h: 48 };
const RD = { x: 296, y: 40, w: 284, h: 208 };
const ROW = (i: number) => RD.y + 62 + i * 40;

type P = { x: number; y: number };
const uA: P = { x: UA.x + UA.w, y: UA.y + UA.h / 2 };
const uS: P = { x: US.x + US.w, y: US.y + US.h / 2 };
const uB: P = { x: UB.x + UB.w, y: UB.y + UB.h / 2 };
const apiL: P = { x: API.x, y: API.y + API.h / 2 };
const apiR: P = { x: API.x + API.w, y: API.y + API.h / 2 };
const apiB: P = { x: API.x + API.w / 2, y: API.y + API.h };
const kfT: P = { x: KF.x + KF.w / 2, y: KF.y };
const rdL: P = { x: RD.x, y: API.y + API.h / 2 };

type Leg = { a: number; b: number; pts: P[]; tone: Tone };
const ELB = API.x - 14;
/** user ↔ API legs bend at the elbow x, like their wires */
const bend = (from: P, to: P): P[] => (from.y === to.y || from.x === to.x ? [from, to] : [from, { x: ELB, y: from.y }, { x: ELB, y: to.y }, to]);
const leg = (a: number, b: number, from: P, to: P, tone: Tone = "lit"): Leg => ({ a, b, pts: bend(from, to), tone });
function along(pts: P[], p: number): P {
  const lens = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let d = p * lens.reduce((s, x) => s + x, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type Cell = { v: string; tone?: Tone };
type Frame = {
  legs: Leg[];
  rows: Cell[]; // rate limit, claim, inventory, expiry
  hot: number[]; // highlighted rows
  users: [Tone, Tone];
  userSub: [string, string];
  api?: string;
  kafka?: Tone;
  clock: string;
  resp: Cell;
  two: boolean;
};

const EMPTY: Cell = { v: "—", tone: "mute" };

function claim(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const base: Frame = {
    legs: [],
    rows: [{ v: "1" }, EMPTY, { v: "9,524" }, EMPTY],
    hot: [],
    users: [undefined, undefined],
    userSub: ["usr_456", ""],
    clock: "10:00:00",
    resp: { v: "—", tone: "mute" },
    two: false,
  };
  if (step === 0)
    return {
      ...base,
      legs: [leg(0, 0.3, uS, apiL), leg(0.32, 0.6, apiR, rdL)],
      rows: [d(0.6) ? { v: "1", tone: "ok" } : { v: "0" }, EMPTY, { v: "9,524" }, EMPTY],
      hot: d(0.6) ? [0] : [],
      api: "rate limit",
    };
  if (step === 1) return { ...base, legs: [leg(0, 0.4, apiR, rdL)], rows: [{ v: "1" }, d(0.45) ? { v: "absent", tone: "ok" } : EMPTY, { v: "9,524" }, EMPTY], hot: d(0.45) ? [1] : [], api: "idempotency" };
  const after: Cell[] = [{ v: "1" }, { v: "TTL 180 s", tone: "ok" }, { v: "9,523", tone: "ok" }, { v: "+240 s", tone: "ok" }];
  if (step === 2) {
    const rows: Cell[] = [{ v: "1" }, d(0.6) ? after[1] : EMPTY, d(0.3) ? after[2] : { v: "9,524" }, d(0.85) ? after[3] : EMPTY];
    return { ...base, legs: [leg(0, 0.25, apiR, rdL)], rows, hot: [d(0.85) ? 3 : d(0.6) ? 1 : 2], api: "Lua script" };
  }
  return {
    ...base,
    legs: [leg(0, 0.4, apiB, kfT, "sky"), leg(0.3, 0.75, apiL, uS, "ok")],
    rows: after,
    users: [d(0.75) ? "ok" : undefined, undefined],
    userSub: [d(0.75) ? "claimed" : "usr_456", ""],
    api: "respond",
    kafka: d(0.4) ? "ok" : "sky",
    resp: d(0.75) ? { v: "clm_abc123 · 180 s to pay", tone: "ok" } : { v: "—", tone: "mute" },
  };
}

function last(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const base: Frame = {
    legs: [],
    rows: [{ v: "1" }, EMPTY, { v: "1", tone: "warn" }, EMPTY],
    hot: [2],
    users: [undefined, undefined],
    userSub: ["claim", "claim"],
    clock: "10:00:29",
    resp: { v: "—", tone: "mute" },
    two: true,
  };
  if (step === 0) return { ...base, legs: [leg(0, 0.45, uA, apiL), leg(0.05, 0.5, uB, apiL), leg(0.55, 0.85, apiR, rdL), leg(0.6, 0.9, apiR, rdL, "warn")], api: "2 scripts", resp: { v: "same instant", tone: "warn" } };
  if (step === 1)
    return {
      ...base,
      legs: [leg(0.55, 0.9, apiL, uA, "ok")],
      rows: [{ v: "1" }, d(0.4) ? { v: "A · 180 s", tone: "ok" } : EMPTY, d(0.2) ? { v: "0", tone: "ok" } : { v: "1", tone: "warn" }, d(0.4) ? { v: "A", tone: "ok" } : EMPTY],
      hot: [d(0.4) ? 1 : 2],
      users: [d(0.9) ? "ok" : "lit", undefined],
      userSub: [d(0.9) ? "claimed" : "running", "waiting"],
      api: "A's script",
      resp: { v: "A: DECR → 0", tone: "ok" },
    };
  const dec = d(0.2) && !d(0.55);
  return {
    ...base,
    legs: [leg(0.6, 0.92, apiL, uB, "bad")],
    rows: [{ v: "1" }, { v: "A · 180 s", tone: "ok" }, dec ? { v: "-1", tone: "bad" } : { v: "0", tone: d(0.55) ? "ok" : undefined }, { v: "A", tone: "ok" }],
    hot: [2],
    users: ["ok", d(0.92) ? "bad" : "lit"],
    userSub: ["claimed", d(0.92) ? "sold out" : "running"],
    api: "B's script",
    resp: d(0.55) ? { v: "B: -1 → INCR → 0 · sold out", tone: "bad" } : { v: "B: DECR → -1", tone: "bad" },
  };
}

function retry(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const held: Cell[] = [{ v: "2" }, { v: "TTL 180 s", tone: "ok" }, { v: "9,523" }, { v: "+240 s" }];
  const base: Frame = { legs: [], rows: held, hot: [], users: [undefined, undefined], userSub: ["usr_456", ""], clock: "10:00:05", resp: { v: "—", tone: "mute" }, two: false };
  if (step === 0)
    return {
      ...base,
      legs: [leg(0, 0.25, uS, apiL, "warn"), leg(0.27, 0.47, apiR, rdL, "warn"), leg(0.5, 0.7, rdL, apiR, "ok"), leg(0.72, 0.95, apiL, uS, "ok")],
      hot: d(0.47) ? [1] : [],
      users: [d(0.95) ? "ok" : "warn", undefined],
      userSub: [d(0.95) ? "same claim" : "retry", ""],
      api: "key exists",
      resp: d(0.95) ? { v: "clm_abc123 again · no DECR", tone: "ok" } : { v: "—", tone: "mute" },
    };
  if (step === 1)
    return {
      ...base,
      rows: [{ v: "2" }, d(0.5) ? { v: "expired", tone: "mute" } : held[1], { v: "9,523" }, { v: "+240 s", tone: "warn" }],
      hot: [d(0.5) ? 3 : 1],
      userSub: ["no checkout", ""],
      clock: d(0.5) ? "10:03:00" : "10:02:59",
      api: "waiting",
      resp: { v: "unit still held (grace)", tone: "warn" },
    };
  return {
    ...base,
    rows: [{ v: "2" }, { v: "expired", tone: "mute" }, d(0.6) ? { v: "9,524", tone: "ok" } : { v: "9,523" }, d(0.35) ? { v: "ZREM'd", tone: "ok" } : { v: "+240 s", tone: "warn" }],
    hot: [d(0.6) ? 2 : 3],
    userSub: ["no checkout", ""],
    clock: "10:04:00",
    api: "expiry worker",
    resp: d(0.6) ? { v: "unit back in the pool", tone: "ok" } : { v: "—", tone: "mute" },
  };
}

const SHORT: Record<string, string> = { "no checkout": "unpaid", "expiry worker": "expiry job", "idempotency": "idempotent" };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "last" ? last(step, t) : variant === "retry" ? retry(step, t) : claim(step, t);
  const sh = (x: string | undefined) => (narrow && x ? SHORT[x] || x : x);
  const keys = narrow ? ["rate_limit", "claim key", "inventory", "expiry zset"] : ["rate_limit:{user}:{min}", "claim:{sale}:{user}", "inventory:{sale}", "claims:expiry:{sale}"];
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const resp = narrow && f.resp.v.length > 24 ? f.resp.v.split(" · ")[0] : f.resp.v;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">
        {narrow ? "sale_xyz" : "sale_xyz · 10,000 units"}
      </Txt>
      <Txt x={W - 20} y={30} k="s" anchor="end">
        {f.clock}
      </Txt>
      {f.two ? (
        <>
          <Wire d={`M${uA.x} ${uA.y}H${ELB}V${apiL.y}H${apiL.x}`} />
          <Wire d={`M${uB.x} ${uB.y}H${ELB}V${apiL.y}`} />
        </>
      ) : (
        <Wire d={`M${uS.x} ${uS.y}H${apiL.x}`} />
      )}
      <Wire d={`M${apiR.x} ${apiR.y}H${rdL.x}`} />
      <Wire d={`M${apiB.x} ${apiB.y}V${kfT.y}`} />
      <Box x={UA.x} y={f.two ? UA.y : US.y} w={UA.w} h={UA.h} label={f.two ? "User A" : "User"} sub={sh(f.userSub[0])} tone={f.users[0]} />
      {f.two && <Box x={UB.x} y={UB.y} w={UB.w} h={UB.h} label="User B" sub={f.userSub[1]} tone={f.users[1]} />}
      <Box x={API.x} y={API.y} w={API.w} h={API.h} label={narrow ? "Claim" : "Claim API"} sub={sh(f.api)} tone={f.api ? "lit" : undefined} />
      <Box x={KF.x} y={KF.y} w={KF.w} h={KF.h} label="Kafka" sub={narrow ? "events" : "claim_events"} tone={f.kafka} />
      <rect className="ax-box" x={RD.x} y={RD.y} width={RD.w} height={RD.h} />
      <Txt x={RD.x + 12} y={RD.y + 24} k="k" anchor="start">
        {narrow ? "Redis" : "Redis · atomic Lua"}
      </Txt>
      {keys.map((k, i) => {
        const y = ROW(i);
        const c = f.rows[i];
        const hot = f.hot.includes(i);
        return (
          <g key={k}>
            {hot && <rect className="fc-hot" x={RD.x + 6} y={y - 24} width={RD.w - 12} height={34} />}
            <Txt x={RD.x + 14} y={y} k="s" anchor="start">
              {k}
            </Txt>
            <Txt x={RD.x + RD.w - 12} y={y} anchor="end" tone={c.tone}>
              {c.v}
            </Txt>
          </g>
        );
      })}
      {live.map((l, i) => {
        const q = along(l.pts, seg(t, l.a, l.b));
        return <Token key={i} x={q.x} y={q.y} s={11} tone={l.tone} />;
      })}
      <Txt x={20} y={H - 38} k="k" anchor="start" tone="mute">
        response
      </Txt>
      <Txt x={20} y={H - 12} anchor="start" tone={f.resp.tone}>
        {resp}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.fc-hot{fill:none;stroke:var(--ax-accent);stroke-width:1.5}`,
  variants: [
    {
      id: "claim",
      label: "One claim",
      steps: [
        { caption: "Rate limit first: INCRBY rate_limit:{user_id}:{minute} returns 1. More than 10 attempts a minute gets 429.", tween: 1600 },
        { caption: "Idempotency check: claim:{sale_id}:{user_id} doesn't exist, so this is a new claim.", tween: 1200 },
        { caption: "One Lua script, atomically: DECR inventory to 9,523, SET the claim with TTL 180 s, ZADD its expiry.", tween: 2000 },
        { caption: "Publish claimed to claim_events and return clm_abc123: the user has 180 seconds to check out.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "last",
      label: "Last unit",
      steps: [
        { caption: "One unit left. Users A and B claim at the same instant; Redis runs their scripts one at a time.", tween: 1800 },
        { caption: "A's script runs first: DECR returns 0, not negative, so A's claim is stored.", tween: 1800 },
        { caption: "B's script: DECR returns -1, so it INCRs the counter back to 0 and answers sold out.", tween: 2200, ms: 3600 },
      ],
    },
    {
      id: "retry",
      label: "Retry, expiry",
      steps: [
        { caption: "The response is lost and the app retries. The claim key exists, so the stored claim returns: no second DECR.", tween: 2400 },
        { caption: "No checkout: at 180 s the claim key's TTL deletes it. Its expiry score adds 60 s of grace.", tween: 1600 },
        { caption: "At 240 s the expiry worker's script ZREMs the entry and INCRs inventory: the unit is back for others.", tween: 1800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
