/**
 * Channel selection (week 6, day 1 · 4.3 the router's policy): the router turns a notification's
 * class into a channel plan, then filters it by preferences and quiet hours. A payment goes in-app
 * first, then push if no device acks, then email (SMS only if the user asked for it); a marketing push
 * at 23:00 is deferred to the end of quiet hours (22:00–08:00), not dropped; a fraud alert ignores
 * opt-outs and quiet hours and goes push now, SMS if still unread after 2 minutes, then email; an
 * OTP skips the ladder and goes by SMS at once.
 */
import { defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const CH = ["PUSH", "SMS", "EMAIL", "IN-APP"];
const COL_X = 214;
const COL_W = 92;
const ROWS = ["class policy", "preferences", "quiet hours", "plan"];
const ROW_Y0 = 116;
const ROW_H = 44;

/** what a cell says: [wide, narrow, tone]; "-" is a channel not in play */
const LABEL: Record<string, [string, string, Tone]> = {
  P: ["first", "1st", "lit"],
  F: ["fallback", "next", "sky"],
  X: ["dropped", "drop", "bad"],
  H: ["deferred", "later", "warn"],
  ask: ["if asked", "asked?", "mute"],
  never: ["never", "never", "mute"],
  skip: ["skipped", "skip", "mute"],
  inbox: ["inbox", "inbox", "ok"],
  now: ["now", "now", "ok"],
  noack: ["if no ack", "no ack", "sky"],
  then: ["then", "then", "sky"],
  at8: ["08:00", "08:00", "warn"],
  m2: ["2 min", "2 min", "warn"],
  m10: ["+10 min", "+10 m", "sky"],
  "-": ["", "", "mute"],
};
type Plan = { head: string; sub: string; subN: string; tone: Tone; rows: string[][]; reveal: number[]; notes: string[]; foot: [string, string, Tone] };

const PLANS: Record<string, Plan> = {
  payment: {
    head: "TRANSACTIONAL · PAYMENT",
    sub: "payment received · Priya · web app open · daytime",
    subN: "payment · Priya",
    tone: "lit",
    rows: [
      ["F", "ask", "F", "P"],
      ["F", "X", "F", "P"],
      ["F", "-", "F", "P"],
      ["noack", "-", "then", "now"],
    ],
    reveal: [0, 1, 1, 2],
    notes: ["", "not asked", "daytime", ""],
    foot: ["push only if no device acks within a few seconds", "push only without an ack", "sky"],
  },
  marketing: {
    head: "MARKETING · BULK",
    sub: "cashback offer · 23:00 · quiet hours 22:00–08:00",
    subN: "offer · 23:00",
    tone: "warn",
    rows: [
      ["P", "never", "F", "-"],
      ["P", "-", "F", "-"],
      ["H", "-", "H", "-"],
      ["at8", "-", "then", "-"],
    ],
    reveal: [0, 1, 1, 2],
    notes: ["", "opted in", "23:00", ""],
    foot: ["deferred to 08:00, not dropped; held pushes spread to 08:20", "deferred, not dropped", "warn"],
  },
  security: {
    head: "CRITICAL · FRAUD ALERT",
    sub: "fraud alert · 23:00 · quiet hours 22:00–08:00",
    subN: "fraud alert · 23:00",
    tone: "bad",
    rows: [
      ["P", "F", "F", "inbox"],
      ["P", "F", "F", "inbox"],
      ["P", "F", "F", "inbox"],
      ["now", "m2", "m10", "now"],
    ],
    reveal: [0, 1, 1, 2],
    notes: ["", "locked", "ignored", ""],
    foot: ["SMS only if still unread after 2 min; a read cancels the rest", "unread 2 min: SMS", "warn"],
  },
  otp: {
    head: "CRITICAL · OTP",
    sub: "sign-in code · Rohan's new phone",
    subN: "OTP · Rohan",
    tone: "bad",
    rows: [
      ["skip", "P", "skip", "skip"],
      ["-", "P", "-", "-"],
      ["-", "P", "-", "-"],
      ["-", "now", "-", "-"],
    ],
    reveal: [0, 1, 1, 2],
    notes: ["", "locked", "ignored", ""],
    foot: ["one SMS now, validity 120 s; the code itself lasts 5 min", "SMS now, 120 s validity", "ok"],
  },
};

function Scene({ variant, step, t, narrow }: SceneProps) {
  const plan = PLANS[variant] || PLANS.payment;
  const last = Math.max(...plan.reveal);
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={plan.tone}>
        {plan.head}
      </Txt>
      <Txt x={24} y={60} k="s" anchor="start">
        {narrow ? plan.subN : plan.sub}
      </Txt>
      {CH.map((c, j) => (
        <Txt key={c} x={COL_X + j * COL_W + COL_W / 2} y={98} k="k" tone="mute">
          {c}
        </Txt>
      ))}
      {ROWS.map((r, i) => {
        const at = plan.reveal[i];
        const shown = at < step || (at === step && t > 0);
        const k = plan.reveal.slice(0, i).filter((x) => x === at).length; // stagger rows revealed together
        const o = at < step ? 1 : at === step ? seg(t, k * 0.25, k * 0.25 + 0.4) : 0;
        const live = at === step;
        const y = ROW_Y0 + i * ROW_H;
        const fin = i === ROWS.length - 1;
        return (
          <g key={r}>
            {fin && <line x1={24} x2={576} y1={y - 7} y2={y - 7} className="cs-rule" />}
            <Txt x={24} y={y + 20} k={fin ? "k" : "s"} anchor="start" tone={shown ? (live ? "lit" : undefined) : "mute"}>
              {r}
            </Txt>
            {!narrow && plan.notes[i] && shown && (
              <Txt x={COL_X - 10} y={y + 20} k="s" anchor="end" tone="mute">
                {plan.notes[i]}
              </Txt>
            )}
            {plan.rows[i].map((c, j) => {
              const [wide, short, tone] = LABEL[c] || LABEL["-"];
              const x = COL_X + j * COL_W + 4;
              const blank = c === "-";
              return (
                <g key={j} opacity={shown ? Math.max(0.15, Math.min(1, o)) : 0.12}>
                  <rect x={x} y={y} width={COL_W - 8} height={30} className={`ax-box${shown && !blank && tone ? ` ${tone}` : ""}`} opacity={blank ? 0.4 : 1} />
                  {shown && !blank && (
                    <Txt x={x + (COL_W - 8) / 2} y={y + 20} k="s" tone={tone}>
                      {narrow ? short : wide}
                    </Txt>
                  )}
                  {c === "X" && shown && <path d={`M${x + 6} ${y + 15}H${x + COL_W - 14}`} className="cs-x" />}
                </g>
              );
            })}
          </g>
        );
      })}
      {step >= last && (
        <Txt x={24} y={314} k="s" anchor="start" tone={plan.foot[2]} opacity={seg(t, 0.5, 0.9)}>
          {narrow ? plan.foot[1] : plan.foot[0]}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cs-x{stroke:var(--ax-bad);stroke-width:2}.cs-rule{stroke:var(--ax-line);stroke-width:1.5}`,
  variants: [
    {
      id: "payment",
      label: "Payment",
      steps: [
        { caption: "A payment is transactional: the class policy sends in-app first, with push and then email as fallbacks. SMS joins only if the user asked for it on payments.", tween: 1200 },
        { caption: "Priya hasn't asked for SMS on payments, so it stays out; it's daytime, so quiet hours change nothing.", tween: 1400 },
        { caption: 'In-app goes first, over her live connection. Push follows only if no device acks within a few seconds, then email; in-app with no live socket counts as "no ack".', tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "marketing",
      label: "Marketing at 23:00",
      steps: [
        { caption: "A marketing push is bulk: push first, email as the fallback, never SMS.", tween: 1200 },
        { caption: "She's opted in, but 23:00 is inside her quiet hours (22:00–08:00 in her own time zone), so the send is deferred to the window's end, not dropped.", tween: 1400 },
        { caption: "It goes out at 08:00, spread with the other held pushes over 08:00–08:20, still with email as the fallback. Nothing buzzes the phone at night.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "security",
      label: "Fraud alert",
      steps: [
        { caption: "A fraud alert is critical: an inbox row and push first, then SMS, then email. Critical notifications can't be opted out of.", tween: 1200 },
        { caption: "Same 23:00, but critical ignores quiet hours: a 2 am fraud alert is the point.", tween: 1400 },
        { caption: "The inbox row and the push go now. Still unread after 2 minutes: SMS; after 10 more: email. A read on any device cancels the steps not yet taken.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "otp",
      label: "OTP",
      steps: [
        { caption: "An OTP is critical too, but a code is useless late, so it skips the ladder: SMS at once, no push or email fallback, and no inbox item, since a code shouldn't sit in a list.", tween: 1200 },
        { caption: "Like any critical message, it can't be turned off and ignores quiet hours.", tween: 1400 },
        { caption: "One SMS now, on the critical lane. The code is valid for 5 minutes and the SMS carries a 120-second validity period, so a text that arrives still has time to be typed.", tween: 1600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
