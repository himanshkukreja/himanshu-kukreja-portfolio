/**
 * The whole lesson, week 2 day 2 (Idempotency in Practice): the timeout hole (did the bank charge?),
 * the idempotency key flow with pre-registration and status checks, key strategies and TTL windows,
 * and the four edge cases that bite.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a: number) => ease(seg(t, a, a + 0.4));

function Readout({ l, n, narrow, tone }: { l: Lines; n?: Lines; narrow: boolean; tone?: Tone }) {
  const x = narrow ? (n ?? [l[0].split(" · ")[0], l[1].split(" · ")[0]]) : l;
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{x[0]}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{x[1]}</Txt>
    </g>
  );
}
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;

/** Client → Server → (store, bank) */
function Stage({ srv, store, storeTone, bank, bankTone, lit }: { srv?: string; store?: string; storeTone?: Tone; bank: string; bankTone?: Tone; lit?: "store" | "bank" }) {
  return (
    <g>
      <Wire d="M124 148H170" arrow />
      {store !== undefined && <Wire d="M302 148H330V85H360" arrow tone={lit === "store" ? "lit" : undefined} />}
      <Wire d={store !== undefined ? "M302 148H330V195H360" : "M302 148H360"} arrow tone={lit === "bank" ? "lit" : undefined} />
      <Box x={20} y={120} w={104} h={56} label="Client" />
      <Box x={170} y={120} w={132} h={56} label="Server" sub={srv} tone="lit" />
      {store !== undefined && <Box x={360} y={60} w={220} h={50} label="Idem. store" sub={store} tone={storeTone} />}
      <Box x={360} y={store !== undefined ? 170 : 120} w={220} h={store !== undefined ? 50 : 56} label="Bank API" sub={bank} tone={bankTone} />
    </g>
  );
}

function Hole({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    return (
      <g>
        <Kick s="yesterday's unsolved problem" tone="bad" />
        <Stage srv="Pay $99" bank={p < 1 ? "…" : "timed out 3.5 s"} bankTone={p < 1 ? undefined : "warn"} />
        {p < 1 && <Token x={lerp(124, 360, p)} y={148} />}
        <Txt x={300} y={222} tone="warn" opacity={fade(t, 0.6)}>did the bank charge the user?</Txt>
        <Readout narrow={narrow} l={["never received it · charged, response lost", "or still processing, done in 1 second"]} n={["never got it? charged?", "still processing?"]} />
      </g>
    );
  }
  if (step === 1) {
    const lane = (y: number, lostAt: number, label: string) => (
      <g>
        <Box x={20} y={y} w={104} h={44} label="Client" sub="timeout" tone="warn" />
        <Box x={436} y={y} w={144} h={44} label="Server" tone={lostAt > 300 ? "ok" : undefined} sub={lostAt > 300 ? "processed" : undefined} />
        <Wire d={`M124 ${y + 22}H436`} dash />
        <Token x={lostAt > 300 ? lerp(436, lostAt - 140, p) : lerp(124, lostAt, p)} y={y + 22} tone="bad" />
        <Txt x={280} y={y - 8} k="s" tone="bad">{label}</Txt>
      </g>
    );
    return (
      <g>
        <Kick s="request lost or response lost?" />
        {lane(70, 270, "request lost")}
        {lane(170, 430, "response lost")}
        <Readout narrow={narrow} l={["the client cannot tell the difference", "no timeout tuning fixes it: make retries safe"]} n={["the client can't tell", "make retries safe"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="toggle switch vs ON/OFF buttons" />
      <Box x={20} y={56} w={272} h={70} label="POST /payments" sub={narrow ? "twice: $198" : "twice = charged twice"} tone="bad" />
      <Box x={308} y={56} w={272} h={70} label="PUT · DELETE" sub={narrow ? "twice: same" : "twice = same result"} tone="ok" />
      <g opacity={fade(t, 0.3)}>
        <Box x={20} y={146} w={272} h={56} label={narrow ? "add $10" : "\"add $10\""} sub="+$20 twice" tone="bad" />
        <Box x={308} y={146} w={272} h={56} label={narrow ? "set 72°F" : "\"set thermostat 72°F\""} sub="still 72°F" tone="ok" />
      </g>
      <Readout narrow={narrow} l={["POST is where the danger lives", "and most APIs use POST for payments"]} tone="bad" />
    </g>
  );
}

const KEY: { kick: string; srv: string; store: string; st?: Tone; bank: string; bt?: Tone; lit?: "store" | "bank"; l: Lines; n?: Lines }[] = [
  { kick: "1 · check the key", srv: "pay_abc123", store: "not found", lit: "store", bank: "idle", l: ["POST /payments · Idempotency-Key: pay_abc123", "never seen this key: a new payment"], n: ["Idempotency-Key: pay_abc123", "never seen: a new payment"] },
  { kick: "2 · pre-register, then call", srv: "pay_abc123", store: "processing", st: "warn", lit: "bank", bank: "key pay_abc123", l: ["record status=processing BEFORE calling the bank", "pass the same key to the bank: it dedupes too"], n: ["store processing first", "the bank dedupes on the key"] },
  { kick: "3 · record the result", srv: "200 OK", store: "completed · txn_789", st: "ok", lit: "store", bank: "charged · txn_789", bt: "ok", l: ["success or failure: update the record", "a retry with pay_abc123 gets the same response"], n: ["update the record", "retries get the same answer"] },
  { kick: "4 · timeout: ask the bank", srv: "retry", store: "processing?", st: "warn", lit: "bank", bank: "completed / not found", bt: "sky", l: ["status still processing: outcome unknown", "ask the bank by key · update · return consistent"], n: ["outcome unknown", "ask the bank by key"] },
];

function Key({ step, t, narrow }: SceneProps) {
  const k = KEY[Math.min(step, 3)];
  const p = ease(seg(t, 0.1, 0.9));
  const toStore = k.lit === "store";
  const tok = p < 0.5 ? { x: lerp(124, 170, p * 2), y: 148 } : { x: lerp(302, 360, p * 2 - 1), y: lerp(148, toStore ? 85 : 195, p * 2 - 1) };
  return (
    <g>
      <Kick s={k.kick} />
      <Stage srv={narrow && k.srv === "pay_abc123" ? "abc123" : k.srv} store={narrow ? k.store.replace(" · txn_789", "") : k.store} storeTone={k.st} bank={narrow ? k.bank.replace("key ", "").replace(" · txn_789", "").replace(" / not found", "?") : k.bank} bankTone={k.bt} lit={k.lit} />
      {p > 0 && p < 1 && <Token {...tok} />}
      <Readout narrow={narrow} l={k.l} n={k.n} />
    </g>
  );
}

function Keys({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const ks: [string, string, string][] = [
      ["client UUID", narrow ? "savvy clients" : "simple API, savvy clients", "key_550e…"],
      ["server intent", narrow ? "public APIs" : "public API, unknown clients", "pi_abc123"],
      ["deterministic", narrow ? "internal" : "internal microservices", "hash(user:order:amt)"],
    ];
    return (
      <g>
        <Kick s="who makes the key?" />
        {ks.map(([l, s, eg], i) => (
          <g key={l} opacity={fade(t, i * 0.2)}>
            <Box x={20} y={50 + i * 66} w={W - 40} h={54} label={l} sub={s} tone={i === 1 ? "lit" : undefined} />
            {!narrow && <Txt x={W - 36} y={82 + i * 66} k="s" anchor="end" tone="sky">{eg}</Txt>}
          </g>
        ))}
        <Readout narrow={narrow} l={["deterministic can't tell an intentional repeat", "add a time bucket to allow buying again later"]} n={["deterministic: no repeats", "add a time bucket"]} />
      </g>
    );
  }
  if (step === 1) {
    const sx = (s: number) => 20 + (s / 60) * 560;
    const marks: [number, string][] = [[0, "send"], [3.5, "timeout"], [5, "retry"], [31, "bank done"]];
    return (
      <g>
        <Kick s="how long to remember?" />
        <Wire d={`M20 120H580`} />
        {marks.map(([s, l], i) => (
          <g key={l}>
            <line className="ax-wire" x1={sx(s)} x2={sx(s)} y1={112} y2={128} />
            <Txt x={sx(s) + (i === 1 ? 14 : i === 2 ? 30 : 0)} y={i % 2 ? 150 : 102} k="s" anchor={i === 0 ? "start" : "middle"} tone={i === 3 ? "warn" : undefined}>{narrow && i === 3 ? "31 s" : l}</Txt>
          </g>
        ))}
        <Txt x={20} y={186} k="s" anchor="start" tone="ok">TTL 60 s · 31 s completion recorded</Txt>
        <Meter x={20} y={194} w={560} h={14} value={60 * ease(seg(t, 0.1, 0.6))} max={60} tone="ok" />
        <Txt x={20} y={236} k="s" anchor="start" tone="bad">{narrow ? "TTL 10 s · record gone" : "TTL 10 s · record gone by 31 s: orphan transaction"}</Txt>
        <Meter x={20} y={244} w={560} h={14} value={10 * ease(seg(t, 0.4, 0.9))} max={60} tone="bad" />
        <Readout narrow={narrow} l={["", "rule of thumb: TTL ≥ 10× your max retry window"]} n={["", "TTL ≥ 10× retry window"]} />
      </g>
    );
  }
  const tiers: [string, string, string, Tone][] = [["Redis", "1 hour", "hot lookups", "sky"], ["PostgreSQL", "30 days", "audit, reconcile", "lit"], ["Archive", "7 years", "compliance", "mute"]];
  return (
    <g>
      <Kick s="where and how long" />
      {tiers.map(([l, ttl, s, tone], i) => (
        <g key={l} opacity={fade(t, i * 0.2)}>
          {i > 0 && <Wire d={`M${i * 194 - 2} 108H${20 + i * 194}`} arrow />}
          <Box x={20 + i * 194} y={70} w={172} h={76} label={l} sub={ttl} tone={tone} />
          {!narrow && <Txt x={106 + i * 194} y={166} k="s">{s}</Txt>}
        </g>
      ))}
      <Txt x={20} y={206} k="s" anchor="start">{narrow ? "90 s window → keep 15 min" : "30 s timeout × 3 retries = 90 s window → keep at least 15 min"}</Txt>
      <Txt x={20} y={232} k="s" anchor="start">{narrow ? "default 24 h · finance 7+ days" : "practical default 24 h · financial 7+ days for compliance"}</Txt>
      <Readout narrow={narrow} l={["storage is cheap, duplicate charges are expensive", "durable store with a Redis cache in front"]} n={["storage is cheap", "duplicates are expensive"]} tone="ok" />
    </g>
  );
}

const EDGE: [string, string, string][] = [
  ["same key, amount 100 → 1,000,000", "same key, new amount", "fix: hash the body, reject the conflict"],
  ["TTL expires at 24 h mid-request", "TTL expires mid-request", "fix: extend the TTL on completion"],
  ["A fails while B waits on the key", "A fails, B waits", "fix: only completed requests block retries"],
  ["charged, but merchant credit fails", "merchant credit fails", "fix: one transaction, or a saga refund"],
];

function Edges({ step, t, narrow }: SceneProps) {
  const k = Math.min(step, 3);
  return (
    <g>
      <Kick s={`edge case ${k + 1} of 4`} tone="bad" />
      {EDGE.map(([d, n, fix], i) => (
        <g key={d} opacity={i > k ? 0.18 : i === k ? fade(t, 0) : 0.55}>
          <rect className={`ax-box ${i === k ? "bad" : ""}`} x={20} y={46 + i * 56} width={W - 40} height={48} />
          <Txt x={36} y={66 + i * 56} anchor="start">{narrow ? n : d}</Txt>
          <Txt x={36} y={86 + i * 56} k="s" anchor="start" tone="ok">{fix}</Txt>
        </g>
      ))}
      <Readout narrow={narrow} l={k === 3 ? ["timeouts prevent resource exhaustion", "idempotency prevents duplicate effects"] : ["", ""]} tone="ok" />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "key") return <Key {...p} />;
  if (p.variant === "keys") return <Keys {...p} />;
  if (p.variant === "edges") return <Edges {...p} />;
  return <Hole {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "hole",
      label: "The hole",
      steps: [
        { caption: "Yesterday's hole: the user clicks Pay $99, the bank call times out after 3.5 seconds, and you don't know if the bank charged them.", tween: 1600 },
        { caption: "The request may have been lost, or the bank charged and the response was lost. The client can't tell the difference, so retries must be made safe.", tween: 1400 },
        { caption: "An operation is idempotent if doing it twice has the same effect as once. PUT and DELETE are; POST /payments is not: paying twice charges twice.", tween: 1200 },
      ],
    },
    {
      id: "key",
      label: "The key",
      steps: [
        { caption: "The client sends Idempotency-Key pay_abc123 with the payment. The server checks its idempotency store: never seen, so this is a new payment.", tween: 1400 },
        { caption: "Before calling the bank, the server records pay_abc123 as processing, and it passes the same key to the bank, which deduplicates too.", tween: 1400 },
        { caption: "The bank returns txn_789 and the record becomes completed. Any retry with pay_abc123 gets the stored response: charged once.", tween: 1400 },
        { caption: "If the bank times out, the record stays processing. On retry the server asks the bank what happened to pay_abc123, updates the record, and answers consistently.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "keys",
      label: "Keys & TTL",
      steps: [
        { caption: "Client-generated UUIDs suit savvy clients, server-generated payment intents suit public APIs, and deterministic keys from the request suit internal services.", tween: 1400, ms: 3600 },
        { caption: "Too short a TTL defeats the purpose: if the bank finishes at 31 s and the record lived only 10 s, the transaction is orphaned. Keep TTL at least 10× the retry window.", tween: 1600, ms: 3600 },
        { caption: "A 90-second retry window means at least 15 minutes; 24 hours is a practical default. Tier it: Redis for an hour, PostgreSQL for 30 days, an archive for 7 years.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "edges",
      label: "Edge cases",
      steps: [
        { caption: "Same key, different request: 100 then 1,000,000. Hash the request body and reject a key reused with different parameters.", tween: 900 },
        { caption: "A request that finishes just as the 24-hour TTL deletes its record lets a retry charge again. Extend the TTL when the request completes.", tween: 900 },
        { caption: "Request A fails while B waits on the same key. B never ran, so only completed requests block retries; B gets its chance.", tween: 900 },
        { caption: "Charged the customer but crediting the merchant failed: neither completed nor failed is right. Use one transaction or a saga. Timeouts stop waiting; idempotency stops duplicates.", tween: 900, ms: 3800 },
      ],
    },
  ],
  Scene,
});
