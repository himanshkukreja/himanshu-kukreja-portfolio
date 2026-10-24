/**
 * Whole-lesson overview (week 6, day 1 · problem understanding & high-level design): clarify the
 * requirements with FERNS (five types over five channels; 50M users, 500M/day, 10M/hour campaigns;
 * <1s / <2s / <1min latency, 99.9% for critical; fallbacks, critical never behind marketing), the
 * back-of-the-envelope numbers (~5,800/s avg, design for ~20K/s; 18 TB queryable, ~30 TB active;
 * SMS ~$3M/month, so push → email → SMS), then one payment notification through the architecture:
 * Send API + outbox, priority topics, router, push worker, and the InvalidToken fallback to email.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type P = { x: number; y: number };

/** a point at fraction f along a polyline */
function walk(pts: P[], f: number): P {
  const ls = pts.slice(1).map((q, i) => Math.abs(q.x - pts[i].x) + Math.abs(q.y - pts[i].y));
  let r = Math.min(1, Math.max(0, f)) * ls.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ls.length; i++) {
    if (r <= ls[i] || i === ls.length - 1) {
      const u = ls[i] ? Math.min(1, r / ls[i]) : 1;
      return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
    }
    r -= ls[i];
  }
  return pts[pts.length - 1];
}

function Chip({ x, y, w, label, tone, h = 28 }: { x: number; y: number; w: number; label: string; tone?: Tone; h?: number }) {
  return (
    <g>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + w / 2} y={y + h / 2 + 5} k="s" tone={tone}>
        {label}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- 1 · clarify (FERNS) */
const FERNS: [string, string, string][] = [
  ["F", "Functional", "what"],
  ["E", "Edge cases", "edges"],
  ["R", "Resources", "limits"],
  ["N", "NFRs", "NFRs"],
  ["S", "Scale", "scale"],
];
const FOCUS = [-1, 0, 4, 3, 1];
const TYPES = ["Transactions", "Security", "Marketing", "Reminders", "Social"];
const CHANS = ["Push", "Email", "SMS", "In-App", "WhatsApp"];
const FEATS = ["preferences", "quiet hours", "scheduling", "digests", "templates"];

function Clarify({ step, t, narrow }: SceneProps) {
  const fade = seg(t, 0.15, 0.7);
  return (
    <g>
      {FERNS.map(([l, w, n], i) => {
        const tone: Tone = step === 4 ? (i === 1 ? "lit" : "ok") : FOCUS[step] === i ? "lit" : undefined;
        return (
          <g key={l} opacity={step === 0 ? seg(t, i * 0.15, i * 0.15 + 0.3) : FOCUS[step] === i || step === 4 ? 1 : 0.4}>
            <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={24 + i * 112} y={26} width={104} height={70} />
            <Txt x={76 + i * 112} y={64} k="d" tone={tone}>
              {l}
            </Txt>
            <Txt x={76 + i * 112} y={88} k="s">
              {narrow ? n : w}
            </Txt>
          </g>
        );
      })}
      <g opacity={fade}>
        {step === 0 && (
          <g>
            <Box x={90} y={140} w={420} h={80} label="Design a Notification Platform" sub={narrow ? undefined : "push, email, SMS, etc."} tone="lit" />
            <Txt x={W / 2} y={262} k="s" tone="warn">
              {narrow ? "ask before you draw" : "don't draw boxes yet: ask before you draw"}
            </Txt>
          </g>
        )}
        {step === 1 &&
          [TYPES, FEATS, CHANS].map((col, c) => (
            <g key={c}>
              <Txt x={110 + c * 190} y={124} k="k">
                {["types", "features", "channels"][c]}
              </Txt>
              {col.map((s, i) => (
                <Chip key={s} x={30 + c * 190} y={134 + i * 34} w={160} label={s} tone={c === 1 ? undefined : "lit"} />
              ))}
            </g>
          ))}
        {step === 2 &&
          [
            ["50M", "users"],
            ["10M", "daily active"],
            ["500M", "per day"],
            ["10M", narrow ? "per hour" : "per hour, campaigns"],
          ].map(([d, s], i) => (
            <g key={i}>
              <Txt x={160 + (i % 2) * 280} y={164 + Math.floor(i / 2) * 84} k="d" tone={i === 3 ? "warn" : undefined}>
                {d}
              </Txt>
              <Txt x={160 + (i % 2) * 280} y={188 + Math.floor(i / 2) * 84} k="s">
                {s}
              </Txt>
            </g>
          ))}
        {step === 3 && (
          <g>
            {[
              ["Security", "< 1 s", "CRITICAL"],
              ["Transactions", "< 2 s", "HIGH"],
              ["Marketing", "< 1 min", "LOW"],
            ].map(([a, b, c], i) => (
              <g key={a}>
                <Txt x={30} y={146 + i * 46} anchor="start">
                  {a}
                </Txt>
                <Txt x={narrow ? 300 : 230} y={146 + i * 46} anchor="start" tone="lit">
                  {b}
                </Txt>
                {!narrow && (
                  <Txt x={320} y={146 + i * 46} k="s" anchor="start">
                    {c}
                  </Txt>
                )}
              </g>
            ))}
            <Txt x={490} y={180} k="d" tone="ok">
              99.9%
            </Txt>
            <Txt x={490} y={204} k="s">
              {narrow ? "critical" : "critical delivery"}
            </Txt>
            <Txt x={W / 2} y={292} k="s">
              GDPR · CAN-SPAM · audit trail
            </Txt>
          </g>
        )}
        {step === 4 && (
          <g>
            <Box x={24} y={124} w={268} h={90} label={narrow ? "push off, bad no." : "push off · bad number"} sub={narrow ? "fallback" : "→ fallback or mark invalid"} tone="warn" />
            <Box x={308} y={124} w={268} h={90} label="critical first" sub={narrow ? "never delayed" : "never behind marketing"} tone="lit" />
            <Box x={24} y={240} w={552} h={50} label={narrow ? "summarize, then design" : "summarize and read it back, then design"} tone="ok" />
          </g>
        )}
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · estimate */
const KICK = ["traffic", "storage", "provider cost per month", "channel order"];

function Estimate({ step, t, narrow }: SceneProps) {
  const f = seg(t, 0.1, 0.9);
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {KICK[step]}
      </Txt>
      {step === 0 && (
        <g>
          <Txt x={W / 2} y={76} k="d">
            500M / day
          </Txt>
          {[
            [narrow ? "avg" : "average", 5800, "~5,800/s", "ok"],
            [narrow ? "peak" : "peak 3×", 17400, "~17,400/s", "warn"],
            [narrow ? "design" : "design for", 20000, "~20,000/s", "lit"],
          ].map(([l, v, s, tone], i) => (
            <g key={i}>
              <Txt x={24} y={134 + i * 60} k="s" anchor="start">
                {l}
              </Txt>
              <Meter x={narrow ? 110 : 130} y={120 + i * 60} w={narrow ? 330 : 310} h={18} value={(v as number) * seg(t, i * 0.25, i * 0.25 + 0.5)} max={20000} tone={tone as Tone} />
              <Txt x={576} y={135 + i * 60} anchor="end" tone={tone as Tone}>
                {s}
              </Txt>
            </g>
          ))}
        </g>
      )}
      {step === 1 &&
        [
          ["200 GB", narrow ? "per day" : "per day · 400 B × 500M", undefined],
          ["18 TB", narrow ? "90 days" : "90 days queryable", "lit"],
          ["400 GB", narrow ? "audit / day" : "audit / day · 3 events each", "warn"],
          ["~30 TB", narrow ? "active" : "active in all", "ok"],
        ].map(([d, s, tone], i) => (
          <g key={i} opacity={seg(t, i * 0.2, i * 0.2 + 0.3)}>
            <Txt x={150 + (i % 2) * 300} y={118 + Math.floor(i / 2) * 110} k="d" tone={tone as Tone}>
              {d}
            </Txt>
            <Txt x={150 + (i % 2) * 300} y={144 + Math.floor(i / 2) * 110} k="s">
              {s}
            </Txt>
            {i % 2 === 0 && <Wire d={`M${narrow ? 250 : 262} ${110 + Math.floor(i / 2) * 110}H${narrow ? 352 : 340}`} arrow />}
          </g>
        ))}
      {step === 2 && (
        <g>
          {[
            ["Push", 0, "$0", "ok"],
            ["Email", 150000, "~$150K", "ok"],
            ["SMS", 3000000, "~$3M", "bad"],
          ].map(([l, v, s, tone], i) => (
            <g key={i}>
              <Txt x={24} y={100 + i * 64} anchor="start">
                {l}
              </Txt>
              <Meter x={110} y={86 + i * 64} w={330} h={18} value={(v as number) * f} max={3000000} tone={tone as Tone} />
              <Txt x={576} y={101 + i * 64} anchor="end" tone={tone as Tone}>
                {s}
              </Txt>
            </g>
          ))}
          <Txt x={110} y={262} k="s" anchor="start" opacity={f}>
            {narrow ? "25M SMS/day" : "25M SMS/day · $7.5M at $0.01 list, ~$3M negotiated"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          {[
            ["Push", "free", "ok"],
            ["Email", "cheap", "ok"],
            ["SMS", narrow ? "last" : "last resort", "warn"],
          ].map(([l, s, tone], i) => (
            <g key={l} opacity={seg(t, i * 0.2, i * 0.2 + 0.3)}>
              {i > 0 && <Wire d={`M${24 + i * 196 - 26} 120H${24 + i * 196}`} arrow />}
              <Box x={24 + i * 196} y={84} w={160} h={72} label={l} sub={s} tone={tone as Tone} />
            </g>
          ))}
          <g opacity={seg(t, 0.6, 1)}>
            <Txt x={W / 2} y={232} k="d" tone="ok">
              $2M+
            </Txt>
            <Txt x={W / 2} y={258} k="s">
              {narrow ? "saved per month" : "saved per month: SMS only for critical or push failure"}
            </Txt>
          </g>
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · architecture */
const BW = 132;
const R1 = 50;
const R2 = 200;
const RH = 46;
const X = (i: number) => 12 + i * 148;
const KY = [76, 100, 124, 148];
const LANES: [string, string][] = [
  ["critical", "CRIT"],
  ["high", "HIGH"],
  ["medium", "MED"],
  ["low", "LOW"],
];
const DATA = ["S3", "ClickHouse", "PostgreSQL", "Redis"];
const c1 = (i: number): P => ({ x: X(i) + BW / 2, y: R1 + RH / 2 });
const c2 = (i: number): P => ({ x: X(i) + BW / 2, y: R2 + RH / 2 });
const HIGH: P = { x: X(3) + BW / 2, y: KY[1] + 10 };

function Arch({ step, t, clock, narrow }: SceneProps) {
  const p = seg(t, 0.05, 0.95);
  const fcm: Tone = step === 3 ? "ok" : step === 4 ? "bad" : undefined;
  const tok =
    step === 0
      ? walk([c1(0), c1(1), c1(2)], p)
      : step === 1
        ? walk([c1(2), { x: X(3) - 8, y: c1(2).y }, { x: X(3) - 8, y: HIGH.y }, HIGH], p)
        : step === 2
          ? walk([HIGH, c2(3), c2(2)], p)
          : step === 3
            ? walk([c2(2), c2(1)], p)
            : walk([c2(2), { x: c2(2).x, y: 258 }, { x: c2(0).x, y: 258 }, c2(0)], p);
  const flood = (k: number) => (clock * 0.4 + k / 4) % 1;
  const notes: [string, Tone][] =
    step === 0
      ? [[narrow ? "send(user-123, …)" : "send(user-123, TRANSACTION, payment_received)", undefined], [narrow ? "row + outbox: one txn" : "notification + outbox row: one transaction", "lit"], [narrow ? "← notification_id" : "← returns notification_id", "ok"]]
      : step === 1
        ? [[narrow ? "every 100ms" : "outbox processor: every 100ms", "lit"], [narrow ? "marketing → LOW" : "marketing floods only the LOW topic", "warn"]]
        : step === 2
          ? [[narrow ? "push, email fallback" : "prefs: Push (primary), Email (fallback)", "lit"], [narrow ? "quiet hours? no" : "push enabled? yes · quiet hours? no", undefined], [narrow ? "“You received $50.00”" : "“You received $50.00 from John”", "ok"]]
          : step === 3
            ? [[narrow ? "SENT = accepted" : "SENT: accepted by FCM, not yet on device", "ok"], [narrow ? "audit log written" : "audit log written to ClickHouse", undefined]]
            : [[narrow ? "token marked invalid" : "InvalidToken → device token marked invalid", "bad"], [narrow ? "DELIVERED_VIA_EMAIL" : "→ email topic · DELIVERED_VIA_EMAIL", "ok"]];
  const r1 = (i: number): Tone => (step === 0 && i > 0 ? (p > (i === 1 ? 0.4 : 0.9) ? "lit" : undefined) : undefined);
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "one payment notification" : "architecture: one payment notification"}
      </Txt>
      {[0, 1].map((i) => (
        <Wire key={i} d={`M${X(i) + BW} ${c1(0).y}H${X(i + 1)}`} arrow tone={step === 0 ? "lit" : undefined} />
      ))}
      <Wire d={`M${X(2) + BW} ${c1(0).y}H${X(3) - 8}V${HIGH.y}H${X(3) + 10}`} arrow tone={step === 1 ? "lit" : undefined} />
      <Wire d={`M${c2(3).x} ${R1 + 130}V${R2}`} arrow tone={step === 2 ? "lit" : undefined} />
      {[3, 2].map((i) => (
        <Wire key={i} d={`M${X(i)} ${c2(0).y}H${X(i - 1) + BW}`} arrow tone={(step === 2 && i === 3) || (step === 3 && i === 2) ? "lit" : undefined} />
      ))}
      {step === 4 && <Wire d={`M${c2(2).x} ${R2 + RH}V258H${c2(0).x}V${R2 + RH}`} arrow dash tone="ok" />}
      {["Payment svc|Payment", "Send API|Send API", "Outbox|Outbox"].map((l, i) => (
        <Box key={l} x={X(i)} y={R1} w={BW} h={RH} label={l.split("|")[narrow ? 1 : 0]} tone={r1(i)} />
      ))}
      <rect className={`ax-box${step === 1 || step === 2 ? " lit" : ""}`} x={X(3)} y={R1} width={BW} height={130} />
      <Txt x={c1(3).x} y={R1 + 18} k="s">
        Kafka
      </Txt>
      {LANES.map(([w, n], i) => (
        <g key={w}>
          <rect className={`ax-box${i === 1 && step >= 1 && step <= 2 ? " lit" : i === 3 && step === 1 ? " warn" : ""}`} x={X(3) + 10} y={KY[i]} width={BW - 20} height={20} />
          <Txt x={X(3) + 16} y={KY[i] + 15} k="s" anchor="start">
            {narrow ? n : w}
          </Txt>
        </g>
      ))}
      {step === 1 && [0, 1, 2].map((k) => <Token key={k} x={lerp(X(3) + 70, X(3) + BW - 16, flood(k))} y={KY[3] + 10} s={7} tone="warn" />)}
      {[
        ["Router", "Router", step === 2 ? "lit" : undefined],
        ["Push worker", "Worker", step >= 2 ? "lit" : undefined],
        ["FCM / APNs", "FCM", fcm],
        ["SendGrid", "SendGrid", step === 4 ? "ok" : undefined],
      ].map(([w, n, tone], j) => (
        <Box key={w} x={X(3 - j)} y={R2} w={BW} h={RH} label={narrow ? n : w} tone={tone as Tone} dim={j === 3 && step !== 4} />
      ))}
      {DATA.map((d, i) => {
        const on = (step === 2 && (d === "Redis" || d === "PostgreSQL")) || (step === 3 && d === "ClickHouse") || (step === 4 && d === "PostgreSQL");
        return (
          <g key={d} opacity={on ? 1 : 0.4}>
            <Chip x={X(i)} y={280} w={BW} h={30} label={d} tone={on ? "sky" : undefined} />
          </g>
        );
      })}
      {notes.map(([s, tone], i) => (
        <Txt key={i} x={12} y={122 + i * 26} k="s" anchor="start" tone={tone} opacity={seg(t, 0.2 + i * 0.2, 0.5 + i * 0.2)}>
          {s}
        </Txt>
      ))}
      {p < 1 && <Token x={tok.x} y={tok.y} s={11} tone={step === 4 ? "ok" : "lit"} />}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "clarify" ? <Clarify {...p} /> : p.variant === "estimate" ? <Estimate {...p} /> : <Arch {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "clarify",
      label: "Clarify",
      steps: [
        { caption: "“Design a notification platform.” Don't start drawing boxes: ask clarifying questions first, using FERNS.", tween: 1600 },
        { caption: "Functional: a fintech app sends five types over push, email, SMS, in-app and WhatsApp, with preferences, scheduling and digests.", tween: 1000 },
        { caption: "Scale: 50 million users, 10 million daily active, 500 million notifications a day, and campaigns of 10 million an hour.", tween: 1000 },
        { caption: "Non-functional: security alerts under 1 second, transactions under 2, marketing within a minute, and 99.9% delivery for critical ones.", tween: 1000 },
        { caption: "Edge cases and priorities: fall back or mark bad contacts invalid, never delay critical behind marketing. Then read it all back.", tween: 1000 },
      ],
    },
    {
      id: "estimate",
      label: "Estimate",
      steps: [
        { caption: "500 million a day is about 5,800 a second on average. Bursts reach 3×, about 17,400 a second, so design for about 20,000.", tween: 1600 },
        { caption: "About 400 bytes a record: 200 GB a day, 18 TB for 90 queryable days. Audit logs add 400 GB a day; about 30 TB active in all.", tween: 1600 },
        { caption: "Push is free and email about $150,000 a month, but 25 million SMS a day is $7.5M a month at $0.01, about $3M negotiated.", tween: 1400 },
        { caption: "So order channels by cost: push first, email second, SMS only for critical alerts or push failures. That saves $2M+ a month.", tween: 1400 },
      ],
    },
    {
      id: "arch",
      label: "Architecture",
      steps: [
        { caption: "The payment service calls the Send API, which writes the notification and its outbox row in one transaction and returns the ID.", tween: 1600 },
        { caption: "Every 100ms the outbox processor publishes it to Kafka's HIGH topic. Separate priority topics keep a marketing flood off critical alerts.", tween: 1400, loop: true },
        { caption: "The router reads preferences, Redis then PostgreSQL: push primary, email fallback. Then it renders “You received $50.00 from John”.", tween: 1600 },
        { caption: "The push worker sends to FCM. Success means accepted, not yet on the device: status SENT, and the audit log is written.", tween: 1000 },
        { caption: "If FCM says InvalidToken, the token is marked invalid and the task goes to the email topic. SendGrid delivers it: DELIVERED_VIA_EMAIL.", tween: 1600 },
      ],
    },
  ],
  Scene,
});
