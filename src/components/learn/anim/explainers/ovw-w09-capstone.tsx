/**
 * Week 9 capstone overview (multi-tenant document platform): the whole interview in four tabs.
 * Requirements and estimates (500 tenants, 100M × 500 KB = 50 TB → 60 → 180 TB, 1,000 req/s with
 * 60% search, a ~3 TB index); the architecture (a global control plane with no personal data over
 * three regional data planes, presigned uploads, a tenant-filtered search); the deep dives (five
 * isolation layers, quotas per plan, residency and deletion, security layers); and operating it.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- requirements + estimates */

function Reqs({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.1, i * 0.1 + 0.3);
  const kick = ["the brief · enterprise document platform", "the bar", "storage", "traffic · peak 1,000 req/s", "search index and fleet"][step];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? kick.split(" · ")[0] : kick}
      </Txt>
      {step === 0 && (
        <g>
          {[
            ["500", "tenants · US, EU, APAC"],
            ["50K", "users, largest tenant"],
            ["10M", "docs, largest tenant"],
          ].map(([a, b], i) => (
            <g key={b} opacity={o(i)}>
              <Txt x={110 + i * 190} y={96} k="d">
                {a}
              </Txt>
              <Txt x={110 + i * 190} y={122} k="s">
                {narrow ? b.split(",")[0].split(" · ")[0] : b}
              </Txt>
            </g>
          ))}
          {(narrow ? ["GDPR · residency", "HIPAA-ready", "SSO · audit logs", "search too slow"] : ["EU customers: GDPR and data residency", "healthcare: HIPAA-ready architecture", "enterprise: SSO and audit logs", "deals lost: \"search was too slow\""]).map((s, i) => (
            <Txt key={s} x={narrow ? 20 + (i % 2) * 290 : 40} y={narrow ? 176 + Math.floor(i / 2) * 34 : 160 + i * 30} k="s" anchor="start" tone="warn" opacity={o(i + 3)}>
              {s}
            </Txt>
          ))}
        </g>
      )}
      {step === 1 &&
        [
          ["search", "< 500 ms p99", "lit"],
          ["API calls", "< 200 ms p99", "lit"],
          ["uptime", "99.9%", "ok"],
          [narrow ? "EU tenants" : "EU tenants' docs + metadata", "stay in the EU", "sky"],
        ].map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={84 + i * 50} k="t" anchor="start">
              {a}
            </Txt>
            <Txt x={570} y={84 + i * 50} k="t" anchor="end" tone={tone as Tone}>
              {b}
            </Txt>
          </g>
        ))}
      {step === 2 &&
        [
          ["100M × 500 KB", "50 TB"],
          ["× 1.2 metadata", "60 TB"],
          ["× 3 replication", "180 TB"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i * 1.5)}>
            <Txt x={30} y={92 + i * 64} k="t" anchor="start">
              {a}
            </Txt>
            <Txt x={570} y={98 + i * 64} k="d" anchor="end" tone={i === 2 ? "lit" : undefined}>
              {b}
            </Txt>
          </g>
        ))}
      {step === 3 &&
        [
          ["search", 600, "lit"],
          ["read", 250, "sky"],
          ["write", 100, "ok"],
          ["other", 50, "mute"],
        ].map(([a, v, tone], i) => (
          <g key={a as string}>
            <Txt x={30} y={86 + i * 46} k="t" anchor="start">
              {a as string}
            </Txt>
            <Meter x={130} y={72 + i * 46} w={340 * ease(t)} h={18} value={v as number} max={600} tone={tone as Tone} />
            <Txt x={570} y={86 + i * 46} k="t" anchor="end">
              {`${v}/s`}
            </Txt>
          </g>
        ))}
      {step === 4 && (
        <g>
          <Txt x={30} y={92} k="t" anchor="start" opacity={o(0)}>
            100M × 10 KB of text
          </Txt>
          <Txt x={570} y={98} k="d" anchor="end" opacity={o(0)}>
            1 TB
          </Txt>
          <Txt x={30} y={156} k="t" anchor="start" opacity={o(1)}>
            {narrow ? "+ ES overhead" : "+ Elasticsearch overhead"}
          </Txt>
          <Txt x={570} y={162} k="d" anchor="end" tone="lit" opacity={o(1)}>
            ~3 TB
          </Txt>
          <Txt x={30} y={222} k="t" anchor="start" opacity={o(2)}>
            {narrow ? "20 API · 9 ES · 10 workers" : "20 API servers · 9 search nodes · 10 workers"}
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start">
        {[narrow ? "smallest: 50 users, 10K docs" : "the smallest tenant: 50 users and 10K documents", narrow ? "HIPAA-ready · SOC 2" : "HIPAA-ready, SOC 2 controls, encryption everywhere", narrow ? "growing 20% a year" : "growing 20% a year · S3 bills ~60 TB", narrow ? "~30M requests a day" : "~30M requests a day · searches are 60%", narrow ? "~40 instances in all" : "~40 instances across US, EU and APAC"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- architecture */

const REG = ["US", "EU", "APAC"];
const AWS = ["us-east-1", "eu-central-1", "ap-southeast-1"];

function Arch({ step, t, narrow }: SceneProps) {
  const k = ease(seg(t, 0.1, 0.9));
  const chips = ["API", "PG", "ES", "S3"];
  const rx = (i: number) => 20 + i * 190;
  return (
    <g>
      <Box x={150} y={20} w={300} h={50} label={narrow ? "Global control" : "Global control plane"} sub={narrow ? "no personal data" : "registry · flags · quotas · routing"} tone={step === 0 ? "lit" : undefined} />
      {REG.map((r, i) => (
        <g key={r}>
          <Wire d={`M${240 + i * 60} 70L${rx(i) + 90} 104`} dash />
          <rect className={`ax-box ${i === 1 && step > 0 ? "sky" : step === 0 ? "ok" : ""}`} x={rx(i)} y={104} width={180} height={150} />
          <Txt x={rx(i) + 10} y={124} k="k" anchor="start">
            {r}
          </Txt>
          {!narrow && (
            <Txt x={rx(i) + 170} y={124} k="s" anchor="end">
              {AWS[i]}
            </Txt>
          )}
          {chips.map((c, j) => (
            <Box key={c} x={rx(i) + 10 + (j % 2) * 84} y={136 + Math.floor(j / 2) * 56} w={76} h={46} label={c} tone={step === 1 && i === 1 && (c === "S3" || c === "ES") ? "lit" : step === 2 && i === 1 && (c === "ES" || c === "API") ? "lit" : undefined} />
          ))}
        </g>
      ))}
      {step === 0 && (
        <Txt x={300} y={96} k="s" tone="bad" opacity={seg(t, 0.4, 1)}>
          {narrow ? "no cross-region tenant data" : "NO CROSS-REGION DATA FLOW FOR TENANT DATA"}
        </Txt>
      )}
      {step === 1 && (
        <g>
          <Token x={lerp(300, 344, k)} y={lerp(96, 214, k)} s={11} tone="lit" />
          {t > 0.9 && <Token x={lerp(344, 260, seg(t, 0.9, 1))} y={170} s={9} tone="sky" />}
        </g>
      )}
      {step === 2 && <Token x={lerp(300, 260, k)} y={lerp(96, 214, k)} s={11} tone="lit" />}
      <Txt x={20} y={H - 16} anchor="start" tone={step === 0 ? "ok" : "lit"}>
        {[narrow ? "regional data planes" : "EU tenant data never leaves the EU region", narrow ? "presigned URL → S3 → queue → ES" : "presigned URL: bytes go straight to the EU bucket · queue → ES", narrow ? "server adds tenant_id filter" : "the search service adds tenant_id and permission filters"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- deep dives */

const ISO = [
  ["1 routing", "JWT tenant = subdomain"],
  ["2 application", "TenantContext · repository"],
  ["3 database", "row-level security"],
  ["4 search", "index per enterprise tenant"],
  ["5 storage", "S3 prefix · per-tenant keys"],
];
const SEC = ["edge: CDN, WAF, DDoS", "network: isolated DB subnet", "app: JWT + MFA, RBAC", "data: TLS 1.2+, AES-256", "monitoring: audit, SIEM"];

function Dives({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["deep dive 1 · tenant isolation", "deep dive 2 · noisy neighbours", "deep dives 3–4 · residency and deletion", "deep dive 5 · security"][step]}
      </Txt>
      {(step === 0 || step === 3) &&
        (step === 0 ? ISO : SEC.map((s) => s.split(": "))).map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <rect className={`ax-box ${step === 0 ? "lit" : "ok"}`} x={20} y={46 + i * 46} width={560} height={38} />
            <Txt x={34} y={70 + i * 46} k="t" anchor="start">
              {a}
            </Txt>
            {!narrow && (
              <Txt x={566} y={70 + i * 46} k="s" anchor="end">
                {b}
              </Txt>
            )}
          </g>
        ))}
      {step === 1 && (
        <g>
          {["Standard", "Professional", "Enterprise"].map((p, i) => (
            <Txt key={p} x={210 + i * 140} y={72} k="k" opacity={o(0)}>
              {narrow ? p.slice(0, 3) : p}
            </Txt>
          ))}
          {[
            ["search/min", "100", "1,000", "10,000"],
            ["API/min", "1,000", "10,000", "100,000"],
            ["uploads", "5", "20", "100"],
            ["timeout", "10 s", "30 s", "60 s"],
          ].map((r, j) =>
            r.map((c, i) => (
              <Txt key={`${j}${i}`} x={i === 0 ? 20 : 210 + (i - 1) * 140} y={112 + j * 40} k={i ? "t" : "s"} anchor={i ? "middle" : "start"} opacity={o(j + 1)} tone={i === 3 ? "lit" : undefined}>
                {c}
              </Txt>
            )),
          )}
        </g>
      )}
      {step === 2 && (
        <g>
          <Box x={20} y={50} w={270} h={180} label={narrow ? "EU tenant" : "EU tenant request"} sub="→ eu-central-1" tone="sky" opacity={o(0)} />
          <Box x={310} y={50} w={270} h={180} label={narrow ? "erasure" : "erasure request"} sub={t > 0.6 ? "verified ✓" : "orchestrated"} tone={t > 0.6 ? "ok" : "lit"} opacity={o(1)} />
          <Txt x={445} y={210} k="s" opacity={o(3)}>
            {narrow ? "legal hold: queued" : "legal hold: queued, user told"}
          </Txt>
          <Txt x={155} y={210} k="s" opacity={o(2)}>
            {narrow ? "consent · export" : "consent · data export"}
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {[narrow ? "the tenant can't be overridden" : "the tenant can't be overridden by parameters or headers", narrow ? "quotas by plan" : "quotas by plan, plus fair scheduling for background jobs", narrow ? "regional routing + orchestration" : "regional routing for residency · deletion orchestrated and verified", narrow ? "zero trust, layer by layer" : "defence in depth with zero trust principles"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- operate */

function Operate({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.15, i * 0.15 + 0.3);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["scale · 500 → 5,000 tenants", "alerting", "the decision"][step]}
      </Txt>
      {step === 0 &&
        [
          ["API servers", "20", "200"],
          ["PostgreSQL", "2 TB/region", "shard by tenant_id"],
          ["Elasticsearch", "~3 TB", "~30 TB"],
          ["S3", "180 TB", "1.8 PB"],
        ].map(([a, b, c], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={20} y={84 + i * 50} k="t" anchor="start">
              {narrow ? a.replace("Elasticsearch", "ES").replace("API servers", "API") : a}
            </Txt>
            {!narrow && (
              <Txt x={260} y={84 + i * 50} k="s" anchor="start">
                {b}
              </Txt>
            )}
            <Txt x={580} y={84 + i * 50} k="t" anchor="end" tone="lit">
              {narrow && c.startsWith("shard") ? "shard/tenant" : c}
            </Txt>
          </g>
        ))}
      {step === 1 &&
        [
          ["cross-tenant access", "0, or page now", "bad"],
          ["error rate", "> 1% · page", "bad"],
          ["search p99", "> 400 ms · warn", "warn"],
          ["deletion request", "near deadline · warn", "warn"],
        ].map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={20} y={84 + i * 50} k="t" anchor="start">
              {narrow ? a.split(" ")[0] : a}
            </Txt>
            <Txt x={580} y={84 + i * 50} k="t" anchor="end" tone={tone as Tone}>
              {b}
            </Txt>
          </g>
        ))}
      {step === 2 &&
        ["start with tenant isolation", "build compliance in", "per-tenant metrics, day one", "dedicated tiers, own keys", "security as code"].map((s, i) => (
          <g key={s} opacity={o(i)}>
            <Token x={30} y={70 + i * 44} s={12} tone="ok" />
            <Txt x={50} y={75 + i * 44} k="t" anchor="start">
              {s}
            </Txt>
          </g>
        ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {[narrow ? "a tenant's data stays together" : "sharding by tenant keeps a tenant's data together", narrow ? "isolation has no error budget" : "isolation has no acceptable rate: one leak is a breach", narrow ? "isolation, fairness, compliance" : "every feature must consider isolation, fairness and compliance"][step]}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "arch") return <Arch {...p} />;
  if (p.variant === "dives") return <Dives {...p} />;
  if (p.variant === "operate") return <Operate {...p} />;
  return <Reqs {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "reqs",
      label: "Requirements",
      steps: [
        { caption: "Design an enterprise document platform: 500 tenants across the US, EU and APAC, the largest with 50,000 users and 10 million documents. Sales hears GDPR, HIPAA, SSO, and slow search.", tween: 1600, ms: 3800 },
        { caption: "The bar: search under 500 milliseconds and API calls under 200 at p99, 99.9 percent uptime, and EU tenants' documents and metadata kept in the EU.", tween: 1400, ms: 3400 },
        { caption: "Storage: 100 million documents of 500 KB is 50 TB, 60 with metadata, 180 TB raw with three copies.", tween: 1600, ms: 3200 },
        { caption: "Traffic peaks at 1,000 requests a second: 600 searches, 250 reads, 100 writes and 50 others, about 30 million a day.", tween: 1400, ms: 3200 },
        { caption: "The search index is 100 million times 10 KB of text, 1 TB, about 3 TB in Elasticsearch, on roughly 40 instances in all.", tween: 1400, ms: 3200 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "A global control plane holds only the tenant registry, flags, quotas and routing, no personal data. Each region has its own API, PostgreSQL, Elasticsearch and S3.", tween: 1400, ms: 3600 },
        { caption: "An EU upload gets a presigned URL, so the bytes go straight to the EU bucket; a queue then extracts the text and indexes it in Elasticsearch.", tween: 1800, ms: 3400 },
        { caption: "A search passes through the search service, which adds the tenant_id and permission filters on the server before it queries Elasticsearch.", tween: 1600, ms: 3200 },
      ],
    },
    {
      id: "dives",
      label: "Deep dives",
      steps: [
        { caption: "Isolation in five layers: the tenant from the JWT matching the subdomain, TenantContext in the repository, row-level security, search index isolation, and tenant-scoped storage.", tween: 1600, ms: 3800 },
        { caption: "Noisy neighbours get quotas by plan: 100, 1,000 or 10,000 searches a minute, and 5, 20 or 100 concurrent uploads.", tween: 1400, ms: 3400 },
        { caption: "EU tenants route to eu-central-1, with consent and data export built in. An erasure request is orchestrated across systems and verified; a legal hold queues it.", tween: 1400, ms: 3600 },
        { caption: "Security is defence in depth: the edge with CDN and WAF, an isolated database subnet, JWT with MFA and RBAC, encryption, and audit monitoring.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "operate",
      label: "Operate",
      steps: [
        { caption: "At 5,000 tenants: 200 API servers, PostgreSQL sharded by tenant_id so a tenant's data stays together, 30 TB of search and 1.8 PB in S3.", tween: 1400, ms: 3400 },
        { caption: "Alerts: any cross-tenant access pages immediately, its target is zero. A deletion request nearing its deadline is a warning.", tween: 1400, ms: 3400 },
        { caption: "The decision: start with tenant isolation, build compliance in, add per-tenant metrics from day one. Every feature must consider isolation, fairness and compliance.", tween: 1600, ms: 3800 },
      ],
    },
  ],
  Scene,
});
