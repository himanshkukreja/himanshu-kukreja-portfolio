/**
 * Week 9 capstone (multi-tenant SaaS · Deep Dives 1 and 2): one search from acme.docplatform.com.
 * The tenant comes from the verified JWT and the subdomain must match; the tenant's config becomes
 * an immutable TenantContext; the plan's quota is checked (Standard: 100 search calls/minute); the
 * repository adds tenant_id and SET LOCAL app.current_tenant_id lets row-level security filter every
 * query; search filters by tenant_id. Blocked: a mismatched token (403), the 101st search in a
 * minute, and a query that forgot its tenant filter (RLS still filters).
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 316;
const CL = { x: 20, y: 44, w: 110, h: 56 };
const GW = { x: 150, y: 44, w: 120, h: 56 };
const SV = { x: 290, y: 44, w: 130, h: 56 };
const PG = { x: 450, y: 44, w: 130, h: 56 };
const ES = { x: 450, y: 124, w: 130, h: 56 };
const CTX = { x: 20, y: 128, w: 250, h: 120 };
const QT = { x: 290, y: 128, w: 130, h: 120 };

type P = { x: number; y: number };
const r = (b: typeof CL): P => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const l = (b: typeof CL): P => ({ x: b.x, y: b.y + b.h / 2 });

type Leg = { a: number; b: number; pts: P[]; tone: Tone };
type Frame = {
  legs: Leg[];
  tones: Record<string, Tone>;
  subs: Record<string, string>;
  ctx: number; // context fields shown
  quota?: { n: number; tone: Tone };
  note: string;
  noteTone?: Tone;
  x?: P;
};

const pt = (a: number, b: number, pts: P[], tone: Tone = "lit"): Leg => ({ a, b, pts, tone });
const esL: P = { x: ES.x, y: ES.y + ES.h / 2 };
const toEs: P[] = [r(SV), { x: SV.x + SV.w + 15, y: r(SV).y }, { x: SV.x + SV.w + 15, y: esL.y }, esL];

function request(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const subs = { cl: "acme.docplat…", gw: "JWT", sv: "search", pg: "RLS", es: "shared index" };
  if (step === 0)
    return {
      legs: [pt(0, 0.4, [r(CL), l(GW)])],
      tones: { gw: d(0.4) ? "ok" : "lit" },
      subs: { ...subs, gw: d(0.4) ? "acme = acme ✓" : "verifying" },
      ctx: 0,
      note: d(0.5) ? "tenant from the token, subdomain agrees" : "\"contract 2024\"",
      noteTone: d(0.5) ? "ok" : undefined,
    };
  if (step === 1)
    return {
      legs: [],
      tones: { gw: "ok", ctx: "lit", qt: d(0.6) ? "ok" : "lit" },
      subs: { ...subs, gw: "acme ✓" },
      ctx: Math.round(seg(t, 0, 0.5) * 4),
      quota: { n: d(0.6) ? 38 : 37, tone: "ok" },
      note: "immutable context · within quota",
      noteTone: "ok",
    };
  if (step === 2)
    return {
      legs: [pt(0, 0.3, [r(GW), l(SV)]), pt(0.35, 0.65, [r(SV), l(PG)])],
      tones: { gw: "ok", sv: "lit", pg: d(0.65) ? "ok" : undefined, ctx: "ok", qt: "ok" },
      subs: { ...subs, gw: "acme ✓", sv: "tenant_id = acme", pg: d(0.65) ? "acme rows only" : "SET LOCAL" },
      ctx: 4,
      quota: { n: 38, tone: "ok" },
      note: "app filter + row-level security",
      noteTone: "lit",
    };
  return {
    legs: [pt(0, 0.35, toEs), pt(0.6, 0.95, [l(SV), r(CL)], "ok")],
    tones: { gw: "ok", sv: "lit", pg: "ok", es: d(0.35) ? "ok" : undefined, ctx: "ok", qt: "ok", cl: d(0.95) ? "ok" : undefined },
    subs: { ...subs, gw: "acme ✓", sv: "+ permissions", pg: "acme rows only", es: d(0.35) ? "tenant_id filter" : "shared index" },
    ctx: 4,
    quota: { n: 38, tone: "ok" },
    note: "Enterprise tenants get their own index",
    noteTone: "lit",
  };
}

function blocked(step: number, t: number): Frame {
  const d = (x: number) => t >= x;
  const subs = { cl: "acme.docplat…", gw: "JWT", sv: "search", pg: "RLS", es: "shared index" };
  if (step === 0)
    return {
      legs: [pt(0, 0.4, [r(CL), l(GW)], "warn")],
      tones: { cl: d(0.5) ? "bad" : undefined, gw: d(0.4) ? "bad" : "lit" },
      subs: { ...subs, cl: d(0.5) ? "403" : "token: beta", gw: d(0.4) ? "beta ≠ acme" : "verifying" },
      ctx: 0,
      note: d(0.5) ? "Tenant mismatch: 403, no data touched" : "token for tenant beta",
      noteTone: d(0.5) ? "bad" : "warn",
      x: d(0.4) ? { x: GW.x + GW.w + 10, y: r(GW).y } : undefined,
    };
  if (step === 1)
    return {
      legs: [pt(0, 0.4, [r(CL), l(GW)])],
      tones: { gw: "ok", ctx: "ok", qt: d(0.5) ? "bad" : "lit", cl: d(0.8) ? "bad" : undefined },
      subs: { ...subs, gw: "acme ✓", cl: d(0.8) ? "retry later" : "search #101" },
      ctx: 4,
      quota: { n: 100, tone: d(0.5) ? "bad" : "warn" },
      note: d(0.5) ? "over quota: retry after the window resets" : "101st search this minute",
      noteTone: d(0.5) ? "bad" : "warn",
    };
  return {
    legs: [pt(0, 0.4, [r(SV), l(PG)], "warn")],
    tones: { gw: "ok", sv: "warn", pg: d(0.45) ? "ok" : "lit", ctx: "ok", qt: "ok" },
    subs: { ...subs, gw: "acme ✓", sv: "bug: no filter", pg: d(0.45) ? "acme rows only" : "SELECT *" },
    ctx: 4,
    quota: { n: 12, tone: "ok" },
    note: "RLS filters even raw SQL",
    noteTone: "ok",
  };
}

function along(pts: P[], q: number): P {
  const lens = pts.slice(1).map((b, i) => Math.abs(b.x - pts[i].x) + Math.abs(b.y - pts[i].y));
  let dd = q * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (dd <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, dd / lens[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, k), y: lerp(pts[i].y, pts[i + 1].y, k) };
    }
    dd -= lens[i];
  }
  return pts[pts.length - 1];
}

const FIELDS = [
  ["tenant_id", "acme"],
  ["plan", "standard"],
  ["isolation", "shared + RLS"],
  ["region", "eu"],
];

function Scene({ variant, step, t, narrow }: SceneProps) {
  const f = variant === "blocked" ? blocked(step, t) : request(step, t);
  const live = f.legs.filter((g) => t > g.a && t < g.b);
  const sub = (k: string) => {
    const s = f.subs[k];
    if (!narrow) return s;
    return ({ "acme.docplat…": "acme", "acme = acme ✓": "match ✓", "tenant_id = acme": "+ tenant", "acme rows only": "acme only", "tenant_id filter": "filtered", "+ permissions": "+ perms", "shared index": "shared", "beta ≠ acme": "mismatch", "token: beta": "beta", "search #101": "#101", "retry later": "retry", "bug: no filter": "no filter", "SET LOCAL": "SET LOCAL", verifying: "verify…" } as Record<string, string>)[s] ?? s;
  };
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "acme · search" : "acme.docplatform.com · search \"contract 2024\""}
      </Txt>
      <Wire d={`M${r(CL).x} ${r(CL).y}H${GW.x}`} />
      <Wire d={`M${r(GW).x} ${r(GW).y}H${SV.x}`} />
      <Wire d={`M${r(SV).x} ${r(SV).y}H${PG.x}`} />
      <Wire d={`M${SV.x + SV.w + 15} ${r(SV).y}V${esL.y}H${ES.x}`} />
      <Wire d={`M${GW.x + GW.w / 2} ${GW.y + GW.h}V${CTX.y}`} dash />
      <Wire d={`M${SV.x + SV.w / 2} ${SV.y + SV.h}V${QT.y}`} dash />
      <Box x={CL.x} y={CL.y} w={CL.w} h={CL.h} label="Client" sub={sub("cl")} tone={f.tones.cl} />
      <Box x={GW.x} y={GW.y} w={GW.w} h={GW.h} label="Gateway" sub={sub("gw")} tone={f.tones.gw} />
      <Box x={SV.x} y={SV.y} w={SV.w} h={SV.h} label="Service" sub={sub("sv")} tone={f.tones.sv} />
      <Box x={PG.x} y={PG.y} w={PG.w} h={PG.h} label={narrow ? "Postgres" : "PostgreSQL"} sub={sub("pg")} tone={f.tones.pg} />
      <Box x={ES.x} y={ES.y} w={ES.w} h={ES.h} label="Search" sub={sub("es")} tone={f.tones.es} />
      <rect className={`ax-box ${f.tones.ctx || ""}`} x={CTX.x} y={CTX.y} width={CTX.w} height={CTX.h} />
      <Txt x={CTX.x + 12} y={CTX.y + 22} k="k" anchor="start" tone={f.ctx ? undefined : "mute"}>
        TenantContext
      </Txt>
      {FIELDS.slice(0, f.ctx).map(([k, v], i) => (
        <g key={k}>
          <Txt x={CTX.x + 12} y={CTX.y + 48 + i * 22} k="s" anchor="start">
            {k}
          </Txt>
          <Txt x={CTX.x + CTX.w - 12} y={CTX.y + 48 + i * 22} k="s" anchor="end" tone="ok">
            {narrow && v === "shared + RLS" ? "shared" : v}
          </Txt>
        </g>
      ))}
      <rect className={`ax-box ${f.tones.qt || ""}`} x={QT.x} y={QT.y} width={QT.w} height={QT.h} />
      <Txt x={QT.x + 12} y={QT.y + 22} k="k" anchor="start" tone={f.quota ? undefined : "mute"}>
        quota
      </Txt>
      {f.quota && (
        <g>
          <Txt x={QT.x + 12} y={QT.y + 60} anchor="start" tone={f.quota.tone}>
            {`${f.quota.n} / 100`}
          </Txt>
          <Meter x={QT.x + 12} y={QT.y + 74} w={QT.w - 24} h={8} value={f.quota.n} max={100} tone={f.quota.tone} />
          <Txt x={QT.x + 12} y={QT.y + 104} k="s" anchor="start">
            {narrow ? "per min" : "searches/min"}
          </Txt>
        </g>
      )}
      {live.map((g, i) => {
        const q = along(g.pts, seg(t, g.a, g.b));
        return <Token key={i} x={q.x} y={q.y} s={11} tone={g.tone} />;
      })}
      {f.x && <path className="tr-x" d={`M${f.x.x} ${f.x.y - 7}l14 14m0 -14l-14 14`} />}
      <Txt x={20} y={H - 16} anchor="start" tone={f.noteTone}>
        {f.note}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.tr-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "request",
      label: "One request",
      steps: [
        { caption: "A search from acme.docplatform.com. The tenant comes from the verified JWT; the subdomain must match it.", tween: 1400 },
        { caption: "acme's config becomes an immutable TenantContext. Its quota is checked: Standard allows 100 searches a minute.", tween: 1600 },
        { caption: "The repository adds tenant_id = acme, and SET LOCAL app.current_tenant_id lets RLS filter every row.", tween: 1600 },
        { caption: "Search filters the shared index by tenant_id; Enterprise tenants get their own. Results are permission-checked.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "blocked",
      label: "Blocked",
      steps: [
        { caption: "A token for tenant beta on acme's subdomain: Tenant mismatch, 403, before any data is touched.", tween: 1400 },
        { caption: "acme's 101st search this minute fails the quota check and is told to retry when the window resets.", tween: 1400 },
        { caption: "A buggy query forgets its tenant filter. RLS still returns only acme's rows: even raw SQL is filtered.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
