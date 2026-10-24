/**
 * Whole-capstone overview (week 7 · legal document search): requirements (50M+ legal documents,
 * boolean / proximity / citation queries, private workspaces searchable in 5 minutes with zero
 * isolation false positives), the estimate (100M docs × 65 KB → 6.5 / 13 / 26 TB, 50 TB of PDFs,
 * ~80 TB; 50K users × 20/h → ~280 searches/s, 1,400 autocompletes/s), the architecture (gateway,
 * search / document / citation services, S3 → OCR → Kafka → indexer, public / private / citation
 * indices), the four deep dives (parser, tenant isolation, citations, ingestion triage) and scale &
 * ops (1B docs, type + date indices, hot / warm / cold tiers, alerts, the build order).
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const PX = 460;
const PW = 128;
type Fig = [string, string, string, Tone?];
type Row = [string, string, string?, Tone?];

function Figs({ figs, narrow, t }: { figs: Fig[]; narrow: boolean; t: number }) {
  return (
    <g>
      <rect className="ax-box" x={PX} y={36} width={PW} height={266} />
      {figs.map(([d, wl, nl, tn], i) => (
        <g key={i} opacity={seg(t, 0.25 + i * 0.25, 0.55 + i * 0.25)}>
          <Txt x={PX + PW / 2} y={110 + i * 110} k="d" tone={tn}>
            {d}
          </Txt>
          <Txt x={PX + PW / 2} y={136 + i * 110} k="s">
            {narrow ? nl : wl}
          </Txt>
        </g>
      ))}
    </g>
  );
}

/** stacked rows: [wide label, narrow label, right-hand note, tone] */
function Rows({ rows, y, narrow, t, h = 32, gap = 40, x = 14, w = 430 }: { rows: Row[]; y: number; narrow: boolean; t: number; h?: number; gap?: number; x?: number; w?: number }) {
  return (
    <g>
      {rows.map(([wl, nl, r, tn], i) => (
        <g key={i} opacity={seg(t, i * 0.12, i * 0.12 + 0.3)}>
          <rect className={`ax-box${tn ? ` ${tn}` : ""}`} x={x} y={y + i * gap} width={w} height={h} />
          <Txt x={x + 12} y={y + i * gap + h / 2 + 5} k="s" anchor="start" tone={tn}>
            {narrow ? nl : wl}
          </Txt>
          {r && (
            <Txt x={x + w - 10} y={y + i * gap + h / 2 + 5} k="s" anchor="end" tone={tn}>
              {r}
            </Txt>
          )}
        </g>
      ))}
    </g>
  );
}

function Head({ wide, short, narrow }: { wide: string; short: string; narrow: boolean }) {
  return (
    <Txt x={14} y={26} k="k" anchor="start">
      {narrow ? short : wide}
    </Txt>
  );
}

function Req({ step, t, narrow }: SceneProps) {
  const figs: Fig[][] = [
    [
      ["50M+", "legal documents", "documents"],
      ["6", "document types", "doc types"],
    ],
    [
      ["5min", "to searchable", "searchable", "lit"],
      ["0", "false positives", "false pos.", "ok"],
    ],
    [
      ["26TB", "Elasticsearch", "in ES"],
      ["~80TB", "total storage", "total", "lit"],
    ],
    [
      ["280/s", "peak searches", "searches", "lit"],
      ["1,400", "autocompletes/s", "suggest/s"],
    ],
  ];
  const body = [
    <g key={0}>
      <Box x={14} y={48} w={430} h={40} label={narrow ? "negligence /10 liability" : "negligence /10 liability AND court:SCOTUS"} tone="lit" />
      <Rows
        y={104}
        narrow={narrow}
        t={t}
        rows={[
          ["boolean: AND, OR, NOT, parentheses", "boolean AND OR NOT"],
          ["proximity: /10 words, /s sentence, /p para", "proximity /10 /s /p"],
          ["citations: cites:410 U.S. 113", "cites:410 U.S. 113"],
          ["filters: jurisdiction, date, judge, type", "jurisdiction, date"],
        ]}
      />
    </g>,
    <g key={1}>
      <Box
        x={14}
        y={48}
        w={430}
        h={70}
        label={narrow ? "public: all firms" : "public court documents: every subscriber"}
        sub={narrow ? undefined : "opinions · statutes · journals · patents"}
        tone="sky"
      />
      {["Firm A", "Firm B"].map((f, i) => (
        <g key={f} opacity={seg(t, 0.2 + i * 0.2, 0.5 + i * 0.2)}>
          <Box x={14 + i * 224} y={140} w={206} h={90} label={`${f} private`} sub={narrow ? "OCR'd uploads" : "uploaded contracts, OCR'd"} tone={i ? "ok" : "lit"} />
        </g>
      ))}
      <line className="ax-wire bad" x1={229} x2={229} y1={132} y2={240} strokeWidth={3} />
      <Txt x={229} y={262} k="s" tone="bad" opacity={seg(t, 0.6, 0.9)}>
        {narrow ? "never crosses" : "A never sees B: zero tolerance"}
      </Txt>
    </g>,
    <g key={2}>
      <Txt x={14} y={62} k="s" anchor="start">
        {narrow ? "100M docs × 65 KB" : "100M docs (50M public + 50M private) × ~65 KB"}
      </Txt>
      {(
        [
          ["raw text", 6.5, "6.5 TB", undefined],
          ["index ×2", 13, "13 TB", undefined],
          ["replicas ×2", 26, "26 TB", "lit"],
          ["PDFs in S3", 50, "50 TB", "sky"],
        ] as [string, number, string, Tone][]
      ).map(([l, v, s, tn], i) => (
        <g key={l} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
          <Txt x={14} y={100 + i * 50} k="s" anchor="start" tone={tn}>
            {l}
          </Txt>
          <Meter x={150} y={88 + i * 50} w={220} h={14} value={v * seg(t, i * 0.15, i * 0.15 + 0.4)} max={50} tone={tn || "mute"} />
          <Txt x={444} y={100 + i * 50} k="s" anchor="end" tone={tn}>
            {s}
          </Txt>
        </g>
      ))}
    </g>,
    <g key={3}>
      <Rows
        y={52}
        narrow={narrow}
        t={t}
        rows={[
          ["50,000 concurrent users at peak", "50,000 users"],
          ["× 20 searches an hour each", "× 20 / hour"],
          ["= 1M an hour ≈ 280 a second", "≈ 280 / second", undefined, "lit"],
          ["× 5 keystrokes = 1,400 autocompletes/s", "× 5 = 1,400 / s"],
          ["p99: simple < 500 ms, boolean < 2 s", "p99 < 500ms / 2s", undefined, "ok"],
        ]}
        gap={48}
        h={36}
      />
    </g>,
  ][step];
  return (
    <g>
      <Head wide={["the problem", "private workspaces", "estimate: storage", "estimate: traffic"][step]} short={["problem", "workspaces", "storage", "traffic"][step]} narrow={narrow} />
      {body}
      <Figs figs={figs[step]} narrow={narrow} t={t} />
    </g>
  );
}

/* architecture frame: x 14..444 */
const P = {
  gw: { x: 14, y: 120, w: 70, h: 60 },
  search: { x: 104, y: 44, w: 92, h: 40 },
  cite: { x: 104, y: 128, w: 92, h: 40 },
  doc: { x: 104, y: 212, w: 92, h: 40 },
  ocr: { x: 222, y: 212, w: 62, h: 40 },
  kafka: { x: 292, y: 212, w: 76, h: 40 },
  idx: { x: 376, y: 212, w: 68, h: 40 },
};
const IR = (i: number) => 62 + i * 38;
const pts = {
  upload: [
    [84, 150],
    [104, 232],
    [222, 232],
    [286, 232],
  ],
  index: [
    [368, 232],
    [410, 232],
    [410, 182],
  ],
  search: [
    [84, 150],
    [104, 64],
    [196, 64],
    [226, IR(0) + 15],
  ],
} as Record<string, number[][]>;
function along(ps: number[][], p: number) {
  const n = ps.length - 1;
  const k = Math.min(n - 1, Math.floor(p * n));
  const q = p * n - k;
  return {
    x: lerp(ps[k][0], ps[k + 1][0], q),
    y: lerp(ps[k][1], ps[k + 1][1], q),
  };
}

function Arch({ step, t, narrow }: SceneProps) {
  const on = (k: string) =>
    (
      ({
        gw: [0, 1, 3],
        search: [0, 3],
        cite: [0, 2],
        doc: [0, 1],
        ocr: [1],
        kafka: [1, 2],
        idx: [2],
        s3: [1],
        pub: [3],
        priv: [2, 3],
        cit: [2],
        redis: [3],
      }) as Record<string, number[]>
    )[k].includes(step);
  const lab: Record<string, [string, string]> = {
    gw: ["API GW", "GW"],
    search: ["Search", "Search"],
    cite: ["Citation", "Cite"],
    doc: ["Document", "Docs"],
    ocr: ["OCR", "OCR"],
    kafka: ["Kafka", "Kafka"],
    idx: ["Index", "Index"],
  };
  const figs: Fig[][] = [
    [
      ["3", "services", "services"],
      ["JWT", "auth + limits", "auth", "lit"],
    ],
    [
      ["50TB", "originals in S3", "in S3", "sky"],
      ["6", "OCR processors", "processors"],
    ],
    [
      ["2-3m", "to searchable", "searchable", "ok"],
      ["<24h", "citation links", "citations"],
    ],
    [
      ["300/s", "peak searches", "searches", "lit"],
      ["500ms", "simple p99", "simple p99", "ok"],
    ],
  ];
  const tok = step === 1 ? along(pts.upload, seg(t, 0, 0.9)) : step === 2 ? along(pts.index, seg(t, 0, 0.9)) : step === 3 ? along(pts.search, seg(t, 0, 0.9)) : null;
  return (
    <g>
      <Head wide={["architecture", "upload path", "indexing", "search path"][step]} short={["architecture", "upload", "indexing", "search"][step]} narrow={narrow} />
      {[64, 148, 232].map((y, i) => (
        <Wire key={y} d={`M84 150C94 150 94 ${y} 104 ${y}`} tone={step === 0 || (step === 1 && i === 2) || (step === 3 && i === 0) ? "lit" : undefined} />
      ))}
      <Wire d={`M196 64H234`} tone={step === 3 ? "lit" : undefined} />
      <Wire d={`M196 64C214 64 214 ${IR(1) + 15} 234 ${IR(1) + 15}`} tone={step === 3 ? "lit" : undefined} />
      <Wire d={`M196 232H222M284 232H292M368 232H376`} tone={step === 1 || step === 2 ? "lit" : undefined} />
      <Wire d={`M410 212V176`} tone={step === 2 ? "lit" : undefined} arrow />
      <Wire d={`M330 212C330 190 220 148 196 148`} tone={step === 2 ? "lit" : undefined} dash />
      <Wire d={`M196 148C214 148 214 ${IR(2) + 15} 234 ${IR(2) + 15}`} tone={step === 2 ? "lit" : undefined} />
      <Wire d={`M150 252V270`} tone={step === 1 ? "lit" : undefined} />
      {Object.entries(P).map(([k, b]) => (
        <Box key={k} {...b} label={narrow ? lab[k][1] : lab[k][0]} sub={k === "gw" && !narrow ? "JWT" : undefined} tone={on(k) ? "lit" : undefined} dim={!on(k)} />
      ))}
      <rect className="ax-box" x={222} y={36} width={222} height={140} />
      <Txt x={234} y={52} k="s" anchor="start">
        Elasticsearch
      </Txt>
      {(
        [
          ["pub", "public · 50M docs", "public 50M"],
          ["priv", "private_docs_<firm>", "private/firm"],
          ["cit", "citations index", "citations"],
        ] as [string, string, string][]
      ).map(([k, w, n], i) => (
        <Box key={k} x={234} y={IR(i)} w={198} h={30} label={narrow ? n : w} tone={on(k) ? (k === "pub" ? "sky" : "lit") : undefined} dim={!on(k)} />
      ))}
      {(
        [
          ["s3", "S3 files", "S3", 104, 92],
          ["pg", "PostgreSQL", "Postgres", 222, 104],
          ["redis", "Redis cache", "Redis", 336, 108],
        ] as [string, string, string, number, number][]
      ).map(([k, w, n, x, bw]) => (
        <Box key={k} x={x} y={270} w={bw} h={32} label={narrow ? n : w} tone={k !== "pg" && on(k) ? "sky" : undefined} dim={k === "pg" || !on(k)} />
      ))}
      {tok && <Token x={tok.x} y={tok.y} s={12} tone="lit" />}
      <Figs figs={figs[step]} narrow={narrow} t={t} />
    </g>
  );
}

function Hard({ step, t, narrow }: SceneProps) {
  const figs: Fig[][] = [
    [
      ["35%", "boolean queries", "boolean"],
      ["15%", "proximity", "proximity"],
    ],
    [
      ["5", "layers", "layers", "lit"],
      ["0", "cross-firm", "cross-firm", "ok"],
    ],
    [
      ["2-hop", "citation depth", "depth"],
      ["<24h", "links fresh", "links"],
    ],
    [
      ["98.5%", "OCR success", "OCR ok", "ok"],
      ["6", "processors", "processors"],
    ],
  ];
  const rows: Row[][] = [
    [
      ["lexer → 9 tokens", "lexer: tokens"],
      ["parser → AST: AND(NEAR/5, damages, NOT)", "parser: AST"],
      ["builder → bool: span_near, match", "builder: bool"],
      ["must_not: punitive · + tenant filter", "+ tenant filter", undefined, "lit"],
    ],
    [
      ["1 · index per firm: private_docs_<firm>", "1 index per firm"],
      ["2 · tenant filter injected by the service", "2 filter injected"],
      ["3 · document-level security", "3 doc-level"],
      ["4 · tenant from the JWT, not the body", "4 tenant from JWT", undefined, "lit"],
      ["5 · every search audit-logged", "5 audit log"],
    ],
    [],
    [
      ["PDF with text → extract directly", "text PDF → extract"],
      ["Word / DOCX → Apache Tika", "Word → Tika"],
      ["scanned PDF / image → OCR pipeline", "scan → OCR", undefined, "lit"],
      ["  deskew, denoise → Tesseract → post-process", "deskew → Tesseract", undefined, "lit"],
      ["unknown → Tika with fallback", "unknown → Tika"],
    ],
  ];
  const cites: [string, number, Tone][] = [
    ["followed", 12000, "ok"],
    ["distinguished", 2500, "sky"],
    ["mentioned", 734, "mute"],
    ["overruled", 0, "bad"],
  ];
  return (
    <g>
      <Head
        wide={["deep dive 1 · query parser", "deep dive 2 · tenant isolation", "deep dive 3 · citations", "deep dive 4 · ingestion"][step]}
        short={["1 · parser", "2 · isolation", "3 · citations", "4 · ingestion"][step]}
        narrow={narrow}
      />
      {step === 0 && <Box x={14} y={40} w={430} h={36} label={narrow ? "(breach /5 contract) AND…" : "(breach /5 contract) AND damages NOT punitive"} tone="lit" />}
      {step === 2 ? (
        <g>
          <Box x={14} y={40} w={430} h={46} label={narrow ? "Brown v. Board" : "Brown v. Board of Education"} sub={narrow ? undefined : "347 U.S. 483 · cited 15,234 times"} tone="lit" />
          {cites.map(([l, v, tn], i) => (
            <g key={l} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
              <Txt x={14} y={120 + i * 36} k="s" anchor="start" tone={tn}>
                {narrow && l === "distinguished" ? "disting." : l}
              </Txt>
              <Meter x={140} y={108 + i * 36} w={230} h={14} value={v * seg(t, 0.1, 0.7)} max={12000} tone={tn} />
              <Txt x={444} y={120 + i * 36} k="s" anchor="end" tone={tn}>
                {v.toLocaleString("en-US")}
              </Txt>
            </g>
          ))}
          <Txt x={14} y={270} k="s" anchor="start" tone="ok">
            {narrow ? "0 overruled: good law" : "0 overruled: still good law"}
          </Txt>
          <Txt x={14} y={294} k="s" anchor="start">
            {narrow ? "edges: citing → cited" : "edges index: citing_id, cited_id, treatment"}
          </Txt>
        </g>
      ) : (
        <Rows rows={rows[step]} y={step === 0 ? 96 : 44} gap={step === 0 ? 50 : 52} h={step === 0 ? 38 : 40} narrow={narrow} t={t} />
      )}
      <Figs figs={figs[step]} narrow={narrow} t={t} />
    </g>
  );
}

function Ops({ step, t, narrow }: SceneProps) {
  const figs: Fig[][] = [
    [
      ["1B", "documents", "documents", "lit"],
      ["~90", "data nodes", "data nodes"],
    ],
    [
      ["ILM", "moves indices", "moves", "lit"],
      ["3", "tiers", "tiers"],
    ],
    [
      ["0", "tenant attempts", "attempts", "ok"],
      ["320ms", "p99 · < 500ms", "p99", "ok"],
    ],
    [
      ["1st", "isolation", "isolation", "lit"],
      ["5", "build steps", "steps"],
    ],
  ];
  const rows: Row[][] = [
    [
      ["cases_federal_2020-2024", "fed_2020-24", "5 shards", "lit"],
      ["cases_federal_2015-2019", "fed_2015-19", "5 shards"],
      ["cases_state_california", "state_ca", "3 shards"],
      ["statutes_federal", "statutes", "2 shards"],
      ["private_docs_*", "private_*", "1-3 each"],
    ],
    [],
    [
      ["any cross-tenant access attempt", "cross-tenant try", "page", "bad"],
      ["cluster RED > 1 minute", "RED > 1 min", "page", "bad"],
      ["p99 > 2 s for 5 minutes", "p99 > 2s 5m", "page", "bad"],
      ["YELLOW > 10 min · OCR < 95%", "YELLOW / OCR", "Slack", "warn"],
      ["new tenant · large document", "new tenant", "info"],
    ],
    [
      ["1 · tenant isolation", "1 isolation", "security", "lit"],
      ["2 · boolean search", "2 boolean search"],
      ["3 · ingestion with OCR", "3 OCR ingestion"],
      ["4 · citation extraction and linking", "4 citations"],
      ["5 · proximity, analytics", "5 advanced"],
    ],
  ];
  const tiers: [string, string, string, Tone][] = [
    ["hot", "last 2 years", "fast SSD", "bad"],
    ["warm", "2-5 years", "std SSD", "warn"],
    ["cold", "5+ years", "HDD", "sky"],
  ];
  return (
    <g>
      <Head
        wide={["10x: 1B documents, 260 TB", "tiered storage", "monitoring & alerts", "what to build first"][step]}
        short={["10x: 1B docs", "tiers", "alerts", "build order"][step]}
        narrow={narrow}
      />
      {step === 1 ? (
        tiers.map(([n, a, s, tn], i) => (
          <g key={n} opacity={seg(t, i * 0.2, i * 0.2 + 0.4)}>
            <Box x={14 + i * 146} y={48} w={138} h={200} label={n} tone={tn} />
            <Txt x={83 + i * 146} y={186} k="s">
              {a}
            </Txt>
            <Txt x={83 + i * 146} y={208} k="s" tone={tn}>
              {s}
            </Txt>
            {i < 2 && <Wire d={`M${152 + i * 146} 270H${160 + i * 146}`} />}
          </g>
        ))
      ) : (
        <Rows rows={rows[step]} y={44} gap={52} h={40} narrow={narrow} t={t} />
      )}
      {step === 1 && (
        <Txt x={229} y={280} k="s" opacity={seg(t, 0.6, 1)}>
          {narrow ? "1 replica each" : "1 replica each · indices age to the right"}
        </Txt>
      )}
      {step === 0 && <Token x={lerp(470, 452, seg(t, 0.3, 0.8))} y={64} s={12} tone="lit" />}
      <Figs figs={figs[step]} narrow={narrow} t={t} />
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "req" ? <Req {...p} /> : p.variant === "arch" ? <Arch {...p} /> : p.variant === "hard" ? <Hard {...p} /> : <Ops {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "req",
      label: "Requirements",
      steps: [
        {
          caption: "Lawyers search 50M+ legal documents with boolean, proximity and citation queries, plus jurisdiction and date filters.",
          tween: 1400,
        },
        {
          caption: "Firms also upload private documents, OCR'd and searchable within 5 minutes, and strictly isolated: zero false positives.",
          tween: 1400,
        },
        {
          caption: "100M documents at ~65 KB: 6.5 TB of text, 13 TB indexed, 26 TB with replicas, plus 50 TB of PDFs in S3. About 80 TB.",
          tween: 1800,
        },
        {
          caption: "50,000 users at 20 searches an hour is 1M an hour, about 280 a second; 5 keystrokes each make 1,400 autocompletes a second.",
          tween: 1600,
        },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        {
          caption: "An API gateway authenticates (JWT) and rate-limits, in front of three services: search, documents and citations.",
          tween: 1000,
        },
        {
          caption: "An upload: the original goes to S3, OCR and extractors pull text, metadata and citations, then document.created goes to Kafka.",
          tween: 2000,
        },
        {
          caption: "The indexer writes it to that firm's private index and the citation service updates the citations index: searchable in 2 to 3 minutes.",
          tween: 1600,
        },
        {
          caption: "A search hits the public index plus only that firm's private index, with Redis as cache. Simple searches stay under 500 ms p99.",
          tween: 1800,
        },
      ],
    },
    {
      id: "hard",
      label: "Deep dives",
      steps: [
        {
          caption: "The query parser: a lexer tokenizes, a parser builds an AST, and a builder emits an Elasticsearch bool query with span_near for /5.",
          tween: 1600,
        },
        {
          caption: "Tenant isolation is defense in depth: index per firm, injected filter, document-level security, tenant from the JWT, and audit logs.",
          tween: 1800,
        },
        {
          caption: "Citations: Brown v. Board is cited 15,234 times, 12,000 followed and 0 overruled, so it's still good law. Edges get their own index.",
          tween: 1600,
        },
        {
          caption: "Ingestion triage: text PDFs are extracted directly, Word goes to Tika, and scans go through OCR: deskew, denoise, Tesseract.",
          tween: 1600,
        },
      ],
    },
    {
      id: "ops",
      label: "Scale & ops",
      steps: [
        {
          caption: "At 10x, 1B documents and 260 TB, split indices by type and date and route queries: a 2023 search skips the older indices.",
          tween: 1400,
        },
        {
          caption: "Tiered storage: hot (last 2 years) on fast SSD, warm (2 to 5 years) on standard SSD, cold (5+ years) on HDD, moved by ILM.",
          tween: 1400,
        },
        {
          caption: "Alerts page on any cross-tenant access attempt, a red cluster over 1 minute or p99 over 2 s. The dashboard shows 0 attempts.",
          tween: 1400,
        },
        {
          caption: "Build order: tenant isolation first, then boolean search, OCR ingestion and citations, advanced features last. Generic search won't do.",
          tween: 1600,
          ms: 3400,
        },
      ],
    },
  ],
  Scene,
});
