/**
 * Raft leader election (week 5, day 5 · 3.2, and the timeouts in 3.3's sketch): heartbeats reset
 * randomized 150–300 ms election timers; the first follower to time out increments the term and
 * asks for votes; a majority makes it leader; a stale term is rejected (terms act like fencing tokens).
 */
import { defineExplainer, lerp, polar, seg, Token, Txt, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
const C = { x: 300, y: 172, r: 112 };
const IDS = ["A", "B", "C", "D", "E"];
const POS = IDS.map((_, i) => polar(C.x, C.y, C.r, i * 72));
const TIMEOUT: Record<string, number> = { B: 160, C: 240, D: 280, E: 210 };

type Role = "leader" | "follower" | "candidate" | "down";

function roles(step: number, t: number): { role: Record<string, Role>; term: Record<string, number> } {
  const role: Record<string, Role> = { A: "leader", B: "follower", C: "follower", D: "follower", E: "follower" };
  const term: Record<string, number> = { A: 2, B: 2, C: 2, D: 2, E: 2 };
  if (step >= 1) role.A = "down";
  if (step >= 2) {
    role.B = "candidate";
    term.B = 3;
  }
  if (step >= 3) ["C", "D", "E"].forEach((n) => (term[n] = 3));
  if (step >= 4) role.B = "leader";
  if (step >= 5) {
    role.A = t > 0.75 ? "follower" : "leader";
    term.A = t > 0.75 ? 3 : 2;
  }
  return { role, term };
}

const toneOf = (r: Role): Tone => (r === "leader" ? "ok" : r === "candidate" ? "lit" : r === "down" ? "bad" : undefined);

function Scene({ step, t, clock, narrow }: SceneProps) {
  const { role, term } = roles(step, t);
  const toks: { x: number; y: number; tone: Tone; o?: number }[] = [];
  const send = (from: number, to: number, p: number, tone: Tone) => {
    const a = POS[from];
    const b = POS[to];
    toks.push({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), tone, o: p <= 0 || p >= 1 ? 0 : 1 });
  };
  if (step === 0) [1, 2, 3, 4].forEach((k) => send(0, k, (clock * 0.9) % 1, "ok"));
  if (step === 2) [0, 2, 3, 4].forEach((k) => k !== 0 && send(1, k, seg(t, 0.2, 0.9), "lit"));
  if (step === 3) [2, 3, 4].forEach((k, j) => send(k, 1, seg(t, 0.1 + j * 0.12, 0.6 + j * 0.12), "lit"));
  if (step === 4) [0, 2, 3, 4].forEach((k) => k !== 0 && send(1, k, (clock * 0.9) % 1, "ok"));
  if (step === 5) {
    [2, 3, 4].forEach((k) => send(1, k, (clock * 0.9) % 1, "ok"));
    send(0, 2, seg(t, 0.1, 0.55), "warn");
  }
  const votes = step >= 3 ? 1 + Math.min(3, Math.floor(seg(t, 0.1, 0.96) * 3 + (step > 3 ? 3 : 0))) : step === 2 ? 1 : 0;
  return (
    <g>
      <Txt x={24} y={36} k="k" anchor="start">
        {`term ${step >= 2 ? 3 : 2}`}
      </Txt>
      <Txt x={24} y={58} k="s" anchor="start">
        {narrow ? "5 nodes · majority 3" : "5 nodes · majority = 3"}
      </Txt>
      {step >= 2 && step <= 4 && (
        <g>
          <Txt x={W - 24} y={36} k="k" anchor="end" tone="lit">
            votes for B
          </Txt>
          <Txt x={W - 24} y={72} k="d" anchor="end" tone={votes >= 3 ? "ok" : "lit"}>
            {`${votes}/5`}
          </Txt>
        </g>
      )}
      {/* links */}
      {POS.map((a, i) =>
        POS.slice(i + 1).map((b, j) => <line key={`${i}-${j}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="le-link" />),
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={10} tone={k.tone} opacity={k.o} />
      ))}
      {IDS.map((id, i) => {
        const p = POS[i];
        const r = role[id];
        const tone = toneOf(r);
        // election timer: full after a heartbeat, drains while no heartbeat arrives
        const to = TIMEOUT[id];
        let frac = 1;
        if (to && step === 1) frac = Math.max(0, 1 - t * (TIMEOUT.B / to));
        if (to && step === 2) frac = id === "B" ? 0 : Math.max(0, 1 - TIMEOUT.B / to - t * 0.15);
        const showTimer = to && (step === 1 || step === 2) && r !== "leader";
        const rejected = step === 5 && id === "C" && t > 0.5 && t < 0.95;
        return (
          <g key={id}>
            <rect x={p.x - 30} y={p.y - 24} width={60} height={48} className={`ax-box${tone ? ` ${tone}` : ""}`} opacity={r === "down" ? 0.55 : 1} />
            <Txt x={p.x} y={p.y + 1} tone={tone}>
              {id}
            </Txt>
            <Txt x={p.x} y={p.y + 17} k="s">{`t${term[id]}`}</Txt>
            {showTimer && (
              <circle
                cx={p.x}
                cy={p.y}
                r={34}
                className={`le-timer${frac <= 0.001 ? " out" : ""}`}
                strokeDasharray={`${(2 * Math.PI * 34 * frac).toFixed(1)} 400`}
                transform={`rotate(-90 ${p.x} ${p.y})`}
              />
            )}
            <Txt x={p.x} y={p.y + (p.y > C.y + 10 ? 46 : -32)} k="s" tone={tone}>
              {r === "down" ? "down" : r === "candidate" ? "candidate" : r === "leader" ? "leader" : narrow ? "" : showTimer ? `${to} ms` : "follower"}
            </Txt>
            {rejected && (
              <Txt x={p.x + 40} y={p.y - 28} k="k" anchor="start" tone="bad">
                stale t2 ✗
              </Txt>
            )}
          </g>
        );
      })}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.le-link{stroke:var(--ax-line-soft);stroke-width:1}.le-timer{fill:none;stroke:var(--ax-amber);stroke-width:3}.le-timer.out{stroke:var(--ax-accent)}`,
  variants: [
    {
      id: "raft",
      label: "Election",
      steps: [
        { caption: "Term 2: A is the leader. Its heartbeats (AppendEntries) reach every follower and keep resetting their election timers.", loop: true },
        { caption: "A crashes and the heartbeats stop. Every follower's timer runs down; the timeouts are randomized between 150 and 300 ms, so one expires first.", tween: 2400 },
        { caption: "B times out first and becomes a candidate: it increments the term to 3, votes for itself and sends RequestVote to the others.", tween: 1600 },
        { caption: "A node grants one vote per term, to the first candidate whose log is at least as up to date as its own. C, D and E vote for B.", tween: 2000 },
        { caption: "4 of 5 votes, more than the 3 a majority needs: B is the leader for term 3 and starts sending heartbeats.", loop: true, ms: 3000 },
        { caption: "A comes back still acting as the term-2 leader. Its messages carry a stale term, so they are rejected; A sees term 3 and steps down. At most one leader per term.", tween: 2600, loop: true, ms: 3400 },
      ],
    },
  ],
  Scene,
});
