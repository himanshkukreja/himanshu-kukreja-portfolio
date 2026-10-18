/**
 * Slowly changing dimensions (week 8, day 3 · 3.1–3.3): John (customer_id 123) moves from Standard
 * to Premium in June. Type 1 overwrites and his Q1 sale turns Premium; Type 2 closes row 1
 * (valid_to 2024-05-31), opens row 2 (Premium from 2024-06-01), and each sale keeps the key it was
 * loaded with, so the join is point-in-time with no date condition.
 */
import { defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const HEAD_Y = 74;
const rowY = (i: number) => 104 + i * 32;
const COLS2 = [36, 84, 134, 256, 380, 496];

type Cell = { v: string; tone?: Tone };

function Row({ y, cells, xs, tone, opacity }: { y: number; cells: Cell[]; xs: number[]; tone?: Tone; opacity?: number }) {
  return (
    <g opacity={opacity}>
      <rect className={`sc-row${tone ? ` ${tone}` : ""}`} x={24} y={y - 20} width={552} height={30} />
      {cells.map((c, i) => (
        <Txt key={i} x={xs[i]} y={y} k="s" anchor="start" tone={c.tone}>
          {c.v}
        </Txt>
      ))}
    </g>
  );
}

function Lists({ narrow, facts, results, resO, factO }: { narrow: boolean; facts: { text: string; tone?: Tone; o?: number }[]; results: { text: string; tone?: Tone }[]; resO: number; factO?: number }) {
  return (
    <g>
      <Txt x={24} y={214} k="k" anchor="start">
        fact_sales
      </Txt>
      {facts.map((f, i) => (
        <Txt key={i} x={24} y={244 + i * 28} k="s" anchor="start" tone={f.tone} opacity={(f.o ?? 1) * (factO ?? 1)}>
          {f.text}
        </Txt>
      ))}
      <g opacity={resO}>
        <rect className="ax-box" x={318} y={196} width={258} height={98} />
        <Txt x={332} y={218} k="k" anchor="start">
          {narrow ? "by segment" : "revenue by segment"}
        </Txt>
        {results.map((r, i) => (
          <Txt key={i} x={332} y={246 + i * 28} k="s" anchor="start" tone={r.tone}>
            {r.text}
          </Txt>
        ))}
      </g>
    </g>
  );
}

function Type1({ step, t, narrow }: SceneProps) {
  const over = step === 1 ? seg(t, 0.3, 0.7) : step >= 1 ? 1 : 0;
  const seg1 = over >= 0.5 ? "Premium" : "Standard";
  const xs = [36, 150, 300];
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={step >= 1 ? "warn" : undefined}>
        {step === 0 ? (narrow ? "January · type 1" : "dim_customer · January · type 1") : narrow ? "June · overwrite" : "dim_customer · June · overwrite"}
      </Txt>
      {(narrow ? ["ID", "NAME", "SEGMENT"] : ["customer_id", "name", "segment"]).map((h, i) => (
        <Txt key={h} x={xs[i]} y={HEAD_Y} k="k" anchor="start" tone="mute">
          {h}
        </Txt>
      ))}
      <Row y={rowY(0)} xs={xs} tone={step === 1 ? "warn" : step === 2 ? "bad" : undefined} cells={[{ v: "123" }, { v: "John" }, { v: seg1, tone: over >= 0.5 ? "warn" : undefined }]} />
      {step >= 1 && (
        <Txt x={24} y={rowY(1) + 4} k="s" anchor="start" tone="bad" opacity={over}>
          {narrow ? "Standard is gone" : "history lost: no trace that John was ever Standard"}
        </Txt>
      )}
      <Lists
        narrow={narrow}
        facts={[{ text: narrow ? "Q1 sale → id 123" : "Q1 sale → customer_id 123", tone: step === 2 ? "bad" : "sky" }]}
        results={[{ text: narrow ? "Q1 → Premium ✗" : "Q1 sale → Premium ✗", tone: "bad" }, { text: narrow ? "should be Standard" : "Q1 split should say Standard", tone: "mute" }]}
        resO={step === 2 ? seg(t, 0.2, 0.7) : 0}
      />
    </g>
  );
}

function Type2({ step, t, narrow }: SceneProps) {
  const close = step === 1 ? seg(t, 0.3, 0.7) : step >= 1 ? 1 : 0;
  const open = step === 2 ? seg(t, 0.1, 0.6) : step >= 2 ? 1 : 0;
  const q = step === 3 ? seg(t, 0.2, 0.7) : 0;
  const heads = narrow ? ["KEY", "ID", "SEGMENT", "FROM", "TO", "CURRENT"] : ["key", "id", "segment", "valid_from", "valid_to", "is_current"];
  const kicker = ["dim_customer · January", "June load · hash changed", "June load · new version", "query · join on customer_key"][step];
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start" tone={step === 1 ? "warn" : step === 3 ? "ok" : undefined}>
        {narrow ? kicker.replace("dim_customer · ", "").replace(" · join on customer_key", "") : kicker}
      </Txt>
      {heads.map((h, i) => (
        <Txt key={h} x={COLS2[i]} y={HEAD_Y} k="k" anchor="start" tone="mute">
          {h}
        </Txt>
      ))}
      <Row
        y={rowY(0)}
        xs={COLS2}
        tone={step === 1 ? "warn" : step === 3 ? "sky" : undefined}
        cells={[
          { v: "1", tone: "sky" },
          { v: "123" },
          { v: "Standard" },
          { v: "2024-01-01" },
          { v: close >= 0.5 ? "2024-05-31" : "NULL", tone: close >= 0.5 && step === 1 ? "warn" : close >= 0.5 ? undefined : "mute" },
          { v: close >= 0.5 ? "FALSE" : "TRUE", tone: close >= 0.5 ? (step === 1 ? "warn" : "mute") : "ok" },
        ]}
      />
      {open > 0 && (
        <Row
          y={rowY(1)}
          xs={COLS2}
          opacity={open}
          tone={step === 2 ? "lit" : step === 3 ? "lit" : undefined}
          cells={[{ v: "2", tone: "lit" }, { v: "123" }, { v: "Premium" }, { v: "2024-06-01" }, { v: "NULL", tone: "mute" }, { v: "TRUE", tone: "ok" }]}
        />
      )}
      <Lists
        narrow={narrow}
        facts={[
          { text: narrow ? "Q1 sale → key 1" : "Q1 sale → customer_key 1", tone: "sky" },
          { text: narrow ? "June sale → key 2" : "June sale → customer_key 2", tone: "lit", o: open },
        ]}
        results={[
          { text: narrow ? "Q1 → Standard ✓" : "Q1 sale → Standard ✓", tone: "ok" },
          { text: narrow ? "June → Premium ✓" : "June sale → Premium ✓", tone: "ok" },
        ]}
        resO={q}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "type2" ? <Type2 {...p} /> : <Type1 {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.sc-row{fill:none;stroke:var(--ax-line-soft);stroke-width:1.5}.sc-row.warn{stroke:var(--ax-amber);stroke-width:2}.sc-row.bad{stroke:var(--ax-bad);stroke-width:2}.sc-row.lit{stroke:var(--ax-accent);stroke-width:2}.sc-row.sky{stroke:var(--ax-sky);stroke-width:2}`,
  variants: [
    {
      id: "type1",
      label: "Type 1 · overwrite",
      steps: [
        { caption: "Type 1 keeps one row per customer: John (customer_id 123) is Standard. His Q1 sale points to customer_id 123.", ms: 3200 },
        { caption: "In June, Type 1 overwrites the segment with Premium. Simple, no extra storage, but the history is gone.", tween: 1400, ms: 3200 },
        { caption: "Q1 revenue by segment now counts John's Q1 purchases as Premium, so the Q1 split by segment is wrong.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "type2",
      label: "Type 2 · new row",
      steps: [
        { caption: "January: John (customer_id 123) is Standard in row customer_key 1. His Q1 sale is stored with customer_key 1.", ms: 3200 },
        { caption: "June load: the hash of the tracked columns changed, so row 1 closes: valid_to 2024-05-31, is_current FALSE.", tween: 1400, ms: 3200 },
        { caption: "A new row, customer_key 2, opens as Premium from 2024-06-01. John's June sale is stored with key 2.", tween: 1400, ms: 3200 },
        { caption: "Revenue by segment joins on customer_key alone: the Q1 sale stays Standard, the June sale counts as Premium.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
