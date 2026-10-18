/**
 * Thread-per-connection vs an epoll event loop (week 0, part 5 · 6.2-6.4): blocking threads sit
 * idle in read() and don't scale past ~10K connections; one thread blocked in epoll_wait gets back
 * only the ready connections and handles them in turn.
 */
import { Box, defineExplainer, ease, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const CL = [0, 1, 2].map((i) => ({ x: 24, y: 52 + i * 88, w: 118, h: 60 }));
const mid = (b: { x: number; y: number; w: number; h: number }, side: "l" | "r") => ({ x: side === "l" ? b.x : b.x + b.w, y: b.y + b.h / 2 });

function Threads({ step, t, narrow }: SceneProps) {
  const TH = [0, 1, 2].map((i) => ({ x: 236, y: 52 + i * 88, w: 150, h: 60 }));
  const appear = step === 0 ? ease(seg(t, 0, 0.6)) : 1;
  const data = step === 1 ? ease(seg(t, 0.1, 0.6)) : 0;
  const wake = step === 1 && data >= 1;
  const grid = step === 2 ? ease(t) : 0;
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start">
        {narrow ? "thread per connection" : "thread per connection · blocking I/O"}
      </Txt>
      {CL.map((c, i) => (
        <g key={i}>
          <Box x={c.x} y={c.y} w={c.w} h={c.h} label={`Client ${i + 1}`} tone={wake && i === 1 ? "lit" : undefined} />
          <Wire d={`M${mid(c, "r").x} ${mid(c, "r").y}H${TH[i].x}`} dash opacity={appear} tone={wake && i === 1 ? "lit" : undefined} />
          <Box
            x={TH[i].x}
            y={TH[i].y}
            w={TH[i].w}
            h={TH[i].h}
            label={`Thread ${i + 1}`}
            sub={wake && i === 1 ? "handling" : narrow ? "blocked" : "read() · blocked"}
            tone={wake && i === 1 ? "ok" : "warn"}
            opacity={appear}
          />
          {!(wake && i === 1) && appear >= 1 && !narrow && (
            <Txt x={TH[i].x + TH[i].w - 8} y={TH[i].y + 16} k="s" anchor="end" tone="warn">
              zZ
            </Txt>
          )}
        </g>
      ))}
      {step === 1 && data > 0 && data < 1 && <Token x={lerp(mid(CL[1], "r").x, TH[1].x - 6, data)} y={mid(CL[1], "r").y} s={12} tone="lit" label={narrow ? undefined : "data"} />}
      {/* memory: one thread (and its stack) per connection */}
      <Txt x={W - 24} y={64} k="k" anchor="end" tone={step === 2 ? "bad" : "mute"}>
        {narrow ? "threads" : "threads alive"}
      </Txt>
      <Txt x={W - 24} y={100} k="d" anchor="end" tone={step === 2 ? "bad" : undefined}>
        {step === 2 ? (grid >= 1 ? "~10K" : Math.max(3, Math.round(grid * 10000)).toLocaleString("en-US")) : "3"}
      </Txt>
      {step === 2 && (
        <g>
          {Array.from({ length: 60 }, (_, k) => {
            const on = k / 60 < grid;
            return <rect key={k} className="io-cell" x={W - 24 - 132 + (k % 10) * 13.4} y={124 + Math.floor(k / 10) * 13.4} width={9} height={9} opacity={on ? 1 : 0.12} />;
          })}
          <Txt x={W - 24} y={226} k="s" anchor="end" tone="bad">
            {narrow ? "1 per connection" : "1 thread per connection"}
          </Txt>
          <Txt x={W - 24} y={248} k="s" anchor="end" tone="bad">
            {narrow ? "limit ~10K" : "doesn't scale past ~10K"}
          </Txt>
        </g>
      )}
      {step < 2 && !narrow && (
        <Txt x={W - 24} y={124} k="s" anchor="end">
          idle while blocked
        </Txt>
      )}
    </g>
  );
}

function Loop({ step, t, narrow }: SceneProps) {
  const EP = { x: 214, y: 82, w: 132, h: 156 };
  const TH = { x: 430, y: 118, w: 146, h: 84 };
  const reg = step === 0 ? ease(seg(t, 0, 0.6)) : 1;
  // which clients send data this step, and the order the thread handles them
  const ready = step === 1 ? [1] : step === 2 ? [0, 2] : [];
  const inbound = ease(seg(t, 0.05, 0.4));
  const handOff = (k: number) => ease(seg(t, 0.45 + k * 0.25, 0.65 + k * 0.25));
  const handling = ready.length ? ready.find((_, k) => handOff(k) > 0 && (k === ready.length - 1 || handOff(k + 1) <= 0)) : undefined;
  const waiting = ready.length === 0 || t < 0.45;
  const sub = waiting ? "epoll_wait()" : handling !== undefined ? `handle c${handling + 1}` : "epoll_wait()";
  const tone: Tone = waiting ? "warn" : "ok";
  const toks: { x: number; y: number; tone: Tone; label?: string }[] = [];
  ready.forEach((c, k) => {
    if (inbound < 1) toks.push({ x: lerp(mid(CL[c], "r").x, EP.x - 6, inbound), y: lerp(mid(CL[c], "r").y, EP.y + 40 + c * 38, inbound), tone: "lit" });
    const h = handOff(k);
    if (inbound >= 1 && h < 1) toks.push({ x: lerp(EP.x + EP.w, TH.x - 6, h), y: lerp(EP.y + 40 + c * 38, TH.y + TH.h / 2, h), tone: "ok", label: narrow ? undefined : `c${c + 1} ready` });
  });
  const readyNow = (c: number) => ready.includes(c) && inbound >= 1 && handOff(ready.indexOf(c)) < 1;
  return (
    <g>
      <Txt x={24} y={30} k="k" anchor="start">
        {narrow ? "event loop · epoll" : "event loop · one thread · epoll"}
      </Txt>
      {CL.map((c, i) => (
        <g key={i}>
          <Box x={c.x} y={c.y} w={c.w} h={c.h} label={`Client ${i + 1}`} tone={ready.includes(i) && inbound < 1 ? "lit" : undefined} />
          <Wire d={`M${mid(c, "r").x} ${mid(c, "r").y}L${EP.x} ${EP.y + 40 + i * 38}`} dash opacity={reg} />
        </g>
      ))}
      <Box x={EP.x} y={EP.y} w={EP.w} h={EP.h} tone={ready.length && inbound >= 1 && t < 0.95 ? "lit" : undefined} />
      <Txt x={EP.x + EP.w / 2} y={EP.y + 22} k="t">
        epoll
      </Txt>
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={reg}>
          <rect className={readyNow(i) ? "io-fd on" : "io-fd"} x={EP.x + 14} y={EP.y + 30 + i * 38} width={EP.w - 28} height={22} />
          <Txt x={EP.x + EP.w / 2} y={EP.y + 46 + i * 38} k="s" tone={readyNow(i) ? "lit" : undefined}>
            {readyNow(i) ? `c${i + 1} ready` : `c${i + 1}`}
          </Txt>
        </g>
      ))}
      <Wire d={`M${EP.x + EP.w} ${TH.y + TH.h / 2}H${TH.x}`} arrow tone={handling !== undefined ? "ok" : undefined} />
      <Box x={TH.x} y={TH.y} w={TH.w} h={TH.h} label="Thread" sub={sub} tone={tone} />
      {/* the loop back to epoll_wait */}
      <path className={step === 3 ? "io-loop on" : "io-loop"} d={`M${TH.x + TH.w / 2} ${TH.y + TH.h}V${TH.y + TH.h + 30}H${TH.x + 20}V${TH.y + TH.h + 4}`} markerEnd={`url(#ax-arrow${step === 3 ? "-lit" : ""})`} />
      <Txt x={TH.x + TH.w / 2} y={TH.y + TH.h + 52} k="s" tone={step === 3 ? "lit" : "mute"}>
        {narrow ? "repeat" : "→ epoll_wait again"}
      </Txt>
      {step === 3 && (
        <Txt x={W - 24} y={TH.y - 28} k="s" anchor="end" tone="ok">
          {narrow ? "1 thread" : "many connections, 1 thread"}
        </Txt>
      )}
      {toks.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={12} tone={k.tone} label={k.label} />
      ))}
    </g>
  );
}

function Scene(p: SceneProps) {
  return p.variant === "loop" ? <Loop {...p} /> : <Threads {...p} />;
}

export default defineExplainer({
  w: W,
  h: H,
  css: `.io-cell{fill:var(--ax-bad)}
.io-fd{fill:none;stroke:var(--ax-line);stroke-width:1.5}.io-fd.on{stroke:var(--ax-accent);stroke-width:2}
.io-loop{fill:none;stroke:var(--ax-line);stroke-width:1.5}.io-loop.on{stroke:var(--ax-accent);stroke-width:2.5}`,
  variants: [
    {
      id: "threads",
      label: "Thread per conn",
      steps: [
        { caption: "accept() spawns one thread per client. Each thread calls read() and blocks until its data arrives.", tween: 1400, ms: 2800 },
        { caption: "Data arrives for client 2: thread 2 wakes and handles it. Threads 1 and 3 sit idle, still blocked.", tween: 1400, ms: 3000 },
        { caption: "Every connection costs a thread, and threads are expensive: this doesn't scale past ~10K connections.", tween: 2200, ms: 3400 },
      ],
    },
    {
      id: "loop",
      label: "Event loop",
      steps: [
        { caption: "One thread registers every connection with epoll once, then blocks in epoll_wait until one is ready.", tween: 1400, ms: 2800 },
        { caption: "Client 2's data arrives: epoll_wait returns only that ready connection, and the thread reads and processes it.", tween: 2000, ms: 2800 },
        { caption: "Clients 1 and 3 become ready together: one epoll_wait returns both, handled one after another.", tween: 2600, ms: 2800 },
        { caption: "Then back to epoll_wait. One thread, many connections: how Node.js, nginx and Redis work.", tween: 1000, ms: 3400 },
      ],
    },
  ],
  Scene,
});
