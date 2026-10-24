/**
 * Week 9, day 1 overview (tenant isolation): the whole lesson in four tabs. Why multi-tenancy
 * (single-tenant $500/mo stacks → shared $50/mo; Acme's $500K ARR "prove isolation"), the pattern
 * spectrum (shared tables → schema per tenant → database per tenant → hybrid tiers), tenant context
 * through every layer (JWT at the gateway, context variable, RLS, cache prefix, logs, jobs) and the
 * three classic mistakes (missing WHERE, trusted X-Tenant-ID, unprefixed cache key).
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const COLS = [110, 300, 490];
const TENANTS = ["acme", "globex", "initech"];
const ROWS = [
  ["1", "acme", "a@acme.com", "Alice"],
  ["2", "acme", "b@acme.com", "Bob"],
  ["3", "globex", "c@globex..", "Carol"],
  ["4", "initech", "d@inite...", "Dave"],
];

function Rows({ x, y, narrow, hl }: { x: number; y: number; narrow: boolean; hl?: boolean }) {
  const cols = narrow ? [20, 70, 330] : [20, 70, 200, 380];
  const pick = (r: string[]) => (narrow ? [r[0], r[1], r[3]] : r);
  return (
    <g>
      {pick(["id", "tenant_id", "email", "name"]).map((c, i) => (
        <Txt key={c} x={x + cols[i]} y={y} k="k" anchor="start" tone={i === 1 && hl ? undefined : "mute"}>
          {c}
        </Txt>
      ))}
      {ROWS.map((r, j) =>
        pick(r).map((c, i) => (
          <Txt key={`${j}${i}`} x={x + cols[i]} y={y + 24 + j * 22} k="s" anchor="start" tone={i === 1 ? "lit" : undefined}>
            {c}
          </Txt>
        )),
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- why + spectrum */

function Why({ step, t, narrow }: SceneProps) {
  const e = ease(t);
  const sep = step === 0 ? 1 : step === 1 ? 1 - e : 0;
  const wide = step === 0 ? 0 : step === 1 ? e : 1;
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {step === 0 ? "single-tenant · the old world" : step === 1 ? "multi-tenant · modern SaaS" : narrow ? "Acme · $500K ARR" : "Acme Corp · $500K ARR · security review"}
      </Txt>
      {COLS.map((c, i) => (
        <Txt key={c} x={c} y={54} k="t">
          {TENANTS[i]}
        </Txt>
      ))}
      {sep > 0 &&
        COLS.map((c) => (
          <g key={c} opacity={sep}>
            <Box x={c - 75} y={66} w={150} h={44} label={narrow ? "App" : "App server"} />
            <Box x={c - 75} y={124} w={150} h={44} label="DB" sub="own" />
          </g>
        ))}
      {wide > 0 && (
        <g opacity={wide}>
          <Box x={40} y={66} w={520} h={44} label={narrow ? "Shared app servers" : "Application servers · A │ B │ C"} />
          {step < 2 && <Box x={40} y={124} w={520} h={44} label={narrow ? "Shared database" : "Shared database · A, B, C"} tone={step === 1 ? "lit" : undefined} />}
        </g>
      )}
      {step < 2 &&
        COLS.map((c) => (
          <Txt key={c} x={c} y={200} k="d" tone={step === 1 && t > 0.5 ? "ok" : undefined}>
            {step === 1 && t > 0.5 ? "$50" : "$500"}
          </Txt>
        ))}
      {step < 2 && (
        <Txt x={300} y={226} k="s">
          per customer per month
        </Txt>
      )}
      {step === 2 && (
        <g opacity={seg(t, 0, 0.4)}>
          <rect className="ax-box warn" x={40} y={124} width={520} height={120} />
          <Rows x={40} y={146} narrow={narrow} hl />
          <Txt x={300} y={270} k="t" tone="warn">
            {narrow ? "WHERE tenant_id = ? (hopefully)" : "every query: WHERE tenant_id = ?  (hopefully)"}
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start" tone={step === 0 ? "ok" : step === 1 ? "warn" : t > 0.6 ? "bad" : undefined}>
        {step === 0 ? "isolation perfect · cost high" : step === 1 ? (narrow ? "cost low · isolation: it depends" : "cost low · isolation depends on implementation") : t > 0.6 ? (narrow ? "prove isolation? not really" : "Can you prove isolation? Not really.") : "one PostgreSQL, all tenants, same tables"}
      </Txt>
    </g>
  );
}

const FACTS: [string, string, string][] = [
  ["application", "millions", "all or nothing"],
  ["database", "thousands", "per schema"],
  ["physical", "hundreds", "per tenant"],
];

function Spectrum({ step, t, narrow }: SceneProps) {
  const o = seg(t, 0, 0.5);
  const pos = [0.12, 0.45, 0.8];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["shared tables + tenant_id", "schema per tenant", "database per tenant", "hybrid · per tier"][step]}
      </Txt>
      {COLS.map((c, i) => (
        <Txt key={c} x={c} y={54} k="t" tone={step === 3 && i === 0 ? "lit" : undefined}>
          {TENANTS[i]}
        </Txt>
      ))}
      <g opacity={o}>
        {step === 0 && (
          <g>
            <rect className="ax-box" x={40} y={66} width={520} height={142} />
            <Rows x={40} y={90} narrow={narrow} hl />
          </g>
        )}
        {step === 1 && (
          <g>
            <rect className="ax-box" x={30} y={66} width={540} height={142} />
            <Txt x={44} y={86} k="s" anchor="start">
              PostgreSQL database
            </Txt>
            {COLS.map((c, i) => (
              <Box key={c} x={c - 82} y={96} w={164} h={70} label={narrow ? TENANTS[i] : `tenant_${TENANTS[i]}`} sub={narrow ? "schema" : "users · orders"} tone={i === 0 ? "lit" : undefined} />
            ))}
            <Txt x={300} y={192} k="s" tone="lit">
              SET search_path TO tenant_acme;
            </Txt>
          </g>
        )}
        {step === 2 && (
          <g>
            <rect className="ax-box ow-frame" x={30} y={66} width={540} height={142} />
            {COLS.map((c, i) => (
              <Box key={c} x={c - 82} y={86} w={164} h={70} label={`db_${TENANTS[i]}`} sub={narrow ? "own DB" : "own backup"} tone="ok" />
            ))}
            <Txt x={300} y={192} k="s">
              {narrow ? "cluster/db_acme" : "postgresql://cluster/db_acme"}
            </Txt>
          </g>
        )}
        {step === 3 && (
          <g>
            <Box x={210} y={66} w={350} h={142} label={narrow ? "shared + RLS" : "Standard: shared tables + RLS"} sub={narrow ? "globex, initech" : "globex · initech · self-serve"} />
            <Box x={40} y={66} w={150} h={142} label="db_acme" sub="Enterprise" tone="lit" />
            <Wire d="M210 180H196" tone="lit" arrow />
            <Txt x={385} y={196} k="s" tone="lit">
              {narrow ? "← migration path" : "← migration path between tiers"}
            </Txt>
          </g>
        )}
      </g>
      {step < 3 ? (
        ["isolation", narrow ? "tenants" : "max tenants", "backup"].map((h, i) => (
          <g key={h}>
            <Txt x={COLS[i]} y={232} k="s">
              {h}
            </Txt>
            <Txt x={COLS[i]} y={252} k="t" tone="lit">
              {FACTS[step][i]}
            </Txt>
          </g>
        ))
      ) : (
        <Txt x={300} y={244} k="t" tone="ok">
          {narrow ? "start shared · dedicated for deals" : "start shared + RLS · dedicated for enterprise deals"}
        </Txt>
      )}
      <line className="ax-wire" x1={60} x2={540} y1={276} y2={276} />
      <Txt x={60} y={300} k="s" anchor="start">
        {narrow ? "low cost" : "shared · low cost"}
      </Txt>
      <Txt x={540} y={300} k="s" anchor="end">
        {narrow ? "isolated" : "dedicated · high isolation"}
      </Txt>
      {(step === 3 ? [pos[0], pos[2]] : [lerp(pos[Math.max(0, step - 1)], pos[step], step === 0 ? 1 : ease(t))]).map((p, i) => (
        <rect key={i} className="ow-mark" x={lerp(60, 540, p) - 6} y={270} width={12} height={12} />
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- the request chain */

type P = { x: number; y: number };
type B = { x: number; y: number; w: number; h: number };
const CL: B = { x: 20, y: 52, w: 110, h: 54 };
const GW: B = { x: 150, y: 52, w: 130, h: 54 };
const SV: B = { x: 300, y: 52, w: 130, h: 54 };
const DB: B = { x: 450, y: 52, w: 130, h: 54 };
const LG: B = { x: 150, y: 168, w: 130, h: 54 };
const CA: B = { x: 300, y: 168, w: 130, h: 54 };
const WK: B = { x: 450, y: 168, w: 130, h: 54 };
const R = (b: B): P => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const L = (b: B): P => ({ x: b.x, y: b.y + b.h / 2 });
const PATHS: Record<string, P[]> = {
  cg: [R(CL), L(GW)],
  gs: [R(GW), L(SV)],
  sd: [R(SV), L(DB)],
  sc: [{ x: 365, y: 106 }, { x: 365, y: 168 }],
  sl: [{ x: 325, y: 106 }, { x: 325, y: 140 }, { x: 215, y: 140 }, { x: 215, y: 168 }],
  sw: [{ x: 405, y: 106 }, { x: 405, y: 140 }, { x: 515, y: 140 }, { x: 515, y: 168 }],
};
const pathD = (p: P[]) => p.map((q, i) => `${i ? "L" : "M"}${q.x} ${q.y}`).join("");
function along(pts: P[], q: number): P {
  const lens = pts.slice(1).map((b, i) => Math.abs(b.x - pts[i].x) + Math.abs(b.y - pts[i].y));
  let d = q * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) return { x: lerp(pts[i].x, pts[i + 1].x, Math.min(1, d / lens[i])), y: lerp(pts[i].y, pts[i + 1].y, Math.min(1, d / lens[i])) };
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

type Fr = { legs: [string, number, number, Tone][]; tones: Record<string, Tone>; subs: Record<string, [string, string]>; note: [string, string]; nt?: Tone; kick: string };
const BASE: Record<string, [string, string]> = { cl: ["JWT: acme", "JWT acme"], gw: ["auth", "auth"], sv: ["service", "service"], db: ["RLS", "RLS"], lg: ["logs", "logs"], ca: ["cache", "cache"], wk: ["worker", "worker"] };

const CONTEXT: Fr[] = [
  { kick: "1 · the gateway", legs: [["cg", 0, 0.5, "lit"]], tones: { gw: "ok" }, subs: { gw: ["tenant = acme", "acme ✓"], cl: ["X-Tenant-ID ✗", "header ✗"] }, note: ["tenant from the verified JWT, never the header", "tenant from the JWT"], nt: "ok" },
  { kick: "2 · service and database", legs: [["gs", 0, 0.4, "lit"], ["sd", 0.45, 0.85, "lit"]], tones: { gw: "ok", sv: "ok", db: "ok" }, subs: { gw: ["tenant = acme", "acme ✓"], sv: ["context = acme", "ctx acme"], db: ["acme rows only", "acme only"] }, note: ["repository adds tenant_id · RLS backs it up", "app filter + RLS"], nt: "ok" },
  { kick: "3 · cache and logs", legs: [["sc", 0, 0.5, "lit"], ["sl", 0, 0.6, "lit"]], tones: { gw: "ok", sv: "ok", db: "ok", ca: "ok", lg: "ok" }, subs: { gw: ["tenant = acme", "acme ✓"], sv: ["context = acme", "ctx acme"], db: ["acme rows only", "acme only"], ca: ["tenant:acme:…", "tenant:acme"], lg: ["tenant_id=acme", "tenant_id"] }, note: ["same user ID in two tenants never collides", "no collisions"], nt: "ok" },
  { kick: "4 · async jobs", legs: [["sw", 0, 0.6, "lit"]], tones: { gw: "ok", sv: "ok", db: "ok", ca: "ok", lg: "ok", wk: "ok" }, subs: { gw: ["tenant = acme", "acme ✓"], sv: ["context = acme", "ctx acme"], db: ["acme rows only", "acme only"], ca: ["tenant:acme:…", "tenant:acme"], lg: ["tenant_id=acme", "tenant_id"], wk: ["scope = acme", "scope acme"] }, note: ["every query, cache lookup and log is tenant-scoped", "all tenant-scoped"], nt: "ok" },
];
const MISTAKES: Fr[] = [
  { kick: "mistake 1 · missing WHERE", legs: [["sd", 0, 0.5, "bad"]], tones: { sv: "warn", db: "bad" }, subs: { sv: ["role = 'admin'", "no tenant"], db: ["ALL tenants", "ALL tenants"] }, note: ["fix: the repository adds tenant_id automatically", "fix: tenant repo"], nt: "ok" },
  { kick: "mistake 2 · trusting the header", legs: [["cg", 0, 0.5, "bad"]], tones: { cl: "bad", gw: "bad" }, subs: { cl: ["victim header", "victim"], gw: ["trusts header", "trusts it"] }, note: ["fix: derive the tenant from the authenticated user", "fix: use the session"], nt: "ok" },
  { kick: "mistake 3 · unprefixed cache key", legs: [["sc", 0, 0.5, "bad"]], tones: { ca: "bad", sv: "warn" }, subs: { ca: ["user:123 = acme's", "acme's 123"], sv: ["globex asks 123", "globex 123"] }, note: ["fix: key it tenant:{id}:user:{id}", "fix: tenant prefix"], nt: "ok" },
];

function Chain({ variant, step, t, narrow }: SceneProps) {
  const f = (variant === "mistakes" ? MISTAKES : CONTEXT)[step];
  const sub = (k: string) => (f.subs[k] ?? BASE[k])[narrow ? 1 : 0];
  const box = (k: string, b: B, label: string) => <Box x={b.x} y={b.y} w={b.w} h={b.h} label={label} sub={sub(k)} tone={f.tones[k]} />;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start" tone={variant === "mistakes" ? "bad" : undefined}>
        {f.kick}
      </Txt>
      {Object.values(PATHS).map((p, i) => (
        <Wire key={i} d={pathD(p)} />
      ))}
      {box("cl", CL, "Client")}
      {box("gw", GW, "Gateway")}
      {box("sv", SV, "Service")}
      {box("db", DB, narrow ? "DB" : "PostgreSQL")}
      {box("lg", LG, "Logs")}
      {box("ca", CA, "Redis")}
      {box("wk", WK, narrow ? "Job" : "Worker")}
      {!narrow && step >= 2 && variant === "context" && (
        <Txt x={365} y={242} k="s" tone="ok">
          tenant:acme:user:123
        </Txt>
      )}
      {f.legs.map(([k, a, b, tone]) => {
        if (t <= a || t >= b) return null;
        const q = along(PATHS[k], seg(t, a, b));
        return <Token key={k} x={q.x} y={q.y} s={11} tone={tone} />;
      })}
      <Txt x={20} y={268} anchor="start" tone={t > 0.5 ? f.nt : undefined}>
        {f.note[narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "why") return <Why {...p} />;
  if (p.variant === "spectrum") return <Spectrum {...p} />;
  return <Chain {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ow-frame{stroke-dasharray:5 6}.ow-mark{fill:var(--ax-accent)}`,
  variants: [
    {
      id: "why",
      label: "Why",
      steps: [
        { caption: "In the old world every customer got its own app server and database: perfect isolation, about $500 a month each.", tween: 1000, ms: 3000 },
        { caption: "Multi-tenancy runs one instance for everyone on shared servers and a shared database, closer to $50 a month each. Isolation now depends on the implementation.", tween: 1600, ms: 3400 },
        { caption: "Then Acme Corp signs for $500K a year and asks you to prove its data is isolated. All tenants share one table, guarded by WHERE tenant_id, hopefully. Not really.", tween: 1600, ms: 3800 },
      ],
    },
    {
      id: "spectrum",
      label: "Patterns",
      steps: [
        { caption: "Shared tables: every row carries a tenant_id and every query must filter on it. Cheapest, scales to millions of tenants, but one forgotten WHERE leaks data.", tween: 1000, ms: 3600 },
        { caption: "Schema per tenant: each tenant gets its own schema, and the connection sets search_path to it. The database enforces isolation, but 10K tenants means 10K schemas.", tween: 1200, ms: 3600 },
        { caption: "Database per tenant: db_acme, db_globex, db_initech. Physical isolation, per-tenant backups and easy data residency, for hundreds of tenants at a higher cost.", tween: 1200, ms: 3600 },
        { caption: "The default is hybrid: start with shared tables plus row-level security, and offer a dedicated database to enterprise deals, with a migration path between tiers.", tween: 1200, ms: 3800 },
      ],
    },
    {
      id: "context",
      label: "Context",
      steps: [
        { caption: "Every layer must know the tenant. The gateway derives it from the verified JWT and strips any client-supplied X-Tenant-ID.", tween: 1400 },
        { caption: "The service's middleware sets a context variable. The repository adds tenant_id to every query, and PostgreSQL row-level security filters even if code forgets.", tween: 1800, ms: 3400 },
        { caption: "Cache keys get a tenant prefix, like tenant:acme:user:123, and every log line carries tenant_id instead of an email.", tween: 1400, ms: 3200 },
        { caption: "Background jobs carry tenant_id in the message, and the worker sets the tenant scope before it runs. Every query, cache lookup and log is tenant-scoped.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "mistakes",
      label: "Mistakes",
      steps: [
        { caption: "Mistake one: a query for admins that forgets the tenant filter returns admins from all tenants. Go through the tenant-aware repository instead.", tween: 1200, ms: 3400 },
        { caption: "Mistake two: trusting the X-Tenant-ID header. An attacker sets it to the victim's tenant. Derive the tenant from the authenticated user.", tween: 1200, ms: 3400 },
        { caption: "Mistake three: a cache key of just user:123. User 123 exists in both tenants, so one gets the other's data. Prefix every key with the tenant.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
