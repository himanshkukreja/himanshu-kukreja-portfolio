/**
 * Tenant context and row-level security (week 9, day 1 · 2.1 / 3.2–3.3 / 4.1–4.2): the JWT's
 * tenant_id flows through TenantMiddleware into a ContextVar, the repository adds the tenant filter
 * and the connection sets app.current_tenant for RLS; RLS still filters a raw query that forgot the
 * filter; a pooled connection must reset app.current_tenant before it is released.
 */
import { defineExplainer, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const ST = { x: 24, w: 272, h: 38 };
const layerY = (i: number) => 52 + i * 48;
const TB = { x: 318, w: 258 };
const rowY = (i: number) => 104 + i * 34;

type Layer = { label: string; labelN?: string; val: string; valN?: string; tone?: Tone };
type Row = { cells: string[]; tone?: Tone; dim?: boolean };

const USERS: string[][] = [
  ["1", "acme", "Alice"],
  ["2", "acme", "Bob"],
  ["3", "globex", "Carol"],
  ["4", "initech", "Dave"],
];
const ORDERS: string[][] = [
  ["101", "acme", "open"],
  ["102", "acme", "open"],
  ["103", "globex", "open"],
  ["104", "initech", "open"],
];

function Stack({ layers, narrow, cursor }: { layers: Layer[]; narrow: boolean; cursor: number }) {
  return (
    <g>
      {layers.map((l, i) => {
        const y = layerY(i);
        return (
          <g key={i} opacity={l.tone === "mute" ? 0.45 : 1}>
            <rect className={`ax-box${l.tone && l.tone !== "mute" ? ` ${l.tone}` : ""}`} x={ST.x} y={y} width={ST.w} height={ST.h} />
            <Txt x={ST.x + 12} y={y + 24} anchor="start">
              {narrow && l.labelN ? l.labelN : l.label}
            </Txt>
            <Txt x={ST.x + ST.w - 12} y={y + 24} k="s" anchor="end" tone={l.tone && l.tone !== "mute" ? l.tone : undefined}>
              {narrow && l.valN !== undefined ? l.valN : l.val}
            </Txt>
            {i < layers.length - 1 && <line className="tc-link" x1={ST.x + 30} x2={ST.x + 30} y1={y + ST.h} y2={y + 48} />}
          </g>
        );
      })}
      {cursor >= 0 && <Token x={ST.x + ST.w + 11} y={cursor} s={12} tone="lit" />}
    </g>
  );
}

function Table({ name, note, noteTone, rows, heads, result, resultTone, resultO }: { name: string; note: string; noteTone?: Tone; rows: Row[]; heads: string[]; result: string; resultTone?: Tone; resultO: number }) {
  const xs = [TB.x + 12, TB.x + 66, TB.x + 172];
  return (
    <g>
      <Txt x={TB.x} y={62} k="k" anchor="start">
        {name}
      </Txt>
      <Txt x={TB.x} y={82} k="s" anchor="start" tone={noteTone}>
        {note}
      </Txt>
      {heads.map((h, i) => (
        <Txt key={h} x={xs[i]} y={rowY(0) - 2} k="s" anchor="start" tone="mute">
          {h}
        </Txt>
      ))}
      {rows.map((r, i) => (
        <g key={i} opacity={r.dim ? 0.3 : 1}>
          <rect className={`tc-row${r.tone ? ` ${r.tone}` : ""}`} x={TB.x} y={rowY(i + 1) - 22} width={TB.w} height={30} />
          {r.cells.map((c, j) => (
            <Txt key={j} x={xs[j]} y={rowY(i + 1)} k="s" anchor="start" tone={r.tone}>
              {c}
            </Txt>
          ))}
        </g>
      ))}
      <Txt x={TB.x} y={rowY(5) + 4} k="t" anchor="start" tone={resultTone} opacity={resultO}>
        {result}
      </Txt>
    </g>
  );
}

const pass = (rows: string[][], who: string | null, tone: Tone, on: boolean): Row[] =>
  rows.map((c) => ({ cells: c, tone: on && c[1] === who ? tone : undefined, dim: on && c[1] !== who }));

function Flow({ step, t, narrow }: SceneProps) {
  const lit = (i: number): Tone => {
    const cur = [0, 2, 4, 4][step];
    if (i > cur) return "mute";
    return i === cur || (step === 1 && i === 1) || (step === 2 && i === 3) ? "lit" : "ok";
  };
  const layers: Layer[] = [
    { label: "Request", val: "JWT tenant_id = acme", valN: "JWT: acme" },
    { label: "TenantMiddleware", labelN: "Middleware", val: "verify · set", valN: "set" },
    { label: "ContextVar", val: "tenant = acme", valN: "acme" },
    { label: "Repository", val: "+ WHERE tenant_id", valN: "+ WHERE" },
    { label: "Connection", val: "app.current_tenant", valN: "set_config" },
  ].map((l, i) => ({ ...l, tone: lit(i) }));
  const from = layerY([0, 0, 2, 4][step]) + ST.h / 2;
  const to = layerY([0, 2, 4, 4][step]) + ST.h / 2;
  const p = step === 0 ? 1 : seg(t, 0.1, 0.8);
  const filt = step === 3 ? seg(t, 0.2, 0.7) >= 1 : false;
  return (
    <g>
      <Txt x={24} y={34} anchor="start">
        {narrow ? "acme.myapp.com" : "GET acme.myapp.com/users"}
      </Txt>
      <Stack layers={layers} narrow={narrow} cursor={step === 3 ? -1 : from + (to - from) * p} />
      <Table
        name={narrow ? "users · RLS" : "users · RLS enabled"}
        note={step >= 2 ? (narrow ? "tenant_id = 'acme'" : "WHERE tenant_id = 'acme'") : narrow ? "every tenant here" : "every tenant's rows, one table"}
        noteTone={step >= 2 ? "lit" : "mute"}
        heads={["id", "tenant_id", "name"]}
        rows={pass(USERS, "acme", "ok", filt)}
        result={narrow ? "2 rows: acme only" : "→ 2 rows: Alice, Bob"}
        resultTone="ok"
        resultO={step === 3 ? seg(t, 0.6, 1) : 0}
      />
    </g>
  );
}

function Rls({ step, t, narrow }: SceneProps) {
  const on = step === 1 && seg(t, 0.2, 0.7) >= 1;
  const layers: Layer[] = [
    { label: "Request", val: "JWT tenant_id = acme", valN: "JWT: acme", tone: "ok" },
    { label: "TenantMiddleware", labelN: "Middleware", val: "set", tone: "ok" },
    { label: "ContextVar", val: "tenant = acme", valN: "acme", tone: "ok" },
    { label: "Raw SQL", val: "no tenant filter ✗", valN: "no filter ✗", tone: "bad" },
    { label: "Connection", val: "app.current_tenant", valN: "set_config", tone: "ok" },
  ];
  return (
    <g>
      <Txt x={24} y={34} anchor="start" tone="bad">
        {narrow ? "status = 'open' · no tenant" : "SELECT * FROM orders WHERE status = 'open'"}
      </Txt>
      <Stack layers={layers} narrow={narrow} cursor={-1} />
      <Table
        name={narrow ? "orders · RLS" : "orders · RLS policy"}
        note={narrow ? "= current_tenant_id()" : "tenant_id = current_tenant_id()"}
        noteTone={step === 1 ? "lit" : "mute"}
        heads={["id", "tenant_id", "status"]}
        rows={pass(ORDERS, "acme", "ok", on)}
        result={step === 0 ? (narrow ? "all 4 tenants?" : "every tenant's orders?") : narrow ? "2 rows: acme only" : "→ 2 rows: only acme's"}
        resultTone={step === 0 ? "warn" : "ok"}
        resultO={step === 0 ? seg(t, 0.3, 0.8) : seg(t, 0.6, 1)}
      />
    </g>
  );
}

function Pool({ step, t, narrow }: SceneProps) {
  const reset = step === 2 && seg(t, 0.15, 0.5) >= 1;
  const layers: Layer[] = [
    { label: "Request", val: step === 0 ? "acme · done" : "next request", valN: step === 0 ? "acme ✓" : "next", tone: step === 0 ? "ok" : "lit" },
    { label: "TenantMiddleware", labelN: "Middleware", val: "", tone: "mute" },
    { label: "ContextVar", val: step === 0 ? "acme" : "not set", valN: step === 0 ? "acme" : "none", tone: step === 0 ? "mute" : "warn" },
    { label: "Repository", val: "", tone: "mute" },
    {
      label: "Pool conn",
      val: reset ? "current_tenant=''" : "current_tenant=acme",
      valN: reset ? "reset ✓" : "acme",
      tone: reset ? "ok" : step === 1 ? "bad" : "warn",
    },
  ];
  const leak = step === 1 && seg(t, 0.3, 0.8) >= 1;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 1 ? "bad" : step === 2 ? "ok" : "warn"}>
        {step === 0 ? (narrow ? "release to the pool" : "connection goes back to the pool") : step === 1 ? (narrow ? "released as is" : "released without a reset") : narrow ? "reset, then release" : "RESET app.current_tenant, then release"}
      </Txt>
      <Stack layers={layers} narrow={narrow} cursor={-1} />
      <Table
        name="users · RLS"
        note={reset ? (narrow ? "no tenant set" : "no tenant: matches nothing") : narrow ? "acme still set" : "app.current_tenant still 'acme'"}
        noteTone={reset ? "ok" : "warn"}
        heads={["id", "tenant_id", "name"]}
        rows={step === 2 ? USERS.map((c) => ({ cells: c, dim: reset })) : pass(USERS, "acme", step === 1 ? "bad" : "warn", step === 1 ? leak : false)}
        result={step === 1 ? (narrow ? "acme's rows leak" : "→ acme's rows leak") : step === 2 ? (narrow ? "0 rows: fails safe" : "→ 0 rows: fails safe") : ""}
        resultTone={step === 1 ? "bad" : "ok"}
        resultO={step === 0 ? 0 : seg(t, 0.6, 1)}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "rls") return <Rls {...p} />;
  if (p.variant === "pool") return <Pool {...p} />;
  return <Flow {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.tc-link{stroke:var(--ax-line);stroke-width:1.5}
.tc-row{fill:none;stroke:var(--ax-line-soft);stroke-width:1.5}.tc-row.ok{stroke:var(--ax-ok);stroke-width:2}.tc-row.bad{stroke:var(--ax-bad);stroke-width:2}.tc-row.warn{stroke:var(--ax-amber);stroke-width:2}`,
  variants: [
    {
      id: "flow",
      label: "Tenant context",
      steps: [
        { caption: "A request arrives with a verified JWT: tenant_id = acme. Subdomain or header are hints that must match.", ms: 3200 },
        { caption: "TenantMiddleware stores it in a ContextVar, so each concurrent request sees its own tenant, never another's.", tween: 1400, ms: 3000 },
        { caption: "The repository adds WHERE tenant_id = 'acme'; the connection sets app.current_tenant so RLS knows the tenant too.", tween: 1400, ms: 3200 },
        { caption: "Only acme's rows, Alice and Bob, come back. Carol (globex) and Dave (initech) never leave the database.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "rls",
      label: "Forgot the filter",
      steps: [
        { caption: "A raw query skips the repository and forgets the filter: SELECT * FROM orders WHERE status = 'open'.", tween: 1200, ms: 3200 },
        { caption: "RLS adds tenant_id = current_tenant_id() to every query on the table, so the database itself returns only acme's orders.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "pool",
      label: "Pooled connection",
      steps: [
        { caption: "acme's request ends, but its pooled connection still has app.current_tenant = 'acme' set.", ms: 3000 },
        { caption: "Released as is, the next request to borrow it inherits acme: its queries run as the wrong tenant.", tween: 1400, ms: 3400 },
        { caption: "So release resets app.current_tenant first. A borrower without a tenant fails RLS instead of seeing acme's rows.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
