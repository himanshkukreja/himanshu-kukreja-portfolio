/**
 * Distributed tracing (week 10, day 2 · 4.1 / 4.3): the lesson's trace abc-123 drawn as a span
 * waterfall (api-gateway 12 ms … bank-api-call 100 ms of 162 ms total), then context propagation:
 * A injects `traceparent`, B extracts it and continues the trace; without it B starts a new trace.
 * Durations are the lesson's; start offsets inside each parent are illustrative.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- variant 1: the waterfall */

type Span = { name: string; short: string; depth: number; start: number; dur: number; phase: 0 | 1 };
const TOTAL = 162;
const SPANS: Span[] = [
  { name: "api-gateway", short: "gateway", depth: 0, start: 0, dur: 12, phase: 0 },
  { name: "auth-service", short: "auth", depth: 1, start: 2, dur: 5, phase: 0 },
  { name: "token-validation", short: "token", depth: 2, start: 3, dur: 2, phase: 0 },
  { name: "order-service", short: "orders", depth: 0, start: 12, dur: 150, phase: 1 },
  { name: "db-query-orders", short: "db-query", depth: 1, start: 13, dur: 8, phase: 1 },
  { name: "payment-service", short: "payment", depth: 1, start: 22, dur: 120, phase: 1 },
  { name: "bank-api-call", short: "bank-api", depth: 2, start: 30, dur: 100, phase: 1 },
  { name: "notification-service", short: "notify", depth: 1, start: 144, dur: 15, phase: 1 },
  { name: "email-send", short: "email", depth: 2, start: 146, dur: 10, phase: 1 },
];
const ROW0 = 62;
const ROWH = 24;

function Waterfall({ step, t, narrow }: SceneProps) {
  const bx0 = narrow ? 150 : 210;
  const bx1 = 576;
  const ms = (v: number) => bx0 + ((bx1 - bx0) * v) / TOTAL;
  // the clock sweeps the request's time: 0 → 12 ms in step 0, 12 → 162 ms in step 1
  const now = step === 0 ? lerp(0, 12, ease(t)) : step === 1 ? lerp(12, TOTAL, ease(t)) : TOTAL;
  const focus = step >= 2 ? seg(t, 0, 0.6) : 0;
  const yTotal = ROW0 + SPANS.length * ROWH + 14;
  return (
    <g>
      <Txt x={20} y={30} k="k" anchor="start">
        trace abc-123
      </Txt>
      {!narrow && (
        <Txt x={bx0} y={30} k="s" anchor="start">
          0 ms
        </Txt>
      )}
      <Txt x={bx1} y={30} k="s" anchor="end">
        {`${TOTAL} ms`}
      </Txt>
      <line x1={bx0} x2={bx1} y1={40} y2={40} className="tw-axis" />
      {SPANS.map((s, i) => {
        const y = ROW0 + i * ROWH;
        const end = Math.min(now, s.start + s.dur);
        const started = now > s.start || step > s.phase;
        const w = Math.max(0, ms(end) - ms(s.start));
        const slow = s.name === "bank-api-call";
        const tone: Tone = slow && step >= 2 ? "lit" : undefined;
        const dim = step >= 2 && !slow && !(s.name === "payment-service" || s.name === "order-service");
        const doneSpan = now >= s.start + s.dur;
        const durText = `${s.dur}${narrow ? "" : " ms"}`;
        const durRight = ms(s.start + s.dur) + 6;
        // no room right of the bar: write the duration just left of where the span starts
        const durLeft = durRight + durText.length * (narrow ? 10.4 : 7.8) > W - 4;
        return (
          <g key={s.name} opacity={!started ? 0.22 : dim ? lerp(1, 0.4, focus) : 1}>
            <Txt x={20 + s.depth * (narrow ? 10 : 14)} y={y + 4} k="s" anchor="start" tone={tone}>
              {narrow ? s.short : s.name}
            </Txt>
            <rect x={ms(s.start)} y={y - 8} width={Math.max(w, started ? 2 : 0)} height={14} className={`tw-span d${s.depth}${slow && step >= 2 ? " slow" : ""}`} />
            {doneSpan && (
              <Txt x={durLeft ? ms(s.start) - 6 : durRight} y={y + 4} k="s" anchor={durLeft ? "end" : "start"} tone={tone}>
                {durText}
              </Txt>
            )}
          </g>
        );
      })}
      {step < 2 && now < TOTAL - 0.5 && <rect x={ms(now) - 1} y={44} width={2} height={yTotal - 58} className="tw-now" />}
      <line x1={20} x2={bx1} y1={yTotal - 10} y2={yTotal - 10} className="tw-axis" />
      <Txt x={20} y={yTotal + 10} k="t" anchor="start">
        {`total ${Math.round(now)} ms`}
      </Txt>
      {step >= 2 && (
        <Txt x={bx1} y={yTotal + 10} k="t" anchor="end" tone="lit" opacity={focus}>
          {narrow ? "bank: 100 of 162" : "bank-api-call: 100 of 162 ms"}
        </Txt>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- variant 2: propagation */

const A = { x: 24, y: 70, w: 140, h: 60 };
const B = { x: 436, y: 70, w: 140, h: 60 };
const TP = "00-4bf92f…-00f067aa…-01";

function Propagation({ step, t, narrow }: SceneProps) {
  const lost = step === 2;
  const travel = seg(t, 0, 0.6);
  const arrived = step > 0 || travel >= 1;
  const pathY = A.y + A.h / 2;
  const tokX = lerp(A.x + A.w, B.x, ease(travel));
  // the trace view below: rows of (trace id, span name, x, width)
  const rows: { tr: string; span: string; x: number; w: number; tone: Tone; o: number }[] = [];
  const show = step === 0 ? 0 : seg(t, 0.1, 0.7);
  const showLost = lost ? seg(t, 0.6, 1) : 0;
  rows.push({ tr: "4bf92f…", span: "A", x: 200, w: 360, tone: lost ? "mute" : "sky", o: 1 });
  if (!lost && step >= 1) rows.push({ tr: "4bf92f…", span: "B", x: 260, w: 220 * show, tone: "ok", o: show });
  if (lost) rows.push({ tr: narrow ? "new ID" : "new trace", span: "B", x: 260, w: 220 * showLost, tone: "bad", o: showLost });
  return (
    <g>
      <Box x={A.x} y={A.y} w={A.w} h={A.h} label="Service A" sub={narrow ? "inject()" : "inject(headers)"} tone={lost ? undefined : step === 0 ? "lit" : undefined} />
      <Box x={B.x} y={B.y} w={B.w} h={B.h} label="Service B" sub={narrow ? "extract()" : "extract(headers)"} tone={lost && arrived ? "bad" : step === 1 ? "ok" : undefined} />
      <Wire d={`M${A.x + A.w} ${pathY}H${B.x}`} arrow tone={lost ? undefined : "lit"} />
      <Txt x={(A.x + A.w + B.x) / 2} y={pathY - 28} k="k" tone={lost ? "bad" : undefined}>
        HTTP request
      </Txt>
      {travel < 1 && (
        <g>
          <Token x={tokX} y={pathY} s={12} tone={lost ? "mute" : "lit"} />
        </g>
      )}
      <Txt x={(A.x + A.w + B.x) / 2} y={156} k="s" tone={lost ? "bad" : "lit"}>
        {lost ? (narrow ? "no header" : "no traceparent header") : narrow ? "traceparent" : `traceparent: ${TP}`}
      </Txt>
      {!narrow && !lost && (
        <Txt x={(A.x + A.w + B.x) / 2} y={176} k="s">
          version · trace ID · parent span ID · sampled
        </Txt>
      )}
      {/* trace view */}
      <Txt x={24} y={196} k="k" anchor="start">
        {lost ? (narrow ? "2 traces" : "tracing UI · two traces") : narrow ? "1 trace" : "tracing UI · one trace"}
      </Txt>
      {rows.map((r, i) => {
        const y = 222 + i * 34;
        return (
          <g key={i} opacity={r.o}>
            <Txt x={24} y={y + 5} k="s" anchor="start" tone={r.tone}>
              {r.tr}
            </Txt>
            <rect x={r.x} y={y - 9} width={Math.max(0, r.w)} height={18} className={`tw-span ${r.tone || ""}`} />
            {r.w > 30 && (
              <text className="ax-s tw-in" x={r.x + 8} y={y + 5}>
                {`span ${r.span}`}
              </text>
            )}
          </g>
        );
      })}
      {!lost && step >= 1 && (
        <Txt x={576} y={300} k="s" anchor="end" tone="ok" opacity={show}>
          {narrow ? "B is A's child" : "B's span is a child of A's span"}
        </Txt>
      )}
      {lost && (
        <Txt x={576} y={300} k="s" anchor="end" tone="bad" opacity={showLost}>
          {narrow ? "journey split" : "the journey is split in two"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "propagate" ? <Propagation {...p} /> : <Waterfall {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.tw-axis{stroke:var(--ax-line);stroke-width:1.5}
.tw-now{fill:var(--ax-accent)}
.tw-span{fill:var(--ax-fg4)}
.tw-span.d0{fill:var(--ax-sky)}.tw-span.d1{fill:var(--ax-fg3)}.tw-span.d2{fill:var(--ax-fg4)}
.tw-span.slow{fill:var(--ax-accent)}
.ax-s.tw-in{fill:var(--ax-on-accent);font-weight:600}
.tw-span.sky{fill:var(--ax-sky)}.tw-span.ok{fill:var(--ax-ok)}.tw-span.bad{fill:var(--ax-bad)}.tw-span.mute{fill:var(--ax-fg4)}
`,
  variants: [
    {
      id: "waterfall",
      label: "Span waterfall",
      steps: [
        { caption: "One request, trace abc-123. Each step records a span: api-gateway 12 ms, with auth and token validation inside.", tween: 1600, ms: 2600 },
        { caption: "order-service takes 150 ms: a db query, payment-service calling the bank, then notifications and email.", tween: 3200, ms: 2600 },
        { caption: "Total 162 ms, and bank-api-call alone is 100 ms of it. That's where to focus optimization.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "propagate",
      label: "Propagation",
      steps: [
        { caption: "Service A injects its trace context into the HTTP headers: traceparent carries the trace ID and A's span ID.", tween: 1800, ms: 2400 },
        { caption: "Service B extracts traceparent and starts its span as A's child: one trace, one journey.", tween: 1600, ms: 2800 },
        { caption: "Without inject and extract, B starts a fresh trace ID. The request shows up as two separate traces.", tween: 2000, ms: 3200 },
      ],
    },
  ],
  Scene,
});
