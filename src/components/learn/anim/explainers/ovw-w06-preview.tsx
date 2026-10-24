/**
 * Whole-lesson overview (week 6 preview): the problem (a fintech super-app's five notification
 * types over five channels, 50M users, 500M/day, 10M/hour campaigns, 99.9% critical SLA), the five
 * days as one pipeline that grows (design, core flow, advanced features, scale, operations), and
 * the preview's production-reality example: device token rotation and its fix.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const LX = 12;
const CW = 116;
const RX = 472;
const ROW = (i: number) => 56 + i * 44;
const RH = 32;
const MID = 150;
const TYPES: [string, string][] = [
  ["Transactions", "Payments"],
  ["Security", "Security"],
  ["Marketing", "Marketing"],
  ["Reminders", "Reminders"],
  ["Social", "Social"],
];
const CHANNELS = ["Push", "Email", "SMS", "In-App", "WhatsApp"];
const PARTS: [string, string, string][] = [
  ["Ingest", "API", "validate"],
  ["Route", "Route", "prefs"],
  ["Queue", "Queue", "priority"],
  ["Worker", "Work", "providers"],
];
const PX = (i: number) => 154 + i * 74;
const PW = 68;
const PY = 122;
const PH = 56;

function Item({ x, y, label, tone, dim }: { x: number; y: number; label: string; tone?: Tone; dim?: boolean }) {
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={y} width={CW} height={RH} />
      <Txt x={x + CW / 2} y={y + 21} k="s" tone={tone || undefined}>
        {label}
      </Txt>
    </g>
  );
}

/** a point along source row → ingest → … → workers → channel row, p in 0..1 */
function path(src: number, dst: number, p: number) {
  const pts = [
    { x: LX + CW, y: ROW(src) + RH / 2 },
    { x: PX(0), y: MID },
    { x: PX(3) + PW, y: MID },
    { x: RX, y: ROW(dst) + RH / 2 },
  ];
  const k = Math.min(2, Math.floor(p * 3));
  const q = p * 3 - k;
  return { x: lerp(pts[k].x, pts[k + 1].x, q), y: lerp(pts[k].y, pts[k + 1].y, q) };
}

function Frame({ narrow, types, chans, parts }: { narrow: boolean; types: (i: number) => Tone | "dim"; chans: (i: number) => Tone | "dim"; parts: boolean }) {
  return (
    <g>
      {TYPES.map(([w, n], i) => {
        const tn = types(i);
        return (
          <g key={w}>
            <Wire d={`M${LX + CW} ${ROW(i) + RH / 2}C${LX + CW + 16} ${ROW(i) + RH / 2} ${PX(0) - 16} ${MID} ${PX(0)} ${MID}`} tone={tn === "lit" ? "lit" : undefined} opacity={tn === "dim" ? 0.3 : 1} />
            <Item x={LX} y={ROW(i)} label={narrow ? n : w} tone={tn === "dim" ? undefined : tn} dim={tn === "dim"} />
          </g>
        );
      })}
      {CHANNELS.map((c, i) => {
        const tn = chans(i);
        return (
          <g key={c}>
            <Wire d={`M${PX(3) + PW} ${MID}C${RX - 16} ${MID} ${RX - 16} ${ROW(i) + RH / 2} ${RX} ${ROW(i) + RH / 2}`} tone={tn === "lit" || tn === "ok" ? tn : tn === "bad" ? "bad" : undefined} opacity={tn === "dim" ? 0.3 : 1} />
            <Item x={RX} y={ROW(i)} label={c} tone={tn === "dim" ? undefined : tn} dim={tn === "dim"} />
          </g>
        );
      })}
      {parts &&
        PARTS.map(([w, n], i) => (
          <g key={w}>
            {i > 0 && <Wire d={`M${PX(i - 1) + PW} ${MID}H${PX(i)}`} arrow />}
            <Box x={PX(i)} y={PY} w={PW} h={PH} label={narrow ? n : w} />
          </g>
        ))}
    </g>
  );
}

function Problem({ step, t, clock, narrow }: SceneProps) {
  const flow = (k: number) => (clock * 0.35 + k / 5) % 1;
  const figs = step < 3 ? [["50M", "users"], ["500M", "per day"]] : [["10M", "per hour"], ["99.9%", narrow ? "critical" : "critical SLA"]];
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "fintech super-app" : "a fintech super-app · like Revolut, Cash App, PayTM"}
      </Txt>
      <Frame
        narrow={narrow}
        parts={false}
        types={(i) => (step === 3 ? (i === 2 ? "warn" : i === 1 ? "lit" : "dim") : step === 0 ? (t > i / 5 ? "lit" : "dim") : undefined)}
        chans={(i) => (step === 1 ? (t > i / 5 ? "lit" : "dim") : step === 3 ? (i === 0 ? "ok" : "dim") : step === 0 ? "dim" : undefined)}
      />
      <Box x={154} y={100} w={290} h={100} label="Notification platform" sub={narrow ? undefined : "5 types · 5 channels"} tone={step >= 2 ? "lit" : undefined} />
      {step >= 2 &&
        figs.map(([d, s], i) => (
          <g key={d} opacity={step === 2 || step === 3 ? seg(t, 0.2, 0.8) : 1}>
            <Txt x={230 + i * 140} y={258} k="d" tone={step === 3 ? (i === 0 ? "warn" : "ok") : undefined}>
              {d}
            </Txt>
            <Txt x={230 + i * 140} y={282} k="s">
              {s}
            </Txt>
          </g>
        ))}
      {step === 3 && [0, 1, 2].map((k) => <Token key={k} x={lerp(LX + CW, 158, flow(k))} y={lerp(ROW(2) + RH / 2, MID, flow(k))} s={8} tone="warn" />)}
    </g>
  );
}

const DAYS = ["Day 1 · problem & design", "Day 2 · core flow", "Day 3 · advanced features", "Day 4 · scale & edge cases", "Day 5 · ops & interview"];
const CHIPS: [string, string][][] = [
  [["clarify", "clarify"], ["estimate", "estimate"], ["architecture", "architecture"], ["schema", "schema"]],
  [],
  [["templates", "templates"], ["digests", "digests"], ["scheduling", "scheduling"], ["preferences", "preferences"]],
  [],
  [["metrics & SLOs", "metrics"], ["alerting", "alerting"], ["canary deploys", "canary"], ["45-min interview", "interview"]],
];
const CW2 = 143;

function Days({ step, t, clock, narrow }: SceneProps) {
  const p = (t * 0.9 + clock * 0.3) % 1;
  const chips = CHIPS[step];
  const camp = step === 3 ? seg(t, 0.1, 0.9) : 0;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? `Day ${step + 1}` : DAYS[step]}
      </Txt>
      <g opacity={step === 0 ? lerp(0.3, 1, seg(t, 0, 0.6)) : 1}>
        <Frame
          narrow={narrow}
          parts
          types={(i) => (step === 1 && i === 0 ? "lit" : step === 3 && i === 2 ? "warn" : step === 1 || step === 3 ? "dim" : undefined)}
          chans={(i) => (step === 1 && i === 0 ? "lit" : step === 3 ? (i === 0 ? "bad" : i === 2 ? "ok" : "dim") : step === 1 ? "dim" : undefined)}
        />
      </g>
      {step === 1 && (
        <g>
          {!narrow && PARTS.map(([w, , s], i) => <Txt key={w} x={PX(i) + PW / 2} y={PY + PH + 20} k="s">{s}</Txt>)}
          <Token {...path(0, 0, p)} s={11} tone="lit" />
        </g>
      )}
      {chips.map(([w, n], i) => (
        <g key={w} opacity={seg(t, i * 0.18, i * 0.18 + 0.3)}>
          <rect className="ax-box lit" x={PX(0) + (i % 2) * (CW2 + 4)} y={196 + Math.floor(i / 2) * 34} width={CW2} height={28} />
          <Txt x={PX(0) + (i % 2) * (CW2 + 4) + CW2 / 2} y={215 + Math.floor(i / 2) * 34} k="s" tone="lit">
            {narrow ? n : w}
          </Txt>
        </g>
      ))}
      {step === 3 && (
        <g>
          <Meter x={PX(2)} y={PY + PH + 14} w={PW} h={12} value={lerp(0.1, 0.9, camp)} max={1} tone="warn" />
          <Txt x={PX(2) + PW / 2} y={PY + PH + 46} k="s" tone="warn">
            10M/hour
          </Txt>
          <Txt x={RX + CW / 2} y={ROW(0) - 8} k="s" tone="bad">
            {narrow ? "open" : "circuit open"}
          </Txt>
          <Txt x={PX(0)} y={84} k="s" anchor="start" tone="ok" opacity={seg(t, 0.5, 0.9)}>
            {narrow ? "fallback → SMS" : "provider fails → fallback to SMS"}
          </Txt>
        </g>
      )}
    </g>
  );
}

function Reality({ step, t, clock, narrow }: SceneProps) {
  const p = seg(t, 0.1, 0.9);
  const retry = (0.75 + clock * 0.8) % 1;
  const dst = step === 3 ? 1 : 0;
  const tok = step === 0 ? null : path(0, dst, step === 2 ? retry : p);
  const db = ["old token", "old token", "old token", "invalid", "new token"][step];
  const dbTone: Tone = step === 3 ? "bad" : step === 4 ? "ok" : "warn";
  const pushTone: Tone = step === 1 || step === 2 || step === 3 ? "bad" : step === 4 ? "ok" : undefined;
  return (
    <g>
      <Txt x={W / 2} y={30} k="k">
        {narrow ? "edge case: token rotation" : "edge case: device token rotation"}
      </Txt>
      <Frame
        narrow={narrow}
        parts
        types={(i) => (i === 1 ? "lit" : "dim")}
        chans={(i) => (i === 0 ? pushTone : i === 1 && step === 3 ? "ok" : i === 2 && step === 3 ? "ok" : "dim")}
      />
      <Wire d={`M${PX(3) + PW / 2} ${PY + PH}V230`} dash />
      <Box x={PX(2)} y={230} w={PW * 2 + 9} h={50} label={db} sub={narrow ? undefined : "token store"} tone={dbTone} />
      {tok && (step !== 1 || t < 0.95) && <Token x={tok.x} y={tok.y} s={11} tone={step === 3 ? "ok" : step === 4 ? "ok" : "lit"} />}
      {(step === 1 || step === 2) && (
        <Txt x={RX + CW / 2} y={ROW(0) - 8} k="s" tone="bad" opacity={step === 1 ? seg(t, 0.8, 1) : 1}>
          UNREGISTERED
        </Txt>
      )}
      {step === 2 && (
        <Txt x={PX(0)} y={92} k="s" anchor="start" tone="bad">
          {narrow ? "retry → same failure" : "retry → same failure, wasted work"}
        </Txt>
      )}
      {step === 4 && (
        <Txt x={PX(0)} y={92} k="s" anchor="start" tone="ok" opacity={seg(t, 0.3, 0.9)}>
          {narrow ? "app opens → new token" : "app opens → registers a new token"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "problem" ? <Problem {...p} /> : p.variant === "days" ? <Days {...p} /> : <Reality {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "problem",
      label: "The problem",
      steps: [
        { caption: "A fintech super-app sends five kinds of notification: transactions, security alerts, marketing, reminders and social.", tween: 1800 },
        { caption: "They go out over five channels: push, email, SMS, in-app and WhatsApp.", tween: 1800 },
        { caption: "The scale: 50 million users and 500 million notifications a day.", tween: 1000 },
        { caption: "Campaigns burst to 10 million an hour, while critical notifications must keep a 99.9% delivery SLA.", tween: 1200, loop: true },
      ],
    },
    {
      id: "days",
      label: "Five days",
      steps: [
        { caption: "Day 1: understand the problem. Clarify requirements, estimate the scale, then draw the architecture and the schemas.", tween: 2000 },
        { caption: "Day 2: the core flow. A transaction is ingested, routed by preferences, queued by priority and sent through a provider.", tween: 1600, loop: true },
        { caption: "Day 3: the features that separate good from great: templates, batching and digests, scheduling, and preferences.", tween: 1800 },
        { caption: "Day 4: what breaks at scale. A 10M-an-hour campaign fills the queue, and a failing provider trips its circuit breaker and falls back.", tween: 1800 },
        { caption: "Day 5: run it and present it. Metrics, alerts and canary deploys, then a complete 45-minute interview.", tween: 1800 },
      ],
    },
    {
      id: "reality",
      label: "Production reality",
      steps: [
        { caption: "Device tokens change on an app reinstall, a restore to a new device or an OS update, but the old token is still in our database.", tween: 900 },
        { caption: "The push fails with an invalid-token error: APNs BadDeviceToken or Unregistered, FCM UNREGISTERED.", tween: 1600 },
        { caption: "If we just retry, it is the same failure and wasted resources, and the user never gets the notification.", tween: 1200, loop: true },
        { caption: "The production fix: detect the invalid-token response, mark the token invalid, and route to a fallback channel, email or SMS.", tween: 1600 },
        { caption: "When the app next opens it registers a new token, and a background job cleans up stale tokens.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
