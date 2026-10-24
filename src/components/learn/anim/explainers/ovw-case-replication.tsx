/**
 * The whole case file "Leader-follower replication and node outages": StreamFlix's leader in
 * US-East with three read followers; a follower crash (minor) and a leader crash at 2 AM on Black
 * Friday (major); the failover dance and split-brain fencing; synchronous vs asynchronous
 * replication and the hybrid; then PostgreSQL vs MongoDB, the RTO/RPO targets and the pitfalls.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";


const W = 600;
const H = 340;
type L = string | readonly [string, string];
const pk = (l: L, n: boolean) => (typeof l === "string" ? l : n ? l[1] : l[0]);
const fade = (t: number, i = 0, n = 0.14) => ease(seg(t, 0.1 + i * n, 0.4 + i * n));

function Head({ k, c, tone, narrow }: { k: L; c?: L; tone?: Tone; narrow: boolean }) {
  return (
    <g>
      <Txt x={16} y={28} k="k" anchor="start" tone={tone}>
        {pk(k, narrow)}
      </Txt>
      {c && (
        <Txt x={W - 16} y={28} k="k" anchor="end" tone={tone || "mute"}>
          {pk(c, narrow)}
        </Txt>
      )}
    </g>
  );
}

function Chips({ items, t, y = 290, tone, narrow }: { items: L[]; t: number; y?: number; tone?: Tone; narrow: boolean }) {
  const w = (W - 32 - (items.length - 1) * 8) / items.length;
  return (
    <g>
      {items.map((l, i) => {
        const x = 16 + i * (w + 8);
        return (
          <g key={i} opacity={fade(t, i)}>
            <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={32} />
            <Txt x={x + w / 2} y={y + 21} k="s" tone={tone}>
              {pk(l, narrow)}
            </Txt>
          </g>
        );
      })}
    </g>
  );
}

function Figs({ items, t, y = 288, narrow }: { items: [L, L, Tone?][]; t: number; y?: number; narrow: boolean }) {
  const w = W / items.length;
  return (
    <g>
      {items.map(([d, s, tone], i) => (
        <g key={i} opacity={fade(t, i, 0.18)}>
          <Txt x={w * (i + 0.5)} y={y} k="d" tone={tone}>
            {pk(d, narrow)}
          </Txt>
          <Txt x={w * (i + 0.5)} y={y + 28} k="s">
            {pk(s, narrow)}
          </Txt>
        </g>
      ))}
    </g>
  );
}

const FOL: [string, string, string][] = [
  ["Follower 1", "US-West", "F1"],
  ["Follower 2", "Europe", "F2"],
  ["Follower 3", "US-East", "F3"],
];
const FY = (i: number) => 50 + i * 70;
type St = { leader?: Tone; lsub?: string; f?: Tone[]; fsub?: (string | undefined)[]; writes?: Tone; rep?: boolean; dimLeader?: boolean };
function Cluster({ s, narrow }: { s: St; narrow: boolean }) {
  const f = s.f || [];
  return (
    <g>
      <Box x={16} y={70} w={110} h={50} label="Writes" sub={narrow ? undefined : "pay · signup"} tone={s.writes || "sky"} />
      <Box x={16} y={170} w={110} h={50} label="Reads" sub={narrow ? undefined : "browse"} tone="sky" />
      <Wire d="M126 95H180" arrow tone={s.writes === "bad" ? "bad" : undefined} dash={s.writes === "bad"} />
      <Box x={180} y={80} w={150} h={84} label="Leader" sub={s.lsub || "US-East"} tone={s.leader || "lit"} dim={s.dimLeader} />
      <Wire d="M71 220V256H396V75H420" tone="sky" />
      <Wire d="M396 145H420" tone="sky" />
      <Wire d="M396 215H420" tone="sky" />
      {s.rep !== false &&
        [0, 1, 2].map((i) => <Wire key={i} d={`M330 ${110 + i * 12}H${370 - i * 6}V${FY(i) + 18}H420`} dash tone={f[i] === "bad" ? "bad" : "lit"} />)}
      {FOL.map(([l, r, n], i) => (
        <Box key={l} x={420} y={FY(i)} w={164} h={50} label={narrow ? n : l} sub={s.fsub?.[i] ?? r} tone={f[i]} />
      ))}
    </g>
  );
}

function Setup({ step, t, clock, narrow }: SceneProps) {
  if (step === 0) {
    const q = clock > 0 ? (clock * 0.6) % 1 : seg(t, 0.2, 0.9);
    return (
      <g>
        <Head k={["StreamFlix · the cluster", "StreamFlix"]} c={["1 leader, 3 followers", "1 + 3"]} narrow={narrow} />
        <Cluster s={{}} narrow={narrow} />
        {q > 0 && q < 1 && [0, 1, 2].map((i) => <Token key={i} x={lerp(330, 420, q)} y={lerp(110 + i * 12, FY(i) + 18, q)} s={7} />)}
        <Chips items={[["leader: all writes", "leader: writes"], ["followers: reads", "followers: reads"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["scenario 1 · a follower crashes", "follower down"]} c={["minor", "minor"]} tone="warn" narrow={narrow} />
        <Cluster s={{ f: [undefined, "bad", undefined], fsub: [undefined, narrow ? "down" : "down · hardware", undefined], lsub: narrow ? "queues" : "queues changes" }} narrow={narrow} />
        <Chips items={[["writes continue", "writes OK"], ["reads move", "reads move"], ["WAL resync 2–5 min", "2–5 min"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["scenario 2 · the leader fails", "leader down"]} c={["2 AM · Black Friday", "2 AM"]} tone="bad" narrow={narrow} />
      <Cluster s={{ leader: "bad", lsub: "down", writes: "bad", rep: false, fsub: [narrow ? "stale?" : "maybe stale", narrow ? "stale?" : "maybe stale", narrow ? "stale?" : "maybe stale"] }} narrow={narrow} />
      <Chips items={[["all writes halt", "writes halt"], ["reads may be stale", "stale reads"], ["failover needed", "failover"]]} t={t} tone="bad" narrow={narrow} />
    </g>
  );
}

function Failover({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["1 · detection", "1 · detect"]} c="10–30 s" tone="warn" narrow={narrow} />
        <Cluster s={{ leader: "bad", lsub: narrow ? "no answer" : "unresponsive", writes: "bad", rep: false }} narrow={narrow} />
        <Chips items={[["heartbeats", "heartbeats"], ["connection tests", "connections"], ["query timeouts", "timeouts"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["2 · election and promotion", "2 · elect"]} c={["most up to date", "most current"]} narrow={narrow} />
        <Cluster s={{ leader: "mute", lsub: "old", dimLeader: true, writes: "bad", rep: false, f: [t > 0.5 ? "ok" : "lit", undefined, undefined], fsub: [t > 0.5 ? (narrow ? "leader" : "new leader") : narrow ? "freshest" : "most up to date", undefined, undefined] }} narrow={narrow} />
        <Chips items={[["pick the freshest follower", "freshest wins"], ["make it writable", "now writable"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 2) {
    const q = ease(seg(t, 0.2, 0.9));
    return (
      <g>
        <Head k={["3 · redirect and reconcile", "3 · redirect"]} narrow={narrow} />
        <Cluster s={{ leader: "mute", lsub: "old", dimLeader: true, writes: "ok", rep: false, f: ["ok", undefined, undefined], fsub: [narrow ? "leader" : "new leader", narrow ? "resync" : "resyncs", narrow ? "resync" : "resyncs"] }} narrow={narrow} />
        <Wire d="M126 82H160V40H502V50" arrow tone="ok" />
        {q > 0 && q < 1 && <Token x={lerp(160, 502, q)} y={40} tone="ok" />}
        <Chips items={[["apps point to the new leader", "apps → new leader"], ["followers sync to it", "followers sync"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  return (
    <g>
      <Head k={["split brain", "split brain"]} c={["fence the old leader", "fence it"]} tone="bad" narrow={narrow} />
      <Box x={16} y={60} w={250} h={70} label={narrow ? "Old leader" : "Old leader"} sub={narrow ? "still writing" : "thinks it's primary"} tone="bad" />
      <Box x={334} y={60} w={250} h={70} label={narrow ? "New leader" : "New leader"} sub={narrow ? "also writing" : "also primary"} tone="bad" />
      <Wire d="M266 95H334" tone="bad" dash />
      <Txt x={300} y={170} k="s" opacity={fade(t, 2)}>
        {narrow ? "GitHub 2018: 24 h 11 min" : "GitHub, Oct 2018: a 43-second break, 24 h 11 min degraded"}
      </Txt>
      <Chips items={[["conflicting writes", "conflicts"], ["fencing", "fencing"], ["witness nodes", "witnesses"]]} t={t} tone="warn" narrow={narrow} />
    </g>
  );
}

function Mode({ step, t, narrow }: SceneProps) {
  const seq = (sync: boolean) => {
    const ack = sync ? seg(t, 0.35, 0.6) : 0;
    const out = sync ? seg(t, 0.65, 0.9) : seg(t, 0.15, 0.4);
    const rep = sync ? seg(t, 0.1, 0.35) : seg(t, 0.5, 0.85);
    return (
      <g>
        <Box x={16} y={60} w={130} h={150} label="User" sub={sync ? "$9.99" : "watchlist"} tone="sky" />
        <Box x={235} y={60} w={130} h={150} label="Leader" tone="lit" />
        <Box x={454} y={60} w={130} h={150} label="Follower" tone={sync ? "ok" : rep >= 1 ? "ok" : undefined} />
        <Wire d="M146 90H235" arrow />
        <Wire d="M365 110H454" arrow dash={!sync} />
        {sync && <Wire d="M454 150H365" arrow tone="ok" />}
        <Wire d="M235 180H146" arrow tone={sync ? "ok" : "warn"} />
        {rep > 0 && rep < 1 && <Token x={lerp(365, 454, rep)} y={110} tone="lit" />}
        {ack > 0 && ack < 1 && <Token x={lerp(454, 365, ack)} y={150} tone="ok" />}
        {out > 0 && out < 1 && <Token x={lerp(235, 146, out)} y={180} tone={sync ? "ok" : "warn"} />}
        <Txt x={190} y={172} k="s" tone={sync ? "ok" : "warn"}>
          {sync ? (narrow ? "ok" : "confirmed") : narrow ? "ok" : "done now"}
        </Txt>
      </g>
    );
  };
  if (step === 0) {
    return (
      <g>
        <Head k={["synchronous", "sync"]} c={["safe, slower", "safe"]} tone="ok" narrow={narrow} />
        {seq(true)}
        <Chips items={[["zero data loss", "no loss"], ["waits for the ack", "waits"], ["slow follower blocks", "can block"]]} t={t} tone="ok" narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["asynchronous", "async"]} c={["fast, risky", "fast"]} tone="warn" narrow={narrow} />
        {seq(false)}
        <Chips items={[["returns at once", "instant"], ["no blocking", "no blocking"], ["can lose writes", "can lose"]]} t={t} tone="warn" narrow={narrow} />
      </g>
    );
  }
  const rows: [string, string, string, Tone][] = [
    ["payments, subscriptions", "synchronous", "sync", "ok"],
    ["user authentication", "semi-synchronous", "semi-sync", "sky"],
    ["history, preferences", "asynchronous", "async", "warn"],
  ];
  return (
    <g>
      <Head k={["the hybrid", "hybrid"]} c={["by how critical", "by criticality"]} tone="ok" narrow={narrow} />
      {rows.map(([k, v, n, tone], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <rect className={`ax-box ${tone}`} x={16} y={52 + i * 58} width={568} height={46} />
          <Txt x={30} y={80 + i * 58} k="s" anchor="start">
            {narrow ? k.split(",")[0] : k}
          </Txt>
          <Txt x={570} y={80 + i * 58} k="t" anchor="end" tone={tone}>
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["US-East ↔ US-West: sync", "near: sync"], ["Europe: async", "ocean: async"]]} t={seg(t, 0.4, 1)} tone="sky" narrow={narrow} />
    </g>
  );
}

function Play({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    return (
      <g>
        <Head k={["how the giants do it", "real systems"]} narrow={narrow} />
        <rect className="ax-box sky" x={16} y={56} width={270} height={150} />
        <Txt x={151} y={92} k="t">
          PostgreSQL
        </Txt>
        <Txt x={151} y={130} k="s">
          {narrow ? "sync standby" : "synchronous standby"}
        </Txt>
        <Txt x={151} y={152} k="s">
          {narrow ? "promote / Patroni" : "pg_ctl promote or Patroni"}
        </Txt>
        <Txt x={151} y={180} k="t" tone="sky">
          2–5 min
        </Txt>
        <rect className="ax-box ok" x={314} y={56} width={270} height={150} />
        <Txt x={449} y={92} k="t">
          MongoDB
        </Txt>
        <Txt x={449} y={130} k="s">
          {narrow ? "heartbeat 2 s" : "heartbeat every 2 s"}
        </Txt>
        <Txt x={449} y={152} k="s">
          {narrow ? "elect after 10 s" : "election after 10 s"}
        </Txt>
        <Txt x={449} y={180} k="t" tone="ok">
          {narrow ? "≤ ~12 s" : "median ≤ ~12 s"}
        </Txt>
        <Chips items={[["manual hero", "manual"], ["automatic guardian", "automatic"]]} t={t} narrow={narrow} />
      </g>
    );
  }
  if (step === 1) {
    return (
      <g>
        <Head k={["measure success", "targets"]} tone="ok" narrow={narrow} />
        <Figs items={[["< 5 min", narrow ? "RTO" : "RTO: back up", "ok"], ["< 30 s", narrow ? "RPO" : "RPO: data lost", "ok"], ["< 1 s", narrow ? "lag" : "replication lag", "ok"]]} y={130} t={t} narrow={narrow} />
        <Chips items={[["alert: lag > 5 s", "lag > 5 s"], ["3 missed heartbeats", "3 heartbeats"], ["disk < 10%", "disk < 10%"]]} t={seg(t, 0.4, 1)} tone="warn" narrow={narrow} />
      </g>
    );
  }
  const pits: [string, string, string][] = [
    ["split brain", "two primaries, conflicting writes", "two primaries"],
    ["cascading failure", "load moves, the rest fall over", "cascade"],
    ["the backup that wasn't", "GitLab 2017: ~6 hours lost", "bad backups"],
  ];
  return (
    <g>
      <Head k={["pitfalls · and the lesson", "pitfalls"]} tone="bad" narrow={narrow} />
      {pits.map(([k, v, n], i) => (
        <g key={k} opacity={fade(t, i, 0.16)}>
          <rect className="ax-box bad" x={16} y={52 + i * 58} width={568} height={46} />
          <Txt x={30} y={80 + i * 58} k="k" anchor="start" tone="bad">
            {k}
          </Txt>
          <Txt x={570} y={80 + i * 58} k="s" anchor="end">
            {narrow ? n : v}
          </Txt>
        </g>
      ))}
      <Chips items={[["design for failure", "design for it"], ["test failover", "test failover"], ["test backups", "test backups"]]} t={seg(t, 0.4, 1)} tone="ok" narrow={narrow} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "failover") return <Failover {...p} />;
  if (p.variant === "mode") return <Mode {...p} />;
  if (p.variant === "play") return <Play {...p} />;
  return <Setup {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "setup",
      label: "The cluster",
      steps: [
        { caption: "StreamFlix runs one leader in US-East for all writes, and three followers in US-West, Europe and US-East that serve reads and copy its changes.", tween: 1600, loop: true },
        { caption: "When Follower 2 in Europe crashes, writes carry on, reads move to the others, and it resyncs from the WAL in 2 to 5 minutes.", tween: 1000 },
        { caption: "When the leader fails at 2 AM on Black Friday, it's a crisis: every write halts and followers may hold stale data until one is promoted.", tween: 1000 },
      ],
    },
    {
      id: "failover",
      label: "Failover",
      steps: [
        { caption: "First, detection: heartbeats, connection tests and query timeouts notice the leader is gone, which takes 10 to 30 seconds.", tween: 1000 },
        { caption: "Then an election picks the most up-to-date follower and promotes it to be the new, write-capable leader.", tween: 1400 },
        { caption: "Applications are redirected to the new leader, and the remaining followers reconcile and sync from it.", tween: 1600 },
        { caption: "Fence the old leader, or two nodes act as primary. At GitHub in 2018, a 43-second network break led to 24 hours 11 minutes of degraded service.", tween: 1200, ms: 3400 },
      ],
    },
    {
      id: "mode",
      label: "Sync vs async",
      steps: [
        { caption: "Synchronous: a $9.99 payment is confirmed only after the follower acknowledges it. Zero data loss, but every write waits.", tween: 2200 },
        { caption: "Asynchronous: a watchlist update returns at once and copies later. Fast, but if the leader dies first, that write can be lost.", tween: 2200 },
        { caption: "So mix them: payments and subscriptions synchronous, authentication semi-synchronous, history and preferences asynchronous.", tween: 1400 },
      ],
    },
    {
      id: "play",
      label: "Playbook",
      steps: [
        { caption: "PostgreSQL fails over by promoting the sync standby, by hand or with Patroni. MongoDB elects a new primary itself, typically within 12 seconds.", tween: 1200, ms: 3400 },
        { caption: "Set targets and alerts: recover in under 5 minutes, lose under 30 seconds of data, keep replication lag under a second.", tween: 1400 },
        { caption: "Watch for split brain, cascading load and backups that don't restore: GitLab lost about 6 hours of data in 2017. Test failover early.", tween: 1400, ms: 3400 },
      ],
    },
  ],
  Scene,
});
