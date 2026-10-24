/**
 * Whole-lesson overview (week 6, day 4: scale, reliability & edge cases), "what breaks at scale?
 * Everything." Scale: a 10M-in-an-hour campaign (+48% average load, a 100,000+/sec burst) tamed by
 * throttled ingestion, a celebrity's 1M-follower fan-out, provider rate limits. Reliability: the
 * circuit breaker cycle, provider failover, graceful degradation. Edge cases: device tokens, email
 * bounces, DST, race conditions. Cost: SMS at $3M+/month and how to cut it.
 */
import { at, Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const PX = (i: number) => 20 + i * 148;
const PW = 116;
const PY = 44;
const PH = 44;
const STAGES: [string, string][] = [
  ["Ingest", "Ingest"],
  ["Kafka", "Kafka"],
  ["Workers", "Workers"],
  ["Providers", "Provider"],
];

/** the platform as one row; each step lights the part under stress */
function Pipe({ narrow, tones }: { narrow: boolean; tones: Tone[] }) {
  return (
    <g>
      {STAGES.map(([w, n], i) => (
        <g key={w}>
          {i > 0 && <Wire d={`M${PX(i - 1) + PW} ${PY + PH / 2}H${PX(i)}`} arrow />}
          <Box x={PX(i)} y={PY} w={PW} h={PH} label={narrow ? n : w} tone={tones[i]} />
        </g>
      ))}
    </g>
  );
}

/** traffic on a conveyor under the row: dense for the burst, sparse once throttled */
function Flow({ n, clock, speed, tone }: { n: number; clock: number; speed: number; tone: Tone }) {
  return (
    <g>
      <Wire d="M20 102H580" dash />
      {Array.from({ length: n }, (_, k) => (
        <Token key={k} x={20 + ((clock * speed + k / n) % 1) * 560} y={102} s={8} tone={tone} />
      ))}
    </g>
  );
}

function Chip({ x, y, w, label, tone, dim }: { x: number; y: number; w: number; label: string; tone?: Tone; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={28} />
      <Txt x={x + w / 2} y={y + 19} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

const BREAKS: [string, string][] = [
  ["API overwhelmed", "API"],
  ["Kafka unbalanced", "Kafka skew"],
  ["DB pools exhaust", "DB pools"],
  ["rate limits hit", "rate limits"],
  ["queue depth grows", "queue lag"],
  ["memory pressure", "memory"],
];
const LIMITS: [string, string, string][] = [
  ["FCM", "10,000/s", "HTTP v1 default"],
  ["APNs", "4,000/s", "self-imposed"],
  ["SendGrid", "100 req/s", "1,000 emails/req"],
  ["Twilio", "100/s", "per short code"],
];

function Scale({ step, t, clock, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const tones = at<Tone[]>(step, [[], ["bad", "bad", "warn", "bad"], ["ok", "lit"], ["lit", "lit"], [undefined, undefined, undefined, "lit"]]);
  const big = (x: number, d: string, s: string, tone?: Tone, o = 1) => (
    <g opacity={o}>
      <Txt x={x} y={166} k="d" tone={tone}>
        {d}
      </Txt>
      <Txt x={x} y={192} k="s">
        {s}
      </Txt>
    </g>
  );
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "scaling challenges" : "part I · scaling challenges"}
      </Txt>
      <Pipe narrow={narrow} tones={tones} />
      {step === 0 && (
        <g>
          {big(110, narrow ? "5,800" : "5,800/s", "normal", undefined, seg(t, 0, 0.3))}
          {big(300, narrow ? "+2,800" : "+2,800/s", narrow ? "campaign" : "10M in 1 hour", "lit", seg(t, 0.25, 0.55))}
          {big(490, narrow ? "8,600" : "8,600/s", "combined", "bad", seg(t, 0.5, 0.8))}
          <Meter x={20} y={222} w={560} h={16} value={5800} max={8600} tone="sky" />
          <rect className="ax-fill warn" x={20 + (560 * 5800) / 8600} y={222} width={((560 * 2800) / 8600) * seg(t, 0.4, 0.8)} height={16} />
          <Txt x={W / 2} y={270} k="s" tone="warn">
            {narrow ? "~48% more, for an hour" : "~48% more load, sustained for an hour"}
          </Txt>
        </g>
      )}
      {step === 1 && (
        <g>
          <Flow n={16} clock={clock} speed={0.7} tone="bad" />
          {big(300, "100,000+/s", narrow ? "10:00:00 · all 10M at once" : "10:00:00 · Send clicked · all 10M hit ingestion")}
          {BREAKS.map(([w, n], i) => (
            <g key={w} opacity={seg(t, 0.2 + i * 0.1, 0.4 + i * 0.1)}>
              <Chip x={20 + (i % 3) * 190} y={216 + Math.floor(i / 3) * 38} w={180} label={narrow ? n : w} tone="bad" />
            </g>
          ))}
        </g>
      )}
      {step === 2 && (
        <g>
          <Flow n={4} clock={clock} speed={0.25} tone="ok" />
          {big(150, "1,000/s", "batches of 1,000", "ok")}
          {big(450, "2.8 h", narrow ? "10M ÷ 1,000/s" : "10M ÷ 1,000/s ≈ 10,000 s")}
          <Meter x={20} y={218} w={560} h={14} value={lerp(0, 2.8, p)} max={4} tone="ok" ticks={4} />
          <Txt x={20} y={254} k="s" anchor="start">
            0 h
          </Txt>
          <Txt x={580} y={254} k="s" anchor="end" tone="warn">
            4 h max
          </Txt>
          <Txt x={W / 2} y={290} k="s" tone="lit">
            {narrow ? "→ notifications.low" : "marketing → notifications.low · critical never waits"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          <Box x={20} y={120} w={160} h={56} label="Celebrity" sub={narrow ? undefined : "1M followers"} tone="warn" />
          <Wire d="M180 148H226" arrow tone="lit" />
          <Box x={226} y={120} w={160} h={56} label="Fan-out" sub={narrow ? undefined : "async job"} tone="lit" />
          <Wire d="M386 148H426" arrow tone="lit" />
          {[0, 1, 2, 3].map((i) => (
            <Meter key={i} x={430} y={122 + i * 14} w={150} h={10} value={lerp(0.05, 0.55, seg(t, 0.2 + i * 0.1, 0.8))} max={1} tone="ok" />
          ))}
          {(narrow
            ? [["1,000/batch", ""], ["5,000/s", ""], ["key: recipient", ""], ["prefs: cache", ""]]
            : [["1,000 followers per batch", ""], ["token bucket at 5,000/s", ""], ["key = recipient, not source", ""], ["prefs: cache, then 1 batch read", ""]]
          ).map(([l], i) => (
            <g key={l} opacity={seg(t, 0.3 + i * 0.12, 0.5 + i * 0.12)}>
              <Chip x={20 + (i % 2) * 284} y={204 + Math.floor(i / 2) * 40} w={276} label={l} tone={i === 2 ? "ok" : "lit"} />
            </g>
          ))}
        </g>
      )}
      {step === 4 && (
        <g>
          {LIMITS.map(([n, l, s], i) => (
            <g key={n} opacity={seg(t, i * 0.15, i * 0.15 + 0.3)}>
              <rect className="ax-box" x={20} y={116 + i * 38} width={560} height={30} />
              <Txt x={34} y={136 + i * 38} k="t" anchor="start">
                {n}
              </Txt>
              <Txt x={narrow ? 566 : 330} y={136 + i * 38} k="t" anchor={narrow ? "end" : "middle"} tone="lit">
                {l}
              </Txt>
              {!narrow && (
                <Txt x={566} y={136 + i * 38} k="s" anchor="end">
                  {s}
                </Txt>
              )}
            </g>
          ))}
          <Txt x={W / 2} y={292} k="s" tone="bad" opacity={seg(t, 0.7, 1)}>
            {narrow ? "429 → back off" : "429 → back off: take no tokens until Retry-After"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const SX = [20, 232, 444];
const STATES = ["CLOSED", "OPEN", "HALF_OPEN"];

function Breaker({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const on: Tone[] = step === 0 ? [p < 0.75 ? "lit" : undefined, p >= 0.75 ? "bad" : undefined, undefined] : [p >= 0.75 ? "ok" : undefined, undefined, p < 0.75 ? "warn" : undefined];
  const n = step === 0 ? Math.min(5, Math.floor(p * 6.5)) : Math.min(3, Math.floor(p * 4.2));
  return (
    <g>
      <Wire d="M156 172H232" arrow tone={step === 0 ? "bad" : undefined} />
      <Wire d="M368 172H444" arrow tone={step === 1 ? "lit" : undefined} />
      <Wire d="M512 196V230H88V196" arrow tone={step === 1 ? "ok" : undefined} />
      <Wire d="M490 148V116H320V148" arrow dash />
      {STATES.map((s, i) => (
        <Box key={s} x={SX[i]} y={148} w={136} h={48} label={narrow && i === 2 ? "HALF" : s} tone={on[i]} />
      ))}
      <Txt x={194} y={140} k="s" tone={step === 0 ? "bad" : undefined}>
        {narrow ? "5 fails" : "5 failures"}
      </Txt>
      <Txt x={406} y={140} k="s" tone={step === 1 ? "lit" : undefined}>
        {narrow ? "30 s" : "after 30 s"}
      </Txt>
      <Txt x={405} y={110} k="s" tone="bad">
        {narrow ? "any fail" : "any failure"}
      </Txt>
      <Txt x={300} y={248} k="s" tone={step === 1 ? "ok" : undefined}>
        {narrow ? "3 successes" : "3 successes close it"}
      </Txt>
      <Txt x={narrow ? 20 : 150} y={286} k="s" anchor="start" tone={step === 0 ? "bad" : "ok"}>
        {step === 0 ? "failures" : "trials"}
      </Txt>
      {Array.from({ length: step === 0 ? 5 : 3 }, (_, i) => (
        <Token key={i} x={(narrow ? 140 : 250) + i * 26} y={281} s={14} tone={i < n ? (step === 0 ? "bad" : "ok") : "mute"} />
      ))}
      <Txt x={narrow ? 580 : 450} y={286} k="s" anchor={narrow ? "end" : "start"}>
        {`${n}/${step === 0 ? 5 : 3}`}
      </Txt>
    </g>
  );
}

const FAILOVER: [string, string, string, string][] = [
  ["Email", "SendGrid", "SES", "failover"],
  ["SMS", "Twilio", "SNS", "failover"],
  ["Push", "FCM", "APNs", "none"],
];

function Reliability(props: SceneProps) {
  const { step, t, narrow } = props;
  const p = seg(t, 0.1, 0.9);
  const lag = lerp(0.3, 2.5, p);
  const mode = lag > 2 ? "CRITICAL_ONLY" : lag > 1 ? "DEGRADED" : "NORMAL";
  const mx = (v: number) => 20 + (560 * v) / 3;
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "reliability patterns" : "part II · reliability patterns"}
      </Txt>
      <Pipe narrow={narrow} tones={at<Tone[]>(step, [[undefined, undefined, undefined, "bad"], [undefined, undefined, undefined, "warn"], [undefined, undefined, "lit", "ok"], ["warn", "bad", "warn"]])} />
      {step < 2 && <Breaker {...props} />}
      {step === 2 &&
        FAILOVER.map(([c, a, b, note], i) => (
          <g key={c} opacity={seg(t, i * 0.25, i * 0.25 + 0.35)}>
            <Txt x={20} y={150 + i * 58} k="t" anchor="start">
              {c}
            </Txt>
            <Box x={100} y={124 + i * 58} w={140} h={44} label={a} sub={narrow || i === 2 ? undefined : "OPEN"} tone={i < 2 ? "bad" : undefined} />
            {i < 2 ? <Wire d={`M240 ${146 + i * 58}H280`} arrow tone="ok" /> : <Txt x={260} y={152 + i * 58} k="t">≠</Txt>}
            <Box x={280} y={124 + i * 58} w={140} h={44} label={b} sub={narrow || i === 2 ? undefined : "fallback"} tone={i < 2 ? "ok" : undefined} />
            <Txt x={580} y={150 + i * 58} k="s" anchor="end" tone={i < 2 ? "ok" : "bad"}>
              {narrow ? note : i < 2 ? "auto failover" : "no failover"}
            </Txt>
          </g>
        ))}
      {step === 3 && (
        <g>
          <Txt x={W / 2} y={150} k="d" tone={mode === "NORMAL" ? "ok" : "bad"}>
            {mode}
          </Txt>
          {["NORMAL", "DEGRADED", "CRITICAL_ONLY"].map((m, i) => (
            <Txt key={m} x={mx(i + 0.5)} y={188} k="s" tone={m === mode ? "lit" : undefined}>
              {m}
            </Txt>
          ))}
          <Meter x={20} y={198} w={560} h={18} value={lag} max={3} tone={lag > 1 ? "bad" : "ok"} />
          {[1, 2].map((v) => (
            <line key={v} className="ax-tick" x1={mx(v)} x2={mx(v)} y1={194} y2={220} />
          ))}
          <Wire d={`M${mx(0.5)} 194V220`} dash tone="ok" />
          <Txt x={mx(0.5)} y={238} k="s" tone="ok">
            0.5M
          </Txt>
          <Txt x={mx(1)} y={238} k="s">
            1M
          </Txt>
          <Txt x={mx(2)} y={238} k="s">
            2M
          </Txt>
          <Txt x={W / 2} y={268} k="s">
            {narrow ? "DEGRADED: shed low priority" : "DEGRADED sheds low priority and marketing email"}
          </Txt>
          <Txt x={W / 2} y={292} k="s" tone="ok">
            {narrow ? "NORMAL: lag < 50%, errors < 5%" : "back to NORMAL only at lag < 50% and errors < 5%"}
          </Txt>
        </g>
      )}
    </g>
  );
}

const EDGES: [string, string, string, string, string][] = [
  ["Device tokens", "invalid → mark, fall back", "rotation · stale cleanup", "invalid → mark", "stale cleanup"],
  ["Email bounces", "550 hard → invalid now", "soft: invalid on 5th", "550 → invalid", "soft: on 5th"],
  ["Timezones & DST", "02:30 spring fwd → 03:30", "fall back → first · UTC", "02:30 → 03:30", "store UTC"],
  ["Race conditions", "re-check user + prefs", "SET NX EX 3600 dedup", "re-check prefs", "SET NX dedup"],
];

function Edges({ step, t, narrow }: SceneProps) {
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "edge cases" : "part III · the edge case encyclopedia"}
      </Txt>
      <Pipe narrow={narrow} tones={[undefined, undefined, step >= 2 ? "lit" : undefined, step < 2 ? "lit" : undefined]} />
      {EDGES.map(([title, a, b, na, nb], i) => {
        const x = 20 + (i % 2) * 284;
        const y = 112 + Math.floor(i / 2) * 100;
        const cur = i === step;
        return (
          <g key={title} opacity={i > step ? 0.3 : cur ? lerp(0.4, 1, seg(t, 0, 0.4)) : 0.6}>
            <rect className={`ax-box${cur ? " lit" : ""}`} x={x} y={y} width={276} height={90} />
            <Txt x={x + 138} y={y + 26} k="t" tone={cur ? "lit" : undefined}>
              {title}
            </Txt>
            {i <= step && (
              <g>
                <Txt x={x + 138} y={y + 52} k="s">
                  {narrow ? na : a}
                </Txt>
                <Txt x={x + 138} y={y + 74} k="s">
                  {narrow ? nb : b}
                </Txt>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

const COSTS: [string, number, string, string][] = [
  ["push", 0, "free", "free"],
  ["in-app", 0, "free", "free"],
  ["email", 150, "$0.0001 · ~$150K/mo", "~$150K/mo"],
  ["SMS", 3000, "$0.01 · ~$3M/mo", "~$3M/mo"],
];

function Cost({ step, t, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={W / 2} y={26} k="k">
        {narrow ? "cost optimization" : "part V · reducing notification costs"}
      </Txt>
      <Pipe narrow={narrow} tones={[undefined, undefined, "lit", step === 0 ? "bad" : "ok"]} />
      {step < 2 &&
        COSTS.map(([c, v, l, nl], i) => {
          const y = 114 + i * 42;
          const tone: Tone = step === 0 ? (i === 3 ? "bad" : i === 2 ? "warn" : "ok") : i < 2 ? "ok" : i === 2 ? "lit" : "warn";
          return (
            <g key={c}>
              <Txt x={20} y={y + 20} k="t" anchor="start" tone={step === 1 ? tone : undefined}>
                {step === 1 ? `${i + 1}. ${c}` : c}
              </Txt>
              {step === 0 ? (
                <Meter x={narrow ? 150 : 130} y={y + 7} w={narrow ? 250 : 270} h={16} value={v * p} max={3000} tone={tone} />
              ) : (
                <Chip x={narrow ? 150 : 130} y={y} w={narrow ? 250 : 270} label={[narrow ? "free" : "free: first choice", "free", narrow ? "before SMS" : "cheap: before SMS", narrow ? "critical" : "critical or user's pick"][i]} tone={tone} />
              )}
              <Txt x={580} y={y + 20} k="s" anchor="end" tone={tone}>
                {step === 0 ? (narrow ? nl : l) : i === 3 ? "budget cap" : ""}
              </Txt>
            </g>
          );
        })}
      {step === 0 && (
        <Txt x={W / 2} y={300} k="s" tone="bad" opacity={seg(t, 0.7, 1)}>
          {narrow ? "SMS: 100x email" : "SMS costs 100x email per message"}
        </Txt>
      )}
      {step === 1 && (
        <Txt x={W / 2} y={300} k="s">
          {narrow ? "push first, SMS as fallback" : "push first · SMS only if push fails · monthly caps"}
        </Txt>
      )}
      {step === 2 &&
        [
          ["GSM-7", 160, "ok"],
          ["Unicode", 70, "warn"],
        ].map(([n, c, tone], i) => (
          <g key={n as string}>
            <Txt x={20} y={142 + i * 60} k="t" anchor="start">
              {n}
            </Txt>
            <Meter x={narrow ? 150 : 130} y={128 + i * 60} w={narrow ? 300 : 360} h={20} value={(c as number) * p} max={160} tone={tone as Tone} />
            <Txt x={580} y={143 + i * 60} k="t" anchor="end" tone={tone as Tone}>
              {`${c}`}
            </Txt>
            <Txt x={narrow ? 150 : 130} y={170 + i * 60} k="s" anchor="start">
              {i === 0 ? (narrow ? "chars per segment" : "characters in one segment") : narrow ? "one non-GSM char" : "if any character is outside GSM-7"}
            </Txt>
          </g>
        ))}
      {step === 2 && (
        <Txt x={W / 2} y={292} k="s" tone="lit" opacity={seg(t, 0.6, 1)}>
          {narrow ? "truncate to 1 segment" : "truncate to one segment: multi-segment costs more"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "scale" ? <Scale {...p} /> : p.variant === "reliability" ? <Reliability {...p} /> : p.variant === "edges" ? <Edges {...p} /> : <Cost {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "scale",
      label: "Scale",
      steps: [
        { caption: "Marketing wants 10M notifications in an hour: 2,800/sec on top of the ~5,800/sec average, about 8,600/sec, a 48% increase.", tween: 1800 },
        { caption: "But campaigns don't spread evenly. Send is clicked at 10:00:00, all 10M hit ingestion and the burst passes 100,000/sec. Everything breaks.", tween: 1800, loop: true },
        { caption: "The fix: stream recipients in batches of 1,000 at 1,000/sec. 10M takes about 2.8 hours, inside the 4-hour max, in the low-priority topic.", tween: 1600, loop: true },
        { caption: "A celebrity with 1M followers posts. An async fan-out job pages followers 1,000 at a time at 5,000/sec, keyed by recipient, not source.", tween: 1800 },
        { caption: "Every provider has limits: FCM 10,000/sec, APNs 4,000/sec self-imposed, SendGrid 100 requests/sec, Twilio 100/sec. On a 429, back off.", tween: 1600 },
      ],
    },
    {
      id: "reliability",
      label: "Reliability",
      steps: [
        { caption: "A provider starts failing. The circuit breaker counts failures, and at 5 it trips from CLOSED to OPEN: stop sending to it.", tween: 2000 },
        { caption: "After 30 seconds it goes HALF_OPEN and allows up to 3 trial calls. 3 successes close it; any failure reopens it.", tween: 2000 },
        { caption: "Failover: with SendGrid's circuit open, email goes to SES, and SMS falls back from Twilio to SNS. Push has none: FCM and APNs aren't peers.", tween: 1600 },
        { caption: "Overloaded, the system degrades: Kafka lag over 1M sheds low priority, over 2M only critical gets through. NORMAL waits for half that.", tween: 2200 },
      ],
    },
    {
      id: "edges",
      label: "Edge cases",
      steps: [
        { caption: "Device tokens rotate on reinstall. An invalid-token response marks the token invalid and falls back; a cleanup job removes stale ones.", tween: 900 },
        { caption: "Email: a 550 hard bounce marks the address invalid at once; soft bounces count up and invalidate on the 5th. Spam complaints unsubscribe.", tween: 900 },
        { caption: "Time zones: 02:30 doesn't exist on a spring-forward night, so it becomes 03:30; on fall-back, use the first occurrence. Store UTC.", tween: 900 },
        { caption: "Races: at delivery, re-check the user exists and re-fetch preferences, then claim a one-hour dedup key with SET NX so only one worker sends.", tween: 900 },
      ],
    },
    {
      id: "cost",
      label: "Cost",
      steps: [
        { caption: "SMS costs $3M+ a month. Push and in-app are free, email is $0.0001 each, SMS $0.01: 100 times email per message.", tween: 1800 },
        { caption: "So the selector prefers free channels, then email. SMS is kept for critical messages or the user's explicit choice, under a monthly budget cap.", tween: 1200 },
        { caption: "Each SMS should fit one segment: 160 GSM-7 characters, or 70 if any character needs Unicode. Multi-segment messages cost more.", tween: 1600 },
      ],
    },
  ],
  Scene,
});
