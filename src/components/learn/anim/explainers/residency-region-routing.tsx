/**
 * Data residency by tenant (week 9, day 3 · 2.1–2.2 / 4.1–4.2): an EU tenant's upload lands on a US
 * app server, get_tenant_region resolves eu (cache key tenant_region:<id>, else the tenants table)
 * and the file goes to eu-central-1; only metadata is global. A migration that forgets the cache key
 * keeps routing to the US for up to the 1-hour TTL.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const GC = { x: 176, y: 44, w: 230, h: 62 };
const APP = { x: 24, y: 158, w: 134, h: 62 };
const REG = [
  { id: "us-east-1", n: "US", y: 118 },
  { id: "eu-central-1", n: "EU", y: 186 },
  { id: "ap-southeast-1", n: "APAC", y: 254 },
];
const RX = 428;
const RW = 148;
const RH = 52;
const regMid = (i: number) => REG[i].y + RH / 2;
const route = (i: number) => `M${APP.x + APP.w} ${APP.y + APP.h / 2}C${APP.x + APP.w + 90} ${APP.y + APP.h / 2} ${RX - 90} ${regMid(i)} ${RX} ${regMid(i)}`;
const pt = (i: number, p: number) => {
  // point along the cubic route (same control points as route())
  const x0 = APP.x + APP.w;
  const y0 = APP.y + APP.h / 2;
  const c1 = { x: x0 + 90, y: y0 };
  const c2 = { x: RX - 90, y: regMid(i) };
  const e = { x: RX, y: regMid(i) };
  const u = 1 - p;
  return {
    x: u * u * u * x0 + 3 * u * u * p * c1.x + 3 * u * p * p * c2.x + p * p * p * e.x,
    y: u * u * u * y0 + 3 * u * u * p * c1.y + 3 * u * p * p * c2.y + p * p * p * e.y,
  };
};

function Regions({ narrow, tones, subs }: { narrow: boolean; tones: Tone[]; subs: string[] }) {
  return (
    <g>
      {REG.map((r, i) => (
        <Box key={r.id} x={RX} y={r.y} w={RW} h={RH} label={narrow ? r.n : r.id} sub={subs[i]} tone={tones[i]} />
      ))}
    </g>
  );
}

function Control({ narrow, tone, sub }: { narrow: boolean; tone?: Tone; sub: string }) {
  return <Box x={GC.x} y={GC.y} w={GC.w} h={GC.h} label={narrow ? "Control plane" : "Global control plane"} sub={sub} tone={tone} />;
}

function Chip({ text, tone, opacity }: { text: string; tone?: Tone; opacity: number }) {
  return (
    <g opacity={opacity}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={GC.x} y={GC.y + GC.h + 10} width={GC.w} height={28} />
      <Txt x={GC.x + GC.w / 2} y={GC.y + GC.h + 29} k="s" tone={tone}>
        {text}
      </Txt>
    </g>
  );
}

const lookupWire = `M${APP.x + APP.w / 2} ${APP.y}V${GC.y + GC.h / 2}H${GC.x}`;

function Route({ step, t, narrow }: SceneProps) {
  const arrive = step === 0 ? seg(t, 0.1, 0.8) : 1;
  const look = step === 1 ? seg(t, 0.1, 0.6) : step > 1 ? 1 : 0;
  const go = step === 2 ? seg(t, 0.1, 0.8) : step > 2 ? 1 : 0;
  const tok = go > 0 ? pt(1, go) : { x: lerp(-10, APP.x - 9, arrive), y: APP.y + APP.h / 2 };
  const meta = step === 3;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "Tenant B (EU) · user in US" : "Tenant B (EU) · employee travelling in the US"}
      </Txt>
      <Control narrow={narrow} tone={meta ? "lit" : step === 1 ? "sky" : undefined} sub={meta ? (narrow ? "registry · config" : "registry · config · routing") : narrow ? "metadata" : "metadata only"} />
      <Wire d={lookupWire} tone={step === 1 ? "lit" : undefined} dash opacity={step >= 1 ? 1 : 0.35} arrow={step === 1} />
      <Chip text={narrow ? "B → eu" : "tenant_region:B → eu"} tone="sky" opacity={look} />
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label={narrow ? "App" : "App server"} sub="us-east-1" tone={step === 0 ? "lit" : undefined} />
      <path className="rr-route" d={route(0)} opacity={0.35} />
      <path className={`rr-route${go > 0 ? " lit" : ""}`} d={route(1)} />
      <path className="rr-route" d={route(2)} opacity={0.35} />
      <Regions
        narrow={narrow}
        tones={[undefined, go >= 1 ? "ok" : undefined, undefined]}
        subs={meta ? ["personal data", "personal data", "personal data"].map((s) => (narrow ? "data" : s)) : ["", go >= 1 ? (narrow ? "file ✓" : "file stored ✓") : "", ""]}
      />
      {step < 3 && <Token x={tok.x} y={tok.y} s={12} tone="lit" opacity={go >= 1 ? 0 : 1} />}
      {step >= 2 && (
        <Txt x={24} y={H - 14} k="s" anchor="start" tone="ok" opacity={go}>
          {narrow ? "s3://data-eu-example/tenants/B/…" : "s3://data-eu-example/tenants/B/… · not the US bucket"}
        </Txt>
      )}
    </g>
  );
}

function Stale({ step, t, narrow }: SceneProps) {
  const fixed = step === 2 ? seg(t, 0.15, 0.45) >= 1 : false;
  const go = step === 1 ? seg(t, 0.2, 0.85) : step === 2 ? seg(t, 0.5, 0.95) : 0;
  const to = step === 2 ? 1 : 0;
  const tok = pt(to, go);
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 2 ? "ok" : "warn"}>
        {step === 0 ? (narrow ? "migrate B: US → EU" : "migrate Tenant B: US → EU") : step === 1 ? (narrow ? "cache hit · stale" : "cache hit · stale for up to 1 hour") : narrow ? "key deleted · re-read" : "assign_region deletes the key"}
      </Txt>
      <Control narrow={narrow} tone={step === 0 ? "sky" : undefined} sub={narrow ? "tenants: eu" : "tenants.data_region = eu"} />
      <Wire d={lookupWire} dash tone={step >= 1 ? "lit" : undefined} opacity={step >= 1 ? 1 : 0.35} />
      <Chip
        text={fixed ? (narrow ? "B → eu (fresh)" : "tenant_region:B → eu ✓") : narrow ? "B → us · stale" : "tenant_region:B → us · 1 h"}
        tone={fixed ? "ok" : step === 1 ? "bad" : "warn"}
        opacity={1}
      />
      <Box x={APP.x} y={APP.y} w={APP.w} h={APP.h} label={narrow ? "App" : "App server"} sub={narrow ? "router" : "DB router"} />
      <path className={`rr-route${step === 1 ? " bad" : ""}`} d={route(0)} opacity={step === 1 ? 1 : 0.35} />
      <path className={`rr-route${step === 2 ? " ok" : ""}`} d={route(1)} opacity={step === 2 ? 1 : 0.6} />
      <path className="rr-route" d={route(2)} opacity={0.35} />
      {step === 0 && <path className="rr-move" d={`M${RX + RW / 2} ${REG[0].y + RH}V${REG[1].y}`} />}
      <Regions
        narrow={narrow}
        tones={[step === 1 ? "bad" : undefined, step === 2 && go >= 1 ? "ok" : step === 0 ? "sky" : undefined, undefined]}
        subs={[step === 0 ? (narrow ? "old" : "old copy") : step === 1 ? (narrow ? "hit ✗" : "still hit ✗") : "", step === 0 ? (narrow ? "new home" : "data migrated") : step === 2 && go >= 1 ? (narrow ? "hit ✓" : "routed ✓") : "", ""]}
      />
      {go > 0 && go < 1 && <Token x={tok.x} y={tok.y} s={12} tone={step === 1 ? "bad" : "ok"} />}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "stale" ? <Stale {...p} /> : <Route {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.rr-route{fill:none;stroke:var(--ax-line);stroke-width:1.5}.rr-route.lit{stroke:var(--ax-accent);stroke-width:2.5}.rr-route.bad{stroke:var(--ax-bad);stroke-width:2.5}.rr-route.ok{stroke:var(--ax-ok);stroke-width:2.5}
.rr-move{fill:none;stroke:var(--ax-sky);stroke-width:2;stroke-dasharray:4 4}`,
  variants: [
    {
      id: "route",
      label: "Routing",
      steps: [
        { caption: "An EU tenant's employee, travelling in the US, uploads a file. The request lands on a US app server.", tween: 1400, ms: 2800 },
        { caption: "The router looks up the tenant's region: the tenant_region cache key first, else the tenants table. Answer: eu.", tween: 1400, ms: 3200 },
        { caption: "The file goes to the eu-central-1 bucket, wherever the request landed. Residency follows the tenant, not the user.", tween: 1600, ms: 3200 },
        { caption: "Only metadata stays global: tenant registry, configuration, routing rules. Personal data, backups included, stays in the tenant's region.", ms: 3600 },
      ],
    },
    {
      id: "stale",
      label: "Stale cache",
      steps: [
        { caption: "Tenant B moves from the US region to the EU, but the code forgets to delete its tenant_region cache key.", ms: 3200 },
        { caption: "get_tenant_region checks the cache first, so for up to an hour reads and uploads still hit the US region.", tween: 1800, ms: 3200 },
        { caption: "assign_region deletes the key after the update. The next lookup reads eu from the database and caches that.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
