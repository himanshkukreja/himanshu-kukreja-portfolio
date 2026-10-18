/**
 * Erasure orchestration (week 9, day 4 · 3.1 / 4.1): DeletionService runs DELETION_TARGETS in
 * priority groups (2 search, 3 files, 4 analytics, 5 third parties, 10 PostgreSQL, 11 caches), same
 * priority in parallel; a failure stops later groups (PARTIALLY_COMPLETED) and a retry resumes;
 * verification checks every system before COMPLETED.
 */
import { defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const GROUPS = [
  { p: 2, why: "search", items: [["elasticsearch", "ES index"]] },
  { p: 3, why: "files", items: [["s3_files", "files"], ["s3_uploads", "uploads"]] },
  { p: 4, why: "analytics", items: [["bigquery", "BigQuery"], ["mixpanel", "Mixpanel"]] },
  { p: 5, why: "third parties", items: [["stripe", "Stripe"], ["zendesk", "Zendesk"], ["intercom", "Intercom"], ["mailchimp", "Mailchimp"]] },
  { p: 10, why: "primary DB", items: [["postgresql", "Postgres"]] },
  { p: 11, why: "caches", items: [["redis_cache", "Redis"], ["cdn_cache", "CDN"]] },
] as const;
const X0 = 76;
const BG = 4;
const bw = (n: number) => (n === 4 ? 122 : 150);
const rowY = (g: number) => 58 + g * 40;

type St = "pending" | "run" | "done" | "fail" | "check";

function Grid({ narrow, state }: { narrow: boolean; state: (g: number, i: number) => St }) {
  return (
    <g>
      {GROUPS.map((g, gi) => (
        <g key={g.p}>
          <Txt x={24} y={rowY(gi) + 20} k="t" anchor="start">{`P${g.p}`}</Txt>
          {g.items.map(([name, short], i) => {
            const s = state(gi, i);
            const tone: Tone = s === "done" ? "ok" : s === "fail" ? "bad" : s === "run" ? "lit" : s === "check" ? "sky" : undefined;
            const BW = bw(g.items.length);
            const x = X0 + i * (BW + BG);
            return (
              <g key={name} opacity={s === "pending" ? 0.6 : 1}>
                <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={x} y={rowY(gi)} width={BW} height={30} />
                <Txt x={x + 9} y={rowY(gi) + 20} k="s" anchor="start" tone={tone}>
                  {narrow ? short : name}
                </Txt>
                <Txt x={x + BW - 8} y={rowY(gi) + 20} k="s" anchor="end" tone={tone}>
                  {s === "done" ? "✓" : s === "fail" ? "✗" : s === "check" ? "?" : ""}
                </Txt>
              </g>
            );
          })}
          {!narrow && g.items.length < 4 && (
            <Txt x={X0 + g.items.length * (bw(g.items.length) + BG) + 4} y={rowY(gi) + 20} k="s" anchor="start" tone="mute">
              {g.why}
            </Txt>
          )}
        </g>
      ))}
    </g>
  );
}

function Head({ status, tone, right }: { status: string; tone?: Tone; right: string }) {
  return (
    <g>
      <Txt x={24} y={32} k="k" anchor="start" tone={tone}>
        {status}
      </Txt>
      <Txt x={576} y={32} k="s" anchor="end">
        {right}
      </Txt>
    </g>
  );
}

/** groups run one after another; `prog` counts finished groups (fractional while one runs) */
function Run({ step, t, narrow }: SceneProps) {
  const prog = step === 0 ? 0 : step === 1 ? seg(t, 0.05, 0.95) * 3 : step === 2 ? 3 + seg(t, 0.05, 0.95) * 2 : 5 + seg(t, 0.05, 0.3);
  const verify = step === 3 ? seg(t, 0.4, 0.9) : 0;
  const state = (g: number): St => {
    if (verify > 0) return verify >= 1 ? "done" : "check";
    if (g + 1 <= prog + 1e-6) return "done";
    if (step > 0 && g < prog) return "run";
    return "pending";
  };
  const status = step === 0 ? "request · PENDING" : verify >= 1 ? "COMPLETED · user notified" : verify > 0 ? "AWAITING_VERIFICATION" : "IN_PROGRESS";
  return (
    <g>
      <Head status={narrow ? status.replace(" · user notified", "") : status} tone={verify >= 1 ? "ok" : undefined} right={narrow ? "30 days" : "deadline: 30 days"} />
      <Grid narrow={narrow} state={(g) => state(g)} />
      {step === 2 && (
        <Txt x={24} y={H - 12} k="s" anchor="start" tone="mute" opacity={seg(t, 0.3, 0.7)}>
          {narrow ? "Postgres last: user_id mapping" : "PostgreSQL waits: others need its user_id mapping"}
        </Txt>
      )}
      {step === 3 && (
        <Txt x={24} y={H - 12} k="s" anchor="start" tone={verify > 0 ? "sky" : "mute"}>
          {verify > 0 ? (narrow ? "check_user_exists → none" : "verify: check_user_exists in every system → none found") : narrow ? "caches last: no refill" : "caches last, so a read can't refill them from undeleted rows"}
        </Txt>
      )}
    </g>
  );
}

function Fail({ step, t, narrow }: SceneProps) {
  const runP5 = step === 0 ? seg(t, 0.2, 0.8) : 1;
  const retry = step === 2 ? seg(t, 0.1, 0.95) * 3 : 0; // stripe, postgres, caches
  const state = (g: number, i: number): St => {
    if (g < 3) return "done";
    if (g === 3) {
      if (i === 0) {
        if (step === 2) return retry >= 1 ? "done" : "run";
        return runP5 >= 1 ? "fail" : "run";
      }
      return runP5 >= 1 ? "done" : "run";
    }
    if (step === 2) {
      const k = g === 4 ? 1 : 2;
      return retry >= k + 1 ? "done" : retry >= k ? "run" : "pending";
    }
    return "pending";
  };
  const status = step === 0 ? (runP5 >= 1 ? "Stripe: timeout" : "IN_PROGRESS") : step === 1 ? "PARTIALLY_COMPLETED" : retry >= 3 ? "AWAITING_VERIFICATION" : "retry · IN_PROGRESS";
  return (
    <g>
      <Head
        status={status}
        tone={step === 1 || (step === 0 && runP5 >= 1) ? "bad" : retry >= 3 ? "ok" : undefined}
        right={step === 2 ? (narrow ? "done skipped" : "completed targets skipped") : step === 1 ? (narrow ? "loop stops" : "loop stops · nothing rolled back") : narrow ? "P2–P4 ✓" : "P2–P4 completed"}
      />
      <Grid narrow={narrow} state={state} />
      {step === 1 && (
        <line className="ed-stop" x1={24} x2={576} y1={rowY(4) - 5} y2={rowY(4) - 5} opacity={seg(t, 0.2, 0.7)} />
      )}
      {step === 1 && (
        <Txt x={24} y={H - 12} k="s" anchor="start" tone="mute" opacity={seg(t, 0.4, 0.9)}>
          {narrow ? "P10 and P11 stay pending" : "PostgreSQL and the caches stay pending until a retry"}
        </Txt>
      )}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "fail" ? <Fail {...p} /> : <Run {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.ed-stop{stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:6 5}`,
  variants: [
    {
      id: "run",
      label: "Orchestration",
      steps: [
        { caption: "An erasure request is created PENDING with a 30-day deadline, listing every system that holds the user's data.", ms: 3200 },
        { caption: "Targets run in priority order; same-priority targets run in parallel: search, then files, then analytics.", tween: 3000, ms: 2400 },
        { caption: "Third parties at 5, then PostgreSQL at 10: analytics needed its user_id mapping, and it holds the foreign keys.", tween: 2200, ms: 2800 },
        { caption: "Caches go last, so a read can't refill them. Verification checks every system; then COMPLETED and the user is notified.", tween: 2600, ms: 3600 },
      ],
    },
    {
      id: "fail",
      label: "A target fails",
      steps: [
        { caption: "Priorities 2 to 4 succeed. At priority 5, Stripe times out while Zendesk, Intercom and Mailchimp succeed.", tween: 1600, ms: 3000 },
        { caption: "The loop stops: PostgreSQL and the caches stay pending. Nothing is rolled back; the request is PARTIALLY_COMPLETED.", tween: 1400, ms: 3400 },
        { caption: "A retry skips completed targets and resumes at Stripe; only a fully successful run reaches AWAITING_VERIFICATION.", tween: 2600, ms: 3400 },
      ],
    },
  ],
  Scene,
});
