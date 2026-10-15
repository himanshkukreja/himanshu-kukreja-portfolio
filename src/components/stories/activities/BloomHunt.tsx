"use client";

import { useState } from "react";
import ActivityShell from "./ActivityShell";
import { BTN_GHOST, BTN_PRIMARY, ChoiceStep, Feedback, OPTION, OPT_DIM, OPT_IDLE, OPT_RIGHT, OPT_WRONG, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

const M = 16;
// The case file's toy hash functions.
const hashes = (x: number) => [x % M, (x * 7) % M, (x * 13) % M];
const uniq = (a: number[]) => Array.from(new Set(a));

const THREATS = [
  { url: "evil-phishing-site.com", h: 42 },
  { url: "crypto-scam.net", h: 7 },
  { url: "fake-bank.org", h: 20 },
];
const SET_BITS = new Set(THREATS.flatMap((t) => hashes(t.h)));
const EMPTY = new Set<number>();

function Bits({
  on,
  mark,
  picks,
  onTap,
  label,
}: {
  on: Set<number>;
  mark?: number[];
  picks?: number[];
  onTap?: (i: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{label}</span>
      <ol className="m-0 grid list-none grid-cols-4 gap-1 p-0 min-[480px]:grid-cols-8" aria-label={label}>
        {Array.from({ length: M }, (_, i) => {
          const isOn = on.has(i);
          const picked = picks?.includes(i);
          const marked = mark?.includes(i);
          const cls = picked
            ? "border-signal bg-signal/20 text-fg"
            : isOn
              ? "border-fg bg-fg text-bg"
              : "border-line-strong bg-bg text-fg-3";
          const body = (
            <>
              <span className="font-mono text-[15px] font-semibold">{isOn ? 1 : 0}</span>
              <span className="font-mono text-[9px] opacity-70">pos {i}</span>
            </>
          );
          return (
            <li key={i} className="relative">
              {onTap ? (
                <button
                  type="button"
                  onClick={() => onTap(i)}
                  aria-pressed={!!picked}
                  aria-label={`Bit ${i}`}
                  className={`flex h-12 w-full flex-col items-center justify-center border ${cls}`}
                >
                  {body}
                </button>
              ) : (
                <span
                  className={`flex h-12 w-full flex-col items-center justify-center border ${cls} ${marked ? "outline outline-2 outline-offset-1 outline-signal" : ""}`}
                  aria-label={`Bit ${i}: ${isOn ? 1 : 0}${marked ? ", checked by this query" : ""}`}
                >
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Formulas() {
  return (
    <p className="m-0 border border-line bg-bg px-3 py-2 font-mono text-[12.5px] leading-[1.6] text-fg-2">
      h1(x) = x % 16 · h2(x) = (x × 7) % 16 · h3(x) = (x × 13) % 16
    </p>
  );
}

function Insert({ ctx }: { ctx: StepCtx }) {
  const [picks, setPicks] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const want = uniq(hashes(42));
  const right = picks.length === want.length && want.every((w) => picks.includes(w));
  const tap = (i: number) => {
    if (done) return;
    setPicks(picks.includes(i) ? picks.filter((p) => p !== i) : picks.length < 3 ? [...picks, i] : picks);
  };
  const submit = () => {
    if (done || !picks.length) return;
    setDone(true);
    ctx.done(right ? 1 : 0);
  };
  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="A 16-bit filter with the case file's three toy hash functions. Tap up to three bits.">
        Insert <code className="font-mono text-[0.9em]">evil-phishing-site.com</code> (hash 42). Which bits flip to 1?
      </StepPrompt>
      <Formulas />
      <Bits on={done ? SET_BITS : EMPTY} picks={done ? undefined : picks} onTap={done ? undefined : tap} label={done ? "After inserting all three threats" : "Bit array · empty"} />
      {!done && (
        <button type="button" onClick={submit} disabled={!picks.length} className={`${BTN_PRIMARY} self-start`}>
          setbit × {picks.length || "…"}
        </button>
      )}
      <div aria-live="polite">
        {done && (
          <Feedback ok={right} title={right ? "Bits 2, 6 and 10." : `It sets bits 2, 6 and 10 (you picked ${[...picks].sort((a, b) => a - b).join(", ")}).`}>
            42 % 16 = 10 · 42 × 7 = 294, % 16 = 6 · 42 × 13 = 546, % 16 = 2. Two more threats went in the same way: crypto-scam.net (toy hash 7 → bits 7, 1, 11) and
            fake-bank.org (toy hash 20 → bits 4, 12, 4: two of its hashes collide). The filter stores bits, never the URLs.
          </Feedback>
        )}
      </div>
    </div>
  );
}

const QUERIES = [
  { url: "suspicious-crypto.net", h: 29, db: false },
  { url: "cute-cats.blog", h: 12, db: false },
  { url: "crypto-scam.net", h: 7, db: true },
];

function Probe({ ctx }: { ctx: StepCtx }) {
  const [k, setK] = useState(0);
  const [answers, setAnswers] = useState<("clean" | "check")[]>([]);
  const q = QUERIES[Math.min(k, QUERIES.length - 1)];
  const bits = uniq(hashes(q.h));
  const allOn = bits.every((b) => SET_BITS.has(b));
  const truth: "clean" | "check" = allOn ? "check" : "clean";
  const answered = answers.length > k;
  const mine = answers[k];
  const last = k >= QUERIES.length - 1;

  const choose = (a: "clean" | "check") => {
    if (answered) return;
    const next = [...answers, a];
    setAnswers(next);
    if (next.length === QUERIES.length) {
      ctx.done(
        next.filter((x, i) => {
          const b = uniq(hashes(QUERIES[i].h));
          return x === (b.every((y) => SET_BITS.has(y)) ? "check" : "clean");
        }).length
      );
    }
  };

  const verdict = !allOn
    ? `At least one bit is 0 (bit ${bits.find((b) => !SET_BITS.has(b))}): DEFINITELY CLEAN. Posted instantly, no database hit.`
    : q.db
      ? "All bits are 1: POSSIBLY MALICIOUS. The database finds it: CONFIRMED MALICIOUS, message blocked."
      : "All bits are 1: POSSIBLY MALICIOUS. The database has no such URL: a FALSE POSITIVE. One extra lookup, then the message posts.";

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub="Each query checks its three bits against the filter.">
        Query {k + 1}/{QUERIES.length}: <code className="font-mono text-[0.9em] [overflow-wrap:anywhere]">{q.url}</code> (hash {q.h})
      </StepPrompt>
      <p className="m-0 border border-line bg-bg px-3 py-2 font-mono text-[12.5px] leading-[1.6] text-fg-2">
        h1 = {q.h % M} · h2 = {(q.h * 7) % M} · h3 = {(q.h * 13) % M}
      </p>
      <Bits on={SET_BITS} mark={bits} label="Filter after three inserts · outlined = this query's bits" />
      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Your call">
        {(
          [
            ["clean", "Definitely clean · post it"],
            ["check", "Possibly malicious · check the DB"],
          ] as const
        ).map(([id, text]) => {
          const cls = !answered ? OPT_IDLE : id === truth ? OPT_RIGHT : id === mine ? OPT_WRONG : OPT_DIM;
          return (
            <button key={id} type="button" disabled={answered} aria-pressed={mine === id} onClick={() => choose(id)} className={`${OPTION} ${cls}`}>
              {text}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="flex flex-col gap-3">
        {answered && (
          <Feedback ok={mine === truth} title={mine === truth ? "Good read." : "Look at the outlined bits again."}>
            {verdict}
          </Feedback>
        )}
        {answered && !last && (
          <button type="button" onClick={() => setK(k + 1)} className={`${BTN_GHOST} self-start`}>
            next query →
          </button>
        )}
      </div>
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "simulation",
  title: "False-positive hunt",
  blurb:
    "Run GlobalForum's Bloom filter by hand: insert a phishing URL into a 16-bit array with the case file's hash functions, then judge three incoming links. One of them is a trap.",
  minutes: 3,
  steps: [
    { id: "insert", label: "Insert a threat", max: 1, render: (ctx) => <Insert ctx={ctx} /> },
    { id: "probe", label: "Judge three links", max: 3, render: (ctx) => <Probe ctx={ctx} /> },
    {
      id: "fn",
      label: "The promise",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="The filter answers “not present” for a URL. How much can GlobalForum trust that?"
          options={[
            "Mostly: about 0.1% of those are actually malicious.",
            "Completely: a Bloom filter has no false negatives.",
            "Only after the 24-hour rebuild.",
            "Only if the URL was normalised first.",
          ]}
          answer={1}
          explain="Every inserted URL set all of its bits, so a single 0 proves it was never inserted. The tunable error only goes one way (false positives), which is why “at least one bit is 0” posts instantly and 99.9% of checks never touch the database."
        />
      ),
    },
    {
      id: "size",
      label: "Size the filter",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="1.2 billion malicious URLs at a 0.1% false-positive rate. Roughly how much memory does the filter need?"
          sub="m = −n × ln(p) / (ln 2)²"
          options={["~210 MB", "~2.15 GB", "~21 GB", "120 GB+"]}
          answer={1}
          explain="m ≈ 17.2 billion bits ≈ 2.15 GB with k ≈ 10 hash functions, versus 120 GB+ to store the URLs themselves (1.2B × ~100 bytes)."
        />
      ),
    },
  ],
};

export default function BloomHunt({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
