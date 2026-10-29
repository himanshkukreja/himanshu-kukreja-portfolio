/**
 * Whole-lesson overview (week 11, day 3 · RAG systems). The illustrative Tuesday (a poison message,
 * the 30 → 10 day policy, 212 answers citing the old rule, searchable 23 hours late); retrieve then
 * generate; parsing and section-aware chunking; contextual retrieval (5.7% → 3.7% → 2.9% → 1.9%);
 * chunk metadata and dedup; CDC with idempotent upserts and a DLQ, a freshness SLO and
 * reconciliation, versions and a blue/green re-embed (~980M tokens, ~$59, ~2 h); query rewriting,
 * 150 candidates reranked to 8, the token budget, lost in the middle, citations; permission-aware
 * retrieval, a reranker outage, and when RAG is the wrong tool.
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  cms: nd(0, 0, "CMS"),
  kafka: nd(1, 0, "Kafka"),
  ing: nd(2, 0, "Ingestion", "Ingest"),
  idx: nd(3, 0, "pgvector + BM25", "Index"),
  acl: nd(0, 1, "ACL"),
  dlq: nd(1, 1, "DLQ"),
  ret: nd(2, 1, "Retrieval", "Retrieve"),
  rr: nd(3, 1, "Reranker"),
  cust: nd(0, 2, "Customer", "Cust"),
  assist: nd(1, 2, "Assist"),
  llm: nd(2, 2, "LLM"),
  ctx: nd(3, 2, "Context"),
};
const E: Ed[] = [
  ["cms", "kafka"],
  ["kafka", "ing"],
  ["ing", "idx"],
  ["ing", "dlq", 12, -8],
  ["idx", "ret", 12, -10],
  ["ret", "rr", 10, 10],
  ["rr", "ctx"],
  ["ctx", "llm"],
  ["llm", "assist", 6, 6],
  ["cust", "assist"],
  ["assist", "ret", -12, 10],
  ["assist", "acl", -12, 0],
];

const F: Record<string, Fr[]> = {
  tue: [
    {
      k: ["one Tuesday at MegaMart", "one Tuesday"],
      kt: "bad",
      on: { cms: "lit", kafka: "bad", ing: "bad", idx: "warn", cust: 1, assist: 1, llm: "warn" },
      sub: { kafka: "backlog", ing: "stuck retrying", idx: "30-day policy", llm: "cites §2.1" },
      fl: [["cms", "kafka", "warn"]],
      chips: [
        ["Sun 23:40 · poison message", "Sun · poison message"],
        ["Tue 10:02 · new 10-day rule", "Tue · 10-day rule"],
        ["14:30 · \"30 days\", cites §2.1", "14:30 · told yes"],
        ["17:00 · 212 wrong promises", "17:00 · 212 answers"],
        ["Wed 09:15 · DLQ, backlog drains", "Wed · DLQ, drains"],
        ["searchable 23 hours late", "23 hours late"],
      ],
      ctn: ["bad", "warn", "bad", "bad", "ok", "warn"],
      note: ["the model quoted what it was given: the bug was in the pipeline", "the bug: the pipeline"],
    },
    {
      k: ["retrieve, then generate", "retrieve, generate"],
      on: { cms: 1, kafka: 1, ing: "lit", idx: "lit", ret: "lit", rr: 1, ctx: 1, llm: "lit", assist: 1, cust: 1 },
      fl: [
        ["kafka", "ing"],
        ["ing", "idx"],
        ["assist", "ret"],
        ["ctx", "llm"],
      ],
      chips: [
        ["ingestion: parse, chunk, embed", "offline: ingest"],
        ["query: rewrite, retrieve, rerank", "online: query"],
        ["swapped index: 70% → 12%", "70% → 12%"],
        ["< 200,000 tokens: one prompt", "< 200K: one prompt"],
        ["MegaMart: ~1 billion tokens", "~1B tokens: retrieve"],
      ],
      ctn: ["lit", "lit", "warn", "sky", "ok"],
      note: ["the answer is only as fresh as the index", "only as fresh as the index"],
    },
  ],
  ingest: [
    {
      k: ["parse, then chunk by section", "parse and chunk"],
      on: { cms: "lit", kafka: 1, ing: "lit" },
      sub: { ing: "section-aware" },
      fl: [
        ["cms", "kafka"],
        ["kafka", "ing"],
      ],
      cols: 1,
      chips: [
        ["flattened: \"Electronics | Opened | 10 days | 15%\"", "flattened table: lost"],
        ["(a) 1,500 tokens: diluted · (b) 200: cut from heading", "(a) diluted · (b) headless"],
        ["(c) one chunk a section, titles inside: choose this", "(c) per section: choose"],
      ],
      ctn: ["bad", "warn", "ok"],
      note: ["Chroma: 200 tokens, no overlap did well; measure on your own data", "measure on your data"],
    },
    {
      k: ["contextual retrieval", "contextual retrieval"],
      kt: "ok",
      on: { ing: "ok", idx: "lit" },
      sub: { ing: "+50–100 tokens", idx: "top-20 failures" },
      fl: [["ing", "idx", "ok"]],
      bars: [
        [["baseline · 5.7%", "baseline · 5.7%"], 5.7, 5.7, "bad"],
        [["+ contextual embeddings · 3.7%", "+ context · 3.7%"], 3.7, 5.7, "warn"],
        [["+ contextual BM25 · 2.9%", "+ BM25 · 2.9%"], 2.9, 5.7, "sky"],
        [["+ reranking · 1.9%", "+ rerank · 1.9%"], 1.9, 5.7, "ok"],
      ],
    },
    {
      k: ["what every chunk carries", "chunk metadata"],
      on: { ing: "lit", idx: "lit" },
      sub: { idx: "chunks + metadata" },
      fl: [["ing", "idx"]],
      chips: [
        ["doc_id, version, chunk_no", "doc_id · version"],
        ["content_hash: dedup, skip", "content_hash"],
        ["effective_from, effective_to", "effective dates"],
        ["tenant_id, acl", "tenant_id · acl"],
        ["lang: the BM25 analyser", "lang"],
        ["embed_model: voyage-4@1024", "embed_model"],
      ],
      ctn: ["lit", "sky", "warn", "bad", "sky", "lit"],
      note: ["dedup: 25,000 seller pages with the same terms return 20 copies", "dedup boilerplate copies"],
    },
  ],
  fresh: [
    {
      k: ["change events into the index", "change events"],
      kt: "ok",
      on: { cms: "lit", kafka: "lit", ing: "lit", idx: "ok", dlq: "warn" },
      sub: { kafka: "by doc_id", ing: "idempotent", dlq: "after 5 fails" },
      fl: [
        ["cms", "kafka"],
        ["kafka", "ing"],
        ["ing", "idx", "ok"],
        ["ing", "dlq", "warn"],
      ],
      chips: [
        ["topic keyed by doc_id: in order", "keyed by doc_id"],
        ["upsert doc_id:version:chunk_no", "idempotent upserts"],
        ["deletes are events too", "deletes are events"],
        ["poison → DLQ after 5 failures", "poison → DLQ"],
      ],
      ctn: ["lit", "ok", "warn", "bad"],
      note: ["the Tuesday fix: one poison message mustn't block every later change", "poison mustn't block"],
    },
    {
      k: ["freshness is an SLO", "freshness SLO"],
      kt: "warn",
      on: { cms: "warn", kafka: 1, ing: 1, idx: "lit" },
      sub: { cms: "relay down", idx: "canary doc" },
      figs: [
        ["99%", ["searchable in 5 min", "in 5 minutes"], "ok"],
        ["1/min", ["canary document edit", "canary edit"], "sky"],
        ["0", ["lag: no events came", "lag, DLQ empty"], "warn"],
      ],
      note: ["reconcile doc_id → content_hash between CMS and index, like a TTL", "reconcile hashes"],
    },
    {
      k: ["versions, and a model change", "versions + re-embed"],
      on: { ing: "lit", idx: "ok" },
      sub: { idx: "chunks_v1 → v2", ing: "dual-write" },
      fl: [["ing", "idx", "ok"]],
      figs: [
        ["~980M", ["tokens to embed", "tokens"], "lit"],
        ["~$59", ["to re-embed it all", "re-embed"], "ok"],
        ["~2 h", ["at tier 1's 8M/min", "at tier 1"], "warn"],
      ],
      note: ["keep old versions by effective date; reindex blue/green, flip an alias", "blue/green behind an alias"],
    },
  ],
  query: [
    {
      k: ["rewrite the question", "rewrite"],
      on: { cust: "lit", assist: "lit", llm: 1 },
      sub: { assist: "small model" },
      fl: [["cust", "assist"]],
      cols: 1,
      chips: [
        ["\"headphone khol liya, wapas ho jayega?\"", "\"headphone khol liya…\""],
        ["→ \"return window for opened headphones\"", "→ opened headphones"],
        ["follow-ups, two-in-one, Hinglish, HyDE", "follow-ups, Hinglish"],
      ],
      ctn: ["sky", "ok", "lit"],
      note: ["a small model, skipped for standalone messages; log the rewrite", "log the rewritten query"],
    },
    {
      k: ["150 candidates, reranked to 8", "150 → 8"],
      kt: "ok",
      on: { assist: "lit", idx: "lit", ret: "lit", rr: "ok" },
      sub: { ret: "hybrid · 150", rr: "cross-encoder" },
      fl: [
        ["assist", "ret"],
        ["idx", "ret"],
        ["ret", "rr", "ok"],
      ],
      figs: [
        ["150", ["hybrid candidates", "candidates"], "lit"],
        ["8", ["kept by the reranker", "kept"], "ok"],
      ],
      note: ["below the score threshold: don't answer from weak context, offer a human", "weak: abstain, hand off"],
    },
    {
      k: ["a per-turn token budget", "token budget"],
      on: { assist: 1, rr: 1, ctx: "lit", llm: "lit" },
      sub: { ctx: "≤ 3,200 tokens" },
      fl: [
        ["rr", "ctx"],
        ["ctx", "llm"],
      ],
      bars: [
        [["20 × 800 · 16,000 a turn", "20 × 800 · 16,000"], 16000, 16000, "bad"],
        [["8 × 400 · ≤ 3,200 a turn", "8 × 400 · 3,200"], 3200, 16000, "ok"],
        [["instructions · ~1,200", "instructions · 1,200"], 1200, 16000, "sky"],
      ],
      note: ["history ≤ 1,500, output ~400; keep citation ids, not old chunks", "keep ids, not old chunks"],
    },
    {
      k: ["lost in the middle", "lost in the middle"],
      kt: "warn",
      on: { ctx: "warn", llm: "warn" },
      sub: { ctx: "best first" },
      fl: [["ctx", "llm", "warn"]],
      figs: [
        [">20%", ["drop, answer mid-context", "drop mid-context"], "bad"],
        ["56.1%", ["closed-book score", "closed-book"], "warn"],
        ["~1.5%", ["gain past 20 documents", "past 20 docs"], "sky"],
      ],
      note: ["choose k by measurement, best first, stop when more stops helping", "measure k, best first"],
    },
    {
      k: ["cite chunk ids, then check them", "citations"],
      kt: "ok",
      on: { llm: "ok", assist: "lit", cust: "ok", ctx: 1 },
      sub: { llm: "cites ids", cust: "10 days" },
      fl: [
        ["llm", "assist", "ok"],
        ["assist", "cust", "ok"],
      ],
      chips: [
        ["the model cites chunk ids", "cites chunk ids"],
        ["every cited id was sent", "cited id was sent"],
        ["every quote is in that chunk", "quote is in chunk"],
        ["show section, date and link", "section, date, link"],
      ],
      ctn: ["lit", "ok", "ok", "sky"],
      note: ["a valid citation isn't a current one: Tuesday's were perfect", "valid ≠ current"],
    },
  ],
  perm: [
    {
      k: ["filter where?", "filter where?"],
      kt: "bad",
      on: { assist: 1, ret: "bad", llm: "warn" },
      sub: { ret: "drops after 20" },
      fl: [["assist", "ret", "bad"]],
      cols: 1,
      chips: [
        ["after top 20: nothing left; Acme's contract was 21st", "after top-k: nothing left"],
        ["\"don't reveal other companies' terms\": already in context", "a prompt isn't access control"],
        ["filter by tenant and ACL inside retrieval, as the user", "filter inside, as the user"],
      ],
      ctn: ["bad", "bad", "ok"],
      note: ["retrieval runs as the user: the assistant has no permissions of its own", "retrieval runs as the user"],
    },
    {
      k: ["three ways to enforce it", "enforce it"],
      kt: "ok",
      on: { assist: "lit", acl: "ok", ret: "ok", idx: "lit" },
      sub: { acl: "per user", ret: "authorised only" },
      fl: [
        ["assist", "acl", "ok"],
        ["assist", "ret"],
        ["idx", "ret", "ok"],
      ],
      chips: [
        ["contracts: per-tenant partition", "contracts: per tenant"],
        ["playbooks: ACL pre-filter", "playbooks: ACL filter"],
        ["tickets: the customer's own", "tickets: own only"],
        ["fast-changing ACLs: late check", "late check at source"],
        ["entitlements down: public only", "down: public only"],
        ["derived data: summaries, caches", "derived data leaks"],
      ],
      ctn: ["ok", "ok", "ok", "sky", "warn", "bad"],
      note: ["OWASP LLM08: context leakage between users sharing a vector store", "OWASP: context leakage"],
    },
    {
      k: ["the reranker times out", "reranker down"],
      kt: "warn",
      on: { ret: 1, rr: "bad", ctx: "warn", llm: "warn" },
      sub: { rr: "timeouts at peak", ctx: "unreranked top 8" },
      fl: [["ret", "rr", "bad"]],
      chips: [
        ["top 8 of 150, unreranked", "unreranked top 8"],
        ["right chunk 12th, not 1st", "right chunk 12th"],
        ["no error rate moves", "no errors move"],
        ["breaker, smaller cross-encoder", "smaller reranker"],
        ["higher abstain, more handoffs", "abstain more"],
        ["tag unreranked answers, alert", "tag and alert"],
      ],
      ctn: ["warn", "bad", "bad", "ok", "ok", "sky"],
    },
    {
      k: ["when RAG is the wrong tool", "RAG or not?"],
      on: { assist: "lit", llm: 1, idx: 1 },
      chips: [
        ["house style: prompt, fine-tune", "style: prompt"],
        ["60-page FAQ: long context", "60 pages: context"],
        ["order 4471: a tool call", "order 4471: a tool"],
        ["the returns corpus: RAG", "returns corpus: RAG"],
      ],
      ctn: ["sky", "sky", "lit", "ok"],
      note: ["fine-tuning teaches behaviour; retrieval supplies facts", "behaviour vs facts"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "tue",
    label: "Tuesday",
    steps: [
      {
        caption:
          "An illustrative Tuesday: the return window for opened electronics drops from 30 days to 10, but a poison message from Sunday blocks the indexer. Anjali is told yes, citing \"Returns policy §2.1: 30 days\", and 212 conversations get the old rule before the DLQ fix makes the policy searchable 23 hours late.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "RAG retrieves passages from a corpus you control, then asks the model to answer from them. Lewis et al. swapped a 2016 Wikipedia index for 2018's and accuracy on 2016 leaders fell from 70% to 12%. Under ~200,000 tokens you could paste it all; MegaMart has about a billion, so it retrieves.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "ingest",
    label: "Ingestion",
    steps: [
      {
        caption:
          "Parsing loses quality first: a policy table flattened into loose tokens destroys \"Electronics | Opened | 10 days | 15%\" before retrieval starts. Of three chunkings for a 6,000-token policy, 1,500-token windows dilute the rule, 200-token windows cut it from its heading, and one chunk per section with titles inside wins.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A chunk out of its document can be meaningless, so contextual retrieval has an LLM prepend a 50–100-token explanation before embedding and BM25. On Anthropic's evaluation, top-20 failures fell from 5.7% to 3.7%, to 2.9% with contextual BM25, and to 1.9% with reranking: 67% fewer.",
        tween: 1400,
      },
      {
        caption:
          "Metadata makes filtering, freshness, permissions and citations possible later: ids and version for idempotent upserts, a content hash for dedup, effective dates, tenant and ACL, language and the embedding model. Without dedup, 25,000 seller pages pasting the same terms fill the results with copies.",
        tween: 1400,
      },
    ],
  },
  {
    id: "fresh",
    label: "Freshness",
    steps: [
      {
        caption:
          "Ingestion is incremental: the CMS publishes changes through an outbox, the topic is keyed by doc_id so versions arrive in order, chunks are upserted idempotently as doc_id:version:chunk_no, deletes are events too, and a message that fails 5 times goes to a dead-letter queue instead of blocking everything behind it.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "If the outbox relay crashes for 20 minutes, three updates never reach Kafka: lag is zero, the DLQ is empty, nothing errors. So measure CMS publish to searchable as an SLO (say 99% within 5 minutes) with a canary document edited every minute, and reconcile content hashes between CMS and index.",
        tween: 1400,
      },
      {
        caption:
          "Keep superseded policy versions with effective dates, since orders under the old rule may still follow it. A model change re-embeds ~980M tokens (3.2M chunks): ~$59 and ~2 hours of rate limit, so it runs blue/green, dual-writing v1 and v2, backfilling, evaluating, then flipping an alias.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "query",
    label: "Query path",
    steps: [
      {
        caption:
          "The customer's words are often a poor query. A small model rewrites Anjali's \"headphone khol liya, wapas ho jayega?\" into \"return window for opened headphones\"; follow-ups need history, two questions become two retrievals, and HyDE embeds a hypothetical answer. Log the rewritten query.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Day 2's hybrid search retrieves generously, 150 candidates, so order ids and SKUs aren't missed. A cross-encoder reranker reads each query and chunk together and keeps the top 8. If even the best score is below the threshold, don't answer from weak context: say so and offer a human.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Twenty fresh 800-token chunks a turn is 16,000 tokens, ~96,000 over a 6-turn conversation, about 4× Day 1's whole conversation. MegaMart's budget: ~1,200 tokens of instructions, ≤ 3,200 of context (8 chunks of 400), ≤ 1,500 of history and ~400 reserved for output.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "More context can hurt. In \"Lost in the Middle\" (2023), GPT-3.5-Turbo's accuracy could drop by more than 20% when the answer sat mid-context, in the worst case below its 56.1% closed-book score, and going past 20 documents gained only ~1.5%. Choose k by measurement and put the best evidence first.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The model cites chunk ids per claim, and the service checks mechanically that every cited id was sent and every quote is in its chunk, then shows section, effective date and link. A valid citation proves the quote exists, not that it's current: Tuesday's 212 answers had perfect ones.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "perm",
    label: "Permissions & failures",
    steps: [
      {
        caption:
          "Filtering after the top 20 can leave nothing, and Acme's own contract, ranked 21st, is never seen; telling the model not to reveal other companies' terms leaves them in its context. Filter by tenant and ACL inside retrieval, so unauthorised chunks never reach the reranker, the model or the logs.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "MegaMart uses all three methods: a partition per business account for contracts, ACL pre-filters for staff playbooks, a customer_id filter for tickets, and a late check at the source for fast-changing ACLs. With entitlements down it fails closed to public content; summaries, caches and logs follow the same rules.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "If the reranker times out and the code quietly sends the first-stage top 8, answers get worse with no error: the right chunk is often 12th, not 1st. Degrade on purpose with a timeout and breaker, a smaller cross-encoder or a higher abstain threshold, and alert on the share of unreranked answers.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "RAG isn't always the tool. House style is behaviour, so prompt (then fine-tune); a 60-page FAQ fits a cached long prompt; \"where's order 4471?\" is a database row for a tool call; the large, changing, permissioned returns corpus that needs citations is RAG.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
