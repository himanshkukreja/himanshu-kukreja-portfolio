/**
 * The whole lesson, week 2 day 5 (Distributed Cron): cron on every server runs jobs 3 times and
 * naive locks fail; leader election, split brain and fencing tokens; the leader dying mid-job
 * (persistent records, heartbeats, checkpoints, stale tokens); real tools and the week's patterns.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a: number) => ease(seg(t, a, a + 0.4));

function Readout({ l, n, narrow, tone }: { l: Lines; n?: Lines; narrow: boolean; tone?: Tone }) {
  const x = narrow ? (n ?? [l[0].split(" · ")[0], l[1].split(" · ")[0]]) : l;
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{x[0]}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{x[1]}</Txt>
    </g>
  );
}
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;

/** three servers on the left, one job (or lock) on the right */
function Three({ subs, tones, job, jobSub, jobTone, wires }: { subs: string[]; tones: Tone[]; job: string; jobSub?: string; jobTone?: Tone; wires: Tone[] }) {
  return (
    <g>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {wires[i] !== "mute" && <Wire d={`M210 ${81 + i * 64}H290V136H380`} arrow tone={wires[i]} />}
          <Box x={20} y={56 + i * 64} w={190} h={50} label={`Server ${i + 1}`} sub={subs[i]} tone={tones[i]} dim={tones[i] === "mute"} />
        </g>
      ))}
      <Box x={380} y={104} w={200} h={64} label={job} sub={jobSub} tone={jobTone} />
    </g>
  );
}

function Hard({ step, t, narrow }: SceneProps) {
  const p = ease(seg(t, 0.1, 0.9));
  if (step === 0) {
    return (
      <g>
        <Kick s="cron on every server" tone="bad" />
        <Three subs={["10:00 run job!", "10:00 run job!", "10:00 run job!"]} tones={["lit", "lit", "lit"]} job="daily report" jobSub={p < 1 ? "…" : "RUNS 3 TIMES"} jobTone="bad" wires={["bad", "bad", "bad"]} />
        <Readout narrow={narrow} l={["one machine: each tick fires once", "many: servers crash · networks split · clocks drift"]} n={["one machine: fires once", "many: crashes, splits, drift"]} tone="bad" />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Kick s="attempt 1 · a database lock" />
        <Three subs={[t > 0.4 ? (narrow ? "crashed" : "crashed 10:00:05") : "holds the lock", "blocked", "blocked"]} tones={[t > 0.4 ? "bad" : "lit", "mute", "mute"]} job="jobs.locked" jobSub="= true, forever" jobTone="warn" wires={["warn", "mute", "mute"]} />
        <Readout narrow={narrow} l={["the crashed holder never releases the lock", "the job never runs again until someone steps in"]} n={["crashed holder keeps the lock", "the job never runs again"]} tone="bad" />
      </g>
    );
  }
  if (step === 2) {
    return (
      <g>
        <Kick s="attempts 2, 3 · lock timeout, Redis" />
        <Three subs={[narrow ? "still running" : "job outlives 5 min", narrow ? "same job!" : "lock expired: same job", ""]} tones={["warn", "bad", "mute"]} job="lock:{job_id}" jobSub={narrow ? "SET NX EX 300" : "SET NX · expires 10:05"} jobTone="bad" wires={["warn", "bad", "mute"]} />
        <Readout narrow={narrow} l={["a slow job runs twice when the lock expires", "GET then DELETE removes Server 2's lock"]} n={["slow job: runs twice", "DELETE hits server 2's lock"]} tone="bad" />
      </g>
    );
  }
  return (
    <g>
      <Kick s="perfect is impossible" />
      <Box x={20} y={56} w={272} h={150} tone="bad" />
      <Txt x={36} y={84} k="k" anchor="start" tone="bad">perfect</Txt>
      <Txt x={36} y={118} anchor="start">{narrow ? "exactly once," : "exactly once, on time,"}</Txt>
      <Txt x={36} y={144} anchor="start">every time</Txt>
      <Txt x={36} y={186} k="s" anchor="start" tone="bad">FLP, 1985</Txt>
      <g opacity={fade(t, 0.3)}>
        <Box x={308} y={56} w={272} h={150} tone="ok" />
        <Txt x={324} y={84} k="k" anchor="start" tone="ok">practical</Txt>
        <Txt x={324} y={118} anchor="start">{narrow ? "at-least-once" : "at-least-once +"}</Txt>
        <Txt x={324} y={144} anchor="start">{narrow ? "+ idempotency" : "idempotent jobs"}</Txt>
        <Txt x={324} y={186} k="s" anchor="start" tone="ok">{narrow ? "alert on misses" : "alert on missed runs"}</Txt>
      </g>
      <Readout narrow={narrow} l={["mutual exclusion · no deadlocks · no split brain", "jobs may be slightly delayed during failures"]} n={["exclusion, no deadlock", "may run a little late"]} />
    </g>
  );
}

function Leader({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Kick s="leader election" />
        <Box x={220} y={46} w={160} h={44} label="etcd" sub={narrow ? undefined : "lease, 10 s TTL"} tone="sky" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <Box x={20 + i * 194} y={140} w={172} h={56} label={`Server ${i + 1}`} sub={i === 0 ? (narrow ? "LEADER" : "LEADER · runs cron") : narrow ? "follower" : "follower · standby"} tone={i === 0 ? "lit" : undefined} />
            <Wire d={`M${106 + i * 194} 140V${i === 1 ? 90 : 68}${i === 1 ? "" : `H${i === 0 ? 220 : 380}`}`} tone={i === 0 ? "lit" : "mute"} dash={i > 0} />
          </g>
        ))}
        <Token x={106} y={lerp(140, 68, ease(t))} opacity={t < 1 ? 1 : 0} />
        <Readout narrow={narrow} l={["only the leader schedules jobs", "followers watch, ready to take over when its lease expires"]} n={["only the leader schedules", "followers wait to take over"]} />
      </g>
    );
  }
  if (step === 1) {
    const rej = t > 0.5;
    return (
      <g>
        <Kick s="split brain · fencing tokens" tone="bad" />
        <Box x={20} y={56} w={200} h={56} label={narrow ? "Old leader" : "Server 1 (old)"} sub="token 1" tone={rej ? "bad" : "lit"} />
        <Box x={20} y={150} w={200} h={56} label={narrow ? "New leader" : "Server 4 (new)"} sub="token 2" tone="ok" />
        <Wire d="M220 84H300V128H380" arrow tone={rej ? "bad" : "lit"} dash />
        <Wire d="M220 178H300V140H380" arrow tone="ok" />
        <Box x={380} y={104} w={200} h={64} label="Job store" sub={rej ? (narrow ? "1 < 2: reject" : "token 1 < 2: rejected") : "token 2 seen"} tone={rej ? "ok" : undefined} />
        <Readout narrow={narrow} l={["a partition, or a GC pause: two think they lead", "each new leader gets a higher token · old ones fail"]} n={["two servers think they lead", "stale tokens are rejected"]} />
      </g>
    );
  }
  const sys: [string, string, string][] = [["ZooKeeper", "ZAB", "HBase, Solr"], ["etcd", "Raft", "Kubernetes"], ["Consul", "Raft", "HashiCorp"]];
  return (
    <g>
      <Kick s="why ZooKeeper and etcd exist" />
      {sys.map(([l, s, u], i) => (
        <g key={l} opacity={fade(t, i * 0.2)}>
          <Box x={20 + i * 194} y={60} w={172} h={64} label={l} sub={s} tone="sky" />
          {!narrow && <Txt x={106 + i * 194} y={146} k="s">{u}</Txt>}
        </g>
      ))}
      <Box x={20} y={176} w={272} h={44} label={narrow ? "DIY: months" : "DIY: months, subtle bugs"} tone="bad" />
      <Box x={308} y={176} w={272} h={44} label={narrow ? "use one: days" : "use one: days, battle-tested"} tone="ok" />
      <Readout narrow={narrow} l={["unless you're building a distributed database", "use an existing coordination service"]} n={["unless you build a database,", "use a coordination service"]} />
    </g>
  );
}

const MODE: { kick: string; a: [string, Tone]; b: [string, Tone]; w: [string, Tone]; s: [string, Tone]; l: Lines; n: Lines }[] = [
  { kick: "10:00:30 · leader A crashes", a: ["crashed", "bad"], b: ["leader 10:00:41", "lit"], w: ["report 50%", "warn"], s: ["running", "warn"], l: ["10:00:40: A's 10 s etcd lease expires", "10:00:41: Server B becomes the new leader"], n: ["10:00:40: lease expires", "10:00:41: B leads"] },
  { kick: "mode 1 · job still running", a: ["crashed", "bad"], b: ["checks, skips", "ok"], w: ["running", "ok"], s: ["recent heartbeat", "ok"], l: ["executions live in the job store, not leader memory", "recent heartbeat: B doesn't schedule it again"], n: ["records in the job store", "recent heartbeat: skip"] },
  { kick: "mode 2 · both crash mid-job", a: ["crashed", "bad"], b: ["reschedules", "lit"], w: ["crashed: 50 emails", "bad"], s: ["no heartbeat", "bad"], l: ["stuck: running but no heartbeat for 60 s", "resume from the checkpoint · idempotent: no resends"], n: ["stuck: no heartbeat 60 s", "resume from checkpoint"] },
  { kick: "mode 3 · split brain", a: ["token 1: stale", "bad"], b: ["token 2", "ok"], w: ["rejects token 1", "ok"], s: ["current token 2", "ok"], l: ["the worker checks the fencing token first", "stale task from the old leader: rejected"], n: ["workers check the token", "stale tasks rejected"] },
];

function Dies({ step, t, narrow }: SceneProps) {
  const m = MODE[Math.min(step, 3)];
  const short = (s: string) => (narrow ? s.replace(" 10:00:41", "").replace("recent heartbeat", "heartbeat ok").replace("crashed: 50 emails", "50 emails").replace("rejects token 1", "rejects 1").replace("current token 2", "token 2").replace("token 1: stale", "token 1") : s);
  const hb = step === 1 && t < 1 ? ease(seg(t, 0.1, 0.9)) : 0;
  return (
    <g>
      <Kick s={m.kick} tone={step === 0 ? "bad" : undefined} />
      <Box x={20} y={56} w={170} h={56} label="Server A" sub={short(m.a[0])} tone={m.a[1]} dim={step > 0 && step < 3} />
      <Box x={20} y={150} w={170} h={56} label="Server B" sub={short(m.b[0])} tone={m.b[1]} />
      <Wire d="M190 178H225V128H250" arrow tone={m.b[1] === "ok" ? "ok" : "lit"} />
      <Wire d="M190 84H215V110H250" arrow tone={step === 3 ? "bad" : "mute"} dash />
      <Box x={250} y={92} w={150} h={56} label="Worker" sub={short(m.w[0])} tone={m.w[1]} />
      <Wire d="M400 120H430" arrow />
      <Box x={430} y={92} w={150} h={56} label="Job store" sub={short(m.s[0])} tone={m.s[1]} />
      {hb > 0 && <Token x={lerp(400, 430, hb)} y={120} tone="ok" />}
      <Readout narrow={narrow} l={m.l} n={m.n} tone={step === 2 ? "bad" : undefined} />
    </g>
  );
}

function Tools({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const tl: [string, string, string, Tone][] = [["Celery Beat", narrow ? "+ Redis lock" : "one beat + Redis lock", "simple Python", "warn"], ["K8s CronJob", narrow ? "~once" : "\"approximately once\"", "cloud-native", "sky"], ["Temporal", narrow ? "durable" : "durable execution", "critical flows", "ok"]];
    return (
      <g>
        <Kick s="real-world schedulers" />
        {tl.map(([l, s, b, tone], i) => (
          <g key={l} opacity={fade(t, i * 0.2)}>
            <Box x={20 + i * 194} y={60} w={172} h={72} label={l} sub={s} tone={tone} />
            {!narrow && <Txt x={106 + i * 194} y={156} k="s">{b}</Txt>}
          </g>
        ))}
        <Readout narrow={narrow} l={["none gives exactly-once side effects", "Temporal: workflow logic once · activities at-least-once"]} n={["none: exactly-once effects", "jobs must be idempotent"]} />
      </g>
    );
  }
  const loop: [string, string][] = [["skip?", "day 2"], ["breaker", "day 3"], ["10 s", "day 1"], ["mark", "day 2"], ["webhook", "day 4"], ["checkpt", "day 5"]];
  return (
    <g>
      <Kick s={step === 1 ? "one job, every pattern" : "how it fails, and recovers"} tone={step === 2 ? "ok" : undefined} />
      {loop.map(([l, d], i) => (
        <g key={l} opacity={step === 1 ? fade(t, i * 0.1) : 1}>
          {i > 0 && <Wire d={`M${12 + i * 96} 100H${20 + i * 96}`} arrow tone="lit" />}
          <Box x={20 + i * 96} y={72} w={88} h={56} label={narrow ? ({ webhook: "event", checkpt: "save" } as Record<string, string>)[l] ?? l : l} sub={d} tone={step === 2 && (i === 1 || i === 5) ? "warn" : i === 5 ? "lit" : undefined} />
        </g>
      ))}
      {step === 1 ? (
        <Txt x={20} y={170} k="s" anchor="start">{narrow ? "per pending payment" : "for each pending payment, under a leader-elected schedule"}</Txt>
      ) : (
        <g opacity={fade(t, 0.2)}>
          <Txt x={20} y={170} k="s" anchor="start">{narrow ? "timeout: checkpoint, go on" : "timeout → log, checkpoint, continue"}</Txt>
          <Txt x={20} y={196} k="s" anchor="start" tone="warn">{narrow ? "open: checkpoint, pause" : "circuit open → checkpoint, pause, retry later"}</Txt>
          <Txt x={20} y={222} k="s" anchor="start" tone="ok">{narrow ? "crash: resume, no dups" : "crash → resume from checkpoint, idempotency prevents duplicates"}</Txt>
        </g>
      )}
      <Readout
        narrow={narrow}
        l={step === 1 ? ["check processed:{id} · breaker · timeout · mark processed", "emit payment.completed · save last_payment_id"] : ["before: \"how do I make this work?\"", "after week 2: \"how will this fail?\""]}
        n={step === 1 ? ["check, breaker, timeout, mark", "emit, checkpoint"] : undefined}
        tone={step === 2 ? "ok" : undefined}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "leader") return <Leader {...p} />;
  if (p.variant === "dies") return <Dies {...p} />;
  if (p.variant === "tools") return <Tools {...p} />;
  return <Hard {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "hard",
      label: "Why it's hard",
      steps: [
        { caption: "On one machine each cron tick fires once. Put cron on three servers and at 10:00 all three run the job: it runs 3 times.", tween: 1400 },
        { caption: "Attempt 1, a database lock: Server 1 takes it, crashes at 10:00:05, and the lock is held forever. The job never runs again without manual intervention.", tween: 1400 },
        { caption: "Attempts 2 and 3, a lock timeout or Redis SET NX: a slow job outlives the 5-minute lock, Server 2 runs it again, and a GET-then-DELETE removes Server 2's lock.", tween: 1400, ms: 3600 },
        { caption: "FLP says perfect distributed cron is impossible. In practice: at-least-once with idempotent jobs, slight delays during failures, and alerts on missed runs.", tween: 1200 },
      ],
    },
    {
      id: "leader",
      label: "Leader election",
      steps: [
        { caption: "Elect one leader to run the scheduler. It holds a lease in etcd; followers stand by and take over if the lease expires.", tween: 1200 },
        { caption: "A partition or a GC pause can leave two servers believing they lead. Fencing tokens fix it: each new leader gets a higher token, and token 1 is rejected after token 2.", tween: 1400, ms: 3600 },
        { caption: "Leader election is so hard that ZooKeeper, etcd and Consul exist for it. Unless you're building a distributed database, use one: days of integration, not months.", tween: 1400 },
      ],
    },
    {
      id: "dies",
      label: "Leader dies",
      steps: [
        { caption: "10:00:00 leader A triggers the daily report, a worker starts it, and at 10:00:30 A crashes. Its 10-second lease expires at 10:00:40 and B leads at 10:00:41.", tween: 1400, ms: 3600 },
        { caption: "Mode 1, the job is still running on another worker: executions live in the job store, so B sees a recent heartbeat and doesn't schedule it again.", tween: 1600 },
        { caption: "Mode 2, the worker died too after sending 50 emails: no heartbeat for 60 seconds marks it stuck, and the idempotent job resumes from its checkpoint.", tween: 1400 },
        { caption: "Mode 3, split brain: the old leader's task arrives with token 1. The worker checks the current token, 2, and rejects the stale task.", tween: 1400 },
      ],
    },
    {
      id: "tools",
      label: "Tools, synthesis",
      steps: [
        { caption: "Celery Beat needs a Redis lock so one beat schedules, Kubernetes CronJobs run \"approximately once\", and Temporal runs workflow logic once but activities at-least-once.", tween: 1400, ms: 3600 },
        { caption: "A reliable payment job uses the whole week: skip if processed, check the breaker, a 10-second timeout, mark processed, emit a webhook, save a checkpoint.", tween: 1400 },
        { caption: "A timeout logs and continues, an open circuit checkpoints and pauses, a crash resumes from the checkpoint. The question is no longer how it works but how it fails.", tween: 1200, ms: 3600 },
      ],
    },
  ],
  Scene,
});
