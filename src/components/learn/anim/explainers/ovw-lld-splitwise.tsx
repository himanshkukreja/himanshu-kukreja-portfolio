/**
 * The whole low-level design lesson, Design a Bill-Splitting App (Splitwise), motivated by Chukta:
 * the round (three split types, integer paise, net balances that sum to zero), the classes
 * (expenses are facts, balances derived; the split strategies; where Chukta's public building
 * blocks fit), the lesson's Goa trip (five expenses, the four balances, 6 debts → 3 payments, a UPI
 * settle-up), then concurrency, honesty about greedy, and the follow-ups.
 */
import { at, Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
/** a class on the diagram: box, label, short label for narrow stages */
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an object's state, drawn as a small square: [label, tone, caption under it] */
type Tile = [Two, Tone?, Two?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** classes in play (plain 1 or a tone); every other class is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** calls flowing in this frame: [from, to, tone]; a reversed pair runs the wire backwards */
  fl?: [string, string, Tone?][];
  /** object state row (spots, seats, cache order, balances…) */
  tiles?: Tile[];
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

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd): P[] {
  const ay = a.y + a.h / 2;
  const by = b.y + b.h / 2;
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: ay };
    const p3 = { x: r ? b.x : b.x + b.w, y: by };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = at(step, F[variant] || F[V[0].id]);
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  // the lower band stacks: tiles, figures, chips, meters
  let y = 206;
  const tY = y;
  if (f.tiles) y += f.tiles.some((x) => x[2] !== undefined) ? 58 : 42;
  const fY = y;
  if (f.figs) y += 64;
  const cols = f.cols || 2;
  const cY = y;
  if (f.chips) y += Math.ceil(f.chips.length / cols) * 34;
  const bY = y;
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cw = (552 - (cols - 1) * 8) / cols;
  const nt = f.tiles?.length || 0;
  const tw = Math.min(96, (568 - (nt - 1) * 6) / Math.max(1, nt));
  const tx = (W - nt * tw - (nt - 1) * 6) / 2;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map(([a, b]) => {
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(geo(N[a], N[b]))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr && n.h < 40 ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const fwd = E.some((e) => e[0] === a && e[1] === b);
        const p = fwd ? bz(geo(N[a], N[b]), u) : bz(geo(N[b], N[a]), 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.tiles?.map(([l, tone, c], i) => {
        const x = tx + i * (tw + 6);
        return (
          <g key={i} opacity={fade(i, nt)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={tY} width={tw} height={30} />
            <Txt x={x + tw / 2} y={tY + 20} k="s" tone={tone}>
              {pick(l, nr)}
            </Txt>
            {c !== undefined && (
              <Txt x={x + tw / 2} y={tY + 46} k="s" tone={tone}>
                {pick(c, nr)}
              </Txt>
            )}
          </g>
        );
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={fY + 30} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={fY + 52} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const cy = cY + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={cy} width={cw} height={26} />
            <Txt x={x + cw / 2} y={cy + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={bY + 10 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={bY + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars || f.tiles ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  user: { x: 16, y: 40, w: 96, h: 44, l: "Members", n: "Users" },
  svc: { x: 144, y: 40, w: 148, h: 44, l: "SplitService", n: "Service" },
  strat: { x: 324, y: 40, w: 136, h: 44, l: "SplitStrategy", n: "Split" },
  upi: { x: 492, y: 40, w: 92, h: 44, l: "UPI link", n: "UPI" },
  expense: { x: 144, y: 150, w: 148, h: 44, l: "Expense" },
  ledger: { x: 324, y: 150, w: 136, h: 44, l: "Ledger" },
  simp: { x: 492, y: 150, w: 92, h: 44, l: "Simplify", n: "Min" },
};
const E: [string, string][] = [
  ["user", "svc"],
  ["svc", "strat"],
  ["svc", "expense"],
  ["expense", "ledger"],
  ["ledger", "simp"],
  ["simp", "upi"],
];
const ALL = { user: 1, svc: 1, strat: 1, upi: 1, expense: 1, ledger: 1, simp: 1 } as const;
const NET: Tile[] = [
  ["Aarav", "ok", ["+₹6,516.66", "+6516.66"]],
  ["Diya", "bad", ["−₹2,883.33", "−2883.33"]],
  ["Kabir", "ok", ["+₹1,600.00", "+1600.00"]],
  ["Meera", "bad", ["−₹5,233.33", "−5233.33"]],
];

const F: Record<string, Fr[]> = {
  round: [
    { k: "the round", on: ALL, figs: [["3", ["split types", "splits"]], ["0", ["paise lost", "paise lost"], "ok"], ["1 tap", ["to settle on UPI", "to settle"]]] },
    {
      k: "clarify first",
      on: { user: 1, svc: "lit" },
      chips: [["INR in integer paise", "integer paise"], ["₹100 / 3 must add up", "₹100 / 3 adds up"], ["payer can be outside the split", "payer outside ok"], ["group members only", "members only"], ["settle-up: a recorded payment", "settle = payment"], ["delete: an exact reversal", "delete = reverse"]],
      ctn: [undefined, "warn"],
    },
    { k: "net balances", on: { ledger: "lit" }, chips: [["+ : the group owes you", "+ owed to you"], ["− : you owe the group", "− you owe"]], ctn: ["ok", "bad"], note: ["paid for others minus consumed: they always sum to zero", "they sum to zero"] },
  ],
  classes: [
    { k: "facts and consequences", on: ALL, sub: { expense: ["a fact", "fact"], ledger: ["derived", "derived"] }, note: ["balances change only by applying an expense, a reversal or a settlement", "only by applying expenses"] },
    { k: "three ways to split", on: { svc: 1, strat: "lit" }, fl: [["svc", "strat"]], chips: [["Equal: 33.34 + 33.33 + 33.33", "Equal: +1 paisa"], ["Exact: shares must add up", "Exact: must add up"], ["Percent: Decimal, floor, then remainders", "Percent: Decimal"]], cols: 1, ct: "sky" },
    {
      k: "Chukta's public blocks",
      on: { svc: 1, expense: 1, ledger: "lit", user: 1 },
      chips: [["balance view → balances are derived", "view: derived"], ["expense RPC → one transaction", "RPC: one txn"], ["row-level security → members only", "RLS: members"]],
      cols: 1,
      ct: "ok",
      note: ["how an app like Chukta can model it", "how an app like Chukta could"],
    },
  ],
  trip: [
    {
      k: "five expenses",
      on: { user: 1, svc: "lit", strat: 1, expense: "lit" },
      fl: [["user", "svc"], ["svc", "strat"], ["svc", "expense"]],
      chips: [["hotel ₹12,000, equal", "hotel, equal"], ["dinner ₹2,500, exact", "dinner, exact"], ["cab ₹1,000, percent", "cab, percent"], ["chai ₹100, 3 ways", "chai, 3 ways"], ["petrol ₹6,000, equal", "petrol, equal"]],
      ct: "sky",
    },
    { k: "the balances", on: { expense: 1, ledger: "lit" }, fl: [["expense", "ledger"]], tiles: NET, note: ["sum: exactly ₹0.00", "sum: ₹0.00"], nt: "ok" },
    { k: "6 debts → 3 payments", on: { ledger: 1, simp: "lit" }, fl: [["ledger", "simp"]], chips: [["Meera → Aarav ₹5,233.33", "Meera→Aarav 5233"], ["Diya → Kabir ₹1,600.00", "Diya→Kabir 1600"], ["Diya → Aarav ₹1,283.33", "Diya→Aarav 1283"]], cols: 1, note: ["biggest debtor pays biggest creditor, repeat", "biggest pays biggest"] },
    {
      k: "one tap to settle",
      kt: "ok",
      on: { simp: 1, upi: "lit", ledger: 1 },
      fl: [["simp", "upi"]],
      tiles: [["Aarav", "ok", ["+₹1,283.33", "+1283.33"]], ["Diya", "bad", ["−₹2,883.33", "−2883.33"]], ["Kabir", "ok", ["+₹1,600.00", "+1600.00"]], ["Meera", "mute", ["₹0.00", "0.00"]]],
      note: ["upi://pay?pa=aarav.demo@upi&am=5233.33&cu=INR", "upi://pay?…&am=5233.33"],
    },
  ],
  ops: [
    { k: "two writes at once", on: { user: "warn", svc: "lit", expense: 1, ledger: 1 }, fl: [["user", "svc", "warn"], ["svc", "expense"]], chips: [["one atomic step per group", "atomic per group"], ["apply a delta, never read-modify-write", "apply a delta"], ["other groups never wait", "groups don't wait"]], cols: 1, ct: "ok" },
    { k: "greedy, honestly", on: { simp: "lit" }, figs: [["≤ n − 1", "payments", "ok"], ["NP-hard", ["true minimum", "the minimum"], "warn"]], note: ["for friends, greedy is the right call", "greedy is fine here"] },
    {
      k: "the follow-ups",
      on: ALL,
      chips: [["edit = delete + add, atomically", "edit = del + add"], ["shares 2:1:1 → a new strategy", "shares: strategy"], ["currencies → per-currency balances", "per currency"], ["reminders → send the UPI link", "remind with UPI"]],
      ct: "ok",
    },
  ],
};

const V: Variant[] = [
  {
    id: "round",
    label: "The round",
    steps: [
      { caption: "The round: groups and expenses split equally, exactly or by percent, balances to the paisa, and the fewest payments to settle.", tween: 1200 },
      { caption: "Clarify: money is integer paise, ₹100 three ways must still add up, the payer may be outside the split, and members only.", tween: 1400 },
      { caption: "One number per person is enough: what they paid for others minus what they consumed. A group's balances always sum to zero.", tween: 1200 },
    ],
  },
  {
    id: "classes",
    label: "The classes",
    steps: [
      { caption: "An expense is a fact; a balance is a consequence. Balances change only by applying an expense, a reversal or a settlement.", tween: 1200 },
      { caption: "Three strategies, one guarantee: the parts add up to the amount. Equal hands out leftover paise; percent uses Decimal and remainders.", tween: 1400, loop: true },
      { caption: "Chukta is publicly built on Supabase Postgres with balance views, expense RPCs and row-level security. Here is where each fits.", tween: 1400 },
    ],
  },
  {
    id: "trip",
    label: "The Goa trip",
    steps: [
      { caption: "Four friends in Goa: a ₹12,000 hotel split equally, an exact dinner, a cab by percent, ₹100 of chai three ways, and petrol.", tween: 1600, loop: true },
      { caption: "In the ledger, Aarav is owed ₹6,516.66 and Kabir ₹1,600; Diya owes ₹2,883.33 and Meera ₹5,233.33. They sum to exactly zero.", tween: 1400, loop: true },
      { caption: "Pairwise there are 6 debts. Greedy min cash flow matches the biggest debtor with the biggest creditor: 3 payments settle it.", tween: 1400, loop: true },
      { caption: "Meera taps a UPI link with Aarav's VPA and ₹5,233.33 filled in. Once it's paid, the settle-up is recorded and two payments remain.", tween: 1400, loop: true },
    ],
  },
  {
    id: "ops",
    label: "Locks & follow-ups",
    steps: [
      { caption: "Two friends add expenses at once. Each write takes the group's lock and applies a delta, so nothing is lost and groups never wait.", tween: 1200, loop: true },
      { caption: "Be honest: greedy gives at most n − 1 payments, usually optimal or close. The true minimum is NP-hard, so greedy is the right call.", tween: 1200 },
      { caption: "Follow-ups: an edit is a delete plus an add, shares are a new strategy, currencies get their own balances, reminders send the link.", tween: 1400 },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
