/**
 * Sticky sessions vs a distributed session store (week 1, day 5 · 2.1 / 2.2 / 3.2): Server 2 holds
 * sessions B, E, H in memory; when it dies user B is logged out. With a shared Redis Cluster store
 * any server finds session B, at the price of a network hop (+1-2 ms) and a new dependency.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const USER = { x: 24, y: 130, w: 112, h: 60 };
const LB = { x: 166, y: 130, w: 104, h: 60 };
const SV = [0, 1, 2].map((i) => ({ x: 304, y: 40 + i * 92, w: 148, h: 60 }));
const ST = { x: 470, y: 116, w: 106, h: 88 };
const SESS = ["A · D · G", "B · E · H", "C · F · I"];

type Pt = { x: number; y: number };
const mid = (b: { x: number; y: number; w: number; h: number }, s: "l" | "r") => ({ x: s === "l" ? b.x : b.x + b.w, y: b.y + b.h / 2 });
/** a point along a polyline, each leg taking an equal share of p */
function walk(pts: Pt[], p: number): Pt {
  const legs = pts.length - 1;
  const f = Math.min(legs - 1e-6, Math.max(0, p * legs));
  const i = Math.floor(f);
  return { x: lerp(pts[i].x, pts[i + 1].x, f - i), y: lerp(pts[i].y, pts[i + 1].y, f - i) };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const store = variant === "store";
  const dead = step >= 1 ? (step === 1 ? ease(seg(t, 0.1, 0.5)) >= 1 : true) : false;
  const to = step >= 2 ? 0 : 1; // which server gets user B's request
  const req = step === 0 || step === 2 ? ease(seg(t, 0, 0.9)) : 0;
  const route: Pt[] = [mid(USER, "r"), mid(LB, "l"), mid(LB, "r"), mid(SV[to], "l"), mid(SV[to], "r")];
  if (store) route.push({ x: ST.x, y: ST.y + ST.h / 2 }, mid(SV[to], "r"));
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  if (req > 0 && req < 1) {
    const p = walk(route, req);
    const atStore = store && req > (route.length - 3) / (route.length - 1);
    toks.push({ ...p, tone: atStore ? "sky" : "lit", label: atStore ? "lookup" : "session=B" });
  }
  const done = req >= 1;
  const lost = !store && step === 2 && done;
  const userSub = lost ? "logged out" : "logged in";
  const userTone: Tone = lost ? "bad" : done ? "ok" : undefined;
  const svSub = (i: number) => {
    if (i === 1 && dead) return store ? "DOWN" : narrow ? "DOWN" : "DOWN · B E H lost";
    if (store) return i === to && done && step !== 1 ? "found B ✓" : "stateless";
    if (i === to && step === 2 && done) return narrow ? "no B" : "no session B";
    return SESS[i];
  };
  const svTone = (i: number): Tone => (i === 1 && dead ? "bad" : i === to && (step === 0 || step === 2) && req > 0.5 ? (lost ? "warn" : "ok") : undefined);
  const kicker = store ? (step === 3 ? (narrow ? "+1–2 ms per request" : "the price: +1–2 ms hop per request") : narrow ? "shared session store" : "any server · shared session store") : lost ? (narrow ? "session lost → /login" : "session lost → redirect to /login") : narrow ? "sticky sessions" : "sticky routing · sessions in server memory";
  return (
    <g>
      <Txt x={24} y={28} k="k" anchor="start" tone={lost ? "bad" : store && step === 3 ? "warn" : undefined}>
        {kicker}
      </Txt>
      <Box x={USER.x} y={USER.y} w={USER.w} h={USER.h} label="User B" sub={userSub} tone={userTone} />
      <Wire d={`M${mid(USER, "r").x} ${mid(USER, "r").y}H${LB.x}`} arrow tone={req > 0 && req < 1 ? "lit" : undefined} />
      <Box x={LB.x} y={LB.y} w={LB.w} h={LB.h} label="LB" sub={store ? "any" : narrow ? "sticky" : "B → S2"} />
      {SV.map((s, i) => (
        <g key={i}>
          <Wire d={`M${mid(LB, "r").x} ${mid(LB, "r").y}L${s.x} ${s.y + s.h / 2}`} arrow tone={i === to && req > 0 && req < 1 ? "lit" : i === 1 && dead ? "mute" : undefined} dash={i === 1 && dead} />
          <Box x={s.x} y={s.y} w={s.w} h={s.h} label={`Server ${i + 1}`} sub={svSub(i)} tone={svTone(i)} dim={i === 1 && dead && step >= 2} />
          {store && <Wire d={`M${s.x + s.w} ${s.y + s.h / 2}L${ST.x} ${ST.y + ST.h / 2}`} tone={step === 3 ? "lit" : i === 1 && dead ? "mute" : undefined} dash={i === 1 && dead} />}
        </g>
      ))}
      {store && (
        <g>
          <Box x={ST.x} y={ST.y} w={ST.w} h={ST.h} label="Redis" sub={narrow ? "A–I" : "sessions A–I"} tone={step === 3 ? "lit" : step === 1 ? "ok" : undefined} />
          <Txt x={ST.x + ST.w / 2} y={ST.y + ST.h + 18} k="s">
            {narrow ? "cluster" : "Redis Cluster"}
          </Txt>
          {step === 3 && (
            <Txt x={ST.x + ST.w / 2} y={ST.y - 12} k="s" tone="warn">
              {narrow ? "dependency" : "new dependency"}
            </Txt>
          )}
        </g>
      )}
      {!store && step >= 1 && (
        <Txt x={SV[1].x + SV[1].w + 12} y={SV[1].y + SV[1].h / 2 + 5} k="t" tone="bad" anchor="start">
          ✕
        </Txt>
      )}
      {store && step >= 1 && (
        <Txt x={SV[1].x + SV[1].w / 2} y={SV[1].y - 8} k="s" tone="bad">
          ✕
        </Txt>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} label={narrow ? undefined : k.label} />
      ))}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "sticky",
      label: "Sticky sessions",
      steps: [
        { caption: "Sticky routing: user B's requests always go to Server 2, which keeps session B in its memory.", tween: 1800, ms: 2600 },
        { caption: "Server 2 dies, and sessions B, E and H die with it.", tween: 1200, ms: 2600 },
        { caption: "The LB reroutes user B to Server 1, which has no session B: the user is logged out.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "store",
      label: "Session store",
      steps: [
        { caption: "Any server can take any request. Each looks session B up in a shared Redis Cluster store.", tween: 2400, ms: 2600 },
        { caption: "Server 2 dies, but no sessions are lost: they live in the store, not on the servers.", tween: 1200, ms: 2600 },
        { caption: "User B's next request lands on Server 1, which finds session B in the store. Still logged in.", tween: 2400, ms: 3000 },
        { caption: "The price: a network hop on every request (+1–2 ms) and a new dependency to keep available.", tween: 800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
