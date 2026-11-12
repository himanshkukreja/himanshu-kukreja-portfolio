/**
 * A hard spending cap for eval runs (the nightly workflow, scripts/ai-eval/nightly.ts; any eval by hand). Loaded before
 * the eval with `--import`, it wraps fetch: every Anthropic Messages call is priced with prices.ts from its usage (a
 * plain JSON reply, or a streamed one read from its message_start / message_delta events), and added to a ledger file
 * shared by every process of the run (EVAL_SPEND_LEDGER). Before a call is sent, its worst case (the input at ~3
 * characters a token, the full max_tokens out, at the model's prices) is reserved; a call whose worst case would take the
 * run past EVAL_MAX_USD is not sent: it gets a 429 "eval cost cap reached" reply, which every eval already treats as a
 * failed call, and the ledger notes `capped` so the run's results are marked partial (not compared as a regression).
 *
 *   EVAL_MAX_USD=3 EVAL_SPEND_LEDGER=/tmp/ledger.json npx tsx --import ./scripts/ai-eval/spend-cap.ts scripts/ai-eval/dsa.ts out
 */
import fs from "fs";
import { costOf, PRICES, MODELS, type Usage } from "../../src/lib/ai/prices";

const CAP = Number(process.env.EVAL_MAX_USD);
const LEDGER = process.env.EVAL_SPEND_LEDGER || "";
const API = /^https:\/\/api\.anthropic\.com\/v1\/messages\b/;

type Ledger = { spent: number; reserved: number; calls: number; refused: number; capped: boolean };

function withLedger<T>(f: (l: Ledger) => T): T {
  // a lock file around the read-modify-write (processes of one run may call at the same time)
  const lock = `${LEDGER}.lock`;
  for (let i = 0; ; i++) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch {
      if (i > 2000) {
        fs.rmSync(lock, { recursive: true, force: true });
        continue;
      }
      const until = Date.now() + 5;
      while (Date.now() < until) {
        /* spin a few ms */
      }
    }
  }
  try {
    let l: Ledger = { spent: 0, reserved: 0, calls: 0, refused: 0, capped: false };
    try {
      l = { ...l, ...(JSON.parse(fs.readFileSync(LEDGER, "utf8")) as Partial<Ledger>) };
    } catch {
      /* a new ledger */
    }
    const out = f(l);
    fs.writeFileSync(LEDGER, JSON.stringify(l));
    return out;
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

/** the worst case of one call: ~3 characters a token in, the whole max_tokens out (thinking budget included) */
export function worstCase(body: { model?: string; max_tokens?: number }, chars: number): number {
  const p = PRICES[body.model ?? ""] ?? PRICES[MODELS.opus];
  return ((chars / 3) * p.input + (body.max_tokens ?? 4096) * p.output) / 1_000_000;
}

/** usage from a streamed reply's events */
async function streamUsage(stream: ReadableStream<Uint8Array>): Promise<Usage> {
  const u: Usage = {};
  const dec = new TextDecoder();
  let buf = "";
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const e = JSON.parse(line.slice(5)) as { type?: string; message?: { usage?: Usage }; usage?: Usage };
        if (e.type === "message_start" && e.message?.usage) Object.assign(u, e.message.usage);
        if (e.type === "message_delta" && e.usage) Object.assign(u, Object.fromEntries(Object.entries(e.usage).filter(([, v]) => v != null)));
      } catch {
        /* not JSON */
      }
    }
  }
  return u;
}

if (LEDGER && CAP > 0) {
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!API.test(url) || typeof init?.body !== "string") return real(input, init);
    let body: { model?: string; max_tokens?: number } = {};
    try {
      body = JSON.parse(init.body);
    } catch {
      /* priced as unknown */
    }
    const reserve = worstCase(body, init.body.length);
    const ok = withLedger((l) => {
      if (l.spent + l.reserved + reserve > CAP) {
        l.refused++;
        l.capped = true;
        return false;
      }
      l.reserved += reserve;
      l.calls++;
      return true;
    });
    if (!ok) return new Response(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "eval cost cap reached (EVAL_MAX_USD)" } }), { status: 429, headers: { "content-type": "application/json" } });
    const settle = (u: Usage) => withLedger((l) => ((l.reserved = Math.max(0, l.reserved - reserve)), (l.spent += costOf(body.model ?? "", u))));
    let res: Response;
    try {
      res = await real(input, init);
    } catch (e) {
      settle({});
      throw e;
    }
    if (!res.ok || !res.body) {
      settle({});
      return res;
    }
    if ((res.headers.get("content-type") || "").includes("event-stream")) {
      const [a, b] = res.body.tee();
      void streamUsage(b).then(settle, () => settle({}));
      return new Response(a, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    const text = await res.text();
    try {
      settle((JSON.parse(text) as { usage?: Usage }).usage ?? {});
    } catch {
      settle({});
    }
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}
