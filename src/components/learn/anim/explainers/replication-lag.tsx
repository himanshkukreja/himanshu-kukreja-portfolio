/**
 * Replication lag and read-your-writes (week 1, day 2 · 3.2 anomaly 1 / 4.3): the lesson's
 * "new email" timeline, then the fix: route the user's reads of fresh writes to the leader.
 */
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps, type Tone } from "../kit";

const W = 600;
const H = 320;
const USER = { x: 24, y: 128, w: 120, h: 64 };
const LEAD = { x: 240, y: 40, w: 150, h: 64 };
const FOLL = { x: 240, y: 216, w: 150, h: 64 };
const OLD = "old@mail";
const NEW = "new@mail";

const right = (b: typeof USER) => ({ x: b.x + b.w, y: b.y + b.h / 2 });
const left = (b: typeof USER) => ({ x: b.x, y: b.y + b.h / 2 });
const move = (a: { x: number; y: number }, b: { x: number; y: number }, p: number) => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });

function Scene({ variant, step, t, narrow }: SceneProps) {
  const fix = variant === "ryw";
  // replication progress leader → follower (slow): reaches the follower at step 4 (anomaly) / 3 (fix)
  const repl = fix ? (step === 0 ? seg(t, 0.4, 1) * 0.45 : step === 1 ? 0.45 + t * 0.15 : step === 2 ? 0.6 + t * 0.15 : 0.75 + t * 0.25) : step === 0 ? seg(t, 0.4, 1) * 0.3 : step === 1 ? 0.3 + t * 0.2 : step === 2 ? 0.5 + t * 0.15 : step === 3 ? 0.65 + t * 0.15 : 0.8 + (step === 4 ? t : 1) * 0.2;
  const leaderNew = step > 0 || t > 0.45;
  const followerNew = repl >= 1;
  const wrote = step === 0 ? seg(t, 0, 0.45) : 1;
  const tokens: { x: number; y: number; tone: Tone; o?: number; label?: string }[] = [];
  if (step === 0 && wrote < 1) tokens.push({ ...move(right(USER), left(LEAD), wrote), tone: "lit", label: "write" });
  if (repl > 0 && repl < 1) tokens.push({ x: LEAD.x + LEAD.w / 2, y: lerp(LEAD.y + LEAD.h, FOLL.y, repl), tone: "sky" });
  let seen: string | null = null;
  let seenTone: Tone = undefined;
  if (!fix) {
    if (step === 2) tokens.push({ ...move(right(USER), left(FOLL), t), tone: "mute", label: "read" });
    if (step === 3) {
      tokens.push({ ...move(left(FOLL), right(USER), Math.min(1, t * 1.4)), tone: "bad", o: t > 0.7 ? 0 : 1 });
      if (t > 0.7) [seen, seenTone] = [OLD, "bad"];
    }
    if (step === 4) [seen, seenTone] = [OLD, "bad"];
    if (step === 5) {
      tokens.push({ ...move(right(USER), left(FOLL), seg(t, 0, 0.5)), tone: "mute", o: t > 0.5 ? 0 : 1 });
      if (t > 0.5) tokens.push({ ...move(left(FOLL), right(USER), seg(t, 0.5, 1)), tone: "ok", o: t >= 1 ? 0 : 1 });
      [seen, seenTone] = t >= 1 ? [NEW, "ok"] : [OLD, "bad"];
    }
  } else {
    if (step === 1) tokens.push({ ...move(right(USER), left(LEAD), t), tone: "mute", label: "read" });
    if (step === 2) {
      tokens.push({ ...move(left(LEAD), right(USER), Math.min(1, t * 1.4)), tone: "ok", o: t > 0.7 ? 0 : 1 });
      if (t > 0.7) [seen, seenTone] = [NEW, "ok"];
    }
    if (step === 3) [seen, seenTone] = [NEW, "ok"];
  }
  const readsTo = fix ? (step >= 1 && step <= 2 ? "leader" : null) : step >= 2 ? "follower" : null;
  return (
    <g>
      <Box x={USER.x} y={USER.y} w={USER.w} h={USER.h} label="User" sub="profile page" tone={seenTone} />
      <Box x={LEAD.x} y={LEAD.y} w={LEAD.w} h={LEAD.h} label="Leader" sub={leaderNew ? NEW : OLD} tone={readsTo === "leader" ? "lit" : leaderNew ? "ok" : undefined} />
      <Box x={FOLL.x} y={FOLL.y} w={FOLL.w} h={FOLL.h} label="Follower" sub={followerNew ? NEW : OLD} tone={readsTo === "follower" ? "lit" : followerNew ? "ok" : undefined} />
      <Wire d={`M${right(USER).x} ${right(USER).y}C200 ${right(USER).y} 200 ${left(LEAD).y} ${LEAD.x} ${left(LEAD).y}`} tone={readsTo === "leader" || (step === 0 && wrote < 1) ? "lit" : undefined} />
      <Wire d={`M${right(USER).x} ${right(USER).y}C200 ${right(USER).y} 200 ${left(FOLL).y} ${FOLL.x} ${left(FOLL).y}`} tone={readsTo === "follower" ? "lit" : fix ? "mute" : undefined} />
      <Wire d={`M${LEAD.x + LEAD.w / 2} ${LEAD.y + LEAD.h}V${FOLL.y}`} dash arrow tone={repl > 0 && repl < 1 ? "sky" : undefined} />
      <Txt x={LEAD.x + LEAD.w / 2 + 12} y={(LEAD.y + LEAD.h + FOLL.y) / 2 + 4} k="s" anchor="start" tone={repl > 0 && repl < 1 ? "sky" : "mute"}>
        {followerNew ? "caught up" : "async replication · lag"}
      </Txt>
      {tokens.map((k, i) => (
        <Token key={i} x={k.x} y={k.y} s={11} tone={k.tone} opacity={k.o} label={narrow ? undefined : k.label} />
      ))}
      {/* what the user sees */}
      <Txt x={W - 24} y={92} k="k" anchor="end">
        {narrow ? "sees" : "user sees"}
      </Txt>
      <Txt x={W - 24} y={130} k="d" anchor="end" tone={seenTone || "mute"}>
        {seen || "…"}
      </Txt>
      {seen === OLD && (
        <Txt x={W - 24} y={154} k="s" anchor="end" tone="bad">
          {narrow ? "stale read" : "stale: \"did my save fail?\""}
        </Txt>
      )}
      {fix && step >= 1 && (
        <Txt x={W - 24} y={262} k="s" anchor="end" tone="lit">
          {narrow ? "own writes → leader" : "own recent writes → read the leader"}
        </Txt>
      )}
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "lag",
      label: "Async follower",
      steps: [
        { caption: "Time 0: the user saves a new email. The write goes to the leader, which applies it and acknowledges.", tween: 1600 },
        { caption: "With asynchronous replication the follower gets the change a moment later. That delay is replication lag: milliseconds normally, minutes under load.", tween: 1400 },
        { caption: "Time 1: the user's next read is routed to the follower, which hasn't received the write yet.", tween: 1400 },
        { caption: "Time 2: the follower answers with the old email. The user thinks the save failed.", tween: 1400 },
        { caption: "Time 3: the follower finally receives the write.", tween: 1400 },
        { caption: "Time 4: the user refreshes and now sees the new email, more confused than before.", tween: 1800 },
      ],
    },
    {
      id: "ryw",
      label: "Read-your-writes",
      steps: [
        { caption: "Same write: the new email lands on the leader; replication to the follower is still in flight.", tween: 1600 },
        { caption: "Read-your-writes: for data this user just wrote, route their reads to the leader (or to a replica that has caught up to their last write).", tween: 1400 },
        { caption: "The leader has the write, so the user sees the new email immediately.", tween: 1400 },
        { caption: "The follower catches up in the background. Other users may still read it slightly stale, which is fine: only the writer must see their own change.", tween: 1600, ms: 3600 },
      ],
    },
  ],
  Scene,
});
