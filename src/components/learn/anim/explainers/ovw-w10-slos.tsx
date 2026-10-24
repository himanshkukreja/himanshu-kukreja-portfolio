/**
 * Week 10, day 1 overview (SLIs, SLOs, SLAs): the whole lesson in four tabs. Why precise language
 * ("pretty reliable" vs a 10-minute or one-hour outage), SLI → SLO → SLA with the notification
 * platform's 99.9% SLO over a 99.5% SLA; choosing SLIs (golden signals, good / valid events,
 * headroom, the cost of nines); error budgets (43.2 minutes, the policy bands, burn-rate tiers,
 * the 99.83% dependency ceiling); and using SLOs for decisions and for each audience.
 */
import { Box, defineExplainer, ease, lerp, seg, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the language */

function Language({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0) {
    const lines: [string, string, Tone][] = [
      ["PM", '"Is the API reliable?"', undefined],
      ["Eng", '"Yeah, pretty reliable."', "warn"],
      ["PM", '"We lost a $500K customer."', "bad"],
      ["Eng", '"It was only down 10 minutes!"', "warn"],
      ["PM", '"They said an hour."', "bad"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {'what does "down" mean?'}
        </Txt>
        {lines.map(([a, b, tone], i) => (
          <g key={i} opacity={o(i)}>
            <Txt x={30} y={74 + i * 44} k="k" anchor="start" tone={a === "PM" ? "mute" : undefined}>
              {a}
            </Txt>
            <Txt x={90} y={74 + i * 44} k="t" anchor="start" tone={tone}>
              {narrow ? b.replace("Yeah, ", "").replace("It was only ", "").replace("We lost a ", "lost ") : b}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "no precise language" : "the argument happens because nobody defined reliability"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const chain: [string, string, string, Tone][] = [
      ["SLI", "the measurement", narrow ? "% < 200 ms" : "% of requests < 200 ms", "sky"],
      ["SLO", "the internal target", narrow ? "99.9%" : "99.9% of them", "ok"],
      ["SLA", "the promise", narrow ? "99.5% or credit" : "99.5%, or 10% credit", "warn"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          three words
        </Txt>
        {chain.map(([a, b, c, tone], i) => (
          <g key={a} opacity={o(i * 1.5)}>
            <Box x={20 + i * 196} y={60} w={176} h={110} label={a} sub={narrow ? b.split(" ").pop() : b} tone={tone} />
            {i < 2 && <Wire d={`M${196 + i * 196} 115H${216 + i * 196}`} arrow />}
            <Txt x={108 + i * 196} y={204} k="t" tone={tone}>
              {c}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "SLO stricter than SLA" : "the SLO is stricter than the SLA: a buffer before penalties"}
        </Txt>
      </g>
    );
  }
  const slos: [string, string, string][] = [
    ["availability", "99.9%", "non-5xx · 30 days"],
    ["latency", "99%", "sends < 500 ms"],
    ["delivery", "95%", "within 30 s"],
    ["correctness", "99.99%", "right recipient · no SLA"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {narrow ? "notification platform SLOs" : "the week 6 notification platform's SLOs"}
      </Txt>
      {slos.map(([a, b, c], i) => (
        <g key={a} opacity={o(i)}>
          <Txt x={30} y={80 + i * 46} k="t" anchor="start">
            {a}
          </Txt>
          <Txt x={narrow ? 330 : 240} y={80 + i * 46} k="t" anchor={narrow ? "end" : "start"} tone={i === 3 ? "lit" : "ok"}>
            {b}
          </Txt>
          {!narrow && (
            <Txt x={360} y={80 + i * 46} k="s" anchor="start">
              {c}
            </Txt>
          )}
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="warn">
        {narrow ? "SLA: 99.5% monthly" : "SLA: 99.5% monthly, or a 10% service credit"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- choosing */

function Choosing({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the four golden signals
        </Txt>
        {[
          ["Latency", "p50 · p99 · p99.9"],
          ["Traffic", "requests/s"],
          ["Errors", "5xx · wrong data"],
          ["Saturation", "CPU · queue depth"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Box x={20 + (i % 2) * 290} y={56 + Math.floor(i / 2) * 104} w={270} h={88} label={a} sub={b} tone={i === 3 ? "warn" : "sky"} />
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "measure what users see" : "measure user experience, not server health"}
        </Txt>
      </g>
    );
  if (step === 1) {
    const k = ease(seg(t, 0.1, 0.8));
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          SLI = good events / valid events
        </Txt>
        <Box x={20} y={56} w={270} h={150} label="valid" sub={narrow ? "/api/* requests" : "all /api/* requests"} />
        <Box x={310} y={56} w={270} h={150} label="good" sub={narrow ? "2xx/4xx, < 200 ms" : "2xx or 4xx, in < 200 ms"} tone="ok" opacity={0.4 + 0.6 * k} />
        <Txt x={155} y={180} k="s" tone="bad" opacity={o(3)}>
          {narrow ? "− /api/health" : "minus /api/health, maintenance"}
        </Txt>
        <Txt x={445} y={180} k="s" opacity={o(4)}>
          {narrow ? "4xx = handled" : "4xx = handled correctly"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "measured at the load balancer" : "measured at the load balancer: the client's view"}
        </Txt>
      </g>
    );
  }
  if (step === 2) {
    const y = (ms: number) => lerp(250, 70, ms / 250);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          leave headroom
        </Txt>
        <line className="ax-wire" x1={60} x2={560} y1={y(0)} y2={y(0)} />
        <Txt x={60} y={y(0) + 20} k="s" anchor="start">
          0 ms
        </Txt>
        <rect className="ax-fill ok" x={60} y={y(200)} width={500} height={y(150) - y(200)} opacity={0.15 * seg(t, 0.4, 0.8)} />
        {[
          [150, "current p99 · 150 ms", "sky"],
          [200, "SLO · 200 ms", "ok"],
        ].map(([v, l, tone]) => (
          <g key={l as string} opacity={v === 200 ? seg(t, 0.4, 0.8) : 1}>
            <line className={`ax-wire ${tone}`} x1={60} x2={560} y1={y(v as number)} y2={y(v as number)} strokeWidth={2} />
            <Txt x={560} y={y(v as number) - 8} k="t" anchor="end" tone={tone as Tone}>
              {narrow ? `${v} ms` : (l as string)}
            </Txt>
          </g>
        ))}
        <Txt x={60} y={y(175) + 4} k="s" anchor="start" opacity={seg(t, 0.6, 1)}>
          {narrow ? "room to drift" : "room for drift before users notice"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "3–5 SLOs per service" : "3–5 SLOs per service, reviewed quarterly"}
        </Txt>
      </g>
    );
  }
  const nines: [string, string][] = [
    ["99.9%", "8.76 hours"],
    ["99.99%", "52.6 minutes"],
    ["99.999%", "5.26 minutes"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        downtime a year · and what it costs
      </Txt>
      {nines.map(([a, b], i) => (
        <g key={a} opacity={o(i * 1.5)}>
          <Txt x={30} y={86 + i * 64} k="d" anchor="start">
            {a}
          </Txt>
          <Txt x={narrow ? 580 : 260} y={84 + i * 64} k="t" anchor={narrow ? "end" : "start"}>
            {b}
          </Txt>
          {!narrow && i === 1 && (
            <Txt x={580} y={84 + i * 64} k="t" anchor="end" tone="warn">
              ~10x the spend
            </Txt>
          )}
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "appropriate, not maximum" : "the goal is appropriate reliability, not maximum"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- budgets */

const BANDS: [number, number, string, string, Tone][] = [
  [50, 100, "> 50%", "ship freely", "ok"],
  [20, 50, "20–50%", "low-risk only", "warn"],
  [0, 20, "< 20%", "defer features", "bad"],
];

function Budget({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0) {
    const left = lerp(100, 0, ease(t));
    const x = (p: number) => lerp(40, 560, p / 100);
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "budget: 43.2 min / 30 days" : "error budget · 0.1% of 30 days = 43.2 minutes"}
        </Txt>
        {BANDS.map(([a, b, l, d, tone]) => (
          <g key={l}>
            <rect className={`ax-fill ${tone}`} x={x(a)} y={90} width={x(b) - x(a)} height={44} opacity={0.35} />
            <Txt x={(x(a) + x(b)) / 2} y={160} k="t" tone={tone}>
              {l}
            </Txt>
            <Txt x={(x(a) + x(b)) / 2} y={182} k="s">
              {narrow ? d.split(" ")[0] : d}
            </Txt>
          </g>
        ))}
        <rect className="ax-fill lit" x={x(left) - 3} y={80} width={6} height={64} />
        <Txt x={300} y={232} k="d" tone={left <= 0 ? "bad" : undefined}>
          {left <= 0.5 ? "0 · feature freeze" : `${((43.2 * left) / 100).toFixed(1)} min`}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "a written, enforced policy" : "a written policy decides what happens at each level"}
        </Txt>
      </g>
    );
  }
  if (step === 1) {
    const rows: [string, string, string, Tone][] = [
      ["14.4x", "2% in 1 hour", "page now", "bad"],
      ["6x", "5% in 6 hours", narrow ? "page (day)" : "page, business hours", "warn"],
      ["3x", "10% in 1 day", "ticket", "sky"],
      ["1x", "10% in 3 days", narrow ? "weekly" : "weekly review", "mute"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          {narrow ? "burn-rate alerts" : "alert on burn rate, not on every error"}
        </Txt>
        {rows.map(([a, b, c, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={86 + i * 52} k="d" anchor="start" tone={tone === "mute" ? undefined : tone}>
              {a}
            </Txt>
            {!narrow && (
              <Txt x={190} y={82 + i * 52} k="s" anchor="start">
                {b}
              </Txt>
            )}
            <Txt x={570} y={82 + i * 52} k="t" anchor="end" tone={tone}>
              {c}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  const deps: [string, string][] = [
    ["Database", "99.99%"],
    ["Payments", "99.95%"],
    ["Storage", "99.99%"],
    ["Bank API", "99.9%"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        dependencies cap you
      </Txt>
      {deps.map(([a, b], i) => (
        <g key={a} opacity={o(i)}>
          <Box x={20 + i * 142} y={60} w={134} h={70} label={a} sub={b} tone={i === 3 ? "warn" : undefined} />
        </g>
      ))}
      <Txt x={300} y={188} k="d" tone="bad" opacity={o(4)}>
        99.83%
      </Txt>
      <Txt x={300} y={214} k="s" opacity={o(4)}>
        {narrow ? "theoretical max" : "theoretical max for a 99.9% service"}
      </Txt>
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "redundancy or degrade" : "fix: redundancy, graceful degradation, or a lower SLO"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- using SLOs */

function Using({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          SLOs settle arguments
        </Txt>
        {[
          ['"ship feature X"', "budget 30% → only if low-risk"],
          ['"refactor auth"', "SLI 95.2% vs 99% target"],
          ['"too many pages"', "< 50% SLO-impacting → tune"],
        ].map(([a, b], i) => (
          <g key={a} opacity={o(i * 1.5)}>
            <Box x={20} y={56 + i * 74} w={200} h={60} label={a} />
            <Wire d={`M220 ${86 + i * 74}H250`} arrow />
            <Txt x={260} y={91 + i * 74} k={narrow ? "s" : "t"} anchor="start" tone="ok">
              {b}
            </Txt>
          </g>
        ))}
      </g>
    );
  if (step === 1) {
    const aud: [string, string, string][] = [
      ["engineers", "p99 185 ms vs 200 · budget 62% · burn 0.8x", "185 / 200 ms"],
      ["product", "we could absorb a ~25-minute outage", "~25 min to spare"],
      ["executives", "GREEN: on track for 99.9%, above the 99.5%", "GREEN"],
      ["customers", "Operational · 99.94% this month", "99.94%"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          one SLO, four audiences
        </Txt>
        {aud.map(([a, b, c], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30} y={80 + i * 52} k="k" anchor="start">
              {a}
            </Txt>
            <Txt x={narrow ? 580 : 170} y={80 + i * 52} k="t" anchor={narrow ? "end" : "start"} tone="ok">
              {narrow ? c : b}
            </Txt>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        100% reliability is
      </Txt>
      {["impossible", "infinitely expensive", "actually harmful"].map((s, i) => (
        <g key={s} opacity={o(i * 1.5)}>
          <Box x={20 + i * 190} y={60} w={180} h={100} label={s.split(" ").pop()} sub={!narrow && s.includes(" ") ? s.split(" ")[0] : undefined} tone="bad" />
        </g>
      ))}
      <Box x={20} y={190} w={560} h={60} label={narrow ? "appropriate reliability" : "appropriate reliability, and room to ship"} tone="ok" opacity={o(4)} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "choosing") return <Choosing {...p} />;
  if (p.variant === "budget") return <Budget {...p} />;
  if (p.variant === "using") return <Using {...p} />;
  return <Language {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "language",
      label: "Language",
      steps: [
        { caption: "Is the API reliable? Pretty reliable. A $500K customer left saying it was down for an hour; the engineer says ten minutes. Without precise language, nobody can tell.", tween: 1600, ms: 3800 },
        { caption: "An SLI is what you measure, like the share of requests under 200 milliseconds. An SLO is the internal target, 99.9 percent. An SLA is the promise, 99.5 percent or customers get credit.", tween: 1600, ms: 3800 },
        { caption: "The notification platform targets 99.9 percent availability, 99 percent of sends under 500 milliseconds, and 99.99 percent correct recipients, with a 99.5 percent SLA below.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "choosing",
      label: "Choosing SLIs",
      steps: [
        { caption: "Start from the four golden signals: latency, traffic, errors and saturation, measured from the user's side.", tween: 1200 },
        { caption: "An SLI is good events over valid events: requests returning 2xx or 4xx within 200 milliseconds, out of all API requests except health checks, measured at the load balancer.", tween: 1400, ms: 3600 },
        { caption: "Don't set the SLO at current performance. If p99 is 150 milliseconds today, an SLO of 200 leaves room for drift.", tween: 1400, ms: 3200 },
        { caption: "Each nine costs more: 99.9 percent allows 8.76 hours of downtime a year, 99.99 percent only 52.6 minutes, for maybe ten times the spend. Aim for appropriate reliability.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "budget",
      label: "Error budgets",
      steps: [
        { caption: "A 99.9 percent SLO over 30 days leaves a 43.2-minute error budget. Above half, ship freely; between 20 and 50 percent, low-risk only; below 20, defer features; at zero, freeze.", tween: 2400, ms: 3600 },
        { caption: "Alert on burn rate: 14.4x spends 2 percent in an hour and pages now; 6x pages in business hours; 3x opens a ticket; 1x waits for the weekly review.", tween: 1400, ms: 3600 },
        { caption: "Dependencies cap you: 99.99 times 99.95 times 99.99 times 99.9 percent is at most 99.83 percent. Add redundancy, degrade gracefully, or adjust the SLO.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "using",
      label: "Using SLOs",
      steps: [
        { caption: "SLOs settle arguments: with 30 percent of budget left, ship only if low-risk; an auth SLI at 95.2 against 99 justifies the refactor; mostly non-SLO pages mean tune the alerts.", tween: 1600, ms: 3800 },
        { caption: "Translate for each audience: 185 against 200 milliseconds for engineers, room for a 25-minute outage for product, GREEN for executives, and 99.94 percent for customers.", tween: 1600, ms: 3600 },
        { caption: "100 percent reliability is impossible, infinitely expensive and harmful. The goal is appropriate reliability, with room to ship features.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
