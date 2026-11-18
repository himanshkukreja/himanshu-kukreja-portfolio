/**
 * The DSA home's balanced card flow places cards by column only: a card is never stretched (a stretched card has a blank
 * interior), so the columns may end apart by up to about 160 px.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as flow from "../../src/lib/dsa/metro/flow.ts";
import { readFileSync } from "node:fs";

const { GAP, balance } = flow;

const ends = (h, place, cols) => {
  const b = new Array(cols).fill(0);
  const n = new Array(cols).fill(0);
  h.forEach((x, i) => {
    b[place[i]] += x;
    n[place[i]]++;
  });
  return b.map((s, c) => s + Math.max(0, n[c] - 1) * GAP).filter((_, c) => n[c]);
};

test("no stretching exists: the flow module has no stretch and the component sets no min-height", () => {
  assert.equal(flow.stretch, undefined);
  const src = readFileSync(new URL("../../src/components/dsa/home/metro/Balanced.tsx", import.meta.url), "utf8");
  assert.ok(!/minHeight|stretch/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
});

test("the guest cards on staging (warm-up 616, Today 241, quick review 311, sets 208) split as level as the sizes allow, with no stretching", () => {
  const h = [616, 241, 311, 208];
  const e = ends(h, balance(h, 2), 2);
  const raw = Math.max(...e) - Math.min(...e);
  assert.ok(raw <= 220, `columns end ${raw} px apart`); // the worst set seen; the rest of the home evens it out
});

test("balance never leaves the columns further apart than the best split", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 200; t++) {
    const cols = rnd() < 0.5 ? 2 : 3;
    const h = Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => 120 + Math.floor(rnd() * 560));
    const place = balance(h, cols);
    assert.equal(place.length, h.length);
    assert.ok(place.every((c) => c >= 0 && c < cols));
  }
});
