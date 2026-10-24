/**
 * Week 10, day 5 overview (incident management): the whole lesson in four tabs. The 3:17 AM page
 * (payment error rate 45%) and what makes something an incident, with SEV1–SEV4; the response
 * (lifecycle and SEV1 targets, the IC / tech / comms roles, mitigation first, the update cadence and
 * status page); learning (blameless framing, five whys down to missing N+1 detection, owned action
 * items within 48 hours); and sustainable on-call.
 */
import { Box, defineExplainer, ease, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;

/* ---------------------------------------------------------------- the page */

function Page({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.12, i * 0.12 + 0.3);
  if (step === 0) {
    const bad = ["panic", "blame", "everyone changes things", "no communication", "happens again"];
    const good = ["calm structure", "clear roles", "coordinated fixes", "stakeholders told", "systemic fix"];
    const badN = ["panic", "blame", "chaos", "silence", "repeats"];
    const goodN = ["calm", "roles", "coordinated", "informed", "fixed"];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start" tone="bad">
          {narrow ? "3:17 AM · error rate 45%" : "3:17 AM · [CRITICAL] payment service error rate 45%"}
        </Txt>
        <Txt x={30} y={68} k="k" anchor="start" tone="bad">
          bad response
        </Txt>
        <Txt x={320} y={68} k="k" anchor="start" tone="ok">
          good response
        </Txt>
        {bad.map((s, i) => (
          <g key={s}>
            <Txt x={30} y={102 + i * 34} k="t" anchor="start" tone="bad" opacity={o(i)}>
              {narrow ? badN[i] : s}
            </Txt>
            <Txt x={320} y={102 + i * 34} k="t" anchor="start" tone="ok" opacity={seg(t, 0.2 + i * 0.1, 0.5 + i * 0.1)}>
              {narrow ? goodN[i] : good[i]}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "not luck: preparation" : "the difference is not luck, it's preparation"}
        </Txt>
      </g>
    );
  }
  const rows: [string, string, Tone][] = [
    ["CPU at 75%", "monitoring", "mute"],
    ["errors 0.5% (SLO 1%)", "warning", "warn"],
    ["errors 5% (SLO 1%)", "INCIDENT", "bad"],
  ];
  const sev: [string, string, Tone][] = [
    ["SEV1", "> $10K/h · all-hands", "bad"],
    ["SEV2", "$1–10K/h · on-call + backup", "warn"],
    ["SEV3", "< $1K/h · business hours", "sky"],
    ["SEV4", "no impact · ticket", "mute"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        not every alert is an incident
      </Txt>
      {rows.map(([a, b, tone], i) => (
        <g key={a} opacity={o(i)}>
          <Txt x={30} y={68 + i * 32} k="t" anchor="start">
            {a}
          </Txt>
          <Txt x={570} y={68 + i * 32} k="t" anchor="end" tone={tone}>
            {b}
          </Txt>
        </g>
      ))}
      {sev.map(([a, b, tone], i) => (
        <g key={a} opacity={o(i + 3)}>
          <Box x={20 + i * 142} y={176} w={134} h={72} label={a} sub={narrow ? b.split(" · ")[0] : b.split(" · ")[1]} tone={tone} />
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start">
        {narrow ? "severity sets the response" : "severity sets who responds, how fast, and who is told"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- response */

const LIFE = ["detect", "triage", "respond", "mitigate", "resolve", "learn"];

function Response({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.12, i * 0.12 + 0.3);
  const k = ease(seg(t, 0.05, 0.9));
  return (
    <g>
      {LIFE.map((s, i) => {
        const on = step === 0 ? k * 6 > i : step === 2 ? i === 3 : step === 1 ? i === 2 : i >= 2 && i <= 4;
        return (
          <g key={s}>
            <rect className={`ax-box ${on ? (i === 3 ? "lit" : "ok") : ""}`} x={20 + i * 95} y={14} width={85} height={30} />
            <Txt x={62 + i * 95} y={34} k="s" tone={on ? undefined : "mute"}>
              {s}
            </Txt>
          </g>
        );
      })}
      {step === 0 &&
        [
          ["TTD", "time to detect", "< 5 min"],
          ["TTE", "time to engage", "< 15 min"],
          ["TTM", "time to mitigate", "< 1 hour"],
        ].map(([a, b, c], i) => (
          <g key={a} opacity={o(i + 3)}>
            <Txt x={30} y={100 + i * 50} k="d" anchor="start" tone="lit">
              {a}
            </Txt>
            {!narrow && (
              <Txt x={150} y={96 + i * 50} k="s" anchor="start">
                {b}
              </Txt>
            )}
            <Txt x={570} y={96 + i * 50} k="t" anchor="end" tone="ok">
              {c}
            </Txt>
          </g>
        ))}
      {step === 1 && (
        <g>
          <Box x={200} y={64} w={200} h={64} label={narrow ? "IC" : "Incident Commander"} sub={narrow ? "coordinates" : "coordinates only"} tone="lit" />
          {[
            ["Tech lead", "diagnoses, fixes"],
            ["Comms lead", "status page, people"],
            ["SMEs", "DB, payments…"],
          ].map(([a, b], i) => (
            <g key={a} opacity={o(i + 1)}>
              <Wire d={`M300 128L${110 + i * 190} 170`} />
              <Box x={20 + i * 190} y={170} w={180} h={64} label={a} sub={narrow ? undefined : b} tone="sky" />
            </g>
          ))}
        </g>
      )}
      {step === 2 && (
        <g>
          {["rollback", "failover", "disable a flag", "scale up"].map((s, i) => (
            <g key={s} opacity={o(i)}>
              <Box x={20 + i * 142} y={70} w={134} h={60} label={narrow ? s.split(" ").pop() : s} tone="lit" />
            </g>
          ))}
          <Txt x={300} y={176} k="t" tone="ok" opacity={o(4)}>
            {narrow ? "restore service first" : "restore service first; root cause comes after"}
          </Txt>
          <Txt x={300} y={210} k="s" opacity={o(5)}>
            {narrow ? "runbook: assess in < 2 min" : "the runbook's quick assessment takes under 2 minutes"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          {["investigating", "identified", "monitoring", "resolved"].map((s, i) => (
            <g key={s}>
              <Box x={20 + i * 142} y={70} w={134} h={56} label={narrow && s === "investigating" ? "investig." : s} tone={k * 4 > i ? (i === 3 ? "ok" : "sky") : undefined} />
              {i < 3 && <Wire d={`M${154 + i * 142} 98H${162 + i * 142}`} arrow />}
            </g>
          ))}
          <Txt x={30} y={168} k="t" anchor="start" opacity={o(2)}>
            {narrow ? "#inc channel · SEV1 every 15 min" : "#inc-2024-01-15-payment-errors · SEV1 updates every 15 min"}
          </Txt>
          <Txt x={30} y={200} k="t" anchor="start" opacity={o(3)}>
            {narrow ? "status page within 10 min" : "status page: first update within 10 minutes of detection"}
          </Txt>
        </g>
      )}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {[narrow ? "SEV1 targets" : "SEV1 targets: detect, engage and mitigate fast", narrow ? "one person coordinates" : "one person coordinates; in SEV3/4 roles can merge", narrow ? "users over root cause" : "mitigation first: users over root cause", narrow ? "plain language, no blame" : "plain language, honest, no blaming third parties"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- learning */

const WHYS: [string, string][] = [
  ["service returned errors", "errors"],
  ["database queries timed out", "DB timeouts"],
  ["new code had N+1 queries", "N+1 queries"],
  ["code review didn't catch it", "missed in review"],
  ["no automated N+1 detection", "no detection"],
];

function Learning({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the blameless postmortem
        </Txt>
        <Box x={20} y={56} w={560} h={70} label={narrow ? "✗ engineer didn't test" : "✗ \"The engineer deployed without testing\""} tone="bad" />
        <Box x={20} y={146} w={560} h={70} label={narrow ? "✓ process allowed it" : "✓ \"Our process allowed untested code to reach production\""} sub={narrow ? undefined : "fix: automated test gates"} tone="ok" opacity={o(3)} />
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "safe people report early" : "safe people report early; blamed people hide issues"}
        </Txt>
      </g>
    );
  if (step === 1)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          five whys
        </Txt>
        {WHYS.map(([a, b], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={30 + i * 14} y={70 + i * 38} k="k" anchor="start" tone="mute">
              why?
            </Txt>
            <Txt x={90 + i * 14} y={70 + i * 38} k="t" anchor="start" tone={i === 4 ? "lit" : undefined}>
              {narrow ? b : a}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="ok" opacity={o(5)}>
          {narrow ? "root: no N+1 check in CI" : "root cause: no automated N+1 detection in CI/CD"}
        </Txt>
      </g>
    );
  const acts: [string, string, string][] = [
    ["N+1 detection in CI", "@alice", "P1"],
    ["canary analysis", "@bob", "P1"],
    ["prod-like staging data", "@charlie", "P2"],
  ];
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        action items, owned and dated
      </Txt>
      {acts.map(([a, b, c], i) => (
        <g key={a} opacity={o(i)}>
          <Token x={34} y={76 + i * 48} s={12} tone={c === "P1" ? "lit" : "sky"} />
          <Txt x={54} y={81 + i * 48} k="t" anchor="start">
            {a}
          </Txt>
          {!narrow && (
            <Txt x={480} y={81 + i * 48} k="s" anchor="end">
              {b}
            </Txt>
          )}
          <Txt x={570} y={81 + i * 48} k="t" anchor="end" tone={c === "P1" ? "lit" : "sky"}>
            {c}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "postmortem within 48 hours" : "written within 48 hours · tracked to completion"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- on-call */

function OnCall({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.14, i * 0.14 + 0.3);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          sustainable on-call
        </Txt>
        <Box x={20} y={50} w={270} h={80} label="primary" sub="responds < 15 min" tone="lit" />
        <Box x={310} y={50} w={270} h={80} label="secondary" sub="responds < 30 min" tone="sky" />
        {Array.from({ length: 8 }, (_, i) => (
          <g key={i} opacity={o(i * 0.6)}>
            <rect className={`ax-box ${i === 0 ? "lit" : ""}`} x={20 + i * 70} y={160} width={60} height={40} />
            <Txt x={50 + i * 70} y={185} k="s" tone={i === 0 ? "lit" : "mute"}>
              {`wk ${i + 1}`}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={236} k="t" anchor="start" opacity={o(4)}>
          {narrow ? "≥ 8 people · < 5 pages a week" : "at least 8 people · fewer than 5 pages a shift"}
        </Txt>
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "runbook for every alert" : "actionable alerts, a runbook each, shift handoffs"}
        </Txt>
      </g>
    );
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone="ok">
        built on preparation
      </Txt>
      {["good alerts", "tested runbooks", "practiced teams"].map((s, i) => (
        <g key={s} opacity={o(i * 1.5)}>
          <Box x={20 + i * 190} y={60} w={180} h={100} label={narrow ? s.split(" ")[1] : s} tone="ok" />
        </g>
      ))}
      <Box x={20} y={190} w={560} h={60} label={narrow ? "heroics = system failure" : "heroics are a sign of system failure"} tone="warn" opacity={o(4)} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "response") return <Response {...p} />;
  if (p.variant === "learning") return <Learning {...p} />;
  if (p.variant === "oncall") return <OnCall {...p} />;
  return <Page {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "page",
      label: "The page",
      steps: [
        { caption: "3:17 AM: the payment service's error rate is 45 percent. Panic, blame and everyone changing things make it worse; calm structure, clear roles and a systemic fix don't. The difference is preparation.", tween: 1800, ms: 4000 },
        { caption: "Not every alert is an incident: 75 percent CPU is monitoring, 0.5 percent errors against a 1 percent SLO is a warning, 5 percent is an incident. Severity, SEV1 to SEV4, sets the response.", tween: 1800, ms: 3800 },
      ],
    },
    {
      id: "response",
      label: "Response",
      steps: [
        { caption: "An incident runs detect, triage, respond, mitigate, resolve and learn. For SEV1: detect within 5 minutes, engage within 15, mitigate within an hour.", tween: 2000, ms: 3400 },
        { caption: "Roles: the incident commander coordinates and doesn't debug, the technical lead diagnoses and fixes, the communications lead keeps everyone informed, and experts join as needed.", tween: 1400, ms: 3600 },
        { caption: "Mitigate first: roll back, fail over, turn off a flag or scale up. Restore service for users, then find the root cause.", tween: 1400, ms: 3200 },
        { caption: "Communicate: a dedicated incident channel with SEV1 updates every 15 minutes, and a status page that moves from investigating to resolved, first updated within 10 minutes.", tween: 1800, ms: 3600 },
      ],
    },
    {
      id: "learning",
      label: "Learning",
      steps: [
        { caption: "Postmortems are blameless. Not the engineer deployed without testing, but our process allowed untested code to reach production, so add automated test gates.", tween: 1200, ms: 3600 },
        { caption: "Five whys: errors, because queries timed out, because of N+1 queries, because review missed them, because nothing detects them automatically. That's the root cause.", tween: 1800, ms: 3600 },
        { caption: "Every action item gets an owner, a priority and a date: N+1 detection in CI, canary analysis, production-like staging data. The postmortem is written within 48 hours.", tween: 1400, ms: 3600 },
      ],
    },
    {
      id: "oncall",
      label: "On-call",
      steps: [
        { caption: "On-call must be sustainable: a primary who responds within 15 minutes, a secondary within 30, at least 8 people in the rotation and fewer than 5 pages a shift.", tween: 1600, ms: 3600 },
        { caption: "Good incident response is built on preparation: good alerts, tested runbooks and practiced teams. Heroics are a sign of system failure.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
