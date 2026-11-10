/**
 * `:::tabs` and `::clip` on System Design Mastery lessons (src/lib/course/sdm-extras.ts, detect/dsa.ts `only`), and
 * that DSA renders and plain SDM renders are unchanged by it.
 *   node --test scripts/tests/sdm-tabs-clips.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const jiti = createJiti(import.meta.url, { alias: { "@": path.join(root, "src") } });
const { renderLessonDetailed } = await jiti.import(path.join(root, "src/lib/course/render.ts"));
const { usesSdmExtras, sdmClipQuest, SDM_DSA_ONLY } = await jiti.import(path.join(root, "src/lib/course/sdm-extras-shared.ts"));

const F = "```";
const TABS = [":::tabs[One rule in four languages]{id=\"rule\"}", F + "python", "x = 1", F, F + "java", "int x = 1;", F, F + "cpp", "int x = 1;", F, F + "javascript", "const x = 1;", F, ":::"].join("\n");
const SDM_DSA = { cast: {}, only: SDM_DSA_ONLY, clips: { "pay-the-bill": { caption: "The bill is the job.", files: [] } } };
const render = async (md, dsa) => (await renderLessonDetailed(md, { kind: "lld", ...(dsa ? { dsa } : {}) })).lesson.html;

test("an SDM lesson renders :::tabs as code panes per language, and ::clip as a clip figure", async () => {
  const html = await render(`# Strategy\n\n## The code\n\n${TABS}\n\n::clip[pay-the-bill]\n\nAfter.\n`, SDM_DSA);
  assert.match(html, /data-dsa="tabs"/);
  assert.match(html, /data-tabs-id="rule"/);
  assert.match(html, /data-langs="python java cpp javascript"/);
  for (const l of ["python", "java", "cpp", "javascript"]) assert.match(html, new RegExp(`class="dsa-pane"[^>]*data-lang="${l}"`), l);
  assert.match(html, /data-dsa="clip"[^>]*data-id="pay-the-bill"/);
  assert.match(html, /The bill is the job\./, "the caption is the fallback before the player loads");
  assert.ok(!html.includes(":::tabs"), "no directive text is left on the page");
});

test("without the options (an unpublished renderer path) tabs and clips degrade to plain text, never a crash", async () => {
  const html = await render(`# Strategy\n\n## The code\n\n${TABS}\n\n::clip[pay-the-bill]\n`);
  assert.ok(!html.includes('data-dsa="tabs"'));
  assert.match(html, /x = 1/, "the code is still on the page");
});

test("a clip with no clips file renders nothing, not a broken box", async () => {
  const html = await render("# S\n\n## A\n\n::clip[missing]\n\nText.\n", { cast: {}, only: SDM_DSA_ONLY, clips: {} });
  assert.ok(!html.includes('data-dsa="clip"'));
  assert.match(html, /Text\./);
});

test("the SDM subset leaves every other DSA directive alone, so an SDM block keeps its meaning", async () => {
  const md = ":::example[Title]{kind=\"analogy\"}\nBody text.\n:::\n";
  const sdm = await render(`# S\n\n## A\n\n${md}`, SDM_DSA);
  const plain = await render(`# S\n\n## A\n\n${md}`);
  assert.ok(!sdm.includes("dsa-example") && !sdm.includes('data-dsa-kind'), "an SDM page does not turn :::example into DSA's block");
  assert.equal(sdm, plain, "a lesson with no tabs or clips renders the same with the options on");
  const dsa = await render(`# S\n\n## A\n\n${md}`, { cast: {} });
  assert.match(dsa, /dsa-example/, "the DSA course (no `only`) still has every directive");
});

test("DSA renders keep tabs and clips", async () => {
  const html = await render(`# S\n\n## A\n\n${TABS}\n\n::clip[c1]\n`, { cast: {}, clips: { c1: { caption: "Cap.", files: ["a.mp4"] } } });
  assert.match(html, /data-dsa="tabs"/);
  assert.match(html, /data-offline-media="a\.mp4"/);
});

test("which lessons need the extra options, and the clips' media id", () => {
  assert.equal(usesSdmExtras("## A\n\n:::tabs[T]{id=\"x\"}\n"), true);
  assert.equal(usesSdmExtras("::clip[a]\n"), true);
  assert.equal(usesSdmExtras("## A\n\n:::panel[T]{tone=\"ok\"}\nx\n:::\n"), false);
  assert.equal(usesSdmExtras("text with ::clip[a] inline"), false);
  assert.equal(sdmClipQuest("low-level-design", "dp-16-strategy", "three-roles"), "clips--low-level-design--dp-16-strategy--three-roles");
});
