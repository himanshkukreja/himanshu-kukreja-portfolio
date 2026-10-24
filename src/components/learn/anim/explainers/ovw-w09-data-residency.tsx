/**
 * Week 9, day 3 overview (data residency and GDPR): the whole lesson in four tabs. Deutsche Bank's
 * "EU data stays in the EU" letter against a us-east-1-only stack; the four architecture patterns
 * (single region, regional deployments, global control plane + regional data, per-tenant region);
 * what data goes where (personal stays, operational can be global, backups and pseudonymized data
 * stay, the backup and logging mistakes); and consent, lawful basis and cross-border transfers.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type B = { x: number; y: number; w: number; h: number };
const RG: B[] = [
  { x: 20, y: 132, w: 180, h: 128 },
  { x: 210, y: 132, w: 180, h: 128 },
  { x: 400, y: 132, w: 180, h: 128 },
];
const RN = ["US", "EU", "APAC"];
const AWS = ["us-east-1", "eu-central-1", "ap-southeast-1"];
const CP: B = { x: 150, y: 44, w: 300, h: 54 };

function Region({ i, tone, dim, lines, narrow, o = 1 }: { i: number; tone?: Tone; dim?: boolean; lines: string[]; narrow: boolean; o?: number }) {
  const b = RG[i];
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect className={`ax-box ${tone || ""}`} x={b.x} y={b.y} width={b.w} height={b.h} />
      <Txt x={b.x + 12} y={b.y + 22} k="k" anchor="start">
        {RN[i]}
      </Txt>
      {!narrow && (
        <Txt x={b.x + b.w - 10} y={b.y + 22} k="s" anchor="end">
          {AWS[i]}
        </Txt>
      )}
      {lines.map((l, j) => (
        <Txt key={j} x={b.x + b.w / 2} y={b.y + 52 + j * 24} k="s" opacity={o} tone={l.endsWith("✗") ? "bad" : undefined}>
          {l}
        </Txt>
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- problem */

function Problem({ step, t, narrow }: SceneProps) {
  const o = seg(t, 0, 0.5);
  if (step === 0) {
    const asks = ["personal data stored only in the EU", "no transfer to the US without safeguards", "sign our DPA (GDPR Article 28)", "show us the architecture"];
    const short = ["data only in the EU", "no unsafe US transfer", "sign our DPA", "show the architecture"];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "from: Deutsche Bank legal" : "from: legal@deutschebank.example.de"}
        </Txt>
        <rect className="ax-box lit" x={20} y={44} width={560} height={210} />
        {asks.map((a, i) => (
          <g key={a} opacity={seg(t, i * 0.2, i * 0.2 + 0.3)}>
            <Txt x={44} y={86 + i * 46} k="d" anchor="start" tone="lit">
              {String(i + 1)}
            </Txt>
            <Txt x={80} y={80 + i * 46} k="t" anchor="start">
              {narrow ? short[i] : a}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 20} anchor="start">
          {narrow ? "a German enterprise deal" : "a German enterprise deal, waiting on one answer"}
        </Txt>
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          current state · everything in the US
        </Txt>
        <Region i={0} tone="bad" lines={narrow ? ["DB + backups", "BigQuery", "Zendesk · Sentry"] : ["PostgreSQL · us-east-1", "backups · us-west-2", "BigQuery · Zendesk", "Sentry"]} narrow={narrow} o={o} />
        <Region i={1} lines={narrow ? ["employees'", "data?"] : ["Deutsche Bank", "employees' data?"]} narrow={narrow} />
        <Region i={2} dim lines={[]} narrow={narrow} />
        <Token x={lerp(300, 120, ease(seg(t, 0.2, 0.9)))} y={112} s={12} tone="bad" />
        <Txt x={300} y={116} k="s" anchor="middle" tone="bad" opacity={seg(t, 0.9, 1)}>
          {narrow ? "EU → US" : "EU personal data → US"}
        </Txt>
        <Txt x={20} y={H - 20} anchor="start" tone="bad">
          {narrow ? "can't show EU data stays in EU" : "nothing to show that EU data stays in the EU"}
        </Txt>
      </g>
    );
  const opts: [string, string, Tone][] = [
    ["\"We can't\"", "lose the deal", "bad"],
    ["\"We comply!\"", narrow ? "4% fines" : "€20M or 4% fines", "bad"],
    [narrow ? "Re-architect" : "Re-architect", "this lesson", "ok"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        your three answers
      </Txt>
      {opts.map(([a, b, tone], i) => (
        <g key={a} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
          <Box x={RG[i].x} y={70} w={180} h={150} label={a} sub={b} tone={tone} />
        </g>
      ))}
      <Txt x={20} y={H - 20} anchor="start" tone="ok">
        {narrow ? "only one is a yes" : "only one of them is an honest yes"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- patterns */

function Patterns({ step, t, narrow }: SceneProps) {
  const o = seg(t, 0, 0.5);
  const ctl = step >= 2;
  const route = ease(seg(t, 0.1, 0.9));
  const kick = ["1 · single region", "2 · regional deployments", "3 · global control + regional data", "4 · per-tenant region"][step];
  const notes: [string, string, Tone][] = [
    ["simple and cheap · can't meet residency laws", "can't meet residency", "bad"],
    ["full isolation · no cross-region features", "full isolation · costly", "warn"],
    ["compliance + global features · define 'metadata' carefully", "metadata global", "ok"],
    ["an EU tenant's upload lands in eu-central-1, wherever it arrives", "EU file → EU bucket", "ok"],
  ];
  const lines = (i: number): string[] => {
    if (step === 0) return i === 0 ? (narrow ? ["app · DB · S3", "ALL data"] : ["app · DB · S3", "ALL regions' data"]) : [];
    if (step === 1) return [narrow ? "app+DB+S3" : "app + DB + storage", `${RN[i]} only`];
    if (step === 2) return [`${RN[i]} data`, narrow ? "personal" : "personal data"];
    return [["Tenant A", "Tenants B, C", "Tenant D"][i], `${RN[i]} data`];
  };
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {kick}
      </Txt>
      {ctl && (
        <g opacity={step === 2 ? o : 1}>
          <Box x={CP.x} y={CP.y} w={CP.w} h={CP.h} label={narrow ? "Global control" : "Global control plane"} sub={narrow ? "metadata only" : "tenant registry · config · routing"} tone="lit" />
          {RG.map((b, i) => (
            <Wire key={i} d={`M${300 + (i - 1) * 60} ${CP.y + CP.h}L${b.x + b.w / 2} ${b.y}`} dash />
          ))}
        </g>
      )}
      {RG.map((_, i) => (
        <Region key={i} i={i} narrow={narrow} lines={lines(i)} dim={step === 0 && i > 0} tone={step === 0 ? (i === 0 ? "warn" : undefined) : step === 3 && i === 1 ? "ok" : step >= 1 ? "sky" : undefined} o={step === 0 && i === 0 ? 1 : o} />
      ))}
      {step === 0 &&
        [1, 2].map((i) => <Token key={i} x={lerp(RG[i].x + 90, 110, route)} y={lerp(200, 196, route)} s={10} tone="warn" opacity={1 - seg(t, 0.85, 1)} />)}
      {step === 1 && (
        <Txt x={300} y={118} k="s" tone="warn" opacity={o}>
          {narrow ? "no sharing" : "NO DATA SHARING BETWEEN REGIONS"}
        </Txt>
      )}
      {step === 3 && (
        <Token
          x={route < 0.5 ? lerp(40, 300, route * 2) : 300}
          y={route < 0.5 ? 70 : lerp(98, 142, (route - 0.5) * 2)}
          s={12}
          tone="lit"
          label={route < 0.5 && !narrow ? "upload · tenant B" : undefined}
        />
      )}
      <Txt x={20} y={H - 20} anchor="start" tone={notes[step][2]}>
        {notes[step][narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- what goes where */

const ITEMS: { n: string; s: string; to: "eu" | "gl"; step: number; bad?: boolean }[] = [
  { n: "user profiles", s: "profiles", to: "eu", step: 0 },
  { n: "uploaded files", s: "files", to: "eu", step: 0 },
  { n: "logs with user IDs", s: "user logs", to: "eu", step: 0 },
  { n: "IP addresses", s: "IPs", to: "eu", step: 0 },
  { n: "aggregated analytics", s: "aggregates", to: "gl", step: 1 },
  { n: "system metrics", s: "metrics", to: "gl", step: 1 },
  { n: "config · feature flags", s: "config", to: "gl", step: 1 },
  { n: "pseudonymized data", s: "pseudonymized", to: "eu", step: 2 },
  { n: "backups · caches", s: "backups", to: "eu", step: 2 },
];

function Where({ step, t, narrow }: SceneProps) {
  const k = ease(seg(t, 0.1, 0.9));
  const eu: B = { x: 20, y: 44, w: 270, h: 230 };
  const gl: B = { x: 310, y: 44, w: 270, h: 230 };
  const slots = { eu: 0, gl: 0 };
  return (
    <g>
      <rect className={`ax-box ${step === 3 ? "bad" : "ok"}`} x={eu.x} y={eu.y} width={eu.w} height={eu.h} />
      <rect className="ax-box sky" x={gl.x} y={gl.y} width={gl.w} height={gl.h} />
      <Txt x={eu.x + 12} y={eu.y + 22} k="k" anchor="start">
        {narrow ? "EU region" : "EU region · residency applies"}
      </Txt>
      <Txt x={gl.x + 12} y={gl.y + 22} k="k" anchor="start" tone="sky">
        {narrow ? "global OK" : "global · usually OK"}
      </Txt>
      {step < 3 &&
        ITEMS.filter((it) => it.step <= step).map((it) => {
          const box = it.to === "eu" ? eu : gl;
          const j = slots[it.to]++;
          const fx = box.x + 30;
          const fy = box.y + 52 + j * 28;
          const moving = it.step === step;
          const x = moving ? lerp(300, fx, k) : fx;
          const y = moving ? lerp(H - 22, fy, k) : fy;
          return (
            <g key={it.n}>
              <Token x={x} y={y - 4} s={10} tone={it.to === "eu" ? "ok" : "sky"} />
              <Txt x={x + 14} y={y} k="s" anchor="start" tone={moving ? undefined : "mute"}>
                {narrow ? it.s : it.n}
              </Txt>
            </g>
          );
        })}
      {step === 3 &&
        [
          ["backups → s3 us-east-1 ✗", "backups → US ✗", "backups-eu-central-1 ✓", "EU backups ✓"],
          ["email → global Datadog ✗", "email → global ✗", "regional logs · user_id ✓", "regional logs ✓"],
          ["Mixpanel, no DPA ✗", "no DPA ✗", "DPA + pseudonymized ID ✓", "DPA first ✓"],
        ].map((r, i) => (
          <g key={i} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
            <Txt x={eu.x + 14} y={110 + i * 56} k="s" anchor="start" tone="bad">
              {narrow ? r[1] : r[0]}
            </Txt>
            <Txt x={gl.x + 14} y={110 + i * 56} k="s" anchor="start" tone="ok">
              {narrow ? r[3] : r[2]}
            </Txt>
          </g>
        ))}
      <Txt x={20} y={H - 14} anchor="start" tone={step === 2 ? "warn" : step === 3 ? "bad" : undefined}>
        {[narrow ? "can it identify a person?" : "can it identify a person? then it stays", narrow ? "no identifiers: global" : "no identifiers: it can be global", narrow ? "still personal data" : "pseudonymized is still personal · backups follow the primary", narrow ? "mistakes → fixes" : "common mistakes → fixes"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- consent + transfers */

function Consent({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.25, i * 0.25 + 0.3);
  if (step === 0) {
    const rows: [string, string, Tone][] = [
      ["\"your order has shipped\"", "contract", "ok"],
      ["\"weekly newsletter\"", "consent", "warn"],
      ["analytics cookies", "consent", "warn"],
      ["tax records", "legal obligation", "ok"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          lawful basis · why are you processing it?
        </Txt>
        {rows.map(([a, b, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={84 + i * 52} k="t" anchor="start">
              {narrow ? a.replace("your order has shipped", "order shipped").replace("weekly ", "") : a}
            </Txt>
            <Txt x={570} y={84 + i * 52} k="t" anchor="end" tone={tone}>
              {b}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 20} anchor="start">
          {narrow ? "optional boxes start unchecked" : "consent boxes start unchecked · no bundling"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const recs: [string, string, Tone][] = [
      ["analytics · GRANTED", "text · version · IP · time", "ok"],
      ["analytics · WITHDRAWN", "appended, not edited", "bad"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          consent log · append-only
        </Txt>
        {recs.map(([a, b, tone], i) => (
          <g key={a} opacity={i === 0 ? 1 : o(1)}>
            <Box x={20} y={56 + i * 80} w={340} h={60} label={a} sub={narrow ? undefined : b} tone={tone} />
          </g>
        ))}
        <Wire d="M360 166H420" tone="lit" arrow />
        <Box x={430} y={136} w={150} h={60} label={narrow ? "event" : "consent."} sub={narrow ? "withdrawn" : "withdrawn"} tone="lit" opacity={o(2)} />
        <Txt x={505} y={230} k="s" tone="bad" opacity={o(3)}>
          stop processing
        </Txt>
        <Txt x={20} y={H - 20} anchor="start">
          {narrow ? "easy to withdraw as to give" : "withdrawing must be as easy as giving · proof kept"}
        </Txt>
      </g>
    );
  }
  const ladder: [string, string, Tone][] = [
    ["adequacy decision", "safest", "ok"],
    ["SCCs + TIA", "most common", "sky"],
    ["BCRs", "corporate groups", "sky"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "EU → elsewhere" : "cross-border transfers · EU → elsewhere"}
      </Txt>
      {ladder.map(([a, b, tone], i) => (
        <g key={a} opacity={o(i)}>
          <Box x={20 + i * 190} y={60} w={180} h={70} label={narrow ? a.split(" ")[0] : a} sub={b} tone={tone} />
        </g>
      ))}
      <g opacity={o(2)}>
        <Txt x={30} y={170} k="t" anchor="start" tone="bad">
          {narrow ? "Privacy Shield ✗ (2020)" : "Privacy Shield: invalidated by Schrems II (2020)"}
        </Txt>
        <line className="ax-wire bad" x1={30} x2={narrow ? 190 : 146} y1={165} y2={165} />
        <Txt x={30} y={200} k="s" anchor="start">
          {narrow ? "adequacy can be revoked" : "adequacy can be revoked: keep a fallback to SCCs"}
        </Txt>
      </g>
      <Txt x={30} y={244} k="t" anchor="start" tone="ok" opacity={o(3)}>
        {narrow ? "a DPA with every processor" : "a DPA with every processor · SCPs block non-EU regions"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "patterns") return <Patterns {...p} />;
  if (p.variant === "where") return <Where {...p} />;
  if (p.variant === "consent") return <Consent {...p} />;
  return <Problem {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "Problem",
      steps: [
        { caption: "A German enterprise deal, then a letter from Deutsche Bank's legal team: our employees' personal data stays in the EU, and you sign our Data Processing Agreement.", tween: 1600, ms: 3600 },
        { caption: "Your stack lives in the US: PostgreSQL in us-east-1, backups in us-west-2, analytics in BigQuery, support in Zendesk, errors in Sentry.", tween: 1400, ms: 3600 },
        { caption: "You can say no and lose the deal, or say yes and risk fines up to 20 million euros or 4 percent of turnover. Or you re-architect.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "patterns",
      label: "Patterns",
      steps: [
        { caption: "Pattern one, a single region: all data from all regions in us-east-1. Simple and cheap, but it can't comply with residency laws.", tween: 1400 },
        { caption: "Pattern two, regional deployments: app, database and storage per region, with no data sharing. Strong compliance, but complex and expensive.", tween: 1200, ms: 3200 },
        { caption: "Pattern three keeps personal data regional and puts a global control plane on top, holding only metadata: the tenant registry, config and routing.", tween: 1200, ms: 3400 },
        { caption: "Pattern four routes by tenant. Tenant B is assigned to the EU, so its upload goes to eu-central-1, even when it lands on a US app server.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "where",
      label: "What goes where",
      steps: [
        { caption: "Personal data must respect residency: user profiles, uploaded files, activity logs with user IDs, and IP addresses.", tween: 1600 },
        { caption: "Operational data with no identifiers can usually be global: aggregated analytics, system metrics, configuration and feature flags.", tween: 1600 },
        { caption: "Grey areas stay in the region: pseudonymized data is still personal data under GDPR, and backups and caches follow the same rules as the primary.", tween: 1600, ms: 3400 },
        { caption: "The classic mistakes: backups copied to a US bucket, user emails in a global logging service, and a third-party tool with no DPA.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "consent",
      label: "Consent",
      steps: [
        { caption: "Every processing needs a lawful basis. Order updates are contract performance; a marketing newsletter or analytics cookies need consent.", tween: 1400, ms: 3400 },
        { caption: "Consent is recorded with the exact text, version, IP and time. A withdrawal is appended, never an edit, and consent.withdrawn tells every system to stop.", tween: 1600, ms: 3600 },
        { caption: "Transfers out of the EU need an adequacy decision, SCCs or BCRs. Privacy Shield fell to Schrems II, so keep a fallback, and sign a DPA with every processor.", tween: 1600, ms: 3800 },
      ],
    },
  ],
  Scene,
});
