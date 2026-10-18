/**
 * Audit log hash chain (week 3, day 5 · 2.3 principle 2 / 6.3 / 9.4): each event stores the
 * previous event's hash (#1000 → abc123). Editing #1001 makes its recomputed hash disagree with the
 * stored one; rewriting every later hash verifies again, which is why the latest hash is also
 * checkpointed somewhere the attacker can't change (WORM storage). Hash values are illustrative.
 */
import { clamp, defineExplainer, seg, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 290;
const BW = 126;
const BY = 66;
const BH = 112;
const BX = [18, 160, 302, 444];
const IDS = ["#1000", "#1001", "#1002", "#1003"];
const ACTORS = ["usr_123", "usr_456", "usr_789", "usr_123"];
const HASH = ["abc123", "9f2e71", "c08b5a", "e7d310"];
const REHASH = ["abc123", "5b1c0e", "77ad02", "3e9f4c"]; // after the rewrite
const CK = { x: 386, y: 222, w: 196, h: 56 };

type Row = { prev: string; hash: string; actor: string; prevTone?: Tone; hashTone?: Tone; actorTone?: Tone };

function Scene({ variant, step, t, narrow }: SceneProps) {
  const rewrite = variant === "rewrite";
  const rows: Row[] = IDS.map((_, i) => ({ prev: i === 0 ? "…" : HASH[i - 1], hash: HASH[i], actor: ACTORS[i] }));
  const marks: (null | "ok" | "bad")[] = [null, null, null, null];
  let scan = -1;
  let status = "";
  let statusTone: Tone = undefined;
  let integrity = "valid";
  let intTone: Tone = "ok";
  let link = 1; // how much of each prev→hash link is lit (step 0 of "edit")
  let recomputed = "";
  let ck = 0;
  let compare = false;
  const edited = rewrite ? step > 0 || t > 0.2 : step >= 2 || (step === 1 && t > 0.4);
  if (edited) {
    rows[1].actor = "usr_999";
    rows[1].actorTone = "bad";
  }
  if (!rewrite) {
    if (step === 0) link = t;
    if (step === 2) {
      scan = t < 0.3 ? 0 : 1;
      marks[0] = t >= 0.3 ? "ok" : null;
      if (t >= 0.65) {
        marks[1] = "bad";
        recomputed = "5b1c0e";
        status = narrow ? "mismatch #1001" : "hash_mismatch · #1001";
        statusTone = "bad";
        integrity = "compromised";
        intTone = "bad";
      }
    }
  } else {
    // the attacker recomputes every later hash, left to right
    const swept = step === 0 ? [0.4, 0.6, 0.8].filter((a) => t >= a).length : 3;
    for (let i = 1; i <= swept; i++) {
      rows[i].hash = REHASH[i];
      rows[i].hashTone = "warn";
      if (i < 3) {
        rows[i + 1].prev = REHASH[i];
        rows[i + 1].prevTone = "warn";
      }
    }
    if (step === 0 && t >= 0.9) {
      status = narrow ? "chain verifies" : "chain verifies again";
      statusTone = "warn";
      marks.fill("ok");
    }
    if (step >= 1) {
      ck = step === 1 ? clamp(t * 2) : 1;
      status = narrow ? "chain verifies" : "chain verifies again";
      statusTone = "warn";
    }
    if (step === 2) {
      compare = t > 0.3;
      if (t >= 0.6) {
        status = narrow ? "head ≠ checkpoint" : "head 3e9f4c ≠ e7d310";
        statusTone = "bad";
        integrity = "compromised";
        intTone = "bad";
      }
    }
  }
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start">
        {narrow ? "hash chain" : "audit_events · hash chain"}
      </Txt>
      <Txt x={W - 24} y={30} k="k" anchor="end" tone="mute">
        integrity
      </Txt>
      <Txt x={W - 24} y={54} anchor="end" tone={intTone}>
        {integrity}
      </Txt>
      {rows.map((r, i) => {
        const x = BX[i];
        const tone = marks[i] === "bad" ? "bad" : scan === i ? "lit" : edited && i === 1 ? "warn" : marks[i] === "ok" ? "ok" : "";
        const showLinks = !rewrite && step === 0;
        const linkOn = i < 3 && showLinks ? seg(link, i / 3, (i + 1) / 3) : 0;
        const prevOn = showLinks && i > 0 && seg(link, (i - 1) / 3, i / 3) >= 1;
        return (
          <g key={IDS[i]}>
            <rect className={`ax-box ${tone}`} x={x} y={BY} width={BW} height={BH} />
            <Txt x={x + 10} y={BY + 24} anchor="start">
              {IDS[i]}
            </Txt>
            <Txt x={x + 10} y={BY + 48} k="s" anchor="start" tone={r.actorTone}>
              {r.actor}
            </Txt>
            <Txt x={x + 10} y={BY + 72} k="s" anchor="start" tone={r.prevTone || (prevOn ? "lit" : undefined)}>
              {`prev ${r.prev}`}
            </Txt>
            <Txt x={x + 10} y={BY + 96} k="s" anchor="start" tone={r.hashTone || (i < 3 && linkOn > 0 ? "lit" : undefined)}>
              {`hash ${r.hash}`}
            </Txt>
            {i < 3 && (
              <path
                className={`ah-link${r.hashTone ? " warn" : linkOn >= 1 ? " lit" : ""}`}
                d={`M${x + BW} ${BY + 92}H${x + BW + 8}V${BY + 68}H${BX[i + 1] - 1}`}
                markerEnd={linkOn >= 1 && !r.hashTone ? "url(#ax-arrow-lit)" : "url(#ax-arrow)"}
                opacity={showLinks ? 0.35 + 0.65 * linkOn : 1}
              />
            )}
            {marks[i] && (
              <Txt x={x + BW / 2} y={BY + BH + 22} k="s" tone={marks[i] === "ok" ? "ok" : "bad"}>
                {marks[i] === "ok" ? "✓" : narrow ? "✗" : "✗ recomputed"}
              </Txt>
            )}
            {i === 1 && recomputed && (
              <Txt x={x + BW / 2} y={BY + BH + 42} k="s" tone="bad">
                {`→ ${recomputed}`}
              </Txt>
            )}
          </g>
        );
      })}
      {scan >= 0 && <rect className="ah-scan" x={BX[scan] - 5} y={BY - 5} width={BW + 10} height={BH + 10} />}
      {/* the checkpoint */}
      {rewrite && ck > 0 && (
        <g opacity={ck}>
          <rect className={`ax-box ${compare && step === 2 && t >= 0.6 ? "bad" : "sky"}`} x={CK.x} y={CK.y} width={CK.w} height={CK.h} />
          <Txt x={CK.x + CK.w / 2} y={CK.y + 24}>
            {narrow ? "WORM" : "WORM checkpoint"}
          </Txt>
          <Txt x={CK.x + CK.w / 2} y={CK.y + 44} k="s" tone="sky">
            {narrow ? "e7d310" : "latest hash e7d310"}
          </Txt>
        </g>
      )}
      {compare && <path className="ah-cmp" d={`M${BX[3] + BW / 2} ${BY + BH}V${CK.y}`} />}
      {compare && t >= 0.6 && (
        <Txt x={BX[3] + BW / 2 + 12} y={(BY + BH + CK.y) / 2 + 6} anchor="start" tone="bad">
          ≠
        </Txt>
      )}
      <Txt x={24} y={240} k="k" anchor="start" tone={statusTone === "bad" ? "bad" : "mute"}>
        verify
      </Txt>
      <Txt x={24} y={268} anchor="start" tone={statusTone}>
        {status || "—"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `
.ah-link{fill:none;stroke:var(--ax-line);stroke-width:1.5}.ah-link.lit{stroke:var(--ax-accent);stroke-width:2}.ah-link.warn{stroke:var(--ax-amber);stroke-width:2}
.ah-scan{fill:none;stroke:var(--ax-accent);stroke-width:1.5;stroke-dasharray:5 4}
.ah-cmp{fill:none;stroke:var(--ax-bad);stroke-width:2;stroke-dasharray:5 4}
`,
  variants: [
    {
      id: "edit",
      label: "Edit one event",
      steps: [
        { caption: "Each audit event stores the previous event's hash: #1001 carries abc123, the hash of #1000.", tween: 2400 },
        { caption: "An attacker edits #1001's actor from usr_456 to usr_999 but leaves the stored hashes alone.", tween: 1400 },
        { caption: "Verification recomputes each hash. #1001 now hashes to 5b1c0e, not the stored 9f2e71: tampering detected.", tween: 2600, ms: 3400 },
      ],
    },
    {
      id: "rewrite",
      label: "Rewrite + checkpoint",
      steps: [
        { caption: "A smarter attacker edits #1001 and recomputes every later hash, so the chain verifies again.", tween: 3000, ms: 3000 },
        { caption: "But the latest hash was checkpointed to WORM storage: e7d310, which the attacker can't change.", tween: 1400 },
        { caption: "The rewritten head 3e9f4c disagrees with the checkpoint e7d310, so the rewrite is detected.", tween: 2000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
