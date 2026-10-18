/**
 * Week 7 capstone (legal search · Deep Dives 1 and 2): one query's path. The gateway takes tenant
 * firm_abc123 from the verified JWT; the parser turns "(breach /5 contract) AND damages NOT punitive"
 * into an AST; the builder emits an ES bool query and the service injects the tenant filter; search
 * runs on public_legal_docs + private_docs_firm_abc123 only, is written to search_audit_log, and
 * tenant_id is stripped from hits. A tenant override in the request is blocked before any of that.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 318;
const SX = 20;
const SW = 140;
const SH = 40;
const SY = (i: number) => 60 + i * 50;
const PX = 186;
const PW = W - 20 - PX;
const PY = 60;
const PH = 240;

type Line = { text: string; k?: "t" | "s"; tone?: Tone; indent?: number; box?: boolean };
type Frame = { at: number; tones: Tone[]; title: string; lines: Line[]; travel?: [number, number]; blocked?: boolean };

const QUERY = "(breach /5 contract) AND damages NOT punitive";

function path(step: number, t: number, narrow: boolean): Frame {
  const d = (x: number) => t >= x;
  const lit = (i: number): Tone[] => [0, 1, 2, 3, 4].map((k) => (k < i ? "ok" : k === i ? "lit" : undefined));
  if (step === 0)
    return {
      at: 0,
      tones: lit(0),
      title: narrow ? "tenant context" : "tenant context (from the JWT)",
      lines: [
        { text: "Authorization: Bearer …", k: "s" },
        { text: d(0.4) ? "tenant_id = firm_abc123" : "verifying signature…", tone: d(0.4) ? "lit" : undefined },
        { text: narrow ? "user_id, roles too" : "user_id, roles: search:public, …", k: "s" },
        { text: d(0.7) ? (narrow ? "immutable: body can't override" : "immutable: the body can't override it") : "", k: "s", tone: "ok" },
      ],
    };
  if (step === 1)
    return {
      at: 1,
      tones: lit(1),
      title: narrow ? "lexer → AST" : "lexer → parser (AST)",
      travel: [0, 1],
      lines: [
        { text: d(0.3) ? "9 tokens" : "tokenizing…", k: "s" },
        { text: "AND", tone: d(0.5) ? "lit" : "mute" },
        { text: narrow ? "├ NEAR/5 breach contract" : "├ NEAR /5: breach, contract", indent: 1, tone: d(0.6) ? undefined : "mute" },
        { text: "├ damages", indent: 1, tone: d(0.7) ? undefined : "mute" },
        { text: "└ NOT punitive", indent: 1, tone: d(0.8) ? undefined : "mute" },
      ],
    };
  if (step === 2)
    return {
      at: 2,
      tones: lit(2),
      title: narrow ? "ES bool query" : "Elasticsearch bool query",
      travel: [1, 2],
      lines: [
        { text: narrow ? "must: span_near (slop 5)" : "must: span_near breach…contract, slop 5", k: "s" },
        { text: "must: match damages", k: "s" },
        { text: "must_not: match punitive", k: "s" },
        { text: narrow ? "filter (service-added):" : "filter, added by the service:", k: "s", tone: d(0.5) ? "lit" : "mute" },
        { text: narrow ? "public OR firm_abc123" : "is_public OR tenant_id = firm_abc123", tone: d(0.5) ? "lit" : "mute", box: d(0.5) },
      ],
    };
  return {
    at: 4,
    tones: [..."ok,ok,ok".split(",") as Tone[], d(0.5) ? "ok" : "lit", d(0.8) ? "ok" : undefined],
    title: narrow ? "indices searched" : "indices searched",
    travel: [2, 4],
    lines: [
      { text: "public_legal_docs ✓", tone: d(0.4) ? "ok" : undefined },
      { text: narrow ? "private_docs_firm_abc123" : "private_docs_firm_abc123 ✓", tone: d(0.4) ? "ok" : undefined },
      { text: narrow ? "firm_def456: never queried" : "private_docs_firm_def456: never queried", k: "s", tone: "mute" },
      { text: d(0.8) ? (narrow ? "→ search_audit_log" : "logged to search_audit_log") : "", k: "s", tone: "ok" },
      { text: d(0.9) ? (narrow ? "hits: tenant_id stripped" : "hits returned, tenant_id stripped") : "", k: "s", tone: "ok" },
    ],
  };
}

function override(step: number, t: number, narrow: boolean): Frame {
  const d = (x: number) => t >= x;
  if (step === 0)
    return {
      at: 1,
      tones: ["ok", d(0.5) ? "bad" : "lit", undefined, undefined, undefined],
      title: narrow ? "@require_tenant_isolation" : "decorator: require_tenant_isolation",
      travel: [0, 1],
      blocked: d(0.5),
      lines: [
        { text: narrow ? "tenant_id: firm_def456" : "filters: { tenant_id: firm_def456 }", k: "s", tone: "warn" },
        { text: d(0.5) ? (narrow ? "\"tenant_id\" found" : "\"tenant_id\" found in query") : "checking…", tone: d(0.5) ? "bad" : undefined },
        { text: d(0.7) ? (narrow ? "SecurityError:" : "SecurityError: Tenant override not allowed") : "", k: "s", tone: "bad" },
        ...(narrow ? [{ text: d(0.7) ? "override not allowed" : "", k: "s" as const, tone: "bad" as Tone }] : []),
        { text: d(0.85) ? (narrow ? "warning logged" : "warning logged with firm_abc123") : "", k: "s" },
      ],
    };
  return {
    at: 3,
    tones: ["ok", "bad", "ok", "ok", undefined],
    title: narrow ? "defense in depth" : "and if a bug skipped that check",
    lines: [
      { text: narrow ? "index list from the JWT:" : "index list comes from the JWT tenant:", k: "s" },
      { text: narrow ? "firm_def456 not in it" : "private_docs_firm_def456 is never in it", tone: "ok" },
      { text: narrow ? "every query also filters" : "every query still carries the filter", k: "s" },
      { text: narrow ? "tenant_id = firm_abc123" : "tenant_id = firm_abc123", tone: "ok", box: true },
    ],
  };
}

function Scene({ variant, step, t, narrow }: SceneProps) {
  const ov = variant === "override";
  const f = ov ? override(step, t, narrow) : path(step, t, narrow);
  const stages = ["Gateway", "Parser", "Builder", "Search", "Audit"];
  let tok: { x: number; y: number } | null = null;
  if (f.travel && t < 0.45) {
    const p = seg(t, 0, 0.45);
    const [a, b] = f.travel;
    tok = { x: SX + SW / 2, y: lerp(SY(a) + SH, SY(b), p) };
  }
  const lh = narrow ? 38 : 34;
  return (
    <g>
      <Txt x={20} y={32} k="k" anchor="start">
        {narrow ? "(breach /5 contract) AND …" : QUERY}
      </Txt>
      <Wire d={`M${SX + SW / 2} ${SY(0) + SH}V${SY(4)}`} />
      {stages.map((s, i) => (
        <Box key={s} x={SX} y={SY(i)} w={SW} h={SH} label={s} tone={f.tones[i]} dim={!f.tones[i]} />
      ))}
      <Wire d={`M${SX + SW} ${SY(f.at) + SH / 2}H${PX}`} tone="lit" />
      <rect className="ax-box lq-panel" x={PX} y={PY} width={PW} height={PH} />
      <Txt x={PX + 14} y={PY + 26} k="k" anchor="start" tone={f.blocked ? "bad" : undefined}>
        {f.title}
      </Txt>
      {f.lines.map((l, i) => {
        const y = PY + 64 + i * lh;
        const x = PX + 14 + (l.indent || 0) * 18;
        return l.text ? (
          <g key={i}>
            {l.box && <rect className="lq-hot" x={PX + 6} y={y - 22} width={PW - 12} height={32} />}
            <Txt x={x} y={y} k={l.k || "t"} anchor="start" tone={l.tone}>
              {l.text}
            </Txt>
          </g>
        ) : null;
      })}
      {tok && <Token x={tok.x} y={tok.y} s={11} tone="lit" />}
      {f.blocked && <path className="lq-x" d={`M${SX + SW + 6} ${SY(1) + 6}l12 12m0 -12l-12 12`} />}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.lq-hot{fill:none;stroke:var(--ax-accent);stroke-width:1.5}.lq-x{fill:none;stroke:var(--ax-bad);stroke-width:2.5}`,
  variants: [
    {
      id: "path",
      label: "Query path",
      steps: [
        { caption: "The gateway verifies the JWT and fixes the tenant, firm_abc123, in an immutable request context.", tween: 1400 },
        { caption: "The lexer tokenizes the query and the parser builds an AST: AND of NEAR/5, damages and NOT punitive.", tween: 1600 },
        { caption: "The builder emits an Elasticsearch bool query. The service, not the user, adds the tenant filter.", tween: 1400 },
        { caption: "Only public_legal_docs and the firm's own index are searched. The search is audit-logged; tenant_id is stripped.", tween: 1800, ms: 3600 },
      ],
    },
    {
      id: "override",
      label: "Override attempt",
      steps: [
        { caption: "A request slips tenant_id: firm_def456 into its filters. The isolation decorator finds it and refuses.", tween: 1800 },
        { caption: "Even if that check had a bug, firm_def456's index isn't searched and every query filters by firm_abc123.", tween: 800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
