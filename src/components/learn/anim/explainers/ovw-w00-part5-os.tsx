/**
 * The whole lesson, week 0 part 5 (operating systems): processes vs threads and their bugs (race,
 * deadlock), memory (paging, page faults, the hierarchy, cache lines), I/O models (thread per
 * connection → epoll event loops) and files and limits (page cache, WAL, fds, containers).
 */
import { Box, defineExplainer, ease, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 330;
type Lines = [string, string];
const fade = (t: number, a = 0, b = 0.55) => ease(seg(t, a, b));
const nw = (narrow: boolean, a: string, b: string) => (narrow ? b : a);
/** "wide|narrow", or the first " · " part when narrow */
const nl = (s: string, narrow: boolean) => (s.includes("|") ? s.split("|")[narrow ? 1 : 0] : narrow ? s.split(" · ")[0] : s);
const Kick = ({ s, tone }: { s: string; tone?: Tone }) => <Txt x={20} y={30} k="k" anchor="start" tone={tone}>{s}</Txt>;
function Readout({ l, narrow, tone }: { l: Lines; narrow: boolean; tone?: Tone }) {
  return (
    <g>
      <Txt x={20} y={H - 38} k="s" anchor="start" tone={tone}>{nl(l[0], narrow)}</Txt>
      <Txt x={20} y={H - 14} k="s" anchor="start">{nl(l[1], narrow)}</Txt>
    </g>
  );
}
function Card({ x, y, w, h, title, lines, tone, o = 1 }: { x: number; y: number; w: number; h: number; title: string; lines: string[]; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <rect className={`ax-box ${tone || ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + 12} y={y + 24} k="k" anchor="start" tone={tone}>{title}</Txt>
      {lines.map((l, i) => <Txt key={i} x={x + 12} y={y + 52 + i * 26} anchor="start">{l}</Txt>)}
    </g>
  );
}
/** a labelled meter row: label left, bar, value right */
function Row({ y, label, v, max, val, tone, o = 1 }: { y: number; label: string; v: number; max: number; val: string; tone?: Tone; o?: number }) {
  return (
    <g opacity={o}>
      <Txt x={20} y={y + 11} k="s" anchor="start">{label}</Txt>
      <Meter x={150} y={y} w={330} h={14} value={v} max={max} tone={tone} />
      <Txt x={580} y={y + 12} k="s" anchor="end" tone={tone}>{val}</Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- 1 · processes and threads */
function Threads({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const st: [string, string, string, Tone][] = [["your application", "\"10,000 requests/s\"", "", "lit"], ["runtime", "Python · JVM · Go · Node.js", "JVM, Go, Node", undefined], ["system libraries", "libc", "libc", undefined], ["kernel", "processes · memory · files · I/O · network", "processes, memory, I/O", "sky"], ["hardware", "", "", undefined]];
    return (
      <g>
        <Kick s="what your code sits on" />
        {st.map(([a, b, c, tone], i) => (
          <g key={a} opacity={fade(t, i * 0.1, i * 0.1 + 0.35)}>
            <rect className={`ax-box ${tone || ""}`} x={20} y={46 + i * 44} width={560} height={36} />
            <Txt x={34} y={69 + i * 44} anchor="start" tone={tone}>{a}</Txt>
            <Txt x={566} y={69 + i * 44} k="s" anchor="end">{nw(narrow, b, c)}</Txt>
          </g>
        ))}
        <Readout narrow={narrow} l={["OS concepts help you tune, debug and decide|tune, debug, decide", "and answer interview questions with confidence|answer with confidence"]} />
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Kick s="process vs thread" />
        <Card x={20} y={50} w={270} h={200} tone="sky" title="process" o={fade(t)} lines={["isolated memory", "create ~0.1-1 ms", "switch 10-100 µs", "one crash, one dead"]} />
        <Card x={310} y={50} w={270} h={200} tone="lit" title="thread" o={fade(t, 0.3, 0.8)} lines={["shared heap", "create ~10 µs", "switch 1-10 µs", "one crash, all dead"]} />
        <Readout narrow={narrow} l={["a switch saves registers · changes page tables · flushes the TLB|process switch flushes TLB", "Go goroutines: many user threads on few kernel threads (M:N)|goroutines: M:N threads"]} />
      </g>
    );
  if (step === 2) {
    const r = (a: string, b: string, y: number, o: number) => (
      <g opacity={o}>
        <Txt x={110} y={y} k="s" tone="sky">{a}</Txt>
        <Txt x={490} y={y} k="s" tone="lit">{b}</Txt>
      </g>
    );
    return (
      <g>
        <Kick s="race condition" tone="bad" />
        <Box x={20} y={50} w={180} h={44} label="Thread A" tone="sky" />
        <Box x={400} y={50} w={180} h={44} label="Thread B" tone="lit" />
        <Box x={230} y={110} w={140} h={56} label="counter" sub={t > 0.75 ? "= 1" : "= 0"} tone={t > 0.75 ? "bad" : undefined} />
        {r("read 0", "read 0", 124, fade(t, 0, 0.3))}
        {r("0 + 1", "0 + 1", 148, fade(t, 0.25, 0.5))}
        {r("write 1", "write 1", 172, fade(t, 0.5, 0.75))}
        <Txt x={300} y={226} tone="bad" opacity={fade(t, 0.75, 1)}>{nw(narrow, "expected 2 · actual 1", "expected 2, got 1")}</Txt>
        <Readout narrow={narrow} tone="bad" l={["read-modify-write is not atomic: an increment is lost|an increment is lost", "fix: a mutex or an atomic increment|fix: mutex or atomic"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="deadlock" tone="bad" />
      <Box x={20} y={56} w={180} h={50} label="Thread A" tone="sky" />
      <Box x={400} y={56} w={180} h={50} label="Thread B" tone="lit" />
      <Box x={20} y={176} w={180} h={50} label="lock A" />
      <Box x={400} y={176} w={180} h={50} label="lock B" />
      <Wire d="M110 106V176" arrow />
      <Wire d="M490 106V176" arrow />
      <g opacity={fade(t, 0.3, 0.8)}>
        <Wire d="M200 92L400 190" tone="bad" dash arrow />
        <Wire d="M400 92L200 190" tone="bad" dash arrow />
        <Txt x={300} y={252} k="s" tone="bad">{nw(narrow, "each waits for the lock the other holds", "each waits for the other")}</Txt>
      </g>
      <Txt x={118} y={146} k="s" anchor="start">holds</Txt>
      <Txt x={482} y={146} k="s" anchor="end">holds</Txt>
      <Readout narrow={narrow} tone="bad" l={["both stuck forever|stuck forever", "prevent it: one global lock order · lock timeouts · detection"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 2 · memory */
const LADDER: [string, number, string, Tone][] = [["L1 cache", 1, "0.5 ns", "ok"], ["L2 cache", 2, "7 ns", "ok"], ["L3 cache", 2.6, "20 ns", "ok"], ["RAM", 3.3, "100 ns", "sky"], ["SSD", 6.5, "150 µs", "warn"], ["HDD", 8.3, "10 ms", "bad"]];
function Memory({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const map: [number, Tone][] = [[3, "ok"], [7, "ok"], [-1, "bad"], [1, "ok"]];
    return (
      <g>
        <Kick s="virtual memory · paging" />
        <Txt x={80} y={60} k="s">virtual</Txt>
        <Txt x={300} y={60} k="s">{nw(narrow, "page table", "table")}</Txt>
        <Txt x={510} y={60} k="s">physical</Txt>
        {map.map(([f, tone], i) => (
          <g key={i} opacity={fade(t, i * 0.15, i * 0.15 + 0.4)}>
            <Box x={20} y={70 + i * 46} w={120} h={36} label={`VPN ${i}`} />
            <Wire d={`M140 ${88 + i * 46}H440`} tone={f < 0 ? "bad" : undefined} dash={f < 0} arrow />
            <Box x={440} y={70 + i * 46} w={140} h={36} label={f < 0 ? "disk" : `PFN ${f}`} tone={tone} />
          </g>
        ))}
        <Txt x={300} y={174} k="s" tone="bad" opacity={fade(t, 0.4, 0.8)}>page fault!</Txt>
        <Readout narrow={narrow} l={["isolation · simple addresses · overcommit · 4 KB pages", "the TLB caches translations · 99%+ hit rate|TLB hit rate 99%+"]} />
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Kick s="page faults" tone="warn" />
        <Row y={80} label="minor" v={1} max={4} val="~1-10 µs" tone="ok" o={fade(t)} />
        <Row y={130} label={nw(narrow, "major (HDD)", "major")} v={4 * fade(t, 0.3, 0.9)} max={4} val="~1-10 ms" tone="bad" o={fade(t, 0.2, 0.5)} />
        <Row y={180} label="invalid" v={0} max={4} val="SIGSEGV" tone="bad" o={fade(t, 0.5, 0.8)} />
        <Txt x={300} y={240} opacity={fade(t, 0.7, 1)}>{nw(narrow, "major ≈ 1000x a minor fault", "major ≈ 1000x minor")}</Txt>
        <Readout narrow={narrow} l={["minor: in RAM, just not mapped · major: read back from disk|major: read from disk", "past physical RAM, swapping turns memory reads into disk reads|swap = disk reads"]} />
      </g>
    );
  if (step === 2)
    return (
      <g>
        <Kick s="the memory hierarchy" />
        {LADDER.map(([a, v, s, tone], i) => <Row key={a} y={52 + i * 32} label={a} v={v} max={8.3} val={s} tone={tone} o={fade(t, i * 0.1, i * 0.1 + 0.3)} />)}
        <Readout narrow={narrow} l={["L1 ~200x faster than RAM · RAM ~1,000x faster than SSD|L1 ≈ 200x RAM", "SSD ~70x faster than HDD for random reads|SSD ≈ 70x HDD"]} />
      </g>
    );
  const cell = (r: number, c: number, tone?: Tone) => <rect key={`${r}-${c}`} className={`ax-box ${tone || ""}`} x={40 + c * 64} y={56 + r * 44} width={58} height={36} />;
  const k = Math.round(ease(seg(t, 0, 0.9)) * 8);
  return (
    <g>
      <Kick s="cache lines · 64 bytes" />
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((c) => cell(r, c, r === 0 && c < k ? "ok" : c === 0 && r > 0 && k > 2 * r ? "bad" : undefined)))}
      <Txt x={300} y={250} k="s">{nw(narrow, "row by row: one line fetch serves ~16 ints · column jumps miss", "row: hits · column: misses")}</Txt>
      <Readout narrow={narrow} l={["sequential access is cache-friendly · strided access is not|sequential beats strided", "scan one field? structure of arrays beats array of structures|SoA beats AoS"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 3 · I/O models */
function Io({ step, t, clock, narrow }: SceneProps) {
  if (step === 0)
    return (
      <g>
        <Kick s="thread per connection" tone="bad" />
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i} opacity={fade(t, i * 0.1, i * 0.1 + 0.3)}>
            <Box x={20 + i * 116} y={50} w={96} h={40} label={narrow ? `conn ${i + 1}` : `client ${i + 1}`} />
            <Wire d={`M${68 + i * 116} 90V116`} arrow />
            <Box x={20 + i * 116} y={116} w={96} h={48} label={`T${i + 1}`} sub="blocked" tone="warn" />
          </g>
        ))}
        <Txt x={300} y={222} k="d" tone="bad" opacity={fade(t, 0.6, 1)}>{nw(narrow, "1M × 1 MB stack = 1 TB", "1M × 1 MB = 1 TB")}</Txt>
        <Readout narrow={narrow} tone="bad" l={["simple, but threads sit idle while they wait|threads sit idle waiting", "it doesn't scale past ~10K connections|tops out ~10K conns"]} />
      </g>
    );
  if (step === 1) {
    const ready = [1, 4, 6];
    return (
      <g>
        <Kick s="epoll · one thread, many sockets" tone="ok" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const on = ready.includes(i) && t > 0.4;
          return (
            <g key={i}>
              <Wire d={`M${50 + i * 70} 90V160`} tone={on ? "lit" : "mute"} dash={!on} />
              <Box x={20 + i * 70} y={50} w={60} h={40} label={`fd${i + 3}`} tone={on ? "lit" : undefined} />
            </g>
          );
        })}
        <Box x={20} y={160} w={560} h={56} label={nw(narrow, "event loop · epoll_wait → handle ready → repeat", "event loop")} tone="ok" />
        {ready.map((i) => <Token key={i} x={50 + i * 70} y={lerp(90, 160, (ease(seg(t, 0.4, 1)) + clock * 0.6) % 1)} opacity={t > 0.4 ? 1 : 0} />)}
        <Readout narrow={narrow} l={["select: 1024 fds, O(n) scan · epoll: O(1), only ready fds|epoll returns only ready fds", "no blocking = no forced context switch · Node.js, nginx, Redis|Node.js, nginx, Redis"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="scale to every core" />
      {[0, 1, 2, 3].map((i) => <Box key={i} x={20 + i * 142} y={56} w={132} h={56} label={nw(narrow, `loop ${i}`, `loop ${i}`)} sub={`core ${i}`} tone="ok" opacity={fade(t, i * 0.1, i * 0.1 + 0.3)} />)}
      <g opacity={fade(t, 0.5, 0.9)}>
        <Wire d="M300 112V150" dash arrow />
        <Box x={160} y={150} w={280} h={52} label={nw(narrow, "thread pool · CPU work", "CPU pool")} sub={undefined} tone="sky" />
      </g>
      <Txt x={300} y={240} tone="lit" opacity={fade(t, 0.6, 1)}>{nw(narrow, "32 cores × ~30K connections each", "32 cores × ~30K each")}</Txt>
      <Readout narrow={narrow} l={["one event loop per core · CPU-heavy work goes to a pool|loop per core + CPU pool", "1M connections: raise fd limits · tune buffers · consider io_uring|then tune fds, io_uring"]} />
    </g>
  );
}

/* ---------------------------------------------------------------- 4 · files, limits, containers */
function Files({ step, t, narrow }: SceneProps) {
  if (step === 0) {
    const p = ease(seg(t, 0.1, 0.6));
    return (
      <g>
        <Kick s="page cache · fsync" />
        <Wire d="M130 140H240" tone="lit" arrow />
        <Wire d="M360 140H470" dash arrow />
        <Wire d="M75 112V96H525V112" tone="ok" arrow />
        <Box x={20} y={112} w={110} h={56} label="App" sub="write()" />
        <Box x={240} y={112} w={120} h={56} label={nw(narrow, "Page cache", "Cache")} sub="RAM" tone="warn" />
        <Box x={470} y={112} w={110} h={56} label="Disk" tone="ok" />
        <Txt x={300} y={88} k="s" tone="ok">fsync()</Txt>
        <Txt x={415} y={160} k="s">later</Txt>
        {p > 0 && p < 1 && <Token x={lerp(130, 240, p)} y={140} />}
        <Txt x={300} y={222} tone="warn" opacity={fade(t, 0.6, 1)}>{nw(narrow, "returns at once: lost if power fails", "lost on power loss")}</Txt>
        <Readout narrow={narrow} l={["write-back is the default: fast, but data sits in RAM|write-back: fast, risky", "need durability? fsync() after writes, like databases do|fsync() for durability"]} />
      </g>
    );
  }
  if (step === 1)
    return (
      <g>
        <Kick s="write-ahead log" tone="ok" />
        {[["txn", undefined], ["WAL append", "lit"], ["fsync", "ok"], ["data files", undefined]].map(([s, tone], i) => (
          <g key={s} opacity={fade(t, i * 0.12, i * 0.12 + 0.35)}>
            {i > 0 && <Wire d={`M${i * 145} 86H${20 + i * 145}`} arrow />}
            <Box x={20 + i * 145} y={58} w={125} h={56} label={nw(narrow, s as string, (s as string).replace("WAL append", "WAL").replace("data files", "data"))} tone={tone as Tone} />
          </g>
        ))}
        <Row y={150} label={nw(narrow, "sequential", "seq.")} v={100} max={100} val="100 MB/s" tone="ok" o={fade(t, 0.4, 0.7)} />
        <Row y={190} label="random" v={1} max={100} val="1 MB/s" tone="bad" o={fade(t, 0.5, 0.8)} />
        <Readout narrow={narrow} l={["crash? replay the WAL to a consistent state|crash: replay the log", "PostgreSQL · MySQL InnoDB · SQLite · Kafka · RocksDB"]} />
      </g>
    );
  if (step === 2) {
    const used = 1024 * fade(t, 0, 0.8);
    return (
      <g>
        <Kick s="file descriptors" />
        {["0 stdin", "1 stdout", "2 stderr", "3 app.log", "4 socket → DB", "5 socket → client"].map((s, i) => <Txt key={s} x={20} y={66 + i * 24} anchor="start" tone={i > 3 ? "sky" : undefined} opacity={fade(t, i * 0.08, i * 0.08 + 0.3)}>{s}</Txt>)}
        <Txt x={360} y={70} k="s">{nw(narrow, "open fds vs ulimit -n 1,024", "fds / 1,024")}</Txt>
        <Meter x={250} y={82} w={330} h={16} value={used} max={1024} tone={used > 1000 ? "bad" : "warn"} />
        <Txt x={415} y={140} tone="bad" opacity={fade(t, 0.8, 1)}>{nw(narrow, "\"Too many open files\"", "too many files")}</Txt>
        <Txt x={415} y={176} k="s" opacity={fade(t, 0.8, 1)}>{nw(narrow, "at ~1,000 clients", "~1,000 clients")}</Txt>
        <Readout narrow={narrow} l={["every TCP connection is a file descriptor|every socket is an fd", "raise ulimit -n to 65,535+ · somaxconn, port range|raise ulimit -n"]} />
      </g>
    );
  }
  return (
    <g>
      <Kick s="containers · namespaces + cgroups" />
      <rect className="ax-box sky" x={20} y={48} width={260} height={180} />
      <Txt x={34} y={72} k="k" anchor="start" tone="sky">container</Txt>
      {(narrow ? ["PID 1: nginx", "own IP", "own /"] : ["PID 1: nginx (host 25463)", "own network: 172.17.0.2", "own filesystem view"]).map((s, i) => <Txt key={s} x={34} y={102 + i * 28} k="s" anchor="start">{s}</Txt>)}
      <Txt x={150} y={214} k="s">{nw(narrow, "namespaces: isolated view", "namespaces")}</Txt>
      <g opacity={fade(t, 0.3, 0.8)}>
        <Txt x={300} y={72} k="s" anchor="start">{nw(narrow, "cpu limit 500m", "cpu 500m")}</Txt>
        <Meter x={300} y={82} w={280} h={14} value={1} max={1} tone="warn" />
        <Txt x={300} y={116} k="s" anchor="start" tone="warn">throttled</Txt>
        <Txt x={300} y={156} k="s" anchor="start">{nw(narrow, "memory limit 512Mi", "mem 512Mi")}</Txt>
        <Meter x={300} y={166} w={280} h={14} value={1} max={1} tone="bad" />
        <Txt x={300} y={200} k="s" anchor="start" tone="bad">OOM-killed</Txt>
      </g>
      <Readout narrow={narrow} l={["namespaces isolate: PID, NET, MNT, UTS, IPC, USER|namespaces isolate", "cgroups limit: CPU is throttled, memory over the limit is killed|cgroups limit"]} />
    </g>
  );
}

function Scene(p: SceneProps) {
  if (p.variant === "memory") return <Memory {...p} />;
  if (p.variant === "io") return <Io {...p} />;
  if (p.variant === "files") return <Files {...p} />;
  return <Threads {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    { id: "threads", label: "Threads", steps: [
      { caption: "When you say a server handles 10,000 requests a second, you rely on the OS: your app sits on a runtime, system libraries and a kernel that manages processes, memory, files, I/O and the network.", tween: 1400, ms: 3800 },
      { caption: "A process has isolated memory; threads share one heap. Threads are cheaper to create and switch, about 10 microseconds to create, but one crashing thread kills them all.", tween: 1400, ms: 3600 },
      { caption: "Shared memory brings races. Two threads both read the counter as 0, both write 1: expected 2, actual 1. Use a mutex or an atomic increment.", tween: 2000 },
      { caption: "Deadlock: each thread holds the lock the other needs, so both wait forever. Always acquiring locks in one global order prevents it.", tween: 1400 },
    ] },
    { id: "memory", label: "Memory", steps: [
      { caption: "Virtual memory gives each process its own address space. A page table maps 4 KB virtual pages to physical frames, and the TLB caches those translations.", tween: 1600 },
      { caption: "A minor page fault only updates the page table, in microseconds. A major fault reads the page back from disk, about 1000 times slower on an HDD: that's why swapping kills latency.", tween: 1600, ms: 3600 },
      { caption: "The hierarchy: L1 cache at half a nanosecond, RAM at 100, an SSD read at 150 microseconds, an HDD seek at 10 milliseconds. L1 is about 200 times faster than RAM.", tween: 1600 },
      { caption: "Memory moves in 64-byte cache lines. Reading an array row by row uses every int each line brings in; jumping down a column misses the cache again and again.", tween: 1800 },
    ] },
    { id: "io", label: "I/O models", steps: [
      { caption: "Thread per connection is simple, but each thread blocks while it waits. At a million connections, that is a million stacks of about 1 MB: a terabyte just for stacks.", tween: 1400 },
      { caption: "Instead, one thread watches many sockets with epoll, which returns only the ready ones. No blocking, no forced context switches: this is how Node.js, nginx and Redis work.", tween: 1600, loop: true },
      { caption: "To use every core, run one event loop per core and hand CPU-heavy work to a thread pool. With 32 cores, each loop handles about 30,000 connections.", tween: 1400 },
    ] },
    { id: "files", label: "Files & limits", steps: [
      { caption: "write() lands in the page cache in RAM and returns at once; the disk gets it later. If the power fails first, it is gone. fsync() forces it to disk.", tween: 1400 },
      { caption: "Databases make that safe with a write-ahead log: append to the log, fsync it, then update the data files. Appends are sequential, about 100 MB a second versus 1 for random writes on an HDD.", tween: 1600, ms: 3800 },
      { caption: "Every TCP connection is a file descriptor, and the default limit is often 1,024. Around 1,000 clients you hit: too many open files. Raise ulimit for busy servers.", tween: 1600 },
      { caption: "A container is a process with isolated namespaces, limited by cgroups. Go over the CPU limit and it is throttled; go over the memory limit and it is OOM-killed.", tween: 1400 },
    ] },
  ],
  Scene,
});
