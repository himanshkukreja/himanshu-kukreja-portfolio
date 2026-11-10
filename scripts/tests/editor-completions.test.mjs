/**
 * The lab editor's basic suggestions (src/components/learn/labs/completions.ts): member vs plain context, the
 * document's own words, nothing inside strings or comments.
 *   node --test scripts/tests/editor-completions.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) { if (s.startsWith(".") && !/\\.\\w+$/.test(s)) return next(s + ".ts", c); throw e; } }`),
);
const { EditorState } = await import("@codemirror/state");
const { CompletionContext } = await import("@codemirror/autocomplete");
const { python } = await import("@codemirror/lang-python");
const { javascript } = await import("@codemirror/lang-javascript");
const { javaLanguage, cppLanguage } = await import("../../src/components/learn/labs/clike.ts");
const { makeSource, documentWords } = await import("../../src/components/learn/labs/completions.ts");

const LANGS = { python, javascript, java: javaLanguage, cpp: cppLanguage };
/** run the source with the cursor at the "|" in `text` */
function run(lang, text, explicit = false) {
  const pos = text.indexOf("|");
  const doc = text.replace("|", "");
  const state = EditorState.create({ doc, extensions: [LANGS[lang]()] });
  return makeSource(lang)(new CompletionContext(state, pos, explicit));
}
const labels = (r) => (r ? r.options.map((o) => o.label) : []);

test("after a dot: members only", () => {
  const r = run("java", "List<Integer> a = new ArrayList<>();\na.ad|");
  assert.ok(labels(r).includes("add") && labels(r).includes("getOrDefault"));
  assert.ok(!labels(r).includes("for (int i"), "no snippets after a dot");
  const d = run("python", "q.|");
  assert.ok(labels(d).includes("popleft") && labels(d).includes("append"));
  assert.ok(labels(run("cpp", "v.pu|")).includes("push_back"));
  assert.ok(labels(run("javascript", "arr.fi|")).includes("filter"));
});

test("known receivers get their own names", () => {
  assert.deepEqual(labels(run("java", "int x = Integer.|")).slice(0, 2), ["MAX_VALUE", "MIN_VALUE"]);
  assert.ok(labels(run("python", "math.|")).includes("inf"));
  assert.ok(labels(run("cpp", "std::|")).includes("unordered_map"));
});

test("plain context: keywords, snippets and the document's own words (not the word at the cursor)", () => {
  const r = run("java", "int totalCount = 0;\nint other = tota|");
  const l = labels(r);
  assert.ok(l.includes("totalCount"), "the learner's variable");
  assert.ok(!l.includes("tota"), "never the word being typed");
  assert.ok(l.includes("while") && l.includes("for (int i") && l.includes("for (int x :"));
  assert.ok(labels(run("cpp", "ret|")).includes("return"));
  assert.ok(labels(run("python", "heap|")).includes("heappush"));
  assert.ok(labels(run("python", "for i in rang|")).includes("for i in range"));
  assert.ok(labels(run("javascript", "for|")).includes("for let i"));
});

test("not for one character, a number, or a string/comment", () => {
  assert.equal(run("java", "i|"), null);
  assert.ok(run("java", "i|", true));
  assert.equal(run("java", "int x = 12ab|"), null);
  assert.equal(run("java", 'String s = "hello wor|";'), null);
  assert.equal(run("java", "// the retu|"), null);
  assert.equal(run("cpp", "/* retu| */"), null);
  assert.equal(run("python", "# the retu|"), null);
  assert.equal(run("python", 'x = "some len|"'), null);
  assert.equal(run("javascript", "const s = 'str|'"), null);
  assert.equal(run("javascript", "// ret|"), null);
});

test("documentWords ignores strings and comments and the skipped position", () => {
  const w = documentWords('int count = 1; // helper note\nString s = "quoted words"; total++;', 4);
  assert.ok(w.includes("total") && !w.includes("helper") && !w.includes("quoted") && !w.includes("count"));
});
