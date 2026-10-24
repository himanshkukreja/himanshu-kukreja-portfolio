/**
 * Whole-lesson overview (week 6, day 3 · advanced features): what each feature changes about what
 * reaches the user. A/B variants by weighted hashing (50/30/20, bucket 65 → variant_a, winner after
 * 1,000 sends and a 10% lift); when to send (20 likes → one batched push, HYBRID 10 / 300 s,
 * 6 PM local digests, UTC scheduling on the leader, best hour + random minute); the multi-channel
 * saga (simultaneous primaries, 60 s wait then fallback, escalation 5 min → SMS, 15 min → call);
 * and the user side (inbox:{user_id} capped at 100, unread counter, WebSocket + Redis pub/sub,
 * hierarchical preferences with optimistic locking and cache invalidation).
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
type M = [wide: string, narrow: string, tone?: Tone];

function Card({ x, y, w, h = 32, m, narrow, op = 1 }: { x: number; y: number; w: number; h?: number; m: M; narrow: boolean; op?: number }) {
  return (
    <g opacity={op}>
      <rect className={`ax-box${m[2] ? ` ${m[2]}` : ""}`} x={x} y={y} width={w} height={h} />
      <Txt x={x + w / 2} y={y + h / 2 + 5} k="s" tone={m[2]}>
        {narrow ? m[1] : m[0]}
      </Txt>
    </g>
  );
}

/** the user's phone on the right: what actually arrives */
function Phone({ msgs, narrow, t, badge }: { msgs: M[]; narrow: boolean; t: number; badge?: string }) {
  return (
    <g>
      <rect className="ax-box" x={440} y={48} width={148} height={256} />
      <Txt x={514} y={70} k="s">
        {narrow ? "phone" : "user's phone"}
      </Txt>
      {badge && <Card x={450} y={258} w={128} h={36} m={[`unread: ${badge}`, `unread ${badge}`, "lit"]} narrow={narrow} op={seg(t, 0.6, 0.9)} />}
      {msgs.map((m, i) => (
        <Card key={i} x={450} y={84 + i * 44} w={128} h={36} m={m} narrow={narrow} op={seg(t, 0.5 + i * 0.1, 0.8 + i * 0.1)} />
      ))}
    </g>
  );
}

/* ---------------------------------------------------------------- A/B tests */
const SEGS: [string, string, number][] = [
  ["control", "control", 50],
  ["variant_a", "variant_a", 30],
  ["var_b", "var_b", 20],
];
const BAR = (v: number) => 24 + (v / 100) * 380;

function AB({ step, t, narrow }: SceneProps) {
  const mk = BAR(65);
  return (
    <g>
      <Txt x={214} y={84} tone={step === 1 ? "lit" : undefined}>
        md5(user_id:test_id) % 100
      </Txt>
      {SEGS.map(([w, n, wt], i) => {
        const a = SEGS.slice(0, i).reduce((s, x) => s + x[2], 0);
        const tone: Tone = step >= 1 && i === 1 ? "lit" : undefined;
        return (
          <g key={w}>
            <rect className={`ax-box${tone ? ` ${tone}` : ""}`} x={BAR(a)} y={118} width={(wt / 100) * 380} height={40} />
            <Txt x={BAR(a + wt / 2)} y={143} k="s" tone={tone}>
              {narrow ? n : w}
            </Txt>
            <Txt x={BAR(a)} y={178} k="s">
              {a}
            </Txt>
          </g>
        );
      })}
      <Txt x={BAR(100)} y={178} k="s">
        100
      </Txt>
      {step === 1 && (
        <g opacity={seg(t, 0.2, 0.6)}>
          <Wire d={`M${mk} 100V170`} tone="lit" />
          <Txt x={mk} y={204} k="s" tone="lit">
            {narrow ? "bucket 65" : "user-123 → bucket 65 → variant_a"}
          </Txt>
          <Txt x={214} y={236} k="s">
            {narrow ? "same user, same variant" : "same user + test → same variant, every send"}
          </Txt>
        </g>
      )}
      {step === 2 && (
        <g>
          {[
            ["sent", "sent"],
            ["delivered", "deliv."],
            ["opened", "opened"],
            ["clicked", "clicked"],
          ].map(([w, n], i) => (
            <g key={w}>
              {i > 0 && <Wire d={`M${12 + i * 104 - 8} 216H${12 + i * 104}`} arrow />}
              <Card x={12 + i * 104} y={200} w={96} m={[w, n, i === 3 ? "lit" : undefined]} narrow={narrow} op={seg(t, i * 0.15, i * 0.15 + 0.3)} />
            </g>
          ))}
          <Card x={12} y={252} w={408} m={["winner: ≥ 1,000 sends and ≥ 10% better clicks", "≥ 1,000 sent, ≥ 10% lift", "ok"]} narrow={narrow} op={seg(t, 0.6, 0.9)} />
        </g>
      )}
      <Phone narrow={narrow} t={step === 0 ? 0 : t} msgs={step === 0 ? [] : [["variant_a copy", "variant_a", "lit"]]} />
    </g>
  );
}

/* ---------------------------------------------------------------- when to send */
function When({ step, t, clock, narrow }: SceneProps) {
  const f = seg(t, 0.05, 0.85);
  const msgs: M[][] = [
    [["20 people liked", "20 likes", "ok"]],
    [["3 people liked", "3 likes", "ok"]],
    [["Daily digest", "Digest", "ok"]],
    [["9:00 reminder", "9:00", "ok"]],
    [["sent 9:xx", "9:xx", "ok"]],
  ];
  return (
    <g>
      {step === 0 && (
        <g>
          <rect className="ax-box lit" x={24} y={176} width={380} height={28} />
          {Array.from({ length: 20 }, (_, i) => {
            const x0 = 30 + (i % 10) * 36;
            const y0 = 70 + Math.floor(i / 10) * 26;
            const d = seg(f, i * 0.03, i * 0.03 + 0.4);
            return <Token key={i} x={lerp(x0, 40 + i * 18, d)} y={lerp(y0, 190, d)} s={10} tone="lit" />;
          })}
          <Txt x={214} y={232} k="s">
            {narrow ? "Redis list per user" : "RPUSH batch:{user_id}:social_like"}
          </Txt>
          <Wire d="M404 190H446" arrow tone="lit" />
        </g>
      )}
      {step === 1 && (
        <g>
          <Txt x={24} y={96} k="s" anchor="start">
            {narrow ? "count" : "count · max 10"}
          </Txt>
          <Meter x={24} y={106} w={390} h={18} value={3} max={10} ticks={10} tone="lit" />
          <Txt x={24} y={166} k="s" anchor="start">
            {narrow ? "window" : "window · 300 s"}
          </Txt>
          <Meter x={24} y={176} w={390} h={18} value={300 * f} max={300} tone="ok" />
          <Txt x={214} y={238} tone="lit">
            {narrow ? "first one wins" : "whichever comes first"}
          </Txt>
          <Txt x={214} y={266} k="s">
            {narrow ? "check every 10 s" : "flush worker checks every 10 s"}
          </Txt>
        </g>
      )}
      {step === 2 && (
        <g>
          <Txt x={24} y={92} k="s" anchor="start">
            {narrow ? "today" : "today's transactions"}
          </Txt>
          {Array.from({ length: 10 }, (_, i) => (
            <Token key={i} x={36 + i * 26} y={116} s={12} tone="sky" opacity={seg(f, i * 0.05, i * 0.05 + 0.2)} />
          ))}
          <Box x={24} y={160} w={180} h={62} label="18:00" sub="user's time" tone="lit" />
          <Box x={228} y={160} w={180} h={62} label="email" sub="top 10" tone="ok" />
          <Wire d="M204 191H228" arrow tone="lit" />
          <Txt x={214} y={262} k="s">
            {narrow ? "daily · weekly · monthly" : "daily, weekly or monthly, per user"}
          </Txt>
        </g>
      )}
      {step === 3 && (
        <g>
          <Txt x={214} y={88} tone="lit">
            {narrow ? "9:00 New York → UTC" : "9:00 America/New_York → UTC"}
          </Txt>
          {["leader", "standby", "standby"].map((l, i) => (
            <Box key={i} x={24 + i * 132} y={130} w={116} h={56} label={narrow ? (i ? "spare" : "leader") : l} sub={narrow ? undefined : i ? "idle" : "polls / 10 s"} tone={i ? undefined : "lit"} dim={i > 0} />
          ))}
          <Txt x={214} y={232} k="s">
            {narrow ? "one poller: sent once" : "one active poller, so the reminder is sent once"}
          </Txt>
          <Wire d="M140 158C250 110 340 110 446 108" arrow dash tone="lit" />
        </g>
      )}
      {step === 4 && (
        <g>
          <Txt x={214} y={88} k="s">
            {narrow ? "30 days of engagement" : "engagement by hour, last 30 days"}
          </Txt>
          {Array.from({ length: 8 }, (_, i) => {
            const h = 6 + i;
            return <Card key={h} x={24 + i * 49} y={110} w={45} m={[`${h}`, `${h}`, h === 9 ? "lit" : undefined]} narrow={narrow} />;
          })}
          {Array.from({ length: 6 }, (_, i) => (
            <Token key={i} x={lerp(30, 400, ((i + 0.5) / 6 + clock * 0.02) % 1)} y={186} s={9} tone="lit" opacity={seg(t, 0.3 + i * 0.08, 0.5 + i * 0.08)} />
          ))}
          <Txt x={214} y={218} k="s" tone="lit">
            {narrow ? "best hour + random minute" : "best hour 9 + random minute, not all at :00"}
          </Txt>
          <Txt x={214} y={256} k="s">
            {narrow ? "too little data: 10 AM" : "under 10 engagements: default 10 AM"}
          </Txt>
        </g>
      )}
      <Phone narrow={narrow} t={t} msgs={msgs[step]} />
    </g>
  );
}

/* ---------------------------------------------------------------- multi-channel saga */
const LANES = ["Push", "SMS", "Email", "Voice call"];
const LY = (i: number) => 70 + i * 50;
const COL = [140, 300, 460];

function Saga({ step, t, narrow }: SceneProps) {
  const ev: [lane: number, col: number, m: M][] =
    step === 0
      ? [
          [0, 0, ["SENT", "SENT", "ok"]],
          [1, 0, ["SENT", "SENT", "ok"]],
          [0, 1, ["done", "done", "ok"]],
        ]
      : step === 1
        ? [
            [0, 0, ["failed", "failed", "bad"]],
            [1, 0, ["failed", "failed", "bad"]],
            [2, 1, ["re-read", "re-read"]],
            [2, 2, ["fallback", "fallback", "ok"]],
          ]
        : [
            [0, 0, ["not opened", "unopened", "warn"]],
            [1, 1, ["escalate", "escalate", "lit"]],
            [3, 2, ["no reply → call", "call", "bad"]],
          ];
  const marks = step === 0 ? ["0 s", "", ""] : step === 1 ? ["0 s", "+60 s", ""] : ["0", "5 min", "15 min"];
  return (
    <g>
      {LANES.map((l, i) => {
        const used = ev.some((e) => e[0] === i);
        return (
          <g key={l} opacity={used ? 1 : 0.35}>
            <Txt x={12} y={LY(i) + 6} anchor="start" tone={i < 2 && step < 2 ? "lit" : undefined}>
              {narrow && l === "Voice call" ? "Voice" : l}
            </Txt>
            <Wire d={`M112 ${LY(i)}H588`} dash />
          </g>
        );
      })}
      {marks.map((m, i) =>
        m ? (
          <g key={i}>
            <Wire d={`M${COL[i] + 60} 46V${LY(3) + 20}`} opacity={0.5} />
            <Txt x={COL[i] + 60} y={284} k="s">
              {m}
            </Txt>
          </g>
        ) : null,
      )}
      {ev.map(([ln, c, m], i) => (
        <Card key={i} x={COL[c] - 5} y={LY(ln) - 16} w={130} m={m} narrow={narrow} op={seg(t, i * 0.2, i * 0.2 + 0.3)} />
      ))}
      <Txt x={W / 2} y={30} k="k">
        {["primaries at once", "all primaries failed", "escalation"][step]}
      </Txt>
    </g>
  );
}

/* ---------------------------------------------------------------- in-app & preferences */
function User({ step, t, clock, narrow }: SceneProps) {
  const f = seg(t, 0.1, 0.8);
  return (
    <g>
      {step === 0 && (
        <g>
          <Token x={lerp(24, 60, f)} y={92} s={12} tone="lit" />
          <Txt x={84} y={97} k="s" anchor="start">
            LPUSH inbox:{"{user_id}"}
          </Txt>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} className={`ax-box${i === 0 ? " lit" : ""}`} x={24 + i * 50} y={116} width={44} height={30} opacity={i === 0 ? f : 1} />
          ))}
          <Txt x={214} y={172} k="s">
            {narrow ? "keep last 100" : "LTRIM: keep the last 100"}
          </Txt>
          <Box x={24} y={196} w={180} h={56} label="unread +1" sub={narrow ? undefined : "unread:{user_id}"} tone="lit" />
          <Box x={228} y={196} w={180} h={56} label="online?" sub={narrow ? "→ WS" : "→ WebSocket"} tone="ok" />
          <Wire d="M408 224H446" arrow tone="ok" />
        </g>
      )}
      {step === 1 && (
        <g>
          <Box x={24} y={84} w={170} h={60} label="ws-server-1" sub={narrow ? undefined : "processes it"} />
          <Box x={240} y={84} w={170} h={60} label="ws-server-2" sub={narrow ? undefined : "holds socket"} tone="ok" />
          <Box x={24} y={200} w={386} h={50} label={narrow ? "Redis pub/sub" : "Redis pub/sub · ws:{user_id}"} tone="sky" />
          <Wire d="M109 144V200" arrow tone="sky" />
          <Wire d="M325 200V144" arrow tone="sky" />
          <Wire d="M410 114H446" arrow tone="ok" />
          <Token x={lerp(109, 325, (f + clock * 0.4) % 1)} y={212} s={10} tone="lit" />
        </g>
      )}
      {step === 2 &&
        [
          ["global", "on", "ok"],
          ["channel: push", "on", "ok"],
          ["marketing → [email]", "push ✗", "bad"],
        ].map(([l, s, tone], i) => (
          <g key={l} opacity={seg(t, i * 0.25, i * 0.25 + 0.3)}>
            {i > 0 && <Wire d={`M214 ${76 + i * 72 - 16}V${76 + i * 72}`} arrow />}
            <Box x={24} y={76 + i * 72} w={380} h={56} label={narrow && i === 2 ? "mkt → [email]" : l} sub={s} tone={tone as Tone} />
          </g>
        ))}
      {step === 3 && (
        <g>
          {["update A", "update B"].map((u, i) => (
            <Box key={u} x={24 + i * 200} y={76} w={180} h={56} label={u} sub={narrow ? undefined : "expects version v"} tone={i ? "bad" : "ok"} />
          ))}
          <Box x={24} y={164} w={380} h={50} label={narrow ? "WHERE version = v" : "UPDATE … WHERE version = v"} tone="lit" />
          <Wire d="M114 132V164" arrow tone="ok" />
          <Wire d="M314 132V164" arrow tone="bad" />
          <Txt x={214} y={244} k="s" tone="bad" opacity={seg(t, 0.3, 0.6)}>
            {narrow ? "B: conflict, re-read" : "B: ConflictError → re-read and retry"}
          </Txt>
          <Txt x={214} y={272} k="s" tone="ok" opacity={seg(t, 0.6, 0.9)}>
            {narrow ? "then DEL prefs cache" : "then delete prefs:{user_id} (5-min cache)"}
          </Txt>
        </g>
      )}
      <Phone
        narrow={narrow}
        t={t}
        badge={step < 2 ? "1" : undefined}
        msgs={step < 2 ? [["new in-app", "in-app", "ok"]] : step === 2 ? [["email only", "email", "ok"]] : [["prefs v+1", "v+1", "ok"]]}
      />
    </g>
  );
}

function Scene(p: SceneProps) {
  const k: Record<string, string[]> = {
    ab: ["a/b test · weights", "a/b test · bucket", "a/b test · winner"],
    when: ["batching", "hybrid batching", "digests", "scheduling", "best time to send"],
    user: ["in-app notification center", "websocket fan-out", "hierarchical preferences", "optimistic locking"],
  };
  return (
    <g>
      {k[p.variant] && (
        <Txt x={W / 2} y={30} k="k">
          {k[p.variant][p.step]}
        </Txt>
      )}
      {p.variant === "ab" ? <AB {...p} /> : p.variant === "when" ? <When {...p} /> : p.variant === "saga" ? <Saga {...p} /> : <User {...p} />}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "ab",
      label: "A/B tests",
      steps: [
        { caption: "A/B testing a template: its variants get traffic weights, here control 50, variant_a 30 and variant_b 20.", tween: 1000 },
        { caption: "The bucket is a hash of user_id and test_id, mod 100. Bucket 65 is past 50 but under 80: variant_a, every time for that user.", tween: 1400 },
        { caption: "Sends, deliveries, opens and clicks are counted. A winner needs at least 1,000 sends and a click rate at least 10% better.", tween: 1600 },
      ],
    },
    {
      id: "when",
      label: "When to send",
      steps: [
        { caption: "Batching: instead of 20 separate “X liked your post” pushes, the user gets one: “20 people liked your post”.", tween: 1800 },
        { caption: "Likes use HYBRID batching: flush at 10, or when the 300-second window passes, whichever comes first. A flush worker checks every 10 s.", tween: 1800 },
        { caption: "Digests are scheduled summaries: the day's transactions, top 10 items, emailed at the preferred 6 PM in the user's own timezone.", tween: 1400 },
        { caption: "A reminder for 9:00 in America/New_York is stored in UTC. Only the leader polls for due items, every 10 s, so it is sent once.", tween: 1400 },
        { caption: "Best time to send: the hour the user engaged most over 30 days, plus a random minute, so millions sharing 9 AM don't fire at :00.", tween: 1400, loop: true },
      ],
    },
    {
      id: "saga",
      label: "Multi-channel",
      steps: [
        { caption: "A security alert runs as a saga: push and SMS, the primaries, go out at the same time. If any primary succeeds, it is done.", tween: 1400 },
        { caption: "If every primary fails, wait 60 seconds, re-read the record in case a webhook confirmed one, and only then try the email fallback.", tween: 1600 },
        { caption: "Escalation reacts to silence, not failure: push unopened after 5 minutes escalates to SMS, no response by 15 minutes to a voice call.", tween: 1600 },
      ],
    },
    {
      id: "user",
      label: "In-app & prefs",
      steps: [
        { caption: "In-app: each notification is pushed onto inbox:{user_id}, trimmed to the last 100, and unread goes up. Online users get it by WebSocket.", tween: 1400 },
        { caption: "Processed on ws-server-1, but the socket is on ws-server-2? Server 1 publishes on Redis channel ws:{user_id}, and server 2 pushes it.", tween: 1400, loop: true },
        { caption: "Preferences are hierarchical: global, channel, then category. All must agree, so marketing set to email only blocks a marketing push.", tween: 1600 },
        { caption: "Updates use optimistic locking: a write lands only if the version still matches, else re-read and retry. Then the cached prefs are deleted.", tween: 1400 },
      ],
    },
  ],
  Scene,
});
