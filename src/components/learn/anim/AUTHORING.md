# Animated explainers: authoring guide

Small, themed, interactive SVG animations of one idea, embedded in a lesson with one line:

```md
::anim[consistent-hashing]
::anim[token-bucket]{start="leaky"}
```

The line goes on its own, with a blank line before and after, at the top level of the lesson (or
inside a `:::` block). Never inside a list or a quote, never in side quests' `:::mission`.

## How it fits together

| Piece | File | Role |
|---|---|---|
| Catalog | `src/lib/course/anim/catalog.ts` | name → title, summary (no-JS / print fallback), allowed options. **One line per explainer, alphabetical.** |
| Renderer | `src/lib/course/detect/directives.ts` (`animFigure`) | `::anim[name]` → `<figure data-sd="anim" data-anim="name">` (all chrome: not course text, not searched, not highlighted) |
| Hydrator | `AnimHydrator.tsx` (mounted by CourseEnhancer) | mounts each figure when it nears the viewport, remounts after the lesson HTML is re-injected |
| Player | `player.tsx` | shadow root, play/pause, prev/next, restart, step track, speed, variant tabs, caption, keyboard, autoplay in view, reduced motion, print storyboard |
| Kit | `kit.tsx` | `defineExplainer`, the `Step`/`Variant`/`SceneProps` types, helpers (`lerp`, `seg`, `at`, `tween`, `ease`, `polar`) and primitives (`Box`, `Wire`, `Token`, `Txt`, `Meter`) |
| Explainer | `explainers/<name>.tsx` | **one self-contained file per explainer**: steps + captions + the scene |
| Offline | `src/lib/offline/lazy.ts` (`loadExplainer`, `loadAnimPlayer`), `warm.ts` | one template `import()`: every file in `explainers/` is its own chunk automatically; saving a page warms exactly the explainers it embeds |

## Add one (the whole checklist)

1. Read the lesson section it will sit in. Every number, name and claim in your captions must be
   the lesson's own (same thresholds, same example values, same step names).
2. Copy the closest existing file in `explainers/` to `explainers/<name>.tsx` (kebab-case; the file
   name is the explainer's name). Keep everything for it in that one file.
3. Add **one line** to `ANIMS` in `catalog.ts`, in alphabetical position:
   `"<name>": { title: "…", summary: "…", opts: {} },`
   The summary must stand alone (it is what no-JS, print-before-load and failed loads show).
4. Put `::anim[<name>]` in the lesson, then run the checks below.

No other file changes. Don't touch `lazy.ts`, `warm.ts`, the hydrator or the player for a new
explainer; if the kit is missing something, add a small generic primitive to `kit.tsx` and say so.

## Writing the explainer

```tsx
import { Box, defineExplainer, lerp, seg, Token, Txt, Wire, type SceneProps } from "../kit";

function Scene({ variant, step, t, clock, narrow, reduced }: SceneProps) {
  // pure function of props: draw the frame for (variant, step) at tween progress t (0 → 1)
  return <g>…</g>;
}

export default defineExplainer({
  w: 600,
  h: 320,
  variants: [
    { id: "main", label: "Main", steps: [
      { caption: "What to notice in this frame, in the lesson's words.", tween: 1600, ms: 2800 },
      { caption: "Flows keep moving during the hold on loop steps.", loop: true },
    ] },
  ],
  css: `.my-thing{stroke:var(--ax-accent)}`, // optional, scoped to this explainer's shadow root
  Scene,
});
```

- **Steps** are the story. 3 to 7 per variant, one idea each. Captions are 1 to 2 sentences.
- **Variants** are scenarios shown as tabs ("No protection" / "Single flight"). Use them for
  before/after or alternative strategies; `start="<id>"` on the directive picks the first one.
- **`t`** is linear 0 → 1 over the step's `tween` (default 750 ms); wrap in `ease()` if you want.
  Use `seg(t, a, b)` for beats inside a step and `at(step, [...])` / `tween(step, t, [...])` for
  per-step values. **`clock`** (seconds) keeps running during the hold only on `loop: true` steps:
  use it for flowing requests, never for state.
- Every frame must make sense with `t = 1` and `clock = 0`: that is exactly what reduced motion
  and the jump-to-step track show. Check the storyboard (below), not only the animation.
- `narrow` is true below ~520px, where labels render ~35% larger: drop secondary labels or use
  shorter text there. No text outside the viewBox, no overlaps at either size.

### "Break it" labs: sliders the reader drags

Add `controls` to the definition and the player draws labelled sliders under the scene; the scene
reads the current values from `values` (still a pure function of its props):

```tsx
export default defineExplainer({
  w: 600, h: 320,
  controls: [
    { id: "ttl", label: "Cache TTL", min: 0, max: 600, step: 30, value: 300, unit: "s" },
    { id: "rps", label: "Traffic", min: 100, max: 20000, step: 100, value: 5000, unit: "req/s" },
  ],
  variants: [{ id: "lab", label: "Lab", steps: [
    { caption: "Drag the TTL down: the hit rate drops and the database takes the misses.", loop: true },
    { caption: "Now push traffic up: past ~12,000 req/s the database saturates and p99 explodes.", loop: true },
  ] }],
  Scene: ({ values, clock }) => /* derive every number from values (+ clock for motion) */ null,
});
```

- Name them `lab-<topic>`. Starting values are the lesson's own example; the captions say what to
  try and what should break. Show the consequence as numbers on the scene (hit rate, p99, cost, errors)
  computed from a simple, honest model stated in the summary; never present a toy model as measured data.
- Steps of a lab are prompts ("now try…"), usually `loop: true` so traffic keeps flowing while dragging.
- The arrow keys move a focused slider (the player only steps when the focus isn't on a slider).

### Visual language (match the learn-art plates)

- Square corners only, 1.5px rules, the 40px blueprint grid (drawn by the player), mono labels.
- One accent: signal orange (`lit`). Semantic tones only where they mean something: `ok` green,
  `bad` red, `warn` amber, `sky` blue, `mute` grey. Never purple, never gradients.
- Colours come from CSS variables only (`--ax-accent`, `--ax-fg`, `--ax-line`, `--ax-ok`, …, see
  `BASE_CSS` in `player.tsx`), so dark and light themes work without extra code. No hex colours.
- Text classes: `Txt k="t"` label, `"s"` small/muted, `"k"` kicker (orange caps), `"d"` big figure.

## Rules

- **Size budget: under 15 KB gzipped per explainer chunk** (the kit and player are shared and not
  counted). No animation or chart libraries; SVG + React state only. No images, fonts or fetches.
- **Accessibility**: the caption is the alt text (it is read out via `aria-live`), so the caption
  alone must carry the idea. Don't encode meaning in colour only: label it too.
  Keyboard is handled by the player (← → Home End, space / k).
- **Reduced motion**: no autoplay, no tweening; the reader steps. Your scene gets `reduced`.
- **Pure scenes**: no `Math.random()`, `Date.now()` or effects in `Scene`; derive everything from
  props so jumping to any step is instant and deterministic.
- Don't add text to the lesson around the explainer just to describe it; the figure titles itself.

## Test

```sh
npx tsc --noEmit -p . && npx eslint src/components/learn/anim src/lib/course/anim
node scripts/validate-blocks.mjs <lesson.md>          # knows ::anim names and their options
SDM_LOCAL_DIR=/path/to/system-design-mastery node scripts/test-blocks-render.mjs
```

Then open the lesson (dev server, never port 3000) and check: it autoplays once in view, every
tab and step reads right with reduced motion on (each frame), dark and light, 1366px and a phone
width, no horizontal overflow, no console errors. Chunk size: after `next build`, gzip the chunk
that contains your explainer (`grep -l "<a caption string>" .next/static/chunks/*.js | xargs gzip -c | wc -c`).

## Step-through diagrams (related)

Mermaid flowcharts can get a ▶ Steps player with a `%% steps:` comment block (format in
`src/lib/diagrams/steps.ts`); sequence diagrams get one automatically, in message order.

```
%% steps:
%% C --> G: The client sends the order to the gateway
%% G --> O, G --> P: The gateway fans out to orders and payments
%% O: Orders writes the row
```
