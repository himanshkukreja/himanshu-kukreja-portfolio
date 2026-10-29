/**
 * Whole-lesson overview (week 6, day 4 · presence and chat fan-out at scale). The Preface's
 * illustrative Saturday night in "Goa Trip" (a lost ack and a double payment, a fast clock, a dead
 * phone still online, a stuck typing indicator, a 300,000-member room at 100% CPU) and the three
 * classes of event; presence (heartbeats with a TTL of d + ε and an offline trigger at d + 2ε, per
 * device, server-stamped last seen, eager ~84,000/s vs visible-only ~22,000/s, typing never stored);
 * fan-out and order (accept then distribute, bodies once with pointers to small groups, hot rooms,
 * one owner numbering each conversation, cursor receipts); and offline sync, dedup on both ends and
 * the failures that heal (split-brain presence, a crash mid-fan-out).
 */
import { Box, defineExplainer, ease, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone, type Variant } from "../kit";

const W = 600;
const H = 340;
/** a label with an optional shorter form for narrow stages: "both" or ["wide", "narrow"] */
type Two = string | [string, string];
type Nd = { x: number; y: number; w: number; h: number; l: string; n?: string };
/** an edge: from, to, and optional port offsets (y for side-by-side boxes, x for stacked ones) */
type Ed = [string, string, number?, number?];
type Fr = {
  /** kicker (top left) */
  k: Two;
  kt?: Tone;
  /** nodes in play (plain 1 or a tone); every other node is dimmed */
  on?: Record<string, Tone | 1>;
  sub?: Record<string, Two>;
  /** wires carrying traffic in this frame: [from, to, tone]; a reversed pair runs a wire backwards */
  fl?: [string, string, Tone?][];
  /** big figures: [figure, label, tone] */
  figs?: [string, Two, Tone?][];
  chips?: Two[];
  cols?: number;
  ct?: Tone;
  /** per-chip tones (override ct) */
  ctn?: Tone[];
  /** meters: [label, value, max, tone] */
  bars?: [Two, number, number, Tone?][];
  note?: Two;
  nt?: Tone;
};
type P = { x: number; y: number };
const pick = (v: Two | undefined, nr: boolean) => (v === undefined ? undefined : typeof v === "string" ? v : v[nr ? 1 : 0]);

/* the stage grid: four columns, three rows of boxes above the figures */
const CX = [16, 124, 260, 404];
const CW = [88, 116, 124, 180];
const RY = [40, 96, 156];
const RH = [44, 48, 40];
const nd = (c: number, r: number, l: string, n?: string, rows = 1): Nd => ({ x: CX[c], y: RY[r], w: CW[c], h: RY[r + rows - 1] + RH[r + rows - 1] - RY[r], l, n });

/** a soft orthogonal curve from one box to the next, picked by their relative position */
function geo(a: Nd, b: Nd, oa = 0, ob = 0): P[] {
  if (b.x >= a.x + a.w - 2 || b.x + b.w <= a.x + 2) {
    const r = b.x >= a.x + a.w - 2;
    const p0 = { x: r ? a.x + a.w : a.x, y: a.y + a.h / 2 + oa };
    const p3 = { x: r ? b.x : b.x + b.w, y: b.y + b.h / 2 + ob };
    const m = (p0.x + p3.x) / 2;
    return [p0, { x: m, y: p0.y }, { x: m, y: p3.y }, p3];
  }
  const d = b.y > a.y;
  const p0 = { x: a.x + a.w / 2 + oa, y: d ? a.y + a.h : a.y };
  const p3 = { x: b.x + b.w / 2 + ob, y: d ? b.y : b.y + b.h };
  const m = (p0.y + p3.y) / 2;
  return [p0, { x: p0.x, y: m }, { x: p3.x, y: m }, p3];
}
const bz = (g: P[], u: number): P => {
  const v = 1 - u;
  const c = [v * v * v, 3 * v * v * u, 3 * v * u * u, u * u * u];
  return { x: g.reduce((s, p, i) => s + p.x * c[i], 0), y: g.reduce((s, p, i) => s + p.y * c[i], 0) };
};
const path = (g: P[]) => `M${g[0].x} ${g[0].y}C${g[1].x} ${g[1].y} ${g[2].x} ${g[2].y} ${g[3].x} ${g[3].y}`;
const ends = (e: Ed) => geo(N[e[0]], N[e[1]], e[2], e[3]);

function Scene({ variant, step, t, clock, narrow: nr }: SceneProps) {
  const f = (F[variant] || F[Object.keys(F)[0]])[Math.min(step, (F[variant] || F[Object.keys(F)[0]]).length - 1)];
  const on = f.on || {};
  /** staggered fade-in for item i of n, always fully in by t = 1 */
  const fade = (i: number, n: number) => {
    const k = n > 1 ? Math.min(0.15, 0.5 / (n - 1)) : 0;
    return ease(seg(t, i * k, i * k + 0.5));
  };
  const xs = [[300], [160, 440], [100, 300, 500]][(f.figs?.length || 1) - 1] || [];
  const cols = f.cols || 2;
  const cw = (552 - (cols - 1) * 8) / cols;
  return (
    <g>
      <Txt x={16} y={26} k="k" anchor="start" tone={f.kt}>
        {pick(f.k, nr)}
      </Txt>
      {E.map((e) => {
        const [a, b] = e;
        const live = a in on && b in on;
        const fl = f.fl?.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        return <Wire key={a + b} d={path(ends(e))} tone={fl ? fl[2] || "lit" : undefined} arrow={live} opacity={live ? 1 : 0.3} />;
      })}
      {Object.entries(N).map(([id, n]) => {
        const s = on[id];
        return <Box key={id} x={n.x} y={n.y} w={n.w} h={n.h} label={nr ? n.n || n.l : n.l} sub={(nr ? undefined : pick(f.sub?.[id], nr)) || undefined} tone={s === 1 ? undefined : s} dim={!(id in on)} />;
      })}
      {f.fl?.map(([a, b, tone], i) => {
        const e = E.find((x) => (x[0] === a && x[1] === b) || (x[0] === b && x[1] === a));
        if (!e) return null;
        const u = ((((t - 1) * 0.5 + clock * 0.55 + 0.5 + i * 0.17) % 1) + 1) % 1;
        const p = bz(ends(e), e[0] === a ? u : 1 - u);
        return <Token key={a + b} x={p.x} y={p.y} s={9} tone={tone || "lit"} />;
      })}
      {f.figs?.map(([d, l, tone], i) => (
        <g key={d + i} opacity={fade(i, f.figs?.length || 1)}>
          <Txt x={xs[i]} y={254} k="d" tone={tone}>
            {d}
          </Txt>
          <Txt x={xs[i]} y={278} k="s">
            {pick(l, nr)}
          </Txt>
        </g>
      ))}
      {f.chips?.map((c, i) => {
        const x = 24 + (i % cols) * (cw + 8);
        const y = 214 + Math.floor(i / cols) * 34;
        const tone = f.ctn?.[i] || f.ct || "lit";
        return (
          <g key={i} opacity={fade(i, f.chips?.length || 1)}>
            <rect className={`ax-box ${tone}`} x={x} y={y} width={cw} height={26} />
            <Txt x={x + cw / 2} y={y + 18} k="s" tone={tone}>
              {pick(c, nr)}
            </Txt>
          </g>
        );
      })}
      {f.bars?.map(([l, v, m, tone], i) => (
        <g key={i} opacity={fade(i, f.bars?.length || 1)}>
          <Txt x={24} y={232 + i * 28} k="s" anchor="start" tone={tone}>
            {pick(l, nr)}
          </Txt>
          <Meter x={nr ? 330 : 300} y={222 + i * 28} w={nr ? 246 : 276} h={12} value={v * ease(seg(t, 0.1, 0.8))} max={m} tone={tone || "sky"} />
        </g>
      ))}
      {f.note && (
        <Txt x={16} y={f.figs || f.chips || f.bars ? H - 12 : 244} k="s" anchor="start" tone={f.nt} opacity={ease(seg(t, 0.3, 0.8))}>
          {pick(f.note, nr)}
        </Txt>
      )}
    </g>
  );
}

const N: Record<string, Nd> = {
  pp: nd(0, 0, "Priya"),
  own: nd(1, 0, "Owner"),
  log: nd(2, 0, "Chat log", "Log"),
  inbx: nd(3, 0, "Member inboxes", "Inboxes"),
  ap: nd(0, 1, "Arjun"),
  gw: nd(1, 1, "Gateways"),
  sync: nd(2, 1, "Sync"),
  kp: nd(1, 2, "Kabir"),
  pres: nd(2, 2, "Presence"),
  wat: nd(3, 2, "Watchers"),
};
const E: Ed[] = [
  ["pp", "own"],
  ["own", "log"],
  ["log", "inbx"],
  ["own", "gw"],
  ["gw", "ap"],
  ["kp", "gw"],
  ["inbx", "sync"],
  ["sync", "gw", 0, -8],
  ["gw", "pres", 8, 0],
  ["pres", "wat"],
];

const F: Record<string, Fr[]> = {
  night: [
    {
      k: ["23:31 · a lost ack, a double payment", "23:31 · a lost ack"],
      kt: "bad",
      on: { pp: "warn", own: 1, log: 1, gw: 1, ap: "bad" },
      sub: { own: "Goa Trip" },
      fl: [
        ["pp", "own", "warn"],
        ["own", "log"],
        ["own", "gw"],
        ["gw", "ap", "bad"],
      ],
      chips: [
        ['"Paid ₹48,000 for the villa"', "Priya's split request"],
        ["the ack is lost on lift Wi-Fi", "the ack is lost"],
        ["her app retries", "her app retries"],
        ["Arjun sees it twice, pays twice", "Arjun pays twice"],
      ],
      ctn: ["lit", "warn", "warn", "bad"],
      note: ["an illustrative Saturday night in a six-friend group", "an illustrative night"],
    },
    {
      k: ["23:33–23:44 · order, a dot, typing", "clock, dot, typing"],
      kt: "warn",
      on: { kp: "bad", gw: 1, pres: "warn", wat: "warn" },
      fl: [
        ["gw", "pres", "warn"],
        ["pres", "wat", "warn"],
      ],
      cols: 1,
      chips: [
        ['23:33 · a phone 4 min fast sorts "done!" above the request', "23:33 · reply above request"],
        ["23:40 · Kabir's dead phone still shows online", "23:40 · Kabir still online"],
        ['23:44 · "Meera is typing…" for nine minutes', "23:44 · typing for 9 min"],
      ],
      ctn: ["warn", "bad", "warn"],
    },
    {
      k: ["23:59 · Cricket Night, last over", "23:59 · a huge room"],
      kt: "bad",
      on: { own: "bad", log: 1, gw: "warn" },
      sub: { own: ["Cricket Night", "hot"] },
      fl: [
        ["own", "log"],
        ["own", "gw", "bad"],
      ],
      figs: [
        ["300,000", ["members", "members"]],
        ["40,000", ["online", "online"], "warn"],
        ["100%", ["chat tier CPU", "CPU"], "bad"],
      ],
      note: ["every message and presence change costs 40,000 deliveries", "40,000 deliveries each"],
    },
    {
      k: ["three classes of event", "three classes"],
      on: { log: "lit", pres: "sky", gw: 1 },
      cols: 3,
      chips: [
        ["durable · messages", "durable"],
        ["soft state · presence", "soft state"],
        ["ephemeral · typing", "ephemeral"],
        ["stored, then retried", "stored first"],
        ["in memory, a TTL", "TTL, latest wins"],
        ["never stored", "dropped first"],
      ],
      ctn: ["lit", "sky", "mute", "lit", "sky", "mute"],
      note: "push the hint, pull the truth",
    },
  ],
  presence: [
    {
      k: ["heartbeats with a TTL", "heartbeat TTL"],
      on: { kp: "lit", gw: 1, pres: "lit" },
      sub: { pres: ["per device", "per device"] },
      fl: [
        ["kp", "gw"],
        ["gw", "pres"],
      ],
      figs: [
        ["d", ["a heartbeat every d s", "heartbeat"]],
        ["d + ε", ["the entry expires", "expires"]],
        ["d + 2ε", ["offline if no new beat", "offline"], "ok"],
      ],
      note: ["a dead phone goes offline by itself; nobody has to say goodbye", "offline by itself"],
    },
    {
      k: ["per device, server's clock", "per device"],
      on: { kp: 1, gw: 1, pres: "lit", wat: 1 },
      fl: [
        ["gw", "pres"],
        ["pres", "wat"],
      ],
      chips: [
        ["stored per device", "per device"],
        ["online if any device is", "any device online"],
        ["publish only changes", "changes only"],
        ["last seen: the server's clock", "server's clock"],
      ],
      ctn: ["sky", "ok", "lit", "warn"],
    },
    {
      k: ["who gets told? everyone", "eager presence"],
      kt: "bad",
      on: { pres: "bad", wat: "bad" },
      fl: [["pres", "wat", "bad"]],
      bars: [
        [["eager · ~84,000/s", "eager ~84K/s"], 84, 167, "bad"],
        [["all messages · ~39,000/s", "messages ~39K/s"], 39, 167, "sky"],
      ],
      note: ["assumed: 5M chat users, 4 changes/h, 150 contacts, 10% online", "assumed: 150 contacts each"],
    },
    {
      k: ["only people looking", "visible-only"],
      kt: "ok",
      on: { pres: "ok", wat: "ok" },
      sub: { wat: ["on screen only", "on screen"] },
      fl: [["pres", "wat", "ok"]],
      bars: [
        [["eager · ~84,000/s", "eager ~84K/s"], 84, 167, "bad"],
        [["visible-only · ~22,000/s", "visible ~22K/s"], 22, 167, "ok"],
        [["no debounce · ~167,000/s", "flapping ~167K/s"], 167, 167, "warn"],
      ],
      note: ["online shows at once, offline can wait a few seconds", "debounce the downgrades"],
    },
    {
      k: ["typing: never stored", "typing"],
      on: { gw: 1, ap: "lit" },
      fl: [["gw", "ap"]],
      cols: 3,
      chips: [
        ["sender: 1 per 3 s", "1 per 3 s"],
        ["receiver: gone at 5 s", "gone at 5 s"],
        ["no seq, ack, retry", "no seq, no ack"],
      ],
      ctn: ["sky", "ok", "mute"],
      note: ['a lost "stopped" can\'t leave anyone typing for nine minutes', "no stuck indicator"],
    },
  ],
  fanout: [
    {
      k: ["accept, then distribute", "one message"],
      on: { pp: "lit", own: "lit", log: "lit", inbx: 1, gw: 1, ap: "ok" },
      sub: { own: "Goa Trip", log: "seq 412" },
      fl: [
        ["pp", "own"],
        ["own", "log"],
        ["log", "inbx"],
        ["own", "gw"],
        ["gw", "ap", "ok"],
      ],
      figs: [
        ["c-77", ["the client id", "client id"]],
        ["412", ["from the owner", "seq"], "lit"],
        ["1 tick", ["once it's in the log", "stored"], "ok"],
      ],
      note: ["nothing is acked before it's durable, nothing sent before it's stored", "durable before acked"],
    },
    {
      k: ["bodies once, pointers to small groups", "hybrid fan-out"],
      on: { own: 1, log: "lit", inbx: "lit", gw: 1 },
      sub: { inbx: ["pointer: up to 412", "pointers"] },
      fl: [
        ["own", "log"],
        ["log", "inbx"],
        ["own", "gw"],
      ],
      cols: 1,
      chips: [
        ["1:1 and Goa Trip (6): a pointer per member", "small: a pointer each"],
        ["Cricket Night (300,000): no per-member writes", "huge: no member writes"],
        ["live copies only to the 5,000 with it open", "live: the 5,000 open"],
      ],
      ctn: ["ok", "warn", "lit"],
    },
    {
      k: ["hot rooms are hot keys", "hot rooms"],
      kt: "warn",
      on: { own: "warn", gw: "lit", ap: 1 },
      sub: { gw: ["one copy each", "1 copy"] },
      fl: [
        ["own", "gw", "warn"],
        ["gw", "ap"],
      ],
      figs: [
        ["1 copy", ["per gateway node", "per node"], "lit"],
        ["~90%", ["of big-room sessions passive", "passive"]],
        ["15,000", ["sessions per relay", "per relay"]],
      ],
      note: ["no typing or member presence in big rooms; isolate them", "thin the events, isolate"],
    },
    {
      k: ["one owner numbers each chat", "sequence numbers"],
      on: { own: "lit", log: "lit", ap: 1, gw: 1 },
      fl: [["own", "log"]],
      chips: [
        ["holding 410, got 412: fetch 411", "gap: fetch 411"],
        ["unique (conversation_id, seq)", "a unique key fences"],
        ["receipts: forward-only cursors", "cursors, max()"],
        ["a group's tick: the minimum", "group: the minimum"],
      ],
      ctn: ["sky", "ok", "lit", "lit"],
      note: ["order per conversation, never by the sender's clock", "never by the sender's clock"],
    },
  ],
  offline: [
    {
      k: ["Kabir's phone, back after 40 min", "sync"],
      on: { kp: "lit", gw: 1, sync: "lit", inbx: 1, log: 1 },
      fl: [
        ["inbx", "sync"],
        ["sync", "gw"],
        ["gw", "kp"],
      ],
      figs: [
        ["9,120", ["inbox cursor", "cursor"]],
        ["8", ["messages, oldest first", "messages"], "lit"],
        ["9,122", ["cursor after the ack", "new cursor"], "ok"],
      ],
      note: ["Goa Trip up to 415, Mom up to 88: 6 and 2 messages from the logs", "6 + 2 from the logs"],
    },
    {
      k: ["at-least-once, deduped twice", "dedup twice"],
      on: { pp: 1, own: "lit", log: 1, gw: 1, ap: "lit" },
      fl: [
        ["pp", "own"],
        ["gw", "ap"],
      ],
      chips: [
        ["send: (device, client id) → 412", "send: client id"],
        ["receive: (conversation, seq)", "receive: seq"],
      ],
      ctn: ["lit", "ok"],
      note: ['not by timestamp or text: two "ok"s a second apart are both real', "not by text"],
    },
    {
      k: ["failures heal instead of fighting", "failures"],
      kt: "warn",
      on: { own: "warn", log: "ok", pres: "warn", sync: "ok" },
      chips: [
        ["split brain: TTL and versions", "split brain: TTL"],
        ["last seen: server clock, max()", "last seen: max()"],
        ["owner crash: the log is the commit", "log is the commit"],
        ["fan-out resumes from the log", "resume from log"],
      ],
      ctn: ["sky", "warn", "ok", "ok"],
      note: ["never use presence for correctness: a wrong dot is cosmetic", "a wrong dot is cosmetic"],
    },
  ],
};

const V: Variant[] = [
  {
    id: "night",
    label: "Saturday night",
    steps: [
      {
        caption:
          'An illustrative Saturday night in "Goa Trip", six friends. At 23:31 Priya posts "Paid ₹48,000 for the villa, ₹8,000 each please"; the server stores it, the ack is lost on lift Wi-Fi, her app retries, and Arjun sees it twice and pays twice.',
        tween: 1400,
        loop: true,
      },
      {
        caption: 'At 23:33 Rohan\'s phone clock, four minutes fast, sorts his "done!" above the request. At 23:40 Kabir, whose phone died at 23:12, still shows online. At 23:44 "Meera is typing…" has been on screen for nine minutes.',
        tween: 1400,
        loop: true,
      },
      { caption: 'At 23:59 the 300,000-member "Cricket Night" community, 40,000 online, reaches the last over: every message and presence change costs 40,000 deliveries, and the chat tier\'s CPU hits 100%.', tween: 1400, loop: true },
      {
        caption:
          "Three classes of event: durable messages and read markers, stored before anyone is told and retried; soft-state presence, in memory with a TTL, latest wins; ephemeral typing, never stored and dropped first. Push the hint, pull the truth.",
        tween: 1400,
      },
    ],
  },
  {
    id: "presence",
    label: "Presence",
    steps: [
      {
        caption:
          "Each device heartbeats every d seconds; its entry expires after d + ε, and a delayed trigger at d + 2ε publishes \"offline\" only if no newer heartbeat came, as in LinkedIn's design. Kabir's dead phone goes offline by itself.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Presence is stored per device and the user shows as the most present device; only a change in that state is published. Last seen is the last heartbeat, stamped by the presence server's clock, never the phone's.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "Telling every online contact is expensive: with an assumed 5M chat users changing state 4 times an hour and 150 contacts each, 10% online, that's ~84,000 pushes a second, twice the ~39,000 message deliveries.",
        tween: 1400,
        loop: true,
      },
      {
        caption: "So clients subscribe only to the users on screen, as Slack, Discord and LinkedIn do: ~22,000 pushes a second, about half the message traffic. Debouncing matters too: 30 raw flips an hour would mean ~167,000.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          'Typing is throttled by the sender to one event every 3 seconds and expired by the receiver 5 seconds after the last, whether or not "stopped" arrives. No storage, sequence number, ack or retry, and it\'s dropped first under load.',
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "fanout",
    label: "Fan-out & order",
    steps: [
      {
        caption:
          "Priya's phone sends with client id c-77; the Goa Trip owner appends it to the conversation log as seq 412 and only then acks (one tick). Pointers go to members' inboxes, a live copy to connected devices, and \"delivered\" acks come back.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "The hybrid: the body goes once into the conversation log, small groups get a tiny pointer in each member's inbox, and a 300,000-member room gets none, since pointers would be 600,000 inbox writes a second. Live copies go only to the 5,000 with it open.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "A hot room is a hot key: send one copy per gateway node, full messages only to people looking (Discord found ~90% of large-server connections passive), split the work across relays of up to 15,000 sessions, and drop typing and member presence there.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Order comes from one owner per conversation assigning 1, 2, 3…, never from senders' clocks; gaps are visible and fetched, and a unique (conversation_id, seq) key fences a failed-over owner. Receipts are forward-only cursors; a group's tick is the minimum.",
        tween: 1400,
        loop: true,
      },
    ],
  },
  {
    id: "offline",
    label: "Offline & failures",
    steps: [
      {
        caption:
          "Kabir's phone comes back after 40 minutes with inbox cursor 9,120. Sync reads the pointers after it (Goa Trip up to 415, Mom up to 88), fetches 6 and 2 messages from the logs, oldest first, and the ack moves the cursor to 9,122.",
        tween: 1400,
        loop: true,
      },
      {
        caption:
          'Every hop retries, so dedup on both ends: the owner dedups sends on the sender device and client message id, so Priya\'s retry gets "412" back; devices dedup receives on (conversation, seq), so a re-sent 412 is dropped and re-acked.',
        tween: 1400,
        loop: true,
      },
      {
        caption:
          "Split-brain presence heals by TTL and per-user versions, and last seen stays server-stamped and monotonic. A crash mid-fan-out is safe because the log write is the commit point: fan-out resumes from the log, and sync repairs the rest.",
        tween: 1400,
      },
    ],
  },
];

export default defineExplainer({ w: W, h: H, variants: V, Scene });
