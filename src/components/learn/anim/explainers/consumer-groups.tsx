/**
 * Kafka partitions and a consumer-group rebalance (week 3, day 1 · 2.3 / 6.2): one consumer per
 * partition within a group; C joins → stop fetching, reassign (A 0-1, B 2-3, C 4-5); consumers
 * beyond the partition count sit idle.
 */
import { at, Box, defineExplainer, lerp, Token, Txt, type SceneProps } from "../kit";

const W = 600;
const H = 330;
const LANE = { x0: 64, x1: 330 };
const laneY = (i: number) => 52 + i * 44;
const PARTS = [0, 1, 2, 3, 4, 5];

type Group = { ids: string[]; own: Record<string, number[]> };
const G: Group[] = [
  { ids: [], own: {} },
  { ids: ["A", "B"], own: { A: [0, 1, 2], B: [3, 4, 5] } },
  { ids: ["A", "B", "C"], own: {} },
  { ids: ["A", "B", "C"], own: { A: [0, 1], B: [2, 3], C: [4, 5] } },
  { ids: ["A", "B", "C"], own: { A: [0, 1], B: [2, 3], C: [4, 5] } },
  { ids: ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"], own: { C1: [0], C2: [1], C3: [2], C4: [3], C5: [4], C6: [5] } },
];
const FLOW = [true, true, false, false, true, true];

function slots(ids: string[]) {
  if (ids.length <= 3) return ids.map((id, k) => ({ id, y: 82 + k * 82, h: 54 }));
  return ids.map((id, k) => ({ id, y: 30 + k * 37, h: 28 }));
}

function Scene({ step, t, clock, narrow }: SceneProps) {
  const g = at(step, G);
  const prevG = at(step - 1, G);
  const flowing = at(step, FLOW);
  const cs = slots(g.ids);
  const yOf = (id: string) => {
    const s = cs.find((c) => c.id === id);
    return s ? s.y + s.h / 2 : 0;
  };
  const ownerOf = (grp: Group, p: number) => Object.keys(grp.own).find((c) => grp.own[c].includes(p));
  const fade = step === 0 ? 1 : t;
  const rebalancing = step === 2 || step === 3;
  return (
    <g>
      <Txt x={24} y={26} k="k" anchor="start">
        {narrow ? "topic · 6 partitions" : "topic: orders · 6 partitions"}
      </Txt>
      {rebalancing && (
        <Txt x={W - 24} y={26} k="k" anchor="end" tone="warn">
          rebalance
        </Txt>
      )}
      {PARTS.map((p) => {
        const y = laneY(p);
        const own = ownerOf(g, p);
        const before = ownerOf(prevG, p);
        const moved = step === 3 && p === 2;
        return (
          <g key={p}>
            <Txt x={24} y={y + 5} anchor="start" tone={moved ? "lit" : undefined}>{`P${p}`}</Txt>
            <rect x={LANE.x0} y={y - 13} width={LANE.x1 - LANE.x0} height={26} className={`cg-lane${moved ? " hot" : ""}`} />
            {/* the ordered log: messages flow right, in order */}
            {[0, 1, 2, 3].map((k) => {
              const ph = flowing ? (clock * 0.32 + k / 4 + p * 0.07) % 1 : (k / 4 + p * 0.07) % 1;
              return <Token key={k} x={lerp(LANE.x0 + 10, LANE.x1 - 10, ph)} y={y} s={10} tone={flowing && own ? "sky" : "mute"} />;
            })}
            {/* assignment wire */}
            {own && (
              <path
                d={`M${LANE.x1} ${y}C${LANE.x1 + 50} ${y} 380 ${yOf(own)} 430 ${yOf(own)}`}
                className={`cg-wire${moved ? " lit" : ""}`}
                opacity={own === before || step === 4 || step === 1 ? 1 : fade}
              />
            )}
          </g>
        );
      })}
      {cs.map((c) => {
        const owns = g.own[c.id] || [];
        const idle = step === 5 && !owns.length;
        const isNew = (step === 2 && c.id === "C") || (step === 5 && g.ids.length > prevG.ids.length);
        return (
          <g key={c.id} opacity={isNew ? fade : 1}>
            <Box
              x={430}
              y={c.y}
              w={146}
              h={c.h}
              label={c.h > 40 ? `Consumer ${c.id}` : c.id}
              sub={c.h > 40 ? (owns.length ? `P${owns.join(", P")}` : rebalancing ? "waiting" : "no partitions") : undefined}
              tone={idle ? "mute" : step === 2 && c.id === "C" ? "lit" : owns.length && !rebalancing ? "sky" : undefined}
              dim={idle}
            />
            {c.h <= 40 && (
              <Txt x={570} y={c.y + c.h / 2 + 5} k="s" anchor="end" tone={idle ? "bad" : undefined}>
                {idle ? "idle" : `P${owns.join(",")}`}
              </Txt>
            )}
          </g>
        );
      })}
      {step === 0 && (
        <Txt x={500} y={170} k="s">
          no consumers yet
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.cg-lane{fill:none;stroke:var(--ax-line);stroke-width:1.5}.cg-lane.hot{stroke:var(--ax-accent);stroke-width:2.5}
.cg-wire{fill:none;stroke:var(--ax-sky);stroke-width:2}.cg-wire.lit{stroke:var(--ax-accent);stroke-width:3}`,
  variants: [
    {
      id: "group",
      label: "Consumer group",
      steps: [
        { caption: "A topic is split into partitions. Each partition is an ordered log: messages keep their order inside it, and parallelism is set by the partition count.", loop: true },
        { caption: "A consumer group shares the work: each partition goes to exactly one consumer in the group. Consumer A owns partitions 0, 1 and 2; B owns 3, 4 and 5.", loop: true, tween: 1200 },
        { caption: "Consumer C joins the group, which triggers a rebalance: all consumers stop fetching.", tween: 1200 },
        { caption: "Partitions are reassigned: A gets 0 and 1, B gets 2 and 3, C gets 4 and 5. Partition 2 moved from A to B mid-processing, so its uncommitted work may be lost or done twice.", tween: 1400, ms: 3800 },
        { caption: "Fetching resumes. Commit offsets often, use cooperative rebalancing, or commit in a rebalance listener before a partition is revoked.", loop: true, ms: 3400 },
        { caption: "Scale the group to 8 consumers on 6 partitions and two consumers sit idle: one partition goes to one consumer per group, so you need more partitions to go faster.", loop: true, tween: 1200, ms: 3800 },
      ],
    },
  ],
  Scene,
});
