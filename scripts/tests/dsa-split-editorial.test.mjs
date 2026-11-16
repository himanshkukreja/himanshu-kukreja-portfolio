import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const src = readFileSync(new URL("../../src/components/dsa/problem/splitEditorial.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { splitEditorial } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

test("lifts the solutions figure out, nested code figures included", () => {
  const html = '<p>a</p><figure data-tabs-id="solutions" class="x"><figure data-sd="code"><pre>1</pre></figure><figure data-sd="code"><pre>2</pre></figure></figure><p>b</p>';
  const r = splitEditorial(html);
  assert.equal(r.editorial, "<p>a</p><p>b</p>");
  assert.ok(r.solutions.startsWith('<figure data-tabs-id="solutions"') && r.solutions.endsWith("</figure>"));
  assert.equal((r.solutions.match(/<figure/g) || []).length, 3);
});

test("no solutions block keeps everything in the editorial", () => {
  const r = splitEditorial("<p>only</p>");
  assert.deepEqual(r, { editorial: "<p>only</p>", solutions: "" });
});
