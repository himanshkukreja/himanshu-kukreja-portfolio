/**
 * DSA Mastery's AI tutor: the pure text pieces (no server imports), shared by the retrieval (search.ts), the routes and
 * scripts/dsa-ai-check.ts.
 *
 * - `plainMd`: a lesson, lecture or problem file's markdown as the model should read it (the course's block syntax turned
 *   into plain words or dropped, long code fences clipped).
 * - `sectionChunks`: markdown split at its ## / ### headings into chunks of at most ~1,600 characters, each with its
 *   heading path, small sections merged into the next one.
 * - `tokens` + BM25 (`bm25Index`, `bm25Scores`): lightweight keyword ranking. No embeddings and no model call, so a search
 *   costs well under a millisecond per hundred chunks and needs nothing but the index in memory.
 * - `capCode`: the no-spoiler guard on code blocks in an answer (also applied while it streams: `codeCapStream`).
 */

/* ------------------------------------------------------------------ markdown → plain markdown */

const MAX_CODE_LINES = 40;

/** The course's directives as plain words; code fences kept (clipped); HTML comments and front matter dropped. */
export function plainMd(md: string, opts: { codeLines?: number } = {}): string {
  const maxCode = opts.codeLines ?? MAX_CODE_LINES;
  const out: string[] = [];
  let fence: string | null = null;
  let codeN = 0;
  const body = md.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const f = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && line.startsWith(fence)) {
        if (codeN > maxCode) out.push("…");
        out.push(line);
        fence = null;
        continue;
      }
      codeN++;
      if (codeN <= maxCode) out.push(line);
      continue;
    }
    if (f) {
      fence = f[1];
      codeN = 0;
      out.push(line);
      continue;
    }
    // a speaker's line: ::line[Text]{who="sofia"} → "Text"
    const said = /^::line\[(.+)\](?:\{[^}]*\})?\s*$/.exec(line);
    if (said) {
      out.push(`"${said[1]}"`);
      continue;
    }
    // a titled block: :::example[Title]{kind="analogy"} → **Example: Title**
    const block = /^:{3,}(\w[\w-]*)\[([^\]\n]+)\]/.exec(line);
    if (block) {
      const name = block[1].toLowerCase();
      if (name === "beat") continue;
      const label = name === "example" ? "Example" : name === "invariant" ? "Invariant" : name === "pattern" ? "Pattern" : name === "poll" ? "Question" : name === "tabs" ? "Template" : name.charAt(0).toUpperCase() + name.slice(1);
      out.push(`**${label}: ${block[2]}**`);
      continue;
    }
    // any other directive line (::handsolve[…], ::trace[…], ::solutions, a block's closing :::) carries no words
    if (/^:{2,}/.test(line)) continue;
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ chunks */

export type MdChunk = { h2: string; h3: string; text: string };

/** Markdown in heading sections (## and ###), small ones merged forward, long ones split at paragraphs. */
export function sectionChunks(md: string, opts: { max?: number; min?: number } = {}): MdChunk[] {
  const max = opts.max ?? 1600;
  const min = opts.min ?? 260;
  const secs: MdChunk[] = [];
  let h2 = "";
  let h3 = "";
  let buf: string[] = [];
  let fence = false;
  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) secs.push({ h2, h3, text });
    buf = [];
  };
  for (const line of md.split("\n")) {
    if (/^(`{3,}|~{3,})/.test(line)) fence = !fence;
    const m = !fence && /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      if (m[1].length <= 2) {
        h2 = m[2];
        h3 = "";
      } else h3 = m[2];
      continue;
    }
    buf.push(line);
  }
  flush();
  // merge a small section into the next one under the same ## heading
  const merged: MdChunk[] = [];
  for (const s of secs) {
    const prev = merged[merged.length - 1];
    if (prev && prev.h2 === s.h2 && prev.text.length < min && prev.text.length + s.text.length < max) {
      prev.text = `${prev.text}\n\n${s.h3 ? `**${s.h3}**\n\n` : ""}${s.text}`;
      continue;
    }
    merged.push({ ...s });
  }
  // split long ones at paragraph breaks (never inside a code fence)
  const out: MdChunk[] = [];
  for (const s of merged) {
    if (s.text.length <= max) {
      out.push(s);
      continue;
    }
    const paras: string[] = [];
    let cur: string[] = [];
    let inFence = false;
    for (const line of s.text.split("\n")) {
      if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;
      if (!inFence && !line.trim() && cur.length) {
        paras.push(cur.join("\n"));
        cur = [];
        continue;
      }
      cur.push(line);
    }
    if (cur.length) paras.push(cur.join("\n"));
    let acc = "";
    for (const p of paras) {
      if (acc && acc.length + p.length + 2 > max) {
        out.push({ ...s, text: acc });
        acc = "";
      }
      acc = acc ? `${acc}\n\n${p}` : p;
    }
    if (acc) out.push({ ...s, text: acc.length > max * 1.6 ? `${acc.slice(0, Math.floor(max * 1.6))}…` : acc });
  }
  return out;
}

/* ------------------------------------------------------------------ tokens and BM25 */

const STOP = new Set(
  "a an and are as at be but by can do does for from has have how i if in into is it its me my no not of on or our so than that the their them then there these they this to too us was we what when where which while who why will with you your yours am been being did doing had he her him his she should would could just also more most some such only own same very s t don now any each few both all other off out over under again further once here about above below up down use used using get got make want need tell explain show give let please".split(
    " ",
  ),
);

function stem(t: string): string {
  let w = t;
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && /(?:s|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
  if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** Lower-case word stems without stop words ("Sliding windows" → ["slid", "window"]); numbers and O(n) kept. */
export function tokens(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(/[^a-z0-9+]+/)) {
    if (raw.length < 2 || STOP.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

export type Bm25 = { docs: { len: number; tf: Map<string, number> }[]; df: Map<string, number>; avg: number };

export function bm25Index(texts: string[]): Bm25 {
  const df = new Map<string, number>();
  let total = 0;
  const docs = texts.map((t) => {
    const tf = new Map<string, number>();
    const toks = tokens(t);
    for (const k of toks) tf.set(k, (tf.get(k) ?? 0) + 1);
    for (const k of tf.keys()) df.set(k, (df.get(k) ?? 0) + 1);
    total += toks.length;
    return { len: toks.length, tf };
  });
  return { docs, df, avg: docs.length ? total / docs.length : 0 };
}

/** BM25 (k1 1.2, b 0.75) of every document for the query's tokens (repeats in the query weigh more). */
export function bm25Scores(ix: Bm25, query: string[]): number[] {
  const n = ix.docs.length;
  const qtf = new Map<string, number>();
  for (const q of query) qtf.set(q, (qtf.get(q) ?? 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  return ix.docs.map((d) => {
    let s = 0;
    for (const [q, w] of qtf) {
      const f = d.tf.get(q);
      if (!f) continue;
      const df = ix.df.get(q) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      s += w * idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / (ix.avg || 1))));
    }
    return s;
  });
}

/* ------------------------------------------------------------------ the no-spoiler code cap */

const CUT_LINE = "… (the rest is yours to write)";

/**
 * Code blocks in an answer kept to `maxLines` lines each: past that, one "the rest is yours to write" line and nothing
 * more until the block closes. For text that is still streaming (`partial`), a line that may still turn out to be the
 * closing fence is held back. The output for a prefix of a text is always a prefix of the output for the whole text, so
 * the stream and the final answer agree.
 */
export function capCode(text: string, maxLines: number, partial = false): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let n = 0;
  let cut = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const last = i === lines.length - 1;
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (f && line.trim().startsWith(fence)) {
        out.push(line);
        fence = null;
        continue;
      }
      // a last line that may still become the closing fence: wait for more text
      if (partial && last && fence.startsWith(line.trim())) {
        out.push("");
        break;
      }
      n++;
      if (n <= maxLines) out.push(line);
      else if (!cut) {
        cut = true;
        out.push(CUT_LINE);
      }
      continue;
    }
    if (f) {
      fence = f[1];
      n = 0;
      cut = false;
    }
    out.push(line);
  }
  // the held-back line: drop the trailing empty placeholder so the prefix property holds
  if (partial && out.length && out[out.length - 1] === "" && lines[lines.length - 1] !== "") out.pop();
  return out.join("\n");
}

/** Deltas in, capped deltas out (`flush` at the end): what was emitted is always a prefix of capCode(all text). */
export function codeCapStream(maxLines: number, emit: (d: string) => void) {
  let all = "";
  let sent = 0;
  const push = (final: boolean) => {
    const capped = capCode(all, maxLines, !final);
    if (capped.length > sent) {
      emit(capped.slice(sent));
      sent = capped.length;
    }
  };
  return {
    push(d: string) {
      all += d;
      push(false);
    },
    flush() {
      push(true);
    },
  };
}
