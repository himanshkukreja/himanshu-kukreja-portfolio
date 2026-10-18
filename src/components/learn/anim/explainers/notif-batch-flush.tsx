/**
 * Batching (week 6, day 3 · 2.1 / 2.2): social_like uses the HYBRID strategy, max_count 10 and a
 * 300 s window, whichever comes first. Each like is pushed onto the Redis list
 * batch:{user_id}:social_like; the 10th like flushes at once, otherwise the flush worker (every
 * 10 s) flushes the batch when its window has passed. One notification goes out per batch.
 */
import { Box, defineExplainer, lerp, Meter, seg, Token, Txt, Wire, type SceneProps } from "../kit";

const W = 600;
const H = 320;
const SRC = { x: 24, y: 104, w: 108, h: 64 };
const LIST = { x: 176, y: 116, w: 250, h: 40 };
const PHONE = { x: 458, y: 70, w: 118, h: 150 };
const MAX = 10;

function Scene({ variant, step, t, narrow }: SceneProps) {
  const byCount = variant === "count";
  const target = byCount ? 10 : 4;
  // likes in the list, window progress (0 → 1 = 300 s), flushed?
  let likes = 0;
  let win = 0;
  let flushed = 0; // 0 → 1 animation of the flush
  if (step === 0) {
    likes = t >= 0.95 ? (byCount ? 6 : 4) : Math.floor(seg(t, 0.05, 0.95) * (byCount ? 6 : 4));
    win = lerp(0, byCount ? 0.3 : 0.4, t);
  } else if (step === 1) {
    likes = byCount ? 6 + Math.min(4, Math.floor(seg(t, 0, 0.8) * 4.999)) : 4;
    win = byCount ? lerp(0.3, 0.45, t) : lerp(0.4, 1, seg(t, 0, 0.85));
  } else {
    likes = target;
    win = byCount ? 0.45 : 1;
    flushed = seg(t, 0, 0.7);
  }
  const full = likes >= MAX;
  const due = !byCount && win >= 1;
  const trigger = full || due;
  const inList = flushed > 0.3 ? 0 : likes;
  const arriving = (step === 0 || (step === 1 && byCount)) && t < 0.95 && t > 0.05;
  const arrP = ((step === 0 ? seg(t, 0.05, 0.95) * (byCount ? 6 : 4) : seg(t, 0, 0.8) * 4) % 1) || 0;
  const sent = flushed >= 1 || (step === 2 && flushed > 0.85);
  return (
    <g>
      <Txt x={24} y={34} k="k" anchor="start">
        {narrow ? "social_like · hybrid" : "social_like · HYBRID: 10 likes or 300 s"}
      </Txt>
      {narrow && (
        <Txt x={24} y={58} k="s" anchor="start">
          10 likes or 300 s
        </Txt>
      )}
      <Box x={SRC.x} y={SRC.y} w={SRC.w} h={SRC.h} label="Likes" sub={narrow ? undefined : "on one post"} />
      <Wire d={`M${SRC.x + SRC.w} ${LIST.y + LIST.h / 2}H${LIST.x}`} arrow tone={arriving ? "lit" : undefined} />
      {arriving && <Token x={lerp(SRC.x + SRC.w + 4, LIST.x - 8, arrP)} y={LIST.y + LIST.h / 2} s={9} tone="lit" />}
      {/* the Redis list */}
      <Txt x={LIST.x} y={LIST.y - 14} k="s" anchor="start" tone={trigger && flushed < 0.3 ? "lit" : undefined}>
        {narrow ? "batch:{user}:social_like" : "batch:{user_id}:social_like"}
      </Txt>
      <Meter x={LIST.x} y={LIST.y} w={LIST.w} h={LIST.h} value={inList} max={MAX} ticks={MAX} tone={full ? "lit" : "sky"} />
      <Txt x={LIST.x + LIST.w} y={LIST.y + LIST.h + 22} k="t" anchor="end" tone={full ? "lit" : undefined}>
        {`${inList}/${MAX}`}
      </Txt>
      {/* the window */}
      <Txt x={LIST.x} y={212} k="s" anchor="start" tone={due ? "lit" : undefined}>
        {narrow ? "window" : "window · checked every 10 s"}
      </Txt>
      <Meter x={LIST.x} y={222} w={LIST.w} h={12} value={win} max={1} tone={due ? "lit" : "warn"} ticks={5} />
      <Txt x={LIST.x + LIST.w} y={256} k="s" anchor="end" tone={due ? "lit" : undefined}>
        {due ? (narrow ? "300 s" : "300 s · flush") : byCount && trigger ? "< 300 s" : "of 300 s"}
      </Txt>
      {trigger && step >= 1 && (
        <Txt x={LIST.x} y={256} k="k" anchor="start" tone="lit">
          {full ? "max_count hit" : "window passed"}
        </Txt>
      )}
      {/* flush → one notification */}
      <Wire d={`M${LIST.x + LIST.w} ${LIST.y + LIST.h / 2}H${PHONE.x}`} arrow tone={flushed > 0 && !sent ? "lit" : undefined} />
      {flushed > 0 && flushed < 1 && <Token x={lerp(LIST.x + LIST.w + 4, PHONE.x - 8, seg(flushed, 0.2, 1))} y={LIST.y + LIST.h / 2} s={14} tone="lit" />}
      <rect x={PHONE.x} y={PHONE.y} width={PHONE.w} height={PHONE.h} className={`ax-box${sent ? " ok" : ""}`} />
      <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + 24} k="k" tone={sent ? "ok" : "mute"}>
        phone
      </Txt>
      {sent ? (
        <g>
          <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + 70} k="d" tone="ok">
            {String(target)}
          </Txt>
          <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + 96} k="s">
            {narrow ? "people" : "people liked"}
          </Txt>
          <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + (narrow ? 118 : 114)} k="s">
            {narrow ? "liked" : "your post"}
          </Txt>
        </g>
      ) : (
        <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + 84} k="s" tone="mute">
          quiet
        </Txt>
      )}
      <Txt x={PHONE.x + PHONE.w / 2} y={PHONE.y + PHONE.h + 22} k="s" tone={sent ? "ok" : "mute"}>
        {sent ? "1 push" : "0 sent"}
      </Txt>
    </g>
  );
}

export default defineExplainer({
  w: W,
  h: H,
  variants: [
    {
      id: "count",
      label: "Count first",
      steps: [
        { caption: "Each like is RPUSHed onto the Redis list batch:{user_id}:social_like. Nothing is sent yet.", tween: 3000 },
        { caption: "The 10th like reaches max_count = 10 before the 300 s window ends: flush now.", tween: 2400 },
        { caption: "One notification, \"10 people liked your post\", replaces ten pushes, and the list is deleted.", tween: 1800, ms: 3400 },
      ],
    },
    {
      id: "window",
      label: "Window first",
      steps: [
        { caption: "A quieter post: only 4 likes arrive. Under 10, so the batch keeps waiting.", tween: 2600 },
        { caption: "The flush worker checks every 10 s; once the batch is 300 s old, its window has passed.", tween: 2600 },
        { caption: "The 4 likes leave as one notification: \"4 people liked your post\".", tween: 1800, ms: 3400 },
      ],
    },
  ],
  Scene,
});
