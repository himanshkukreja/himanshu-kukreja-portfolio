/**
 * Week 9 preview overview: the whole week in three tabs. The enterprise security questionnaire
 * ("you built for scale, not for trust") and the mindset shift; the five days, each as one picture
 * under a shared day track (isolation spectrum, tenant C at 800% of quota, EU data in the EU, one
 * user's data in many systems, five security layers); and the HR SaaS capstone and its six
 * requirements.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const DAYS = ["D1", "D2", "D3", "D4", "D5", "Cap"];
const DAYN = ["isolation", "noisy", "residency", "deletion", "security", "capstone"];

function Track({ on, narrow }: { on: number; narrow: boolean }) {
  return (
    <g>
      {DAYS.map((d, i) => (
        <g key={d}>
          <rect className={`ax-box ${i === on ? "lit" : i < on ? "ok" : ""}`} x={20 + i * 95} y={14} width={85} height={30} />
          <Txt x={62 + i * 95} y={34} k="s" tone={i === on ? "lit" : i < on ? undefined : "mute"}>
            {narrow ? d : DAYN[i]}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- the gap */

function Gap({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.12, i * 0.12 + 0.3);
  if (step === 0) {
    const qs = ["How do you isolate our data from others?", "Where is our data stored geographically?", "Can you provide SOC 2 Type II?", "How do you handle GDPR deletion requests?", "What's your encryption strategy?", "Can another customer slow us down?"];
    const qn = ["isolation?", "data location?", "SOC 2?", "GDPR deletion?", "encryption?", "noisy neighbours?"];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "security questionnaire" : "your first enterprise customer's security questionnaire"}
        </Txt>
        {qs.map((q, i) => (
          <g key={q} opacity={o(i)}>
            <Txt x={30} y={70 + i * 38} k="d" anchor="start" tone="lit">
              ?
            </Txt>
            <Txt x={64} y={66 + i * 38} k="t" anchor="start">
              {narrow ? qn[i] : q}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  if (step === 1) {
    const k = ease(t);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          built for scale, not for trust
        </Txt>
        <Box x={20} y={60} w={270} h={170} label="Scale" sub={narrow ? "weeks 1–8" : "fast · reliable · 10x spikes"} tone="ok" />
        <Box x={310} y={60} w={270} h={170} label="Trust" sub={narrow ? "week 9" : "isolation · residency · deletion"} tone={k > 0.5 ? "warn" : undefined} />
        <Txt x={445} y={256} k="t" tone="warn" opacity={seg(t, 0.5, 1)}>
          the gap
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "reliability ≠ isolation" : "reliability says nothing about isolation, residency or deletion"}
        </Txt>
      </g>
    );
  }
  const rows: [string, string, string][] = [
    ["question", "make it fast?", "make it secure?"],
    ["optimize for", "the common case", "the worst case"],
    ["a failure is", "retried", "a breach"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        the mindset shift
      </Txt>
      <Txt x={narrow ? 250 : 260} y={70} k="k" anchor="start">
        performance
      </Txt>
      <Txt x={narrow ? 420 : 430} y={70} k="k" anchor="start" tone="warn">
        security
      </Txt>
      {rows.map(([a, b, c], i) => (
        <g key={a} opacity={o(i * 2)}>
          <Txt x={20} y={116 + i * 56} k="s" anchor="start">
            {a}
          </Txt>
          <Txt x={narrow ? 250 : 260} y={116 + i * 56} k={narrow ? "s" : "t"} anchor="start">
            {b}
          </Txt>
          <Txt x={narrow ? 420 : 430} y={116 + i * 56} k={narrow ? "s" : "t"} anchor="start" tone={i === 2 ? "bad" : "warn"}>
            {c}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- the week */

function Week({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.15, i * 0.15 + 0.3);
  const k = ease(seg(t, 0.1, 0.8));
  const notes: [string, string][] = [
    ["1000 customers who can't see each other's data", "customers can't see each other"],
    ["one customer can't ruin everyone else's experience", "no one ruins it for all"],
    ["EU data stays in the EU on a global platform", "EU data stays in the EU"],
    ["delete one user's data from every system, within a month", "delete everywhere, in a month"],
    ["each layer assumes the previous layer failed", "never trust, always verify"],
  ];
  return (
    <g>
      <Track on={step} narrow={narrow} />
      {step === 0 && (
        <g>
          {["Shared tables", "Schema/tenant", "DB/tenant", "VPC/tenant"].map((s, i) => (
            <g key={s} opacity={o(i)}>
              <Box x={20 + i * 142} y={70} w={134} h={60} label={narrow ? s.split(" ")[0] : s} sub={["startups", "growing", "enterprise", "regulated"][i]} tone={i === 0 ? "ok" : i === 3 ? "lit" : undefined} />
            </g>
          ))}
          <line className="ax-wire" x1={30} x2={570} y1={170} y2={170} />
          <Token x={lerp(30, 570, k)} y={170} s={12} tone="lit" />
          <Txt x={30} y={196} k="s" anchor="start">
            {narrow ? "low cost" : "low cost · high density"}
          </Txt>
          <Txt x={570} y={196} k="s" anchor="end">
            {narrow ? "isolated" : "high cost · high isolation"}
          </Txt>
        </g>
      )}
      {step === 1 &&
        [
          ["Tenant A", 40, "ok"],
          ["Tenant B", 60, "ok"],
          ["Tenant C", t > 0.6 ? 100 : 800, t > 0.6 ? "warn" : "bad"],
        ].map(([n, v, tone], i) => (
          <g key={n as string}>
            <Txt x={20} y={88 + i * 50} k="t" anchor="start">
              {n as string}
            </Txt>
            <Meter x={150} y={74 + i * 50} w={300} h={18} value={Math.min(v as number, 100)} max={100} tone={tone as Tone} />
            <Txt x={464} y={88 + i * 50} k="t" anchor="start" tone={tone as Tone}>
              {i === 2 ? (t > 0.6 ? (narrow ? "429" : "429 · quota") : "800%!") : `${v}%`}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <g>
          <Box x={20} y={64} w={260} h={140} label="EU region" sub={narrow ? "German user" : "user in Germany → stays"} tone="ok" />
          <Box x={320} y={64} w={260} h={140} label="US region" sub={narrow ? "CCPA" : "user in California · CCPA"} tone="sky" />
          <Txt x={300} y={232} k="t" tone="bad" opacity={o(3)}>
            {narrow ? "GDPR: €20M or 4%" : "GDPR fines: up to €20M or 4% of global turnover"}
          </Txt>
        </g>
      )}
      {step === 3 &&
        ["PostgreSQL", "Elasticsearch", "Redis", "Kafka", "S3", "BigQuery", "Backups", "Stripe"].map((s, i) => (
          <g key={s}>
            <Box x={20 + (i % 4) * 142} y={64 + Math.floor(i / 4) * 70} w={134} h={56} label={narrow && s.length > 9 ? s.slice(0, 7) + "…" : s} tone={t > 0.2 + i * 0.08 ? "ok" : "warn"} sub={t > 0.2 + i * 0.08 ? "deleted" : "user data"} />
          </g>
        ))}
      {step === 4 &&
        ["1 Network", "2 Identity", "3 Application", "4 Data", "5 Detection"].map((s, i) => (
          <g key={s} opacity={o(i)}>
            <rect className={`ax-box ${i === 4 ? "sky" : "lit"}`} x={20 + i * 22} y={58 + i * 30} width={560 - i * 44} height={26} />
            <Txt x={300} y={76 + i * 30} k="s">
              {narrow ? s : `${s} · ${["VPC, WAF, DDoS", "authn, authz, tenant", "validation, audit", "encryption, keys", "anomalies, PII leaks"][i]}`}
            </Txt>
          </g>
        ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {notes[step][narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- capstone */

const REQS = ["enterprise isolation option", "EU data stays in the EU", "deletion within 30 days", "audit logs for all access", "encryption everywhere", "noisy neighbour prevention"];
const REQN = ["isolation tier", "EU stays in EU", "delete in 30 days", "audit logs", "encrypt all", "noisy neighbours"];

function Capstone({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.12, i * 0.12 + 0.3);
  return (
    <g>
      <Track on={5} narrow={narrow} />
      {step === 0 &&
        [
          ["500", narrow ? "customers" : "enterprise customers"],
          ["2M", "users"],
          ["4", narrow ? "regions" : "US · EU · UK · AU"],
        ].map(([a, b], i) => (
          <g key={b} opacity={o(i * 2)}>
            <Txt x={110 + i * 190} y={130} k="d">
              {a}
            </Txt>
            <Txt x={110 + i * 190} y={158} k="s">
              {b}
            </Txt>
          </g>
        ))}
      {step === 0 && (
        <Txt x={300} y={214} k="t" tone="warn" opacity={o(6)}>
          {narrow ? "PII · salaries · reviews" : "employee PII · salaries · performance reviews"}
        </Txt>
      )}
      {step === 1 &&
        REQS.map((r, i) => (
          <g key={r} opacity={o(i)}>
            <Box x={20 + (i % 2) * 290} y={60 + Math.floor(i / 2) * 64} w={270} h={52} label={narrow ? REQN[i] : r} sub={`day ${[1, 3, 4, 5, 5, 2][i]}`} tone="lit" />
          </g>
        ))}
      {step === 2 && (
        <g>
          {DAYN.slice(0, 5).map((d, i) => (
            <g key={d} opacity={seg(t, i * 0.1, i * 0.1 + 0.3)}>
              <Box x={20 + i * 115} y={70} w={105} h={44} label={narrow ? DAYS[i] : d} tone="ok" />
              <Wire d={`M${72 + i * 115} 114L${200 + i * 50} 190`} tone="lit" />
            </g>
          ))}
          <Box x={170} y={190} w={260} h={60} label={narrow ? "one platform" : "one audit-ready platform"} tone={t > 0.7 ? "ok" : undefined} opacity={seg(t, 0.5, 0.9)} />
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "a B2B SaaS for HR" : "design a B2B SaaS platform for HR management", narrow ? "SOC 2 · GDPR · CCPA" : "SOC 2 Type II, GDPR and CCPA required", narrow ? "every day, combined" : "pass an enterprise security audit: every day, combined"][step]}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "week") return <Week {...p} />;
  if (p.variant === "capstone") return <Capstone {...p} />;
  return <Gap {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "gap",
      label: "The gap",
      steps: [
        { caption: "Your first enterprise customer sends a security questionnaire: how do you isolate our data, where is it stored, how do you handle GDPR deletion, encryption, and noisy neighbours?", tween: 1600, ms: 3800 },
        { caption: "Eight weeks made the system fast and reliable. But you built for scale, not for trust, and reliability says nothing about isolation, residency or deletion.", tween: 1200, ms: 3400 },
        { caption: "The engineering changes: performance optimizes the common case and retries failures; security protects against the worst case, because a failure is a breach.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "week",
      label: "The week",
      steps: [
        { caption: "Day 1, tenant isolation: a spectrum from shared tables, cheap and dense, to a VPC per tenant for regulated industries.", tween: 1600 },
        { caption: "Day 2, noisy neighbours: tenants A and B use 40 and 60 percent of their quotas, but C's runaway query hits 800 percent. C is throttled to its quota.", tween: 1600, ms: 3400 },
        { caption: "Day 3, data residency: a user in Germany means data stays in the EU, under GDPR fines of up to 20 million euros or 4 percent of turnover.", tween: 1400, ms: 3200 },
        { caption: "Day 4, the right to deletion: one user's data lives in PostgreSQL, search, caches, Kafka, S3, the warehouse, backups and third parties, and all of it must go.", tween: 1800, ms: 3400 },
        { caption: "Day 5, security architecture: network, identity, application, data and detection layers. Never trust, always verify; each layer assumes the previous one failed.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "capstone",
      label: "Capstone",
      steps: [
        { caption: "The capstone is an HR platform: 500 enterprise customers, 2 million users in the US, EU, UK and Australia, holding salaries and performance reviews.", tween: 1400, ms: 3400 },
        { caption: "Six requirements: an enterprise isolation option, EU data in the EU, deletion within 30 days, audit logs, encryption everywhere and noisy-neighbour prevention.", tween: 1400, ms: 3600 },
        { caption: "Meeting them takes all five days at once: a platform that could pass an enterprise security audit.", tween: 1400, ms: 3200 },
      ],
    },
  ],
  Scene,
});
