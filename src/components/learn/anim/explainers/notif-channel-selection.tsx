/**
 * Channel selection (week 6, day 1 · 4.1 / 4.3 / 7.3): the selector starts from the type's
 * channel matrix, then filters by preferences, quiet hours (22:00–08:00 lets only Email and
 * In-App through, unless the notification is CRITICAL) and availability, and orders primary
 * before fallback. Three notifications: a payment, a marketing email at night, a fraud alert.
 */
import { defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const CH = ["PUSH", "SMS", "EMAIL", "IN-APP"];
const COL_X = 214;
const COL_W = 92;
const ROWS = ["type matrix", "preferences", "quiet hours", "device token", "send"];
const ROW_Y0 = 120;
const ROW_H = 40;

/** cell codes: P primary · F fallback · X dropped here · - not in play · 1/2 send order · = unchanged */
type Cell = "P" | "F" | "X" | "-" | "1" | "1+" | "2";
type Plan = { head: string; sub: string; subN: string; tone: Tone; rows: Cell[][]; reveal: number[]; notes: string[] };

const PLANS: Record<string, Plan> = {
  payment: {
    head: "TRANSACTION · HIGH",
    sub: "payment_received · user-123 · daytime",
    subN: "payment · user-123",
    tone: "lit",
    rows: [
      ["P", "F", "F", "-"],
      ["P", "X", "F", "-"],
      ["P", "-", "F", "-"],
      ["P", "-", "F", "-"],
      ["1", "-", "2", "-"],
    ],
    reveal: [0, 1, 2, 2, 2],
    notes: ["", "SMS off", "not quiet", "token ok", ""],
  },
  marketing: {
    head: "MARKETING · LOW",
    sub: "newsletter · 23:00 · quiet hours 22:00-08:00",
    subN: "newsletter · 23:00",
    tone: "sky",
    rows: [
      ["F", "-", "P", "-"],
      ["F", "-", "P", "-"],
      ["X", "-", "P", "-"],
      ["-", "-", "P", "-"],
      ["-", "-", "1", "-"],
    ],
    reveal: [0, 0, 1, 2, 2],
    notes: ["", "opted in", "quiet", "", ""],
  },
  security: {
    head: "SECURITY · CRITICAL",
    sub: "fraud alert · 23:00 · quiet hours 22:00-08:00",
    subN: "fraud alert · 23:00",
    tone: "bad",
    rows: [
      ["P", "P", "F", "-"],
      ["P", "P", "F", "-"],
      ["P", "P", "F", "-"],
      ["P", "P", "F", "-"],
      ["1+", "1+", "2", "-"],
    ],
    reveal: [0, 0, 1, 2, 2],
    notes: ["", "", "bypassed", "token ok", ""],
  },
};

const LABEL: Record<Cell, [string, string, Tone]> = {
  P: ["primary", "main", "lit"],
  F: ["fallback", "backup", "sky"],
  X: ["dropped", "drop", "bad"],
  "-": ["", "", "mute"],
  "1": ["send 1st", "1st", "ok"],
  "1+": ["at once", "now", "ok"],
  "2": ["if fails", "next", "sky"],
};

function Scene({ variant, step, t, narrow }: SceneProps) {
  const plan = PLANS[variant] || PLANS.payment;
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={plan.tone}>
        {plan.head}
      </Txt>
      <Txt x={24} y={60} k="s" anchor="start">
        {narrow ? plan.subN : plan.sub}
      </Txt>
      {CH.map((c, j) => (
        <Txt key={c} x={COL_X + j * COL_W + COL_W / 2} y={100} k="k" tone="mute">
          {c}
        </Txt>
      ))}
      {ROWS.map((r, i) => {
        const at = plan.reveal[i];
        const shown = at < step || (at === step && t > 0);
        const k = plan.reveal.slice(0, i).filter((r) => r === at).length; // stagger rows revealed together
        const o = at < step ? 1 : at === step ? seg(t, k * 0.25, k * 0.25 + 0.4) : 0;
        const live = at === step;
        const y = ROW_Y0 + i * ROW_H;
        const last = i === ROWS.length - 1;
        return (
          <g key={r}>
            {last && <line x1={24} x2={576} y1={y - 6} y2={y - 6} className="cs-rule" />}
            <Txt x={24} y={y + 20} k={last ? "k" : "s"} anchor="start" tone={shown ? (live ? "lit" : undefined) : "mute"}>
              {r}
            </Txt>
            {!narrow && plan.notes[i] && shown && (
              <Txt x={COL_X - 10} y={y + 20} k="s" anchor="end" tone="mute">
                {plan.notes[i]}
              </Txt>
            )}
            {plan.rows[i].map((c, j) => {
              const [wide, short, tone] = LABEL[c];
              const x = COL_X + j * COL_W + 4;
              return (
                <g key={j} opacity={shown ? Math.max(0.15, Math.min(1, o)) : 0.12}>
                  <rect x={x} y={y} width={COL_W - 8} height={30} className={`ax-box${shown && c !== "-" && tone ? ` ${tone}` : ""}`} opacity={c === "-" ? 0.4 : 1} />
                  {shown && c !== "-" && (
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
        { caption: "A TRANSACTION starts from the type matrix: Push primary, SMS and Email as fallbacks.", tween: 1200 },
        { caption: "user-123's preferences say Push (primary), Email (fallback), so SMS drops out.", tween: 1200 },
        { caption: "Not quiet hours and a device token exists: send Push first, keep Email as the fallback.", tween: 1600, ms: 3400 },
      ],
    },
    {
      id: "marketing",
      label: "Marketing at 23:00",
      steps: [
        { caption: "A MARKETING message: Email primary, Push only as a fallback the user opted in to.", tween: 1200 },
        { caption: "23:00 is inside quiet hours (22:00-08:00): only non-intrusive Email and In-App pass, so Push drops.", tween: 1200 },
        { caption: "Result: one email and nothing buzzing the phone at night.", tween: 1400, ms: 3400 },
      ],
    },
    {
      id: "security",
      label: "Fraud alert",
      steps: [
        { caption: "A SECURITY alert is CRITICAL: Push and SMS are both primary, sent simultaneously, Email the fallback.", tween: 1200 },
        { caption: "Same 23:00 quiet hours, but CRITICAL notifications bypass them: nothing is filtered.", tween: 1200 },
        { caption: "Push and SMS go out at once, with Email ready as the fallback.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
