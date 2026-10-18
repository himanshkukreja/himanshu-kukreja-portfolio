/**
 * Durable execution (week 5, day 3 · 1.1–1.3): plain code loses its place on a crash; Temporal
 * records every step in the workflow's event history, and a new worker replays it: completed
 * activities return their stored result (res-456) instead of running again, then execution
 * continues with charge_payment.
 */
import { defineExplainer, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const WK = { x: 24, y: 40, w: 220, h: 222 };
const HI = { x: 264, y: 40, w: 312, h: 222 };
const CODE = ["reserve_inventory", "charge_payment", "create_shipment"];
const CODE_Y = [128, 170, 212];
const EVENTS: { name: string; short: string; arg: string }[] = [
  { name: "WorkflowExecutionStarted", short: "WorkflowStarted", arg: "order-123" },
  { name: "ActivityTaskScheduled", short: "ActivityScheduled", arg: "reserve_inventory" },
  { name: "ActivityTaskCompleted", short: "ActivityCompleted", arg: "res-456" },
  { name: "ActivityTaskScheduled", short: "ActivityScheduled", arg: "charge_payment" },
];
const ROW_Y = (i: number) => HI.y + 50 + i * 43;

type Mark = "todo" | "run" | "done" | "replay" | "lost";
const MARK_TONE: Record<Mark, Tone> = { todo: "mute", run: "lit", done: "ok", replay: "sky", lost: "bad" };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const durable = variant === "durable";
  let marks: Mark[] = ["todo", "todo", "todo"];
  let events = 0; // rows written so far
  let crashed = false;
  let worker = durable ? "worker 1" : "order service";
  let cursor = -1; // replay cursor row
  let note = "";
  let noteTone: Tone = undefined;

  if (!durable) {
    if (step === 0) {
      marks = [t < 0.6 ? "run" : "done", t < 0.6 ? "todo" : "run", "todo"];
      note = t < 0.6 ? "reserving…" : "reservation in memory only";
    } else {
      crashed = t > 0.25;
      marks = crashed ? ["lost", "lost", "lost"] : ["done", "run", "todo"];
      note = crashed ? (narrow ? "reserve again?" : "restart: reserve again? stuck?") : "";
      noteTone = "bad";
    }
  } else if (step === 0) {
    events = Math.min(4, Math.floor(seg(t, 0, 0.9) * 4) + 1);
    marks = [events >= 3 ? "done" : "run", events >= 4 ? "run" : "todo", "todo"];
    note = events >= 4 ? "charge_payment scheduled" : "recording events";
  } else if (step === 1) {
    events = 4;
    crashed = t > 0.3;
    marks = crashed ? ["lost", "lost", "lost"] : ["done", "run", "todo"];
    note = crashed ? "history is safe in the DB" : "";
    noteTone = crashed ? "ok" : undefined;
  } else if (step === 2) {
    events = 4;
    worker = "worker 2";
    const p = seg(t, 0.1, 0.95);
    cursor = Math.min(2, Math.floor(p * 3));
    marks = [cursor >= 2 ? "replay" : "todo", "todo", "todo"];
    note = cursor >= 2 ? "stored result · not re-run" : "replaying history";
    noteTone = "sky";
  } else {
    events = 4;
    worker = "worker 2";
    cursor = 3;
    marks = ["replay", "run", "todo"];
    note = narrow ? "activity worker runs it" : "activity worker picks it up";
    noteTone = "lit";
  }

  const wTone: Tone = crashed ? "bad" : worker === "worker 2" ? "sky" : undefined;
  return (
    <g>
      {/* the workflow worker and its code */}
      <rect className={`ax-box${wTone ? ` ${wTone}` : ""}`} x={WK.x} y={WK.y} width={WK.w} height={WK.h} />
      <Txt x={WK.x + 14} y={WK.y + 26} k="k" anchor="start" tone={crashed ? "bad" : worker === "worker 2" ? "sky" : undefined}>
        {crashed ? "crashed" : worker}
      </Txt>
      <Txt x={WK.x + 14} y={WK.y + 54} k="s" anchor="start">
        {durable ? "OrderWorkflow.run" : "process_order()"}
      </Txt>
      {CODE.map((c, i) => (
        <g key={c}>
          <rect x={WK.x + 14} y={CODE_Y[i] - 9} width={10} height={10} className={`ax-tok ${MARK_TONE[marks[i]] || ""}`} />
          <Txt x={WK.x + 32} y={CODE_Y[i]} k="s" anchor="start" tone={marks[i] === "todo" ? "mute" : MARK_TONE[marks[i]]}>
            {c}
          </Txt>
        </g>
      ))}
      {crashed && <path d={`M${WK.x + 8} ${WK.y + 8}L${WK.x + WK.w - 8} ${WK.y + WK.h - 8}M${WK.x + WK.w - 8} ${WK.y + 8}L${WK.x + 8} ${WK.y + WK.h - 8}`} className="dx-x" />}

      {/* the event history */}
      <rect className={`ax-box${durable ? (crashed ? " ok" : "") : ""}`} x={HI.x} y={HI.y} width={HI.w} height={HI.h} />
      <Txt x={HI.x + 14} y={HI.y + 26} k="k" anchor="start" tone={durable ? undefined : "mute"}>
        {!durable ? "no event history" : narrow ? "event history" : "event history · Temporal DB"}
      </Txt>
      {!durable && (
        <Txt x={HI.x + HI.w / 2} y={HI.y + HI.h / 2 + 8} k="s" tone="mute">
          {narrow ? "none: state in memory" : "no history: state lives in memory"}
        </Txt>
      )}
      {durable &&
        EVENTS.map((e, i) => {
          const shown = i < events;
          const on = i === cursor;
          const past = cursor >= 0 && i < cursor;
          const tone: Tone = on ? (cursor === 3 ? "lit" : "sky") : undefined;
          return (
            <g key={i} opacity={shown ? 1 : 0}>
              {on && <rect x={HI.x + 6} y={ROW_Y(i) - 17} width={HI.w - 12} height={narrow ? 42 : 39} className={`dx-row ${tone}`} />}
              <Txt x={HI.x + 16} y={ROW_Y(i)} k="s" anchor="start" tone={tone || (past ? "sky" : "mute")}>
                {`${i + 1}`}
              </Txt>
              <Txt x={HI.x + 38} y={ROW_Y(i)} k="s" anchor="start" tone={tone}>
                {narrow ? e.short : e.name}
              </Txt>
              <Txt x={HI.x + 38} y={ROW_Y(i) + (narrow ? 19 : 17)} k="s" anchor="start" tone={i === 2 ? "ok" : "mute"}>
                {e.arg}
              </Txt>
            </g>
          );
        })}
      {durable && step === 0 && events < 4 && <Token x={HI.x + HI.w - 20} y={ROW_Y(events - 1)} s={9} tone="lit" />}

      {/* what is happening */}
      <Txt x={WK.x} y={296} k="t" anchor="start" tone={noteTone}>
        {note}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.dx-x{stroke:var(--ax-bad);stroke-width:2;opacity:.55}.dx-row{fill:none;stroke-width:1.5}.dx-row.sky{stroke:var(--ax-sky)}.dx-row.lit{stroke:var(--ax-accent)}`,
  variants: [
    {
      id: "plain",
      label: "Normal code",
      steps: [
        { caption: "Normal code: reserve_inventory succeeds, but the reservation is tracked only in the function's memory.", tween: 2000 },
        { caption: "Crash. Function state is lost: restart and reserve again (double reserve), or don't, and the order is stuck.", tween: 1600, ms: 3600 },
      ],
    },
    {
      id: "durable",
      label: "Durable execution",
      steps: [
        { caption: "Temporal records each step as an event: started, reserve_inventory scheduled and completed (res-456), charge_payment scheduled.", tween: 3200, ms: 3000 },
        { caption: "The workflow worker crashes mid-workflow. Its event history survives in Temporal's database.", tween: 1400 },
        { caption: "A new worker replays from the start: reserve_inventory returns its stored result, res-456, without re-executing.", tween: 3000, ms: 3000 },
        { caption: "Replay reaches event 4 and execution continues: an activity worker picks up charge_payment.", tween: 1200, ms: 3400 },
      ],
    },
  ],
  Scene,
});
