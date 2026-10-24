/**
 * Week 10, day 3 overview (deployment strategies): the whole lesson in four tabs. The deployment
 * paradox and the strategies on one fleet of pods (big bang's downtime, rolling's two live
 * versions, blue-green's 2x switch, canary's 1% → 10% → 50% → 100%); feature flags that decouple
 * deploy from release; the expand-contract rename of name → full_name; and the four kinds of
 * rollback, fastest to slowest, with the habits that make them rare.
 */
import { Box, defineExplainer, ease, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type V = "old" | "new" | "down" | "idle";
const TONE: Record<V, Tone> = { old: "sky", new: "ok", down: "bad", idle: "mute" };

function Pods({ vs, y = 96, x0 = 150 }: { vs: V[]; y?: number; x0?: number }) {
  return (
    <g>
      {vs.map((v, i) => (
        <g key={i}>
          <rect className={`ax-box ${TONE[v] || ""}`} x={x0 + (i % 5) * 84} y={y + Math.floor(i / 5) * 64} width={72} height={48} opacity={v === "idle" ? 0.35 : 1} />
          <Txt x={x0 + 36 + (i % 5) * 84} y={y + 29 + Math.floor(i / 5) * 64} k="s" tone={TONE[v]}>
            {v === "down" ? "down" : v === "new" ? "v1.1" : "v1.0"}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const fill = (n: number, a: V, b: V, total = 10): V[] => Array.from({ length: total }, (_, i) => (i < n ? a : b));

/* ---------------------------------------------------------------- strategies */

function Strategies({ step, t, narrow }: SceneProps) {
  const k = ease(t);
  if (step === 0)
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          the deployment paradox
        </Txt>
        <Box x={20} y={56} w={270} h={110} label={narrow ? "to improve" : "to improve it"} sub="you must change it" tone="lit" />
        <Box x={310} y={56} w={270} h={110} label={narrow ? "to keep stable" : "to keep it stable"} sub="you must not" tone="sky" />
        <Box x={20} y={196} w={560} h={56} label={narrow ? "deploy often, deploy safely" : "deploy frequently, but deploy SAFELY"} tone="ok" opacity={seg(t, 0.5, 0.9)} />
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "small deploys, fast rollbacks" : "safest deploy: a small one · safest rollback: a fast one"}
        </Txt>
      </g>
    );
  let vs: V[] = fill(10, "old", "old");
  let note: [string, string, Tone] = ["", "", undefined];
  let blue = false;
  let pct = "";
  if (step === 1) {
    vs = t < 0.35 ? fill(10, "old", "old") : t < 0.7 ? fill(10, "down", "down") : fill(10, "new", "new");
    note = ["downtime, then every user hits v1.1 at once", "downtime, all users at once", "bad"];
  } else if (step === 2) {
    vs = fill(Math.round(k * 5), "new", "old");
    note = ["50% done: both versions live · rollback is slow", "both versions live", "warn"];
  } else if (step === 3) {
    blue = true;
    note = ["switch all traffic at once · switch back = instant rollback", "instant switch back · 2x", "ok"];
  } else {
    const st = Math.min(3, Math.floor(k * 4));
    vs = fill([1, 1, 5, 10][st], "new", "old");
    pct = ["1%", "10%", "50%", "100%"][st];
    note = ["watch 15 min: error rate and latency, canary vs stable", "canary vs stable", "ok"];
  }
  const sw = blue && t > 0.5;
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        {["", "big bang", "rolling", "blue-green", "canary"][step]}
      </Txt>
      <Box x={20} y={120} w={90} h={60} label="LB" tone="lit" />
      {!blue && <Wire d="M110 150H140" tone="lit" arrow />}
      {!blue && <Pods vs={vs} />}
      {blue && (
        <g>
          <Txt x={140} y={84} k="k" anchor="start" tone="sky">
            {narrow ? "blue" : "blue · v1.0"}
          </Txt>
          <Pods vs={fill(5, sw ? "idle" : "old", "old", 5)} y={92} />
          <Txt x={140} y={176} k="k" anchor="start" tone="ok">
            {narrow ? "green" : "green · v1.1"}
          </Txt>
          <Pods vs={fill(5, "new", "new", 5)} y={184} x0={150} />
          <Wire d={sw ? "M110 150L150 208" : "M110 150L150 116"} tone="lit" arrow />
        </g>
      )}
      {pct && (
        <Txt x={580} y={56} k="d" anchor="end" tone="lit">
          {pct}
        </Txt>
      )}
      {(step === 1 || step === 4) &&
        (step === 1 ? ["v1.0 running", "DOWNTIME", "v1.1 running"] : ["1%", "10%", "50%", "100%"]).map((s, i, a) => {
          const on = step === 1 ? t >= [0, 0.35, 0.7][i] : i <= Math.min(3, Math.floor(k * 4));
          const w = 430 / a.length;
          return (
            <g key={s}>
              <rect className={`ax-box ${on ? (s === "DOWNTIME" ? "bad" : step === 1 && i === 0 ? "sky" : "ok") : ""}`} x={150 + i * w} y={234} width={w - 8} height={30} />
              <Txt x={150 + i * w + (w - 8) / 2} y={254} k="s" tone={on ? (s === "DOWNTIME" ? "bad" : undefined) : "mute"}>
                {narrow && s.endsWith(" running") ? s.split(" ")[0] : s}
              </Txt>
            </g>
          );
        })}
      {step === 1 && t >= 0.35 && t < 0.7 && (
        <Txt x={360} y={66} k="t" tone="bad">
          DOWNTIME
        </Txt>
      )}
      <Txt x={20} y={H - 16} anchor="start" tone={note[2]}>
        {note[narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- flags */

function Flags({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0) {
    const stages = ["OFF", "10%", "beta", "everyone"];
    const st = Math.min(3, Math.floor(ease(t) * 4));
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          decouple deployment from release
        </Txt>
        <Box x={20} y={56} w={250} h={80} label="deploy" sub={narrow ? "code live, OFF" : "code is live, feature OFF"} tone="sky" />
        <Box x={330} y={56} w={250} h={80} label="release" sub={narrow ? "flip the flag" : "turn the flag on"} tone="ok" />
        <Wire d="M270 96H330" tone="lit" arrow />
        {stages.map((s, i) => (
          <g key={s}>
            <rect className={`ax-box ${i <= st ? "ok" : ""}`} x={20 + i * 142} y={176} width={134} height={50} />
            <Txt x={87 + i * 142} y={206} k="t" tone={i <= st ? "ok" : "mute"}>
              {s}
            </Txt>
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start">
          {narrow ? "deploy anytime, release when ready" : "deploy anytime, release when ready"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start">
        four kinds · one lifecycle
      </Txt>
      {[
        ["release", "gradual rollout"],
        ["experiment", "A/B tests"],
        ["ops", "kill switch"],
        ["permission", "premium, beta"],
      ].map(([a, b], i) => (
        <g key={a} opacity={o(i)}>
          <Box x={20 + i * 142} y={50} w={134} h={70} label={narrow && a.length > 8 ? a.slice(0, 6) + "." : a} sub={narrow ? undefined : b} tone={i === 2 ? "lit" : "sky"} />
        </g>
      ))}
      {["create (owner, expiry)", "roll out", "100%", "REMOVE from code"].map((s, i) => (
        <g key={s} opacity={seg(t, 0.4 + i * 0.12, 0.55 + i * 0.12)}>
          <Txt x={30 + (narrow ? (i % 2) * 290 : 0)} y={narrow ? 166 + Math.floor(i / 2) * 34 : 160 + i * 28} k="t" anchor="start" tone={i === 3 ? "warn" : undefined}>
            {`${i + 1} · ${narrow ? s.split(" (")[0] : s}`}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="warn">
        {narrow ? "stale flags are tech debt" : "flags are temporary: stale flags are tech debt"}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- expand-contract */

const PHASES: { kick: string; cols: string[]; w: string; r: string; ddl: string; ddlN: string; note: [string, string]; tone: Tone }[] = [
  { kick: "the wrong way · rename directly", cols: ["full_name"], w: "uses name ✗", r: "uses full_name", ddl: "RENAME COLUMN name TO full_name", ddlN: "RENAME COLUMN", note: ["both versions run during a deploy: one of them breaks", "one version breaks"], tone: "bad" },
  { kick: "1 · expand", cols: ["name", "full_name"], w: "write both", r: "read name", ddl: "ADD COLUMN full_name", ddlN: "ADD COLUMN", note: ["migration first, then code: old and new both work", "old and new both work"], tone: "ok" },
  { kick: "2 · migrate", cols: ["name", "full_name"], w: "write both", r: "read full_name", ddl: "SET full_name = name WHERE NULL", ddlN: "backfill", note: ["backfill first, then switch reads to the new column", "backfill, then read new"], tone: "ok" },
  { kick: "3 · contract", cols: ["full_name"], w: "write full_name", r: "read full_name", ddl: "DROP COLUMN name", ddlN: "DROP COLUMN", note: ["drop the old column only after all old code is gone", "drop after old code is gone"], tone: "ok" },
];

function Migrations({ step, t, narrow }: SceneProps) {
  const p = PHASES[step];
  const o = seg(t, 0.2, 0.7);
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone={step === 0 ? "bad" : undefined}>
        {p.kick}
      </Txt>
      <rect className="ax-box" x={20} y={50} width={300} height={170} />
      <Txt x={36} y={74} k="k" anchor="start">
        users
      </Txt>
      {p.cols.map((c, i) => (
        <g key={c} opacity={step === 1 && c === "full_name" ? o : 1}>
          <Box x={36 + i * 140} y={90} w={128} h={50} label={c} tone={c === "full_name" ? "ok" : "sky"} />
        </g>
      ))}
      <Txt x={36} y={180} k="s" anchor="start" tone="lit">
        {narrow ? p.ddlN : p.ddl}
      </Txt>
      <Box x={340} y={50} w={240} h={76} label={step === 0 ? "old code" : "writes"} sub={p.w} tone={step === 0 ? "bad" : undefined} />
      <Box x={340} y={144} w={240} h={76} label={step === 0 ? "new code" : "reads"} sub={p.r} tone={step === 0 ? "ok" : undefined} />
      {step > 0 &&
        ["expand", "migrate", "contract"].map((s, i) => (
          <g key={s}>
            <rect className={`ax-box ${i + 1 === step ? "lit" : i + 1 < step ? "ok" : ""}`} x={20 + i * 190} y={234} width={180} height={30} />
            <Txt x={110 + i * 190} y={254} k="s" tone={i + 1 <= step ? undefined : "mute"}>
              {s}
            </Txt>
          </g>
        ))}
      <Txt x={20} y={H - 16} anchor="start" tone={p.tone}>
        {p.note[narrow ? 1 : 0]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- rollback */

function Rollback({ step, t, narrow }: SceneProps) {
  const o = (i: number) => seg(t, i * 0.16, i * 0.16 + 0.3);
  if (step === 0) {
    const rows: [string, string, number, Tone][] = [
      ["feature", "instant: flip the flag", 0.04, "ok"],
      ["code", "seconds to minutes", 0.2, "ok"],
      ["config", "minutes", 0.4, "warn"],
      ["data", "minutes to hours · risky", 1, "bad"],
    ];
    return (
      <g>
        <Txt x={20} y={28} k="k" anchor="start">
          rollback · fastest to slowest
        </Txt>
        {rows.map(([a, b, f, tone], i) => (
          <g key={a} opacity={o(i)}>
            <Txt x={20} y={80 + i * 52} k="t" anchor="start">
              {a}
            </Txt>
            <rect className={`ax-fill ${tone}`} x={120} y={66 + i * 52} width={Math.max(8, 260 * f * ease(t))} height={18} />
            {!narrow && (
              <Txt x={580} y={80 + i * 52} k="s" anchor="end" tone={tone}>
                {b}
              </Txt>
            )}
          </g>
        ))}
        <Txt x={20} y={H - 16} anchor="start" tone="warn">
          {narrow ? "avoid needing a data rollback" : "avoid data rollbacks: expand-contract, backups first"}
        </Txt>
      </g>
    );
  }
  return (
    <g>
      <Txt x={20} y={28} k="k" anchor="start" tone="ok">
        ship without fear
      </Txt>
      {["deploy frequently, in small batches", "deploy early in the week", "monitor during the deploy", "a rollback plan before deploying", "automated rollback on a threshold breach"].map((s, i) => (
        <g key={s} opacity={o(i)}>
          <Token x={34} y={66 + i * 42} s={12} tone="ok" />
          <Txt x={54} y={71 + i * 42} k="t" anchor="start">
            {narrow ? s.replace(", in small batches", "").replace(" on a threshold breach", "").replace(" before deploying", "") : s}
          </Txt>
        </g>
      ))}
      <Txt x={20} y={H - 16} anchor="start" tone="ok">
        {narrow ? "small, watched, quickly undone" : "small, incremental, monitored, fast to roll back"}
      </Txt>
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "flags") return <Flags {...p} />;
  if (p.variant === "migrations") return <Migrations {...p} />;
  if (p.variant === "rollback") return <Rollback {...p} />;
  return <Strategies {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "strategies",
      label: "Strategies",
      steps: [
        { caption: "To improve a system you must change it; to keep it stable you must not. The answer: deploy frequently, but deploy safely.", tween: 1200 },
        { caption: "Big bang stops v1.0, deploys and starts v1.1: downtime, then every user hits the new version at once. If it's broken, all of them are affected.", tween: 2400, ms: 3200 },
        { caption: "Rolling replaces instances one at a time with no downtime, but two versions run together, so the database and APIs must support both, and rollback is slow.", tween: 2000, ms: 3400 },
        { caption: "Blue-green deploys v1.1 to an idle green environment and switches all traffic at once. Switching back is an instant rollback, for twice the infrastructure.", tween: 1800, ms: 3400 },
        { caption: "Canary sends 1 percent to the new version, watched for 15 minutes against the stable one, then 10, 50 and 100 percent.", tween: 3000, ms: 3200 },
      ],
    },
    {
      id: "flags",
      label: "Feature flags",
      steps: [
        { caption: "Feature flags decouple deployment from release: the new checkout flow ships OFF, then turns on for 10 percent, for beta users, then for everyone.", tween: 2400, ms: 3200 },
        { caption: "Release, experiment, ops and permission flags all share a lifecycle: create with an owner and expiry, roll out, reach 100 percent, then remove the flag from the code.", tween: 1800, ms: 3600 },
      ],
    },
    {
      id: "migrations",
      label: "Migrations",
      steps: [
        { caption: "Renaming name to full_name in one step breaks a running version, because old and new code run side by side during the deploy.", tween: 1200 },
        { caption: "Expand: add full_name, write to both columns, keep reading name. Old and new code both work.", tween: 1400 },
        { caption: "Migrate: backfill full_name from name, then switch reads to full_name while still writing both.", tween: 1200 },
        { caption: "Contract: write only full_name, and drop the name column once no old code is left.", tween: 1200, ms: 3200 },
      ],
    },
    {
      id: "rollback",
      label: "Rollback",
      steps: [
        { caption: "Rollbacks differ in speed: a feature flag is instant, code takes seconds to minutes, config minutes, and data minutes to hours, with real risk of loss.", tween: 1800, ms: 3400 },
        { caption: "So deploy small and often, early in the week, watch metrics during the deploy, have a rollback plan, and roll back automatically when a threshold is breached.", tween: 1800, ms: 3600 },
      ],
    },
  ],
  Scene,
});
