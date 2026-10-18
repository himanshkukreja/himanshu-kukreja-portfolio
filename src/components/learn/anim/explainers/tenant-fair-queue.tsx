/**
 * Fair scheduling (week 9, day 2 · 7.1): Tenant A queues 100 jobs, then Tenant B queues 1. A shared
 * FIFO makes B wait for all 100; TenantPriorityQueue's per-tenant queues and round-robin dequeue
 * serve B after about one A job, with max_per_tenant = 100; FairScheduler scores tasks
 * (running + 1) / weight (free 1, pro 5, enterprise 20).
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const A = { x: 24, y: 70, w: 112, h: 58 };
const B = { x: 24, y: 206, w: 112, h: 58 };
const WK = { x: 478, y: 126, w: 98, h: 74 };
const L0 = 170;
const slot = (i: number) => L0 + i * 26;

function Tenants({ narrow, aSub, bSub, aTone, bTone }: { narrow: boolean; aSub: string; bSub: string; aTone?: Tone; bTone?: Tone }) {
  return (
    <g>
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label={narrow ? "A" : "Tenant A"} sub={aSub} tone={aTone || "sky"} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label={narrow ? "B" : "Tenant B"} sub={bSub} tone={bTone || "lit"} />
    </g>
  );
}

function Fifo({ step, t, narrow }: SceneProps) {
  const LY = 163;
  // the head of the queue is on the right, next to the worker; B joined last, so it sits at the tail
  const drained = step === 1 ? seg(t, 0.05, 0.95) * 3 : 0;
  const done = Math.floor(drained + 0.001);
  const pos = (i: number) => 10 - i + drained; // A's job i (0 = A's first job)
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start" tone={step === 1 ? "bad" : undefined}>
        {narrow ? "one shared FIFO queue" : "one shared FIFO queue · arrival order"}
      </Txt>
      <Tenants narrow={narrow} aSub="100 jobs" bSub="1 job" />
      <rect className="fq-lane" x={L0 - 14} y={LY - 18} width={WK.x - L0 - 6} height={36} />
      <Wire d={`M${A.x + A.w} ${A.y + A.h / 2}C${A.x + A.w + 14} ${A.y + A.h / 2} ${L0 - 30} ${LY} ${L0 - 14} ${LY}`} arrow />
      <Wire d={`M${B.x + B.w} ${B.y + B.h / 2}C${B.x + B.w + 14} ${B.y + B.h / 2} ${L0 - 30} ${LY} ${L0 - 14} ${LY}`} arrow />
      {Array.from({ length: 12 }, (_, i) => {
        const p = pos(i);
        if (p < 1.5) return null;
        const enter = step === 0 ? seg(t, i * 0.05, 0.3 + i * 0.05) : 1;
        if (step === 0 && i > 8) return null;
        const into = Math.max(0, p - 10);
        const x = into > 0 ? lerp(slot(10), WK.x + 20, into) : slot(p);
        return (
          <Token
            key={i}
            x={enter < 1 ? lerp(A.x + A.w, slot(p), enter) : x}
            y={enter < 1 ? lerp(A.y + A.h / 2, LY, enter) : LY}
            s={14}
            tone="sky"
            opacity={(into > 0 ? 1 - into : 1) * Math.min(1, (p - 1.5) * 2)}
          />
        );
      })}
      <Txt x={slot(1)} y={LY + 5} k="s" tone="sky">
        …
      </Txt>
      <Token x={step === 0 ? lerp(B.x + B.w, slot(0), seg(t, 0.6, 0.95)) : slot(0)} y={step === 0 ? lerp(B.y + B.h / 2, LY, seg(t, 0.6, 0.95)) : LY} s={14} tone="lit" label="B" />
      <Txt x={(slot(2) + slot(10)) / 2} y={LY + 42} k="s" tone="sky">
        {narrow ? "A × 100" : "A's 100 jobs (9 shown)"}
      </Txt>
      <Wire d={`M${WK.x - 20} ${LY}H${WK.x}`} arrow />
      <Box x={WK.x} y={WK.y} w={WK.w} h={WK.h} label="Worker" sub={step === 1 ? `A done ${done}` : "idle"} tone={step === 1 ? "sky" : undefined} />
      {step === 1 && (
        <g>
          <Txt x={slot(0) - 6} y={LY - 32} k="t" anchor="start" tone="bad">
            {`${100 - done} ahead of B`}
          </Txt>
          <Txt x={WK.x + WK.w} y={H - 20} k="s" anchor="end" tone="bad">
            {narrow ? "B starves behind A" : "B waits for all 100 of A's jobs: starvation"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function RoundRobin({ step, t, narrow }: SceneProps) {
  const AY = A.y + A.h / 2;
  const BY = B.y + B.h / 2;
  const a1 = step === 1 ? seg(t, 0.05, 0.45) : step > 1 ? 1 : 0;
  const b1 = step === 1 ? seg(t, 0.5, 0.9) : step > 1 ? 1 : 0;
  const bounce = step === 2 ? seg(t, 0.1, 0.6) : 0;
  const bNew = step === 2 ? seg(t, 0.4, 0.9) : 0;
  const serving = step === 1 ? (t < 0.48 ? "A" : "B") : step === 2 ? "B" : "";
  const wy = WK.y + WK.h / 2;
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "queue per tenant · round-robin" : "TenantPriorityQueue · one queue per tenant · round-robin"}
      </Txt>
      <Tenants narrow={narrow} aSub={step === 2 ? "full" : "100 jobs"} bSub="1 job" aTone={step === 2 ? "warn" : undefined} />
      {[AY, BY].map((y, k) => (
        <g key={k}>
          <rect className="fq-lane" x={L0 - 14} y={y - 18} width={slot(9) - L0 + 30} height={36} />
          <Wire d={`M${(k ? B : A).x + A.w} ${y}H${L0 - 14}`} arrow />
          <Wire d={`M${slot(9) + 16} ${y}C${slot(9) + 40} ${y} ${WK.x - 30} ${wy} ${WK.x} ${wy}`} arrow tone={serving === (k ? "B" : "A") ? "lit" : undefined} />
        </g>
      ))}
      {/* A's lane: tokens shift toward the head as A1 leaves */}
      {Array.from({ length: 9 }, (_, i) => {
        const enter = step === 0 ? seg(t, (8 - i) * 0.04, 0.3 + (8 - i) * 0.04) : 1;
        const head = i === 8;
        const x = head && a1 > 0 ? lerp(slot(8), WK.x + 20, a1) : slot(i);
        return <Token key={i} x={enter < 1 ? lerp(A.x + A.w, slot(i), enter) : x} y={head && a1 > 0 ? lerp(AY, wy, a1) : AY} s={14} tone="sky" opacity={head && a1 >= 1 ? 0 : 1} />;
      })}
      <Txt x={L0 - 4} y={AY - 26} k="s" anchor="start" tone={step === 2 ? "warn" : "sky"}>
        {step === 2 ? (narrow ? "100 / 100 · full" : "100 / max_per_tenant 100 · full") : narrow ? "A × 100" : "A's 100 jobs (9 shown)"}
      </Txt>
      {/* B's job */}
      <Token
        x={step === 0 ? lerp(B.x + B.w, slot(8), seg(t, 0.4, 0.8)) : b1 > 0 ? lerp(slot(8), WK.x + 20, b1) : slot(8)}
        y={step === 0 ? BY : b1 > 0 ? lerp(BY, wy, b1) : BY}
        s={14}
        tone="lit"
        label={b1 > 0 && b1 < 1 ? undefined : "B"}
        opacity={b1 >= 1 ? 0 : 1}
      />
      {step === 2 && <Token x={lerp(B.x + B.w, slot(8), bNew)} y={BY} s={14} tone="ok" label="B" opacity={bNew > 0 ? 1 : 0} />}
      {step === 2 && (
        <g>
          <Token x={lerp(A.x + A.w + 4, L0 - 24, bounce < 0.5 ? bounce * 2 : 2 - bounce * 2)} y={AY - 0} s={14} tone="bad" opacity={bounce > 0 ? 1 : 0} />
          <Txt x={A.x + A.w + 6} y={AY + 38} k="s" anchor="start" tone="bad" opacity={seg(t, 0.4, 0.7)}>
            {narrow ? "101st → False" : "101st enqueue → False"}
          </Txt>
          <Txt x={B.x + B.w + 6} y={BY + 38} k="s" anchor="start" tone="ok" opacity={bNew}>
            {narrow ? "B → True" : "B's enqueue → True"}
          </Txt>
        </g>
      )}
      <Box x={WK.x} y={WK.y} w={WK.w} h={WK.h} label="Worker" sub={step === 0 ? "idle" : step === 1 ? (t < 0.48 ? "A1" : narrow ? "A1 B1" : "A1, B1") : narrow ? "A1 B1 A2" : "A1, B1, A2…"} tone={serving === "A" ? "sky" : serving === "B" ? "lit" : undefined} />
      {step === 1 && (
        <Txt x={WK.x + WK.w} y={H - 14} k="s" anchor="end" tone="ok" opacity={seg(t, 0.85, 1)}>
          {narrow ? "B waited ~1 job" : "B waited for about one of A's jobs"}
        </Txt>
      )}
    </g>
  );
}

function Weighted({ step, t, narrow }: SceneProps) {
  const scored = step >= 1;
  const ranked = step >= 2;
  const sp = step === 1 ? seg(t, 0.2, 0.8) : scored ? 1 : 0;
  const swap = step === 2 ? seg(t, 0.1, 0.7) : ranked ? 1 : 0;
  const cards = [
    { y: 62, name: narrow ? "free · w 1" : "free tenant · weight 1", run: 0, f: "(0 + 1) / 1 = 1.0", v: 1000, tone: "sky" as Tone },
    { y: 186, name: narrow ? "enterprise · w 20" : "enterprise · weight 20", run: 9, f: "(9 + 1) / 20 = 0.5", v: 500, tone: "lit" as Tone },
  ];
  const ey = (k: number) => {
    const before = k === 0 ? 120 : 196; // submit order: free first
    const after = k === 0 ? 196 : 120; // heap order: lower score first
    return lerp(before, after, swap);
  };
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "score = (running + 1) / weight" : "FairScheduler · score = (running + 1) / weight · lower first"}
      </Txt>
      {cards.map((c, k) => (
        <g key={k}>
          <rect className={`ax-box ${c.tone}`} x={24} y={c.y} width={270} height={104} />
          <Txt x={38} y={c.y + 24} anchor="start">
            {c.name}
          </Txt>
          <Txt x={38} y={c.y + 50} k="s" anchor="start">
            running
          </Txt>
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} className={i < c.run ? `fq-run ${c.tone}` : "fq-run"} x={narrow ? 130 + i * 16 : 112 + i * 18} y={c.y + 40} width={11} height={11} />
          ))}
          <Txt x={38} y={c.y + 84} k="t" anchor="start" tone={c.tone} opacity={sp}>
            {c.f}
          </Txt>
        </g>
      ))}
      <Txt x={322} y={92} k="k" anchor="start">
        {narrow ? "heap" : "heap · next to run on top"}
      </Txt>
      {[0, 1].map((k) => {
        const c = cards[k];
        const y = ey(k);
        const top = ranked && k === 1;
        return (
          <g key={k}>
            <rect className={`ax-box${top ? " lit" : ""}`} x={322} y={y} width={254} height={52} />
            <Txt x={336} y={y + 31} anchor="start">
              {k === 0 ? (narrow ? "free" : "free task") : narrow ? "enterprise" : "enterprise task"}
            </Txt>
            <Txt x={562} y={y + 31} k="s" anchor="end" tone={scored ? c.tone : "mute"}>
              {scored ? String(c.v) : "?"}
            </Txt>
          </g>
        );
      })}
      {ranked && (
        <Txt x={576} y={276} k="s" anchor="end" tone="lit" opacity={swap}>
          {narrow ? "enterprise first" : "500 < 1000: enterprise runs first"}
        </Txt>
      )}
      {step === 3 && (
        <Txt x={24} y={H - 14} k="s" anchor="start" tone="warn">
          {narrow ? "fixed at submit: add aging" : "score is fixed at submit: add aging or round-robin to bound waits"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "rr") return <RoundRobin {...p} />;
  if (p.variant === "weighted") return <Weighted {...p} />;
  return <Fifo {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.fq-lane{fill:none;stroke:var(--ax-line);stroke-width:1.5}
.fq-run{fill:none;stroke:var(--ax-line);stroke-width:1.5}.fq-run.lit{fill:var(--ax-accent);stroke:var(--ax-accent)}.fq-run.sky{fill:var(--ax-sky);stroke:var(--ax-sky)}`,
  variants: [
    {
      id: "fifo",
      label: "Shared FIFO",
      steps: [
        { caption: "Tenant A queues 100 jobs, then Tenant B queues 1. In one shared FIFO queue, B's job is last.", tween: 1800, ms: 3000 },
        { caption: "The worker drains in arrival order, so B waits behind all 100 of A's jobs: starvation.", tween: 3000, ms: 3200 },
      ],
    },
    {
      id: "rr",
      label: "Round-robin",
      steps: [
        { caption: "TenantPriorityQueue keeps one queue per tenant: A's 100 jobs in A's queue, B's single job in its own.", tween: 1800, ms: 3000 },
        { caption: "Dequeue rotates across tenants, one item each: A's first job, then B's. B waits for about one job.", tween: 2400, ms: 3200 },
        { caption: "Once A has max_per_tenant = 100 queued, its next enqueue returns False; B keeps enqueuing normally.", tween: 2000, ms: 3400 },
      ],
    },
    {
      id: "weighted",
      label: "Weighted",
      steps: [
        { caption: "FairScheduler orders tasks by (running tasks + 1) / weight, lower first. Weights: free 1, pro 5, enterprise 20.", ms: 3400 },
        { caption: "A free tenant with 0 running scores (0+1)/1 = 1.0; an enterprise tenant with 9 running scores 10/20 = 0.5.", tween: 1400, ms: 3400 },
        { caption: "The enterprise task runs first despite 9 running: weight buys share, and each running task raises a tenant's score.", tween: 1400, ms: 3400 },
        { caption: "Caveat: the score is fixed at submit time, so sustained high-weight traffic can starve free tenants.", ms: 3400 },
      ],
    },
  ],
  Scene,
});
