/**
 * Spotify's play path (side quest 7 · Phase 3 playback flow / Deep Dive 2 multi-layer caching):
 * the Stream Service authorizes once and returns a URL signed for 1 hour; the CDN edge checks the
 * token itself and serves popular tracks from cache (99%+ hit rate) in under 200 ms; a long-tail
 * miss falls back to the GCS origin (100M+ songs); prefetched next tracks play from the device.
 */
import { Box, clamp, defineExplainer, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 276;
type Pt = { x: number; y: number };
const CL = { x: 24, y: 40, w: 124, h: 64 };
const SS = { x: 238, y: 16, w: 124, h: 56 };
const CD = { x: 238, y: 150, w: 124, h: 56 };
const OR = { x: 452, y: 150, w: 124, h: 56 };
const CA = { x: 24, y: 150, w: 124, h: 56 };
const TO_SS: Pt[] = [{ x: 148, y: 56 }, { x: 193, y: 56 }, { x: 193, y: 44 }, { x: 238, y: 44 }];
const TO_CD: Pt[] = [{ x: 148, y: 88 }, { x: 206, y: 88 }, { x: 206, y: 178 }, { x: 238, y: 178 }];
const TO_OR: Pt[] = [{ x: 362, y: 178 }, { x: 452, y: 178 }];
const TO_CA: Pt[] = [{ x: 86, y: 104 }, { x: 86, y: 150 }];
const rev = (p: Pt[]) => [...p].reverse();
const path = (p: Pt[]) => p.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("");

function along(pts: Pt[], p: number): Pt {
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  let d = clamp(p) * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? Math.min(1, d / lens[i]) : 1;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * f, y: pts[i].y + (pts[i + 1].y - pts[i].y) * f };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type Leg = { a: number; b: number; pts: Pt[]; tone: Tone; label: string };
const go = (a: number, b: number, pts: Pt[], tone: Tone, label: string): Leg => ({ a, b, pts, tone, label });
type Frame = { legs: Leg[]; cl: string; clT?: Tone; ss: string; ssT?: Tone; cd: string; cdT?: Tone; or: string; orT?: Tone; ca: string; caT?: Tone; res?: string; resT?: Tone };

function frame(variant: string, step: number, t: number): Frame {
  const after = (x: number) => t >= x;
  const idle = { cl: "tap", ss: "rights · sign", cd: "token check", or: "100M+ songs", ca: "recent tracks" };
  if (variant === "edge") {
    if (step === 0)
      return { ...idle, legs: [go(0, 0.4, TO_SS, "lit", "tap to play: authorize"), go(0.55, 0.95, rev(TO_SS), "ok", "signed URL · expires in 1 hour")], ss: after(0.4) ? "rights checked" : "rights · sign", ssT: t > 0.4 && t < 1 ? "lit" : after(1) ? "ok" : undefined };
    if (step === 1) return { ...idle, cl: "has URL", legs: [go(0, 0.5, TO_CD, "lit", "GET audio + signed token")], cd: after(0.5) ? "token ✓ · cached" : "token check", cdT: after(0.5) ? "ok" : undefined };
    return { ...idle, legs: [go(0, 0.5, rev(TO_CD), "ok", "audio from the edge cache")], cl: after(0.5) ? "playing" : "has URL", clT: after(0.5) ? "ok" : undefined, cd: "token ✓ · cached", cdT: "ok", res: after(0.5) ? "under 200 ms" : undefined, resT: "ok" };
  }
  if (variant === "origin") {
    if (step === 0) return { ...idle, cl: "has URL", legs: [go(0, 0.5, TO_CD, "lit", "GET long-tail track + token")], cd: after(0.5) ? "cache miss" : "token check", cdT: after(0.5) ? "warn" : undefined };
    if (step === 1)
      return {
        ...idle,
        cl: "waiting",
        legs: [go(0, 0.4, TO_OR, "warn", "fall back to the GCS origin"), go(0.5, 0.9, rev(TO_OR), "ok", "audio from origin")],
        cd: "cache miss",
        cdT: "warn",
        or: t > 0.4 && t < 1 ? "serving" : "100M+ songs",
        orT: t > 0.4 ? "lit" : undefined,
      };
    return { ...idle, legs: [go(0, 0.5, rev(TO_CD), "ok", "audio via the edge")], cl: after(0.5) ? "playing" : "waiting", clT: after(0.5) ? "ok" : undefined, cd: "from origin", cdT: "warn", res: after(0.5) ? "first play slower" : undefined, resT: "warn" };
  }
  if (step === 0)
    return {
      ...idle,
      cl: "playing song 1",
      legs: [go(0, 0.3, TO_CD, "sky", "prefetch the next track"), go(0.35, 0.65, rev(TO_CD), "sky", "next track's audio"), go(0.72, 0.95, TO_CA, "sky", "store in the client cache")],
      ca: after(0.95) ? "next track ready" : "recent tracks",
      caT: after(0.95) ? "ok" : undefined,
    };
  return {
    ...idle,
    legs: [go(0, 0.45, rev(TO_CA), "ok", "skip → play from the device")],
    cl: after(0.45) ? "playing next" : "skip!",
    clT: after(0.45) ? "ok" : "lit",
    ca: "next track ready",
    caT: "ok",
    res: after(0.45) ? "no network wait" : undefined,
    resT: "ok",
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = frame(variant, step, t);
  const live = f.legs.filter((l) => t > l.a && t < l.b);
  const msg = live[0];
  const short = (s: string) => (narrow ? s.replace("rights checked", "checked").replace("token ✓ · cached", "cached ✓").replace("playing song 1", "playing").replace("next track ready", "next ready").replace("recent tracks", "recent").replace("rights · sign", "rights") : s);
  return (
    <g>
      <Box x={CL.x} y={CL.y} w={CL.w} h={CL.h} label="Client" sub={short(f.cl)} tone={f.clT} />
      <Box x={SS.x} y={SS.y} w={SS.w} h={SS.h} label={narrow ? "Stream" : "Stream svc"} sub={short(f.ss)} tone={f.ssT} />
      <Box x={CD.x} y={CD.y} w={CD.w} h={CD.h} label="CDN edge" sub={short(f.cd)} tone={f.cdT} />
      <Box x={OR.x} y={OR.y} w={OR.w} h={OR.h} label={narrow ? "Origin" : "GCS origin"} sub={short(f.or)} tone={f.orT} dim={variant !== "origin"} />
      <Box x={CA.x} y={CA.y} w={CA.w} h={CA.h} label={narrow ? "Cache" : "Device cache"} sub={short(f.ca)} tone={f.caT} />
      <Wire d={path(TO_SS)} />
      <Wire d={path(TO_CD)} />
      <Wire d={path(TO_OR)} opacity={variant === "origin" ? 1 : 0.35} />
      <Wire d={path(TO_CA)} />
      <Txt x={300} y={224} k="s" tone="mute">
        {narrow ? "99%+ hits" : "99%+ hit rate for popular"}
      </Txt>
      {live.map((l, i) => {
        const p = along(l.pts, seg(t, l.a, l.b));
        return <Token key={i} x={p.x} y={p.y} s={11} tone={l.tone} />;
      })}
      {msg && (
        <Txt x={24} y={256} k="s" anchor="start" tone={msg.tone}>
          {`→ ${msg.label}`}
        </Txt>
      )}
      <Txt x={W - 24} y={34} k="k" anchor="end" tone="mute">
        {narrow ? "first audio" : "tap → first audio"}
      </Txt>
      <Txt x={W - 24} y={66} anchor="end" tone={f.res ? f.resT : "mute"}>
        {f.res ?? "target < 200 ms"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "edge",
      label: "Popular track",
      steps: [
        { caption: "Tap to play: the Stream Service checks tier, region and licensing, then returns a URL signed for 1 hour.", tween: 2200 },
        { caption: "The client asks the CDN edge, which verifies the token itself: no backend round trip per request.", tween: 1600 },
        { caption: "Popular tracks are always at the edge (99%+ hit rate), so music starts in under 200 ms.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "origin",
      label: "Long-tail track",
      steps: [
        { caption: "An obscure long-tail track: the URL is signed the same way, but this edge hasn't cached it.", tween: 1600 },
        { caption: "The edge falls back to the GCS origin, which holds every one of the 100M+ songs.", tween: 2200 },
        { caption: "The audio streams on, but this first play paid the origin round trip that popular tracks skip.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "prefetch",
      label: "Next in queue",
      steps: [
        { caption: "While a song plays, the playback response's prefetch URLs let the client download the next track.", tween: 2800 },
        { caption: "The user skips. The next track is already in the client cache, so it starts with no network wait.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
