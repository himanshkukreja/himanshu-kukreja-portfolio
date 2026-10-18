"use client";

import { useMemo, useRef, useState } from "react";
import { DEMO_LABEL, PRIMARY_BTN, type DemoProps, useTicker } from "../useTicker";

// A Goa trip in three moves, with the same maths Chukta uses (reimplemented here, minimal):
// amounts in whole paise, largest-remainder splits (ties by id), itemised bills where tax is
// shared by what each person had, pairwise debts per expense, then greedy "simplify debts".

type Pid = "aarav" | "kabir" | "meera" | "you";
type Transfer = { from: Pid; to: Pid; amount: number };

const PEOPLE: { id: Pid; name: string; short: string }[] = [
  { id: "you", name: "You", short: "Y" },
  { id: "aarav", name: "Aarav", short: "A" },
  { id: "meera", name: "Meera", short: "M" },
  { id: "kabir", name: "Kabir", short: "K" },
];
const NAME = Object.fromEntries(PEOPLE.map((p) => [p.id, p.name])) as Record<Pid, string>;
const ALL_IDS = PEOPLE.map((p) => p.id);

type Item = { name: string; price: number; fair: Pid[] };
const ITEMS: Item[] = [
  { name: "Prawn curry rice", price: 48000, fair: ["you", "aarav", "meera"] },
  { name: "Paneer tikka", price: 32000, fair: ["you", "aarav", "meera", "kabir"] },
  { name: "Kingfisher × 3", price: 54000, fair: ["you", "aarav", "kabir"] },
  { name: "Fresh lime soda", price: 12000, fair: ["meera"] },
];
const SUBTOTAL = ITEMS.reduce((a, i) => a + i.price, 0);
const GST = Math.round(SUBTOTAL * 0.05); // 5% GST on the bill
const DINNER = SUBTOTAL + GST;

/** Earlier expenses on the trip, each split equally between all four. */
const EARLIER: { what: string; paidBy: Pid; amount: number }[] = [
  { what: "Villa, 2 nights", paidBy: "aarav", amount: 1200000 },
  { what: "Airport cab", paidBy: "kabir", amount: 240000 },
  { what: "Scooter rental", paidBy: "meera", amount: 160000 },
];

const CHAT: { who: string; text: string }[] = [
  { who: "Meera", text: "No beer for me. The lime soda was mine." },
  { who: "Kabir", text: "I skipped the prawns." },
];

/** Largest remainder: floor shares, leftover paise to the biggest remainders, ties by id. */
function distribute(total: number, weights: { id: Pid; w: number }[]): Map<Pid, number> {
  const W = weights.reduce((a, x) => a + x.w, 0);
  const out = new Map<Pid, number>();
  if (W <= 0) return out;
  const parts = weights.map((x) => ({ id: x.id, base: Math.floor((total * x.w) / W), rem: (total * x.w) % W }));
  let left = total - parts.reduce((a, p) => a + p.base, 0);
  const order = [...parts].sort((a, b) => (a.rem === b.rem ? a.id.localeCompare(b.id) : b.rem - a.rem));
  for (let k = 0; left > 0; k++, left--) order[k].base += 1;
  for (const p of parts) out.set(p.id, p.base);
  return out;
}

/** Itemised split: each line equally between who had it; GST in proportion to their items. */
function itemised(claims: Pid[][]): Map<Pid, number> {
  const sub = new Map<Pid, number>();
  ITEMS.forEach((it, i) => {
    const who = claims[i];
    if (!who.length) return;
    for (const [id, v] of distribute(it.price, who.map((id) => ({ id, w: 1 })))) sub.set(id, (sub.get(id) ?? 0) + v);
  });
  const ids = [...sub.keys()];
  const tax = distribute(GST, ids.map((id) => ({ id, w: sub.get(id) ?? 0 })));
  return new Map(ids.map((id) => [id, (sub.get(id) ?? 0) + (tax.get(id) ?? 0)]));
}

/** Who owes whom, expense by expense (one payer each), netted per pair. */
function pairwise(dinner: Map<Pid, number>): Transfer[] {
  const expenses = [
    ...EARLIER.map((e) => ({ paidBy: e.paidBy, owed: distribute(e.amount, ALL_IDS.map((id) => ({ id, w: 1 }))) })),
    { paidBy: "you" as Pid, owed: dinner },
  ];
  const pair = new Map<string, number>(); // "a|b", a < b; positive = a owes b
  for (const e of expenses)
    for (const [id, amt] of e.owed) {
      if (id === e.paidBy || !amt) continue;
      const [a, b, sign] = id < e.paidBy ? [id, e.paidBy, 1] : [e.paidBy, id, -1];
      pair.set(`${a}|${b}`, (pair.get(`${a}|${b}`) ?? 0) + sign * amt);
    }
  const out: Transfer[] = [];
  for (const [key, v] of pair) {
    if (!v) continue;
    const [a, b] = key.split("|") as [Pid, Pid];
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v });
  }
  return out;
}

function nets(ts: Transfer[]): Map<Pid, number> {
  const n = new Map<Pid, number>(ALL_IDS.map((id) => [id, 0]));
  for (const t of ts) {
    n.set(t.from, n.get(t.from)! - t.amount);
    n.set(t.to, n.get(t.to)! + t.amount);
  }
  return n;
}

/** Simplify debts: biggest debtor pays biggest creditor until everyone is at zero. */
function simplify(balance: Map<Pid, number>): Transfer[] {
  const cr = [...balance].filter(([, v]) => v > 0).map(([id, v]) => ({ id, amt: v }));
  const dr = [...balance].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amt: -v }));
  const big = (xs: { id: Pid; amt: number }[]) =>
    xs.reduce((best, x) => (x.amt > best.amt || (x.amt === best.amt && x.id < best.id) ? x : best));
  const out: Transfer[] = [];
  while (cr.length && dr.length) {
    const c = big(cr);
    const d = big(dr);
    const amt = Math.min(c.amt, d.amt);
    out.push({ from: d.id, to: c.id, amount: amt });
    c.amt -= amt;
    d.amt -= amt;
    if (!c.amt) cr.splice(cr.indexOf(c), 1);
    if (!d.amt) dr.splice(dr.indexOf(d), 1);
  }
  return out;
}

/** ₹1,23,456.50 (Indian grouping, paise only when there are some). */
function inr(minor: number): string {
  const m = Math.abs(minor);
  const r = String(Math.floor(m / 100));
  const p = m % 100;
  const grouped = r.length <= 3 ? r : `${r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${r.slice(-3)}`;
  return `${minor < 0 ? "−" : ""}₹${grouped}${p ? `.${String(p).padStart(2, "0")}` : ""}`;
}

const sameSet = (a: Pid[], b: Pid[]) => a.length === b.length && a.every((x) => b.includes(x));

// ---------------------------------------------------------------- payment graph

const POS: Record<Pid, [number, number]> = { you: [52, 38], aarav: [268, 38], meera: [52, 174], kabir: [268, 174] };
const HALF = 19;

function Edge({ t, tone, show }: { t: Transfer; tone: "plain" | "hot"; show: boolean }) {
  const [x1, y1] = POS[t.from];
  const [x2, y2] = POS[t.to];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const k = HALF / Math.max(Math.abs(ux), Math.abs(uy)) + 4;
  const a = [x1 + ux * k, y1 + uy * k];
  const b = [x2 - ux * (k + 2), y2 - uy * (k + 2)];
  const diag = dx !== 0 && dy !== 0;
  const f = diag ? 0.3 : 0.5;
  const lx = a[0] + (b[0] - a[0]) * f;
  const ly = a[1] + (b[1] - a[1]) * f;
  const color = tone === "hot" ? "var(--c-signal)" : "var(--c-fg-3)";
  const label = inr(t.amount);
  const w = label.length * 6.8 + 8;
  return (
    <g className="transition-opacity duration-500" style={{ opacity: show ? 1 : 0 }}>
      <line
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke={color}
        strokeWidth={tone === "hot" ? 2.5 : 1.5}
        markerEnd={`url(#${tone === "hot" ? "ck-arrow-hot" : "ck-arrow"})`}
      />
      <rect x={lx - w / 2} y={ly - 8} width={w} height={16} fill="var(--c-raised)" />
      <text
        x={lx}
        y={ly + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fontWeight={tone === "hot" ? 700 : 500}
        fill={tone === "hot" ? "var(--c-signal-text)" : "var(--c-fg-2)"}
        fontFamily="var(--font-geist-mono), ui-monospace, monospace"
      >
        {label}
      </text>
    </g>
  );
}

function Graph({ before, after, simplified }: { before: Transfer[]; after: Transfer[]; simplified: boolean }) {
  const n = nets(before);
  return (
    <svg
      viewBox="0 0 320 212"
      className="block h-auto w-full max-w-[420px] self-center"
      role="img"
      aria-label={
        simplified
          ? `Simplified: ${after.map((t) => `${NAME[t.from]} pays ${NAME[t.to]} ${inr(t.amount)}`).join("; ")}`
          : `Who owes whom: ${before.map((t) => `${NAME[t.from]} owes ${NAME[t.to]} ${inr(t.amount)}`).join("; ")}`
      }
    >
      <defs>
        {(
          [
            ["ck-arrow", "var(--c-fg-3)"],
            ["ck-arrow-hot", "var(--c-signal)"],
          ] as const
        ).map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill={c} />
          </marker>
        ))}
      </defs>
      {before.map((t) => (
        <Edge key={`b-${t.from}-${t.to}`} t={t} tone="plain" show={!simplified} />
      ))}
      {after.map((t) => (
        <Edge key={`a-${t.from}-${t.to}`} t={t} tone="hot" show={simplified} />
      ))}
      {PEOPLE.map((p) => {
        const [x, y] = POS[p.id];
        const v = n.get(p.id) ?? 0;
        const below = y > 100;
        return (
          <g key={p.id}>
            <rect
              x={x - HALF}
              y={y - HALF}
              width={HALF * 2}
              height={HALF * 2}
              fill={p.id === "you" ? "#C8F169" : "var(--c-surface-2)"}
              stroke={p.id === "you" ? "#111511" : "var(--c-line-strong)"}
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="15"
              fontWeight="700"
              fill={p.id === "you" ? "#111511" : "var(--c-fg)"}
              fontFamily="var(--font-display), ui-sans-serif, system-ui"
            >
              {p.short}
            </text>
            <text
              x={x}
              y={below ? y + HALF + 13 : y - HALF - 7}
              textAnchor="middle"
              fontSize="10"
              fill={v >= 0 ? "var(--c-ok)" : "var(--c-bad-text)"}
              fontFamily="var(--font-geist-mono), ui-monospace, monospace"
            >
              {p.name} {v >= 0 ? "+" : ""}
              {inr(v)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------- the demo

type Step = "split" | "simplify" | "settle";
const STEPS: [Step, string][] = [
  ["split", "split the bill"],
  ["simplify", "simplify debts"],
  ["settle", "settle over UPI"],
];

const startClaims = () => ITEMS.map(() => [...ALL_IDS]);

export default function ChuktaDemo({ clear }: DemoProps) {
  const [step, setStep] = useState<Step>("split");
  const [claims, setClaims] = useState<Pid[][]>(startClaims);
  const [guess, setGuess] = useState<number | null>(null);
  const [pay, setPay] = useState<"idle" | "opening" | "paid">("idle");
  const [fairAtSave, setFairAtSave] = useState(false);
  const payRef = useRef(0);
  const { start, stop } = useTicker();

  const shares = useMemo(() => itemised(claims), [claims]);
  const before = useMemo(() => pairwise(shares), [shares]);
  const after = useMemo(() => simplify(nets(before)), [before]);
  const mine = after.filter((t) => t.from === "you");

  const allClaimed = claims.every((c) => c.length > 0);
  const matched = ITEMS.filter((it, i) => sameSet(claims[i], it.fair)).length;
  const fair = matched === ITEMS.length;
  const simplified = guess !== null;

  const toggle = (i: number, id: Pid) =>
    setClaims((cs) => cs.map((c, k) => (k !== i ? c : c.includes(id) ? c.filter((x) => x !== id) : ALL_IDS.filter((x) => x === id || c.includes(x)))));

  const save = () => {
    setFairAtSave(fair);
    setStep("simplify");
  };

  const settle = () => {
    setPay("opening");
    payRef.current = 0;
    start(() => {
      payRef.current += 1;
      if (payRef.current >= 2) {
        stop();
        setPay("paid");
        clear("Split, simplified, settled over UPI");
      }
    }, 750);
  };

  const restart = () => {
    stop();
    setStep("split");
    setClaims(startClaims());
    setGuess(null);
    setPay("idle");
  };

  const stepIdx = STEPS.findIndex(([s]) => s === step);
  const youOwe = mine.reduce((a, t) => a + t.amount, 0);
  // Example payee only (not a real UPI ID); the format is the one Chukta builds.
  const upi = mine
    .map((t) => `upi://pay?pa=${t.to}.demo%40upi&pn=${NAME[t.to]}&am=${(t.amount / 100).toFixed(2)}&cu=INR&tn=Goa%20trip`)
    .join("\n");

  return (
    <div className="flex flex-col gap-3.5">
      {/* app bar + steps */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/projects/chukta/mark.svg" alt="" width={24} height={24} className="h-6 w-6" />
          <span className="font-display text-[17px] font-bold tracking-[-0.02em] text-fg">Goa trip</span>
          <span className="font-mono text-[11px] text-fg-3">· 4 friends</span>
        </span>
        <button type="button" onClick={restart} className="min-h-10 border border-line-strong px-3 font-mono text-xs text-fg-2 hover:bg-surface-2">
          restart
        </button>
      </div>
      <ol className="m-0 grid list-none grid-cols-3 gap-1 p-0" aria-label="Steps">
        {STEPS.map(([s, name], i) => (
          <li
            key={s}
            aria-current={s === step ? "step" : undefined}
            className={`px-2 py-1.5 font-mono text-[10px] uppercase tracking-label sm:text-[11px] ${
              i === stepIdx ? "bg-signal font-semibold text-on-signal" : i < stepIdx ? "bg-surface-2 text-fg-2" : "border border-dashed border-line-strong text-fg-4"
            }`}
          >
            {i < stepIdx ? "✓" : i + 1} · {name}
          </li>
        ))}
      </ol>

      {step === "split" && (
        <div className="flex flex-wrap gap-3">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <span className={DEMO_LABEL}>SCANNED BILL · tap who had what</span>
            <div className="flex flex-col border border-dashed border-[#C9CEBF] bg-[#F5F6F0] p-3 text-[#111511] sm:p-4">
              <div className="flex items-baseline justify-between border-b border-dashed border-[#C9CEBF] pb-2 font-mono text-[11px] uppercase tracking-label text-[#575E55]">
                <span>Shack 9 · Anjuna</span>
                <span>paid by you</span>
              </div>
              {ITEMS.map((it, i) => (
                <div key={it.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-dashed border-[#E1E4DA] py-2.5">
                  <span className="flex min-w-0 flex-[1_1_150px] items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold">{it.name}</span>
                    <span className="font-mono text-[13px]">{inr(it.price)}</span>
                  </span>
                  <span role="group" aria-label={`Who had ${it.name}`} className="flex gap-1">
                    {PEOPLE.map((p) => {
                      const on = claims[i].includes(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${p.name} had ${it.name}`}
                          onClick={() => toggle(i, p.id)}
                          className={`grid h-10 w-10 place-items-center font-display text-sm font-bold ${
                            on ? "bg-[#111511] text-[#C8F169]" : "border border-dashed border-[#B5BAA9] text-[#575E55]"
                          }`}
                        >
                          {p.short}
                        </button>
                      );
                    })}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-2 font-mono text-[12px] text-[#575E55]">
                <span>GST 5% · shared by what you had</span>
                <span>{inr(GST)}</span>
              </div>
              <div className="flex justify-between pt-1 font-mono text-[14px] font-semibold">
                <span>Total</span>
                <span>{inr(DINNER)}</span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
            <span className={DEMO_LABEL}>GROUP CHAT</span>
            <div className="flex flex-col gap-1.5">
              {CHAT.map((m) => (
                <div key={m.text} className="max-w-[95%] self-start border border-line-strong px-3 py-2 text-sm leading-snug text-fg-2">
                  <span className="font-semibold text-fg">{m.who}: </span>
                  {m.text}
                </div>
              ))}
            </div>
            <span className={`${DEMO_LABEL} mt-1`}>SHARES · live, to the paisa</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
              {PEOPLE.map((p) => {
                const v = shares.get(p.id) ?? 0;
                return (
                  <li key={p.id} className="flex items-center gap-2 font-mono text-[13px]">
                    <span className="w-12 shrink-0 text-fg-2">{p.name}</span>
                    <span className="relative h-2 grow bg-surface-2">
                      <span className="absolute inset-y-0 left-0 bg-signal transition-[width] duration-300" style={{ width: `${(v / DINNER) * 100}%` }} />
                    </span>
                    <span className="w-[76px] shrink-0 text-right text-fg">{inr(v)}</span>
                  </li>
                );
              })}
            </ul>
            <span className="text-[13px] leading-snug text-fg-3">
              Split equally it would be {inr(Math.floor(DINNER / 4))} each.{" "}
              <span className={`whitespace-nowrap ${fair ? "font-semibold text-ok" : ""}`}>
                {fair ? "Matches the chat ✓" : `${matched}/${ITEMS.length} lines match the chat.`}
              </span>
            </span>
            <button type="button" onClick={save} disabled={!allClaimed} className={`${PRIMARY_BTN} mt-1`}>
              {allClaimed ? "Save expense →" : "Every line needs someone"}
            </button>
          </div>
        </div>
      )}

      {step === "simplify" && (
        <div className="flex flex-wrap gap-4">
          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <span className={DEMO_LABEL}>{simplified ? `SIMPLIFIED · ${after.length} payments` : `WHO OWES WHOM · ${before.length} payments`}</span>
            <div className="border border-line bg-raised p-2 sm:p-3">
              <Graph before={before} after={after} simplified={simplified} />
            </div>
          </div>
          <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2.5">
            <span className={DEMO_LABEL}>TRIP EXPENSES</span>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono text-[12px] text-fg-2">
              {EARLIER.map((e) => (
                <li key={e.what} className="flex justify-between gap-2">
                  <span>
                    {e.what} · {NAME[e.paidBy]} paid
                  </span>
                  <span className="text-fg">{inr(e.amount)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2">
                <span>Dinner, itemised · you paid</span>
                <span className="text-fg">{inr(DINNER)}</span>
              </li>
            </ul>
            {!simplified ? (
              <>
                <span className="text-[15px] font-semibold leading-snug text-fg">
                  {before.length} payments to settle this trip. Guess: how few can do it?
                </span>
                <div role="group" aria-label="Your guess" className="flex gap-1.5">
                  {[2, 3, 4, 5].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGuess(g)}
                      className="min-h-12 flex-1 border border-line-strong font-mono text-base text-fg hover:border-signal hover:bg-surface-2"
                    >
                      {g}
                    </button>
                  ))}
                </div>
                <span className="text-[13px] text-fg-3">Your pick runs Chukta&apos;s simplify debts.</span>
              </>
            ) : (
              <>
                <span className="text-[15px] font-semibold leading-snug text-fg" aria-live="polite">
                  {before.length} → {after.length} payments.{" "}
                  <span className={guess === after.length ? "text-ok" : "text-fg-3"}>
                    {guess === after.length ? `You called it: ${guess} ✓` : `You guessed ${guess}.`}
                  </span>
                </span>
                <span className="text-[13px] leading-snug text-fg-3">
                  Same totals for everyone, fewer transfers. The biggest debtor pays the biggest creditor until all are at zero.
                </span>
                <button type="button" onClick={() => setStep("settle")} className={PRIMARY_BTN}>
                  Settle up →
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {step === "settle" && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
            <span className={DEMO_LABEL}>YOUR BALANCE</span>
            <div className={`flex flex-col gap-1 border p-4 ${pay === "paid" ? "border-ok" : "border-line-strong"}`} aria-live="polite">
              {pay === "paid" ? (
                <>
                  <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] text-fg">Chukta.</span>
                  <span className="text-[15px] text-fg-2">You&apos;re settled up in Goa trip. {inr(0)} owed.</span>
                </>
              ) : (
                <>
                  <span className="text-[15px] text-fg-2">
                    You owe {mine.map((t) => NAME[t.to]).join(" and ")}
                  </span>
                  <span className="font-display text-[34px] font-extrabold leading-none tracking-[-0.03em] text-bad-text">{inr(youOwe)}</span>
                </>
              )}
            </div>
            {pay !== "paid" ? (
              <button type="button" onClick={settle} disabled={pay === "opening"} className={`${PRIMARY_BTN} w-full sm:w-auto`}>
                {pay === "opening" ? "Opening your UPI app…" : `Pay ${inr(youOwe)} with UPI`}
              </button>
            ) : (
              <span className="font-mono text-[12px] text-fg-3">
                Split {fairAtSave ? "fairly ✓" : "(not quite how the chat said)"} · guess {guess === after.length ? "✓" : "✗"} · settled ✓
              </span>
            )}
          </div>
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-2">
            <span className={DEMO_LABEL}>ONE TAP · what Chukta hands your UPI app</span>
            <code className="block whitespace-pre-wrap break-all border border-line bg-raised p-3 font-mono text-[12px] leading-relaxed text-fg-2">{upi}</code>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px] leading-snug text-fg-3">
              {after
                .filter((t) => t.from !== "you")
                .map((t) => (
                  <li key={`${t.from}-${t.to}`}>
                    {NAME[t.from]} → {NAME[t.to]} {inr(t.amount)} · gets a WhatsApp nudge
                  </li>
                ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
