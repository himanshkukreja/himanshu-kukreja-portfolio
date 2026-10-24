/**
 * The whole case file "Why your OTP arrives late": one code's journey (OTP service, aggregator,
 * operator DLT scrubbing, SMSC store and forward, phone, delivery report); shared queues and stale
 * 10-hour validity; DLT's checks and the 8 March 2021 failures; the resend that makes the first
 * code invalid, and reuse plus idempotency; then backoff, fallback channels, delivered-not-sent
 * metrics and SMS pumping defences.
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const HOPS: [string, string][] = [
  ["OTP svc", "OTP"],
  ["Aggregator", "Aggr"],
  ["Operator", "Telco"],
  ["SMSC", "SMSC"],
  ["Phone", "Phone"],
];
const HX = (i: number) => 16 + i * 117;
function Pipe({ tones = {}, subs = {}, narrow, t, flow, back }: { tones?: Record<number, Tone>; subs?: Record<number, string>; narrow: boolean; t: number; flow?: [number, number, Tone?]; back?: boolean }) {
  const q = flow ? seg(t, 0.1, 0.9) : 0;
  const x = flow ? lerp(HX(flow[0]) + 100, HX(flow[1]), ease(q)) : 0;
  return (
    <g>
      {HOPS.map(([l, n], i) => (
        <g key={l}>
          {i > 0 && <Wire d={`M${HX(i) - 17} 86H${HX(i)}`} arrow />}
          <Box x={HX(i)} y={60} w={100} h={52} label={narrow ? n : l} sub={subs[i]} tone={tones[i]} />
        </g>
      ))}
      {flow && q > 0 && q < 1 && <Token x={x} y={86} tone={flow[2]} />}
      {back && <Wire d="M534 112V128H66V112" arrow dash />}
    </g>
  );
}

function Journey({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const sec = Math.round(lerp(0, 40, seg(t, 0, 0.6)));
    return (
      <g>
        <Head k={["11:59 · sale day", "sale day"]} c={["tap Pay", "Pay"]} narrow={narrow} />
        <Box x={16} y={60} w={200} h={150} label="" tone="sky" />
        <Txt x={116} y={110} k="s">
          {narrow ? "waiting" : "waiting for the OTP"}
        </Txt>
        <Txt x={116} y={160} k="d" tone={sec >= 40 ? "warn" : undefined}>
          {sec}s
        </Txt>
        <g opacity={fade(t, 4)}>
          <Box x={260} y={60} w={160} h={60} label="481 203" sub="SMS 1" />
          <Box x={260} y={150} w={160} h={60} label="907 552" sub={narrow ? "after resend" : "SMS 2, resend"} />
          <Wire d="M420 90H460" arrow tone="bad" />
          <Box x={460} y={60} w={124} h={60} label="Invalid" sub="OTP" tone="bad" />
        </g>
        <Chips items={[["tap Resend at 40 s", "Resend at 40 s"], ["two codes arrive", "two codes"], ["the first fails", "first fails"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["the journey of six digits", "the journey"]} c={["many hands", "many hands"]} narrow={narrow} />
        <Pipe narrow={narrow} t={t} flow={[0, 4]} back tones={{ 2: "warn" }} subs={narrow ? {} : { 2: "DLT scrub", 3: "store+fwd" }} />
        <Txt x={300} y={150} k="s">
          {narrow ? "delivery report back" : "the delivery report (DLR) travels back"}
        </Txt>
        <Chips items={[["a queue at every hop", "queues"], ["a rate limit", "rate limits"], ["a way to fail", "failures"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const fill = ease(seg(t, 0, 0.5));
    return (
      <g>
        <Head k={["one shared queue", "shared queue"]} c="illustrative" tone="bad" narrow={narrow} />
        <Pipe narrow={narrow} t={t} tones={{ 1: "bad" }} subs={narrow ? {} : { 1: "1,000/s" }} />
        <Txt x={16} y={156} k="s" anchor="start">
          {narrow ? "promo blast: 2M SMS" : "12:00 promo blast: 2,000,000 SMS"}
        </Txt>
        <Meter x={16} y={168} w={500} h={22} value={fill} max={1} tone="warn" ticks={20} />
        <Token x={lerp(560, 528, fill)} y={179} s={14} tone="bad" />
        <Txt x={584} y={210} k="s" anchor="end" tone="bad">
          OTP
        </Txt>
        <Figs items={[["2,000 s", narrow ? "to drain" : "to send the promo"], ["~33 min", narrow ? "OTP waits" : "the OTP can wait", "bad"]]} y={262} t={seg(t, 0.4, 1)} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["stale codes, late", "stale codes"]} c={["validity period", "validity"]} tone="warn" narrow={narrow} />
      <Pipe narrow={narrow} t={t} tones={{ 3: "warn" }} subs={{ 3: "retries" }} />
      <Txt x={16} y={156} k="s" anchor="start" tone="bad">
        {narrow ? "default: 10 hours" : "default validity: 36,000 s (10 hours)"}
      </Txt>
      <Meter x={16} y={168} w={568} h={18} value={ease(t)} max={1} tone="bad" />
      <Txt x={16} y={216} k="s" anchor="start" tone="ok">
        {narrow ? "for OTPs: 5–300 s" : "recommended for codes: 5 to 300 seconds"}
      </Txt>
      <Meter x={16} y={228} w={568} h={18} value={0.03 * ease(t)} max={1} tone="ok" />
      <Chips items={[["a stale code only confuses", "stale = confusing"], ["drop it instead", "drop it"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Dlt({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const checks: [string, string][] = [
      ["Header", "registered"],
      ["Template", "exact text"],
      ["Chain", "declared"],
      ["Preferences", "allowed"],
    ];
    return (
      <g>
        <Head k={["DLT scrubbing · India", "DLT scrubbing"]} c="TRAI · TCCCPR" narrow={narrow} />
        {checks.map(([l, s], i) => (
          <g key={l} opacity={fade(t, i, 0.14)}>
            <Box x={16 + i * 146} y={60} w={130} h={60} label={narrow && l === "Preferences" ? "Prefs" : l} sub={narrow ? undefined : s} tone={i === 1 ? "bad" : "ok"} />
            {i < 3 && <Wire d={`M${146 + i * 146} 90H${162 + i * 146}`} arrow />}
          </g>
        ))}
        <Wire d="M227 120V160" arrow tone="bad" />
        <g opacity={fade(t, 4)}>
          <Box x={148} y={160} w={158} h={52} label="Blocked" tone="bad" />
          <Txt x={326} y={192} k="s" anchor="start" tone="bad">
            {narrow ? "an extra space" : "an extra space is enough"}
          </Txt>
        </g>
        <Chips items={[["API accepted", "API: accepted"], ["never delivered", "never delivered"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["8 March 2021", "8 March 2021"]} c={["full scrubbing goes live", "scrubbing on"]} tone="bad" narrow={narrow} />
        <Pipe narrow={narrow} t={t} tones={{ 2: "bad", 3: "mute", 4: "mute" }} subs={{ 2: narrow ? "blocks" : "blocks" }} />
        <Txt x={300} y={160} k="s">
          {narrow ? "templates not registered" : "many banks hadn't registered their templates"}
        </Txt>
        <Figs items={[["25–30%", narrow ? "SMS failed" : "of SMS failed that Monday", "bad"], ["7 days", narrow ? "paused" : "TRAI paused scrubbing", "ok"]]} y={240} t={t} narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["treat the template like code", "template = code"]} tone="ok" narrow={narrow} />
      <Box x={16} y={60} w={270} h={60} label={narrow ? "Registered" : "Registered right"} sub={narrow ? "not slowed" : "not slowed by the rules"} tone="ok" />
      <Box x={314} y={60} w={270} h={60} label={narrow ? "Unregistered" : "Wording changed"} sub={narrow ? "blocked" : "silently blocked"} tone="bad" />
      <Txt x={300} y={170} k="s" opacity={fade(t, 2)}>
        {narrow ? "“Your OTP is” → “one-time code”" : "“Your OTP is” → “Your one-time code is”"}
      </Txt>
      <Chips items={[["version control", "version it"], ["test char by char", "test it"], ["approve first", "approve"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Codes({ step, t, narrow }: SceneProps) {
  const rows = (tone2: Tone, s1: string) => (
    <g>
      <Box x={16} y={56} w={140} h={52} label={narrow ? "Server" : "OTP server"} tone="lit" />
      <Box x={444} y={56} w={140} h={52} label="You" tone="sky" />
      <Txt x={300} y={74} k="s">
        {s1}
      </Txt>
      <Wire d="M156 82H444" arrow tone={tone2} />
    </g>
  );
  if (step === 0) {
    const sms1 = ease(seg(t, 0.5, 0.95));
    return (
      <g>
        <Head k={["two codes, one valid", "two codes"]} c={["rotate on resend", "rotate"]} tone="bad" narrow={narrow} />
        {rows(undefined, narrow ? "SMS 2 first" : "SMS 2 arrives first")}
        <Box x={16} y={130} w={140} h={52} label="907 552" sub={narrow ? "saved" : "replaces 481 203"} tone="ok" />
        <Token x={lerp(170, 430, ease(seg(t, 0.1, 0.4)))} y={82} tone="ok" opacity={t < 0.4 ? 1 : 0} />
        <Box x={180} y={130} w={160} h={52} label="481 203" sub={narrow ? "late" : "SMS 1, late"} tone="warn" opacity={1} />
        <Wire d={`M340 156H${lerp(340, 444, sms1)}`} arrow={sms1 > 0.9} tone="warn" />
        <g opacity={fade(t, 5)}>
          <Box x={444} y={130} w={140} h={52} label="Invalid" sub={narrow ? "481 203" : "types 481 203"} tone="bad" />
        </g>
        <Chips items={[["SMS gives no order", "no order"], ["and no timing", "no timing"]]} t={t} tone="bad" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["reuse the live code", "reuse"]} c={["same code while valid", "same code"]} tone="ok" narrow={narrow} />
        {rows("ok", narrow ? "any order works" : "either SMS, any order")}
        <Box x={16} y={130} w={140} h={52} label="481 203" sub={narrow ? "live" : "still live"} tone="ok" />
        <Box x={180} y={130} w={120} h={52} label="SMS 1" sub="481 203" tone="ok" />
        <Box x={314} y={130} w={120} h={52} label="SMS 2" sub="481 203" tone="ok" />
        <Box x={444} y={130} w={140} h={52} label="Verified" tone="ok" />
        <Chips items={[["within 10 min", "≤ 10 min"], ["accepted once", "once"], ["failures limited", "limited"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["one tap, one send", "idempotency"]} c={["idempotency key", "one key"]} tone="ok" narrow={narrow} />
      <Box x={16} y={70} w={150} h={120} label={narrow ? "App" : "App"} sub={narrow ? "tap · retry" : "tap + retry"} tone="sky" />
      <Wire d="M166 110H250" arrow />
      <Wire d="M166 150H250" arrow />
      <Token x={lerp(166, 250, seg(t, 0.1, 0.4))} y={110} opacity={t < 0.4 ? 1 : 0} label={narrow ? undefined : "key A"} />
      <Token x={lerp(166, 250, seg(t, 0.4, 0.7))} y={150} opacity={t >= 0.4 && t < 0.7 ? 1 : 0} label={narrow ? undefined : "key A"} />
      <Box x={250} y={90} w={170} h={80} label="Seen A?" sub={narrow ? "1st result" : "returns 1st result"} tone="ok" />
      <Wire d="M420 130H460" arrow tone="ok" />
      <Box x={460} y={100} w={124} h={60} label="1 SMS" tone="ok" />
      <Chips items={[["same intent, same result", "same intent"], ["no duplicate SMS", "no duplicates"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Right({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const chans = ["WhatsApp", "Voice", "Email"];
    return (
      <g>
        <Head k={["retry without making it worse", "retry well"]} narrow={narrow} />
        <Box x={16} y={60} w={150} h={56} label="SMS" sub={narrow ? "30 s wait" : "Resend in 30 s"} tone="lit" />
        <Wire d="M166 88H200" arrow />
        <Box x={200} y={60} w={180} h={56} label={narrow ? "Same code" : "Resend same code"} sub={narrow ? "backoff" : "backoff + jitter"} />
        <Wire d="M380 88H400V170H420" arrow tone="warn" />
        <Txt x={392} y={148} k="s" anchor="end" tone="warn">
          {narrow ? "no DLR" : "no delivered report"}
        </Txt>
        {chans.map((c, i) => (
          <g key={c} opacity={fade(t, i + 1)}>
            <Box x={420} y={60 + i * 62} w={164} h={50} label={c} tone="ok" />
          </g>
        ))}
        <Chips items={[["a polite countdown", "countdown"], ["short validity", "short validity"], ["another channel", "fall back"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    const st: [string, Tone][] = [
      ["queued", "warn"],
      ["sent", "sky"],
      ["delivered", "ok"],
    ];
    return (
      <g>
        <Head k={["measure what happened", "measure it"]} c={["sent ≠ delivered", "sent ≠ delivered"]} narrow={narrow} />
        {st.map(([l, tone], i) => (
          <g key={l} opacity={fade(t, i, 0.15)}>
            <Box x={16 + i * 196} y={60} w={176} h={56} label={l} sub={i === 1 ? (narrow ? "carrier took it" : "carrier accepted it") : i === 2 ? (narrow ? "on the phone" : "reached the phone") : narrow ? "waiting" : "waiting to go out"} tone={tone} />
            {i < 2 && <Wire d={`M${192 + i * 196} 88H${212 + i * 196}`} arrow />}
          </g>
        ))}
        <Figs items={[["p95", narrow ? "time to delivered" : "time to delivered, per operator"], ["verified / sent", narrow ? "conversion" : "conversion: the honest number", "ok"]]} y={196} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Head k={["SMS pumping", "SMS pumping"]} c={["fraud on send buttons", "fraud"]} tone="bad" narrow={narrow} />
        <Box x={16} y={60} w={150} h={70} label="Bots" sub={narrow ? "many numbers" : "number ranges"} tone="bad" />
        <Wire d="M166 95H226" arrow tone="bad" />
        <Box x={226} y={60} w={150} h={70} label="Send OTP" sub={narrow ? "you pay" : "you pay per SMS"} tone="warn" />
        <Wire d="M376 95H434" arrow tone="bad" />
        <Box x={434} y={60} w={150} h={70} label={narrow ? "Cut" : "Revenue cut"} sub={narrow ? "no code typed" : "no code ever typed"} tone="bad" />
        <Txt x={300} y={170} k="s" opacity={fade(t, 2)}>
          {narrow ? "Fraud Guard: $62.7M saved" : "Twilio: Fraud Guard saved customers $62.7M (2022–24)"}
        </Txt>
        <Chips items={[["limit per number", "per number"], ["per IP, device", "per IP"], ["bot checks", "bot checks"], ["geo permissions", "geo"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k="the lesson" tone="ok" narrow={narrow} />
      <Pipe narrow={narrow} t={1} tones={{ 0: "ok", 1: "ok", 2: "ok", 3: "ok", 4: "ok" }} subs={narrow ? {} : { 0: "same code", 2: "registered", 3: "short TTL" }} />
      <Txt x={300} y={170} k="t">
        {narrow ? "never assume order" : "never assume order or timing"}
      </Txt>
      <Chips items={[["own OTP lane", "own lane"], ["reuse + idempotent", "reuse"], ["measure delivered", "delivered"]]} t={t} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "dlt") return <Dlt {...p} />;
  if (p.variant === "codes") return <Codes {...p} />;
  if (p.variant === "right") return <Right {...p} />;
  return <Journey {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "journey",
      label: "The journey",
      steps: [
        { caption: "11:59 on sale day. You tap Pay, wait 40 seconds, tap Resend. Two codes arrive, you type the first, and it says Invalid OTP.", tween: 2200, ms: 3200 },
        { caption: "One code passes many hands: the OTP service, an SMS aggregator, the operator's DLT check, the SMSC's store and forward, then your phone.", tween: 2200 },
        { caption: "Illustrative: a 2,000,000-SMS promo at 1,000 a second takes 2,000 seconds. An OTP stuck behind it in the same queue can wait about 33 minutes.", tween: 1800, ms: 3400 },
        { caption: "A stuck SMS can wait 10 hours by default on one major provider. For codes it recommends 5 to 300 seconds: better dropped than stale.", tween: 1400 },
      ],
    },
    {
      id: "dlt",
      label: "DLT",
      steps: [
        { caption: "In India every commercial SMS is scrubbed against DLT: header, exact template, telemarketer chain, preferences. An extra space can block it.", tween: 1600, ms: 3400 },
        { caption: "When full scrubbing went live on 8 March 2021, many templates weren't registered. About 25 to 30% of SMS failed, and TRAI paused it for seven days.", tween: 1400, ms: 3400 },
        { caption: "The rules don't slow a correctly registered OTP. An unregistered wording change does, so treat the template like code.", tween: 1200 },
      ],
    },
    {
      id: "codes",
      label: "Two codes",
      steps: [
        { caption: "The bug: Resend makes a new code, 907 552, replacing 481 203. When the late SMS 1 arrives and you type its code, it's invalid.", tween: 2000, ms: 3400 },
        { caption: "The fix: a resend within the validity window sends the same code, so every SMS is right. It still expires in minutes and works once.", tween: 1200 },
        { caption: "Double taps and retries become one SMS: the app sends an idempotency key, and a repeat returns the first result instead of sending again.", tween: 1600 },
      ],
    },
    {
      id: "right",
      label: "Do it right",
      steps: [
        { caption: "Retry gently: a 30-second countdown, the same code, backoff with jitter. With no delivered report, offer WhatsApp, a voice call or email.", tween: 1400 },
        { caption: "Sent only means a carrier accepted it; delivered means it reached the phone. Watch time to delivered and how many codes get verified.", tween: 1400 },
        { caption: "Some want you to send more: SMS pumping bots tap Send OTP on number ranges for a revenue cut. Rate limit per number, IP and device.", tween: 1400 },
        { caption: "Never assume SMS order or timing: give OTPs their own lane, reuse the live code, make sends idempotent, and measure what's delivered.", tween: 1200 },
      ],
    },
  ],
  Scene,
});
