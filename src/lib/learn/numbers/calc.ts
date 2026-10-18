/**
 * Numbers playground calculator: unit-aware back-of-the-envelope maths with a worked solution.
 *
 *   "50k QPS × 2 KB × 30 days"  →  259.2 TB, via 100 MB/s (800 Mbps)
 *
 * Self-contained on purpose (no imports): the page and the Node test runner
 * (scripts/tests/calc.test.mjs) load this same file.
 *
 * Conventions follow W00 · Part 3 (Back-of-the-envelope estimation):
 *   - data units are decimal: 1 KB = 1,000 B ("use 1,000 for estimation"); KiB/MiB/GiB… are the
 *     binary 1,024-based units and are labelled as such;
 *   - 1 day = 86,400 s, 1 month = 30 days (2,592,000 s), 1 year = 365 days (31,536,000 s);
 *     the lesson's shortcuts (day ≈ 10^5 s, month ≈ 2.5 × 10^6 s, year ≈ 3 × 10^7 s) are shown as a
 *     second "interview shortcut" answer;
 *   - network speeds are bits: Gbps ÷ 8 = GB/s; "Mb" is megabits, "MB" megabytes.
 *
 * Grammar (one statement per line or `;`, `#` starts a comment):
 *   line     := [name "="] sum [("in" | "to" | "as") target]
 *   sum      := term (("+" | "-") term)*            a + 20%  →  a × 1.2
 *   term     := unary (("×" | "x" | "*" | "·" | "/" | "÷" | "per" | "of" | <implicit>) unary)*
 *   unary    := "-" unary | power
 *   power    := postfix ["^" unary]
 *   postfix  := primary ["%"]
 *   primary  := literal | name | unit | fn "(" sum ("," sum)* ")" | "(" sum ")"
 *   literal  := number [suffix] {unit | label} {("/" | "per") (unit | label)}
 *   number   := 12 | 1,000 | 2.5 | .5 | 1e9        suffix := k K | m M | b B bn | T
 *   unit     := B KB MB GB TB PB · KiB MiB GiB TiB · bit Kb Mb Gb · bps Kbps Mbps Gbps Tbps
 *               ns µs us ms s min h day week month year (+ plurals) · QPS RPS TPS (= per second)
 *   label    := any other word after a number ("200M users", "20 views/day"): a count, ×1
 *   fn       := ceil floor round sqrt abs min max log(x[, base]) log2 log10 ln
 * A number with "B" attached is a billion ("4B"); with a space it is bytes ("300 B", "300 bytes").
 */

// ---------------------------------------------------------------- quantities

/** value in base units (bytes, seconds) and the exponents of bytes and seconds */
export type Q = { v: number; B: number; s: number };

export type Kind = "data" | "bandwidth" | "rate" | "time" | "number" | "other";

type UnitDef = {
  /** factor to base units (exact) */
  f: number;
  /** factor in interview-shortcut mode, when different */
  short?: number;
  B: number;
  s: number;
  /** canonical spelling for "read as" and conversions */
  name: string;
  /** a reading note shown under the result */
  warn?: string;
  /** a plain count word ("users", "requests"): value 1, no dimension */
  label?: boolean;
};

const DAY = 86_400;
const u = (f: number, B: number, s: number, name: string, extra: Partial<UnitDef> = {}): UnitDef => ({ f, B, s, name, ...extra });

const DATA = (k: number) => Math.pow(1000, k);
const BIN = (k: number) => Math.pow(1024, k);

/** Case-sensitive unit table. */
const UNITS: Record<string, UnitDef> = {};
const add = (names: string[], def: UnitDef) => names.forEach((n) => (UNITS[n] = def));

// bytes (decimal, the course's convention)
add(["B", "byte", "bytes", "Byte", "Bytes"], u(1, 1, 0, "B"));
add(["KB", "kB", "kilobyte", "kilobytes"], u(DATA(1), 1, 0, "KB"));
add(["MB", "megabyte", "megabytes"], u(DATA(2), 1, 0, "MB"));
add(["GB", "gigabyte", "gigabytes"], u(DATA(3), 1, 0, "GB"));
add(["TB", "terabyte", "terabytes"], u(DATA(4), 1, 0, "TB"));
add(["PB", "petabyte", "petabytes"], u(DATA(5), 1, 0, "PB"));
add(["EB", "exabyte", "exabytes"], u(DATA(6), 1, 0, "EB"));
// lowercase data units read as bytes, with a note (megabits are "Mb")
(["kb", "mb", "gb", "tb", "pb"] as const).forEach((n, i) => {
  UNITS[n] = u(DATA(i + 1), 1, 0, n.toUpperCase(), { warn: `Read "${n}" as ${n.toUpperCase()} (bytes). For bits write "${n[0].toUpperCase()}b" or "${n[0].toUpperCase()}bps".` });
});
// bytes (binary)
add(["KiB"], u(BIN(1), 1, 0, "KiB"));
add(["MiB"], u(BIN(2), 1, 0, "MiB"));
add(["GiB"], u(BIN(3), 1, 0, "GiB"));
add(["TiB"], u(BIN(4), 1, 0, "TiB"));
add(["PiB"], u(BIN(5), 1, 0, "PiB"));
// bits
add(["b", "bit", "bits"], u(1 / 8, 1, 0, "bit"));
add(["Kb", "kbit", "Kbit", "kilobit", "kilobits"], u(DATA(1) / 8, 1, 0, "Kb"));
add(["Mb", "Mbit", "megabit", "megabits"], u(DATA(2) / 8, 1, 0, "Mb"));
add(["Gb", "Gbit", "gigabit", "gigabits"], u(DATA(3) / 8, 1, 0, "Gb"));
add(["Tb", "Tbit", "terabit", "terabits"], u(DATA(4) / 8, 1, 0, "Tb"));
// bit rates
add(["bps"], u(1 / 8, 1, -1, "bps"));
add(["Kbps", "kbps"], u(DATA(1) / 8, 1, -1, "Kbps"));
add(["Mbps", "mbps"], u(DATA(2) / 8, 1, -1, "Mbps"));
add(["Gbps", "gbps"], u(DATA(3) / 8, 1, -1, "Gbps"));
add(["Tbps", "tbps"], u(DATA(4) / 8, 1, -1, "Tbps"));
add(["Pbps"], u(DATA(5) / 8, 1, -1, "Pbps"));
// byte rates
add(["Bps"], u(1, 1, -1, "B/s"));
add(["KBps"], u(DATA(1), 1, -1, "KB/s"));
add(["MBps"], u(DATA(2), 1, -1, "MB/s"));
add(["GBps"], u(DATA(3), 1, -1, "GB/s"));
add(["TBps"], u(DATA(4), 1, -1, "TB/s"));
// time
add(["ns", "nanosecond", "nanoseconds"], u(1e-9, 0, 1, "ns"));
add(["us", "µs", "μs", "microsecond", "microseconds"], u(1e-6, 0, 1, "µs"));
add(["ms", "millisecond", "milliseconds", "msec"], u(1e-3, 0, 1, "ms"));
add(["s", "sec", "secs", "second", "seconds"], u(1, 0, 1, "s"));
add(["min", "mins", "minute", "minutes"], u(60, 0, 1, "min"));
add(["h", "hr", "hrs", "hour", "hours"], u(3600, 0, 1, "h"));
add(["d", "day", "days"], u(DAY, 0, 1, "day", { short: 100_000 }));
add(["wk", "wks", "week", "weeks"], u(7 * DAY, 0, 1, "week", { short: 600_000 }));
add(["mo", "month", "months"], u(30 * DAY, 0, 1, "month", { short: 2_500_000 }));
add(["y", "yr", "yrs", "year", "years"], u(365 * DAY, 0, 1, "year", { short: 30_000_000 }));
// per-second rates
add(["QPS", "qps", "RPS", "rps", "TPS", "tps", "Hz"], u(1, 0, -1, "/s"));

/** Count words: a number of things. They document the maths and multiply by 1. */
const LABELS = new Set(
  (
    "user users DAU MAU dau mau visitor visitors customer customers people person member members " +
    "request requests req reqs query queries op ops operation operations call calls hit hits " +
    "view views read reads write writes post posts tweet tweets photo photos image images pic pics video videos " +
    "message messages msg msgs event events order orders payment payments txn txns transaction transactions " +
    "action actions item items record records row rows object objects file files doc docs document documents " +
    "url urls link links click clicks upload uploads download downloads search searches like likes comment comments " +
    "notification notifications push pushes email emails ride rides trip trips booking bookings ticket tickets " +
    "server servers node nodes machine machines instance instances replica replicas shard shards partition partitions " +
    "broker brokers consumer consumers producer producers key keys session sessions connection connections " +
    "page pages product products listing listings song songs stream streams log logs line lines entry entries chunk chunks " +
    "copy copies time times device devices sensor sensors reading readings check checks"
  ).split(" ")
);

const SUFFIX: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, mn: 1e6, b: 1e9, B: 1e9, bn: 1e9, Bn: 1e9, T: 1e12, t: 1e12, tn: 1e12 };

const KEYWORDS = new Set(["x", "X", "per", "of", "in", "to", "as"]);

type Fn = { min: number; max: number; run: (args: Q[], name: string) => Q };
const sameDim = (a: Q, b: Q) => a.B === b.B && a.s === b.s;
const dimless = (q: Q) => q.B === 0 && q.s === 0;

const FUNCS: Record<string, Fn> = {
  ceil: { min: 1, max: 1, run: ([a]) => ({ ...a, v: ceilSafe(a.v) }) },
  floor: { min: 1, max: 1, run: ([a]) => ({ ...a, v: Math.floor(a.v + 1e-9) }) },
  round: { min: 1, max: 1, run: ([a]) => ({ ...a, v: Math.round(a.v) }) },
  abs: { min: 1, max: 1, run: ([a]) => ({ ...a, v: Math.abs(a.v) }) },
  sqrt: {
    min: 1,
    max: 1,
    run: ([a]) => {
      if (a.B % 2 || a.s % 2) throw new CalcError("sqrt needs a plain number (or squared units).");
      return { v: Math.sqrt(a.v), B: a.B / 2, s: a.s / 2 };
    },
  },
  min: { min: 1, max: 20, run: (args) => pick(args, Math.min) },
  max: { min: 1, max: 20, run: (args) => pick(args, Math.max) },
  log: {
    min: 1,
    max: 2,
    run: ([a, b], name) => {
      needDimless([a, ...(b ? [b] : [])], name);
      return { v: b ? Math.log(a.v) / Math.log(b.v) : Math.log10(a.v), B: 0, s: 0 };
    },
  },
  log2: { min: 1, max: 1, run: ([a], name) => (needDimless([a], name), { v: Math.log2(a.v), B: 0, s: 0 }) },
  log10: { min: 1, max: 1, run: ([a], name) => (needDimless([a], name), { v: Math.log10(a.v), B: 0, s: 0 }) },
  ln: { min: 1, max: 1, run: ([a], name) => (needDimless([a], name), { v: Math.log(a.v), B: 0, s: 0 }) },
};

/** ceil that ignores float dust: ceil(2.0000000001) is 2, not 3 */
function ceilSafe(v: number) {
  const r = Math.round(v);
  return Math.abs(v - r) < 1e-9 * Math.max(1, Math.abs(v)) ? r : Math.ceil(v);
}

function pick(args: Q[], f: (...n: number[]) => number): Q {
  args.forEach((a) => {
    if (!sameDim(a, args[0])) throw new CalcError("min/max need values in the same kind of unit.");
  });
  return { ...args[0], v: f(...args.map((a) => a.v)) };
}

function needDimless(args: Q[], name: string) {
  if (!args.every(dimless)) throw new CalcError(`${name}() works on plain numbers, not units.`);
}

export class CalcError extends Error {
  at?: number;
  constructor(message: string, at?: number) {
    super(message);
    this.at = at;
  }
}

// ---------------------------------------------------------------- tokens

type Tok =
  | { k: "num"; v: number; text: string; pos: number; end: number }
  | { k: "word"; text: string; pos: number; end: number; attached: boolean }
  | { k: "op"; text: string; pos: number; end: number };

const OPS: Record<string, string> = { "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", "^": "^", "%": "%", "(": "(", ")": ")", ",": ",", "=": "=" };
const NUM_RE = /^(?:\d{1,3}(?:,\d{3})+(?![\d,])|\d+)(?:\.\d+)?(?:[eE][+-]?\d+)?|^\.\d+(?:[eE][+-]?\d+)?/;
const WORD_RE = /^[A-Za-zµμ_][A-Za-z0-9_µμ]*/;

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const num = NUM_RE.exec(rest);
    if (num) {
      const text = num[0];
      out.push({ k: "num", v: Number(text.replace(/,/g, "")), text, pos: i, end: i + text.length });
      i += text.length;
      const w = WORD_RE.exec(src.slice(i));
      if (w) {
        // "2x" is "2 ×"
        if (w[0] === "x" || w[0] === "X") {
          out.push({ k: "op", text: "*", pos: i, end: i + 1 });
        } else {
          out.push({ k: "word", text: w[0], pos: i, end: i + w[0].length, attached: true });
        }
        i += w[0].length;
      }
      continue;
    }
    const w = WORD_RE.exec(rest);
    if (w) {
      out.push({ k: "word", text: w[0], pos: i, end: i + w[0].length, attached: false });
      i += w[0].length;
      continue;
    }
    if (OPS[c]) {
      out.push({ k: "op", text: OPS[c], pos: i, end: i + 1 });
      i++;
      continue;
    }
    throw new CalcError(`Unexpected "${c}"`, i);
  }
  return out;
}

// ---------------------------------------------------------------- AST

type UnitRef = { def: UnitDef; exp: 1 | -1; text: string };

type Node =
  | { t: "lit"; n: number; units: UnitRef[]; src: string; pct?: boolean; labelOnly?: boolean; suffix?: number }
  | { t: "var"; name: string; src: string }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; l: Node; r: Node; src: string }
  | { t: "neg"; e: Node; src: string }
  | { t: "pct"; e: Node; src: string }
  | { t: "call"; fn: string; args: Node[]; src: string }
  | { t: "group"; e: Node; src: string };

type Target = { units: UnitRef[]; text: string };

type Parsed = { name: string | null; expr: Node; target: Target | null; notes: string[] };

/** A unit, or a count label, for a word. Variables are checked by the caller. */
function unitOf(word: string): UnitDef | null {
  if (UNITS[word]) return UNITS[word];
  const lower = word.toLowerCase();
  // "Days", "Hours", "Seconds": case only matters for data units
  const ci = Object.keys(UNITS).find((k) => k.length > 2 && k.toLowerCase() === lower && UNITS[k].B === 0);
  if (ci) return UNITS[ci];
  if (LABELS.has(word) || LABELS.has(lower)) return { f: 1, B: 0, s: 0, name: word, label: true };
  return null;
}

class Parser {
  i = 0;
  notes: string[] = [];
  toks: Tok[];
  src: string;
  vars: Set<string>;
  constructor(toks: Tok[], src: string, vars: Set<string>) {
    // no parameter properties: Node's type stripping (the test runner) can't erase them
    this.toks = toks;
    this.src = src;
    this.vars = vars;
  }

  peek(o = 0) {
    return this.toks[this.i + o];
  }
  next() {
    return this.toks[this.i++];
  }
  isOp(t: Tok | undefined, text: string) {
    return !!t && t.k === "op" && t.text === text;
  }
  isWord(t: Tok | undefined, text?: string) {
    return !!t && t.k === "word" && (text === undefined || t.text === text);
  }
  slice(a: number, b: number) {
    return this.src.slice(a, b).trim();
  }
  fail(msg: string, t?: Tok): never {
    throw new CalcError(msg, t ? t.pos : this.src.length);
  }
  note(msg: string) {
    if (!this.notes.includes(msg)) this.notes.push(msg);
  }

  line(): Parsed {
    let name: string | null = null;
    const t0 = this.peek();
    if (t0 && t0.k === "word" && this.isOp(this.peek(1), "=")) {
      name = t0.text;
      if (KEYWORDS.has(name)) this.fail(`"${name}" is an operator word; pick another name.`, t0);
      if (UNITS[name] || FUNCS[name]) this.fail(`"${name}" is a ${UNITS[name] ? "unit" : "function"}; pick another name.`, t0);
      this.i += 2;
    }
    if (!this.peek()) this.fail(name ? `Give "${name}" a value, e.g. ${name} = 20k QPS` : "Type an expression");
    const expr = this.sum();
    let target: Target | null = null;
    const t = this.peek();
    if (t && t.k === "word" && (t.text === "in" || t.text === "to" || t.text === "as")) {
      this.next();
      target = this.target();
    }
    const left = this.peek();
    if (left) this.fail(left.k === "op" && left.text === ")" ? "Unmatched )" : `Unexpected "${left.k === "num" ? left.text : left.text}"`, left);
    return { name, expr, target, notes: this.notes };
  }

  sum(): Node {
    const start = this.peek()?.pos ?? 0;
    let l = this.term();
    for (;;) {
      const t = this.peek();
      if (!this.isOp(t, "+") && !this.isOp(t, "-")) return l;
      this.next();
      const r = this.term();
      l = { t: "bin", op: t!.text as "+" | "-", l, r, src: this.slice(start, this.endOf()) };
    }
  }

  endOf() {
    const prev = this.toks[this.i - 1];
    return prev ? prev.end : 0;
  }

  startsOperand(t: Tok | undefined) {
    if (!t) return false;
    if (t.k === "num") return true;
    if (t.k === "op") return t.text === "(";
    return !KEYWORDS.has(t.text);
  }

  term(): Node {
    const start = this.peek()?.pos ?? 0;
    let l = this.unary();
    for (;;) {
      const t = this.peek();
      let op: "*" | "/" | null = null;
      if (this.isOp(t, "*")) op = "*";
      else if (this.isOp(t, "/")) op = "/";
      else if (this.isWord(t, "x") || this.isWord(t, "X") || this.isWord(t, "of")) op = "*";
      else if (this.isWord(t, "per")) op = "/";
      if (op) this.next();
      else if (this.startsOperand(t)) op = "*";
      else return l;
      if (!this.peek()) this.fail(`Something is missing after "${op === "*" ? "×" : "/"}"`);
      const r = this.unary();
      l = { t: "bin", op, l, r, src: this.slice(start, this.endOf()) };
    }
  }

  unary(): Node {
    const t = this.peek();
    if (this.isOp(t, "-")) {
      this.next();
      const e = this.unary();
      return { t: "neg", e, src: this.slice(t!.pos, this.endOf()) };
    }
    if (this.isOp(t, "+")) {
      this.next();
      return this.unary();
    }
    return this.power();
  }

  power(): Node {
    const start = this.peek()?.pos ?? 0;
    const base = this.postfix();
    if (this.isOp(this.peek(), "^")) {
      this.next();
      const exp = this.unary();
      return { t: "bin", op: "^", l: base, r: exp, src: this.slice(start, this.endOf()) };
    }
    return base;
  }

  postfix(): Node {
    const start = this.peek()?.pos ?? 0;
    let e = this.primary();
    while (this.isOp(this.peek(), "%")) {
      this.next();
      if (e.t === "lit" && !e.pct) e = { ...e, pct: true, src: this.slice(start, this.endOf()) };
      else e = { t: "pct", e, src: this.slice(start, this.endOf()) };
    }
    return e;
  }

  /** a word that can sit inside a literal: a unit or a label, never a variable or a keyword */
  literalWord(t: Tok | undefined): UnitDef | null {
    if (!t || t.k !== "word") return null;
    if (KEYWORDS.has(t.text) || this.vars.has(t.text) || t.text === "ans") return null;
    if (FUNCS[t.text] && this.isOp(this.toks[this.toks.indexOf(t) + 1], "(")) return null;
    const def = unitOf(t.text);
    if (def) {
      if (def.warn) this.note(def.warn);
      return def;
    }
    return null;
  }

  primary(): Node {
    const t = this.peek();
    if (!t) this.fail("Something is missing at the end");
    if (t.k === "num") return this.literal();
    if (t.k === "op") {
      if (t.text === "(") {
        this.next();
        const e = this.sum();
        if (!this.isOp(this.peek(), ")")) this.fail("Missing )", this.peek());
        this.next();
        return { t: "group", e, src: this.slice(t.pos, this.endOf()) };
      }
      this.fail(t.text === ")" ? "Unmatched )" : `"${t.text}" needs a value before it`, t);
    }
    // word
    const w = t.text;
    if (FUNCS[w] && this.isOp(this.peek(1), "(")) {
      this.next();
      this.next();
      const args: Node[] = [];
      if (!this.isOp(this.peek(), ")")) {
        for (;;) {
          args.push(this.sum());
          if (this.isOp(this.peek(), ",")) {
            this.next();
            continue;
          }
          break;
        }
      }
      if (!this.isOp(this.peek(), ")")) this.fail(`Missing ) after ${w}(`, this.peek());
      this.next();
      const f = FUNCS[w];
      if (args.length < f.min || args.length > f.max) this.fail(`${w}() takes ${f.min === f.max ? f.min : `${f.min}–${f.max}`} value${f.max > 1 ? "s" : ""}`, t);
      return { t: "call", fn: w, args, src: this.slice(t.pos, this.endOf()) };
    }
    if (this.vars.has(w) || w === "ans") {
      this.next();
      return { t: "var", name: w, src: w };
    }
    if (w === "x" || w === "X") this.fail(`"×" needs a value before it`, t);
    const def = this.literalWord(t);
    if (def) return this.literal();
    this.fail(`"${w}" isn't defined. Add a line above like "${w} = 20k QPS", or use a unit (KB, ms, day, QPS…).`, t);
  }

  /** number [suffix] {unit|label} {(/|per) (unit|label)}, or a bare unit/label word */
  literal(): Node {
    const first = this.peek()!;
    let n = 1;
    let suffix: number | undefined;
    const units: UnitRef[] = [];
    let labelOnly = false;
    if (first.k === "num") {
      this.next();
      n = first.v;
      const att = this.peek();
      if (att && att.k === "word" && att.attached) {
        this.next();
        const text = att.text;
        if (SUFFIX[text] !== undefined) {
          suffix = SUFFIX[text];
          n *= suffix;
          if (text === "m") this.note('"m" after a number is million; write "min" for minutes.');
          if (text === "B" || text === "b") this.note(`"${first.text}${text}" is ${first.text} billion; write "${first.text} B" or "${first.text} bytes" for bytes.`);
        } else {
          const def = UNITS[text] ? UNITS[text] : null;
          if (def) {
            if (def.warn) this.note(def.warn);
            units.push({ def, exp: 1, text });
          } else {
            // "50kQPS", "5Musers": a suffix glued to a unit or label
            const m = /^(bn|Bn|mn|tn|[kKmMbBTt])(.+)$/.exec(text);
            const rest = m ? unitOf(m[2]) : null;
            if (m && rest) {
              suffix = SUFFIX[m[1]];
              n *= suffix;
              if (rest.warn) this.note(rest.warn);
              units.push({ def: rest, exp: 1, text: m[2] });
            } else {
              const any = unitOf(text);
              units.push({ def: any || { f: 1, B: 0, s: 0, name: text, label: true }, exp: 1, text });
              if (!any) this.note(`"${text}" isn't a unit I know; read it as a count (×1).`);
            }
          }
        }
      }
    } else {
      const def = this.literalWord(first)!;
      this.next();
      units.push({ def, exp: 1, text: first.text });
      labelOnly = !!def.label;
    }
    // more words after the number: "2 KB", "200M daily users"
    for (;;) {
      const t = this.peek();
      if (!t || t.k !== "word") break;
      const def = this.literalWord(t);
      if (def) {
        this.next();
        units.push({ def, exp: 1, text: t.text });
        continue;
      }
      // a word that isn't a unit, variable or keyword right after a number: a count label
      if (first.k === "num" && !KEYWORDS.has(t.text) && !this.vars.has(t.text) && t.text !== "ans" && !(FUNCS[t.text] && this.isOp(this.peek(1), "("))) {
        this.next();
        units.push({ def: { f: 1, B: 0, s: 0, name: t.text, label: true }, exp: 1, text: t.text });
        this.note(`"${t.text}" isn't a unit I know; read it as a count (×1).`);
        continue;
      }
      break;
    }
    // "MB/s", "100M/day", "posts/user/day": a slash written tight belongs to the literal.
    // Spaced ("20 views / day") or "per" stays an operator, so the working shows the division.
    for (;;) {
      const t = this.peek();
      const t2 = this.peek(1);
      const prev = this.toks[this.i - 1];
      if (!this.isOp(t, "/") || !t2 || t2.k !== "word" || !prev || t!.pos !== prev.end || t2.pos !== t!.end) break;
      const def = this.literalWord(t2);
      if (!def) break;
      // keep "/ (…)" and "/ name(" out of the literal
      if (this.isOp(this.peek(2), "(") || this.isOp(this.peek(2), "^")) break;
      this.next();
      this.next();
      units.push({ def, exp: -1, text: t2.text });
    }
    const allLabels = units.length > 0 && units.every((x) => x.def.label);
    return { t: "lit", n, units, src: this.slice(first.pos, this.endOf()), suffix, labelOnly: labelOnly || (first.k !== "num" && allLabels) };
  }

  target(): Target {
    const start = this.peek()?.pos ?? this.src.length;
    const units: UnitRef[] = [];
    let exp: 1 | -1 = 1;
    for (;;) {
      const t = this.peek();
      if (!t) break;
      if (this.isOp(t, "/") || this.isWord(t, "per")) {
        this.next();
        exp = -1;
        continue;
      }
      if (this.isOp(t, "*")) {
        this.next();
        exp = 1;
        continue;
      }
      if (t.k === "word") {
        const def = unitOf(t.text);
        if (!def) this.fail(`"${t.text}" isn't a unit I can convert to`, t);
        this.next();
        units.push({ def, exp, text: t.text });
        continue;
      }
      this.fail(`Convert to a unit, like "in GB" or "in Gbps"`, t);
    }
    if (!units.length) this.fail(`Say which unit, like "in TB" or "in Gbps"`);
    return { units, text: this.slice(start, this.src.length) };
  }
}

// ---------------------------------------------------------------- evaluation

export type Step = { text: string; kind: Kind; value: Q };

type Ctx = { short: boolean; vars: Map<string, Q>; steps: Step[]; conversions: string[]; ans: Q | null };

const isTrivial = (n: Node) => n.t === "lit" && !!n.labelOnly;

function unitsQ(units: UnitRef[], short: boolean): Q {
  let v = 1;
  let B = 0;
  let s = 0;
  units.forEach((x) => {
    const f = short && x.def.short ? x.def.short : x.def.f;
    v *= Math.pow(f, x.exp);
    B += x.def.B * x.exp;
    s += x.def.s * x.exp;
  });
  return { v, B, s };
}

function litQ(n: Extract<Node, { t: "lit" }>, short: boolean): Q {
  const q = unitsQ(n.units, short);
  return { v: n.n * q.v * (n.pct ? 0.01 : 1), B: q.B, s: q.s };
}

/** text used for a node inside a step: what was typed for literals and names, the value for sub-results */
function label(n: Node, ctx: Ctx, val: Map<Node, Q>): string {
  if (n.t === "lit" || n.t === "var") return n.src;
  if (n.t === "group" && (n.e.t === "lit" || n.e.t === "var")) return n.e.src;
  if (n.t === "neg") return `-${label(n.e, ctx, val)}`;
  return fmtQ(val.get(n)!);
}

function evalNode(n: Node, ctx: Ctx, val: Map<Node, Q>): Q {
  const out = evalInner(n, ctx, val);
  if (!Number.isFinite(out.v)) throw new CalcError(Number.isNaN(out.v) ? "That doesn't give a number." : "That's infinite (division by zero?).");
  val.set(n, out);
  return out;
}

function evalInner(n: Node, ctx: Ctx, val: Map<Node, Q>): Q {
  switch (n.t) {
    case "lit": {
      const q = litQ(n, ctx.short);
      // conversions worth showing: units that change the number ("30 days" = 2,592,000 s)
      const real = n.units.filter((x) => !x.def.label);
      if (real.length && !ctx.short) {
        const si = fmtSI(q);
        const typed = n.src;
        if (si.replace(/[\s,]/g, "") !== typed.replace(/[\s,]/g, "")) {
          const line = `${typed} = ${si}`;
          if (!ctx.conversions.includes(line)) ctx.conversions.push(line);
        }
      }
      return q;
    }
    case "var": {
      const q = n.name === "ans" ? ctx.ans : ctx.vars.get(n.name);
      if (!q) throw new CalcError(n.name === "ans" ? '"ans" is the previous line\'s result; there is none yet.' : `"${n.name}" isn't defined yet.`);
      return q;
    }
    case "group":
      return evalNode(n.e, ctx, val);
    case "neg": {
      const q = evalNode(n.e, ctx, val);
      return { ...q, v: -q.v };
    }
    case "pct": {
      const q = evalNode(n.e, ctx, val);
      return { ...q, v: q.v * 0.01 };
    }
    case "call": {
      const args = n.args.map((a) => evalNode(a, ctx, val));
      const out = FUNCS[n.fn].run(args, n.fn);
      ctx.steps.push({ text: `${n.fn}(${n.args.map((a) => label(a, ctx, val)).join(", ")}) = ${fmtQ(out)}`, kind: kindOf(out), value: out });
      return out;
    }
    case "bin": {
      const l = evalNode(n.l, ctx, val);
      const r = evalNode(n.r, ctx, val);
      let out: Q;
      const rPct = isPct(n.r) && !isPct(n.l);
      switch (n.op) {
        case "+":
        case "-":
          if (rPct && dimless(r)) {
            // "500 GB + 30%" grows by 30%
            out = { ...l, v: l.v * (1 + (n.op === "+" ? 1 : -1) * r.v) };
          } else {
            if (!sameDim(l, r)) throw new CalcError(`Can't ${n.op === "+" ? "add" : "subtract"} ${describe(l)} and ${describe(r)}: different kinds of unit.`);
            out = { ...l, v: n.op === "+" ? l.v + r.v : l.v - r.v };
          }
          break;
        case "*":
          out = { v: l.v * r.v, B: l.B + r.B, s: l.s + r.s };
          break;
        case "/":
          if (r.v === 0) throw new CalcError("Division by zero.");
          out = { v: l.v / r.v, B: l.B - r.B, s: l.s - r.s };
          break;
        case "^":
          if (!dimless(r)) throw new CalcError("A power must be a plain number.");
          out = { v: Math.pow(l.v, r.v), B: l.B * r.v, s: l.s * r.v };
          break;
      }
      if (!isTrivial(n.l) && !isTrivial(n.r)) {
        const sym = n.op === "*" ? "×" : n.op === "/" ? "/" : n.op === "^" ? "^" : n.op === "+" ? "+" : "−";
        const lt = label(n.l, ctx, val);
        const rt = label(n.r, ctx, val);
        const pretty = n.op === "^" ? `${lt}^${rt}` : `${lt} ${sym} ${rt}`;
        ctx.steps.push({ text: `${pretty} = ${fmtQ(out)}`, kind: kindOf(out), value: out });
      }
      return out;
    }
  }
}

const isPct = (n: Node): boolean => (n.t === "lit" && !!n.pct) || n.t === "pct" || (n.t === "group" && isPct(n.e));

function describe(q: Q): string {
  const k = kindOf(q);
  return k === "data" ? "data" : k === "bandwidth" ? "data per second" : k === "rate" ? "a rate" : k === "time" ? "time" : k === "number" ? "a plain number" : unitStr(q);
}

/** "read as" text: every literal in base units */
function readAs(n: Node, ctx: Ctx): string {
  switch (n.t) {
    case "lit":
      if (n.pct && n.units.every((x) => x.def.label)) return `${fmtNum(n.n)}%`;
      return fmtSI(litQ(n, ctx.short));
    case "var":
      return n.name;
    case "group":
      return `(${readAs(n.e, ctx)})`;
    case "neg":
      return `-${readAs(n.e, ctx)}`;
    case "pct":
      return `${readAs(n.e, ctx)} %`;
    case "call":
      return `${n.fn}(${n.args.map((a) => readAs(a, ctx)).join(", ")})`;
    case "bin": {
      if ((n.op === "*" || n.op === "/") && isTrivial(n.r)) return readAs(n.l, ctx);
      if (n.op === "*" && isTrivial(n.l)) return readAs(n.r, ctx);
      const sym = n.op === "*" ? "×" : n.op === "-" ? "−" : n.op;
      return n.op === "^" ? `${readAs(n.l, ctx)}^${readAs(n.r, ctx)}` : `${readAs(n.l, ctx)} ${sym} ${readAs(n.r, ctx)}`;
    }
  }
}

// ---------------------------------------------------------------- formatting

export function kindOf(q: Q): Kind {
  if (q.B === 1 && q.s === 0) return "data";
  if (q.B === 1 && q.s === -1) return "bandwidth";
  if (q.B === 0 && q.s === -1) return "rate";
  if (q.B === 0 && q.s === 1) return "time";
  if (q.B === 0 && q.s === 0) return "number";
  return "other";
}

const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const sup = (n: number) => String(n).replace(/[-0-9]/g, (c) => SUP[c]);

function trim(s: string) {
  return s.includes(".") && !s.includes("e") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** "46,296", "0.7", "28.57", "2.59 × 10¹⁴" */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return n > 0 ? "∞" : n < 0 ? "-∞" : "NaN";
  const a = Math.abs(n);
  if (a === 0) return "0";
  if (a >= 1e15 || a < 1e-4) {
    const e = Math.floor(Math.log10(a));
    const m = n / Math.pow(10, e);
    return `${trim(m.toFixed(2))} × 10${sup(e)}`;
  }
  if (a >= 1000) return Math.round(n).toLocaleString("en-US");
  const p = Number(n.toPrecision(4));
  return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** 4 significant figures, no thousands grouping beyond 999 (used with a scaled unit) */
function fmtScaled(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString("en-US");
  return Number(n.toPrecision(4)).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** "4 billion", "550 million", "46.3 thousand" (≥ 1,000 only) */
export function fmtWords(n: number): string | null {
  const a = Math.abs(n);
  for (const [f, w] of [
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
    [1e3, "thousand"],
  ] as const) {
    if (a >= f && a < f * 1000) return `${fmtScaled(n / f)} ${w}`;
  }
  return null;
}

const DATA_UNITS = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB"];
const BIN_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB"];
const BIT_UNITS = ["bps", "Kbps", "Mbps", "Gbps", "Tbps", "Pbps", "Ebps"];

function scale(n: number, base: number, names: string[]): string {
  const a = Math.abs(n);
  let k = 0;
  while (k < names.length - 1 && a >= Math.pow(base, k + 1) * 0.9995) k++;
  if (a > 0 && a < 1) return `${fmtNum(n)} ${names[0]}`;
  return `${fmtScaled(n / Math.pow(base, k))} ${names[k]}`;
}

export const fmtBytes = (b: number) => scale(b, 1000, DATA_UNITS);
export const fmtBytesBinary = (b: number) => scale(b, 1024, BIN_UNITS);
export const fmtBits = (bytesPerSec: number) => scale(bytesPerSec * 8, 1000, BIT_UNITS);

const TIME_UNITS: [number, string][] = [
  [365 * DAY, "years"],
  [DAY, "days"],
  [3600, "h"],
  [60, "min"],
  [1, "s"],
  [1e-3, "ms"],
  [1e-6, "µs"],
  [1e-9, "ns"],
];

export function fmtTime(sec: number): string {
  const a = Math.abs(sec);
  if (a === 0) return "0 s";
  for (const [f, name] of TIME_UNITS) {
    if (a >= f * 0.9995) {
      const v = sec / f;
      return `${fmtScaled(v)} ${name === "days" && Math.abs(v) < 1.0005 ? "day" : name === "years" && Math.abs(v) < 1.0005 ? "year" : name}`;
    }
  }
  return `${fmtNum(sec)} s`;
}

function unitStr(q: Q): string {
  const parts: string[] = [];
  if (q.B) parts.push(q.B === 1 ? "B" : `B${sup(q.B)}`);
  if (q.s > 0) parts.push(q.s === 1 ? "s" : `s${sup(q.s)}`);
  let out = parts.join("·");
  if (q.s < 0) out = `${out || ""}/${q.s === -1 ? "s" : `s${sup(-q.s)}`}`;
  return out;
}

/** value with its natural unit: "259.2 TB", "100 MB/s", "46,296 /s", "2.5 ms", "29" */
export function fmtQ(q: Q): string {
  switch (kindOf(q)) {
    case "data":
      return fmtBytes(q.v);
    case "bandwidth":
      return `${fmtBytes(q.v)}/s`;
    case "rate":
      return `${fmtNum(q.v)} /s`;
    case "time":
      return fmtTime(q.v);
    case "number":
      return fmtNum(q.v);
    default:
      return `${fmtNum(q.v)} ${unitStr(q)}`;
  }
}

/** base units, no scaling: "2,000 B", "2,592,000 s", "50,000 /s" */
function fmtSI(q: Q): string {
  const k = kindOf(q);
  if (k === "number") return fmtNum(q.v);
  if (k === "rate") return `${fmtNum(q.v)} /s`;
  if (k === "bandwidth") return `${fmtNum(q.v)} B/s`;
  if (k === "data") return `${fmtNum(q.v)} B`;
  if (k === "time") return `${fmtNum(q.v)} s`;
  return `${fmtNum(q.v)} ${unitStr(q)}`;
}

export type Display = {
  kind: Kind;
  /** "259.2 TB" */
  main: string;
  /** what the main number is: "total data", "bandwidth" */
  caption: string;
  /** other useful views of the same value */
  alts: string[];
};

export function display(q: Q): Display {
  const k = kindOf(q);
  const alts: string[] = [];
  let caption = "result";
  switch (k) {
    case "data": {
      caption = "data (decimal units, 1 KB = 1,000 B)";
      if (Math.abs(q.v) >= 1000) alts.push(`${fmtBytesBinary(q.v)} in binary units (1 KiB = 1,024 B)`);
      alts.push(`${fmtNum(q.v)} bytes`);
      break;
    }
    case "bandwidth": {
      caption = "bandwidth";
      alts.push(`${fmtBits(q.v)} (× 8 for bits)`);
      alts.push(`${fmtBytes(q.v * DAY)} per day · ${fmtBytes(q.v * 30 * DAY)} per month`);
      alts.push(`peak ×2 = ${fmtBits(q.v * 2)} · ×3 = ${fmtBits(q.v * 3)}`);
      break;
    }
    case "rate": {
      caption = "per second";
      const perDay = q.v * DAY;
      alts.push(`${fmtWords(perDay) || fmtNum(perDay)} per day`);
      alts.push(`peak ×2 = ${fmtNum(q.v * 2)} /s · ×3 = ${fmtNum(q.v * 3)} /s`);
      break;
    }
    case "time": {
      caption = "time";
      if (Math.abs(q.v) >= 60 || Math.abs(q.v) < 1) alts.push(`${fmtNum(q.v)} s`);
      if (Math.abs(q.v) < 1) alts.push(`${fmtNum(q.v * 1e9)} ns`);
      break;
    }
    case "number": {
      caption = "number";
      const w = fmtWords(q.v);
      if (w && Math.abs(q.v) >= 1e6) alts.push(w);
      const a = Math.abs(q.v);
      if (a >= 1e4 && a < 1e15) alts.push(`${trim((q.v / Math.pow(10, Math.floor(Math.log10(a)))).toFixed(2))} × 10${sup(Math.floor(Math.log10(a)))}`);
      if (!Number.isInteger(q.v) && a >= 1 && a < 1e6) alts.push(`rounded up: ${Math.ceil(q.v - 1e-9).toLocaleString("en-US")}`);
      break;
    }
    default:
      caption = unitStr(q);
  }
  return { kind: k, main: fmtQ(q), caption, alts };
}

/** value shown in a chosen unit: 92 MB/s in Gbps → "0.736 Gbps" */
function inTarget(q: Q, t: Target, short: boolean): string {
  const f = unitsQ(t.units, short);
  if (f.B !== q.B || f.s !== q.s) {
    throw new CalcError(`Can't show ${describe(q)} in ${t.text} (that's ${describe(f)}).${kindOf(q) === "data" && kindOf(f) === "bandwidth" ? " Divide by a time first, e.g. / day." : ""}`);
  }
  return `${fmtScaled(q.v / f.v)} ${t.text}`;
}

// ---------------------------------------------------------------- lines

export type LineOk = {
  ok: true;
  src: string;
  name: string | null;
  value: Q;
  display: Display;
  /** "0.736 Gbps" when the line ends in "in Gbps" */
  converted: string | null;
  steps: Step[];
  /** literals in base units: "50,000 /s × 2,000 B × 2,592,000 s" */
  readAs: string;
  /** unit conversions used: "30 days = 2,592,000 s" */
  conversions: string[];
  notes: string[];
  /** the same line with the lesson's shortcuts (1 day ≈ 10^5 s …), when it changes the answer */
  shortcut: string | null;
  /** useful intermediate values of another kind: the bandwidth on the way to a storage total */
  along: { kind: Kind; text: string }[];
};

export type LineErr = { ok: false; src: string; error: string; at: number | null };
export type Line = LineOk | LineErr;

export type CalcResult = {
  lines: Line[];
  /** the last line that evaluated */
  final: LineOk | null;
  ok: boolean;
};

/** Split into statements: newlines and ";", minus "#" / "//" comments. Keeps the source offset. */
export function statements(input: string): { src: string; offset: number }[] {
  const out: { src: string; offset: number }[] = [];
  let off = 0;
  input.split("\n").forEach((raw) => {
    const noComment = raw.replace(/(#|\/\/).*$/, "");
    let o = off;
    noComment.split(";").forEach((part) => {
      if (part.trim()) out.push({ src: part, offset: o });
      o += part.length + 1;
    });
    off += raw.length + 1;
  });
  return out;
}

const ALONG: Kind[] = ["bandwidth", "rate"];

export function calculate(input: string): CalcResult {
  const stmts = statements(input);
  const vars = new Map<string, Q>();
  const shortVars = new Map<string, Q>();
  const names = new Set<string>();
  let ans: Q | null = null;
  let shortAns: Q | null = null;
  const lines: Line[] = [];
  let final: LineOk | null = null;

  for (const st of stmts) {
    const src = st.src.trim();
    const lead = st.src.length - st.src.trimStart().length;
    try {
      const toks = tokenize(src);
      const parsed = new Parser(toks, src, names).line();
      const ctx: Ctx = { short: false, vars, steps: [], conversions: [], ans };
      const val = new Map<Node, Q>();
      const value = evalNode(parsed.expr, ctx, val);
      const converted = parsed.target ? inTarget(value, parsed.target, false) : null;

      // the lesson's shortcut numbers (only matters when day/week/month/year appear)
      const sctx: Ctx = { short: true, vars: shortVars, steps: [], conversions: [], ans: shortAns };
      let svalue: Q | null = null;
      try {
        svalue = evalNode(parsed.expr, sctx, new Map());
      } catch {
        svalue = null;
      }
      const differs = !!svalue && Math.abs(svalue.v - value.v) > Math.abs(value.v) * 0.005;
      const shortText = differs && svalue ? (parsed.target ? inTarget(svalue, parsed.target, true) : fmtQ(svalue)) : null;
      const shortcut = shortText && shortText !== (converted ?? fmtQ(value)) ? shortText : null;

      const kind = kindOf(value);
      const along: { kind: Kind; text: string }[] = [];
      ALONG.forEach((k) => {
        if (k === kind) return;
        const s = ctx.steps.find((x) => x.kind === k);
        if (!s) return;
        along.push({ kind: k, text: k === "bandwidth" ? `${fmtQ(s.value)} = ${fmtBits(s.value.v)}` : fmtQ(s.value) });
      });

      if (parsed.name) {
        names.add(parsed.name);
        vars.set(parsed.name, value);
        shortVars.set(parsed.name, svalue || value);
      }
      ans = value;
      shortAns = svalue || value;
      const line: LineOk = {
        ok: true,
        src,
        name: parsed.name,
        value,
        display: display(value),
        converted,
        steps: ctx.steps,
        readAs: readAs(parsed.expr, ctx),
        conversions: ctx.conversions,
        notes: parsed.notes,
        shortcut,
        along,
      };
      lines.push(line);
      final = line;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      // a failed definition still reserves its name, so later lines say "not defined yet" honestly
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(src);
      if (m) names.add(m[1]);
      lines.push({ ok: false, src, error: e.message, at: e.at === undefined ? null : st.offset + lead + e.at });
    }
  }
  return { lines, final, ok: lines.length > 0 && lines.every((l) => l.ok) };
}
