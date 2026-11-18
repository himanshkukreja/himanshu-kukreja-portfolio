/**
 * The DSA home's balanced card flow must never leave a blank band under the shorter column (it came back three times:
 * a card changed size and the best split of the cards still ended 214 px apart). balance() picks the columns; stretch()
 * grows the cards of the shorter column so the columns end within SLACK of each other.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { GAP, SLACK, balance, stretch } from "../../src/lib/dsa/metro/flow.ts";

const ends = (h, place, extra, cols) => {
  const b = new Array(cols).fill(0);
  const n = new Array(cols).fill(0);
  h.forEach((x, i) => {
    b[place[i]] += x + extra[i];
    n[place[i]]++;
  });
  return b.map((s, c) => s + Math.max(0, n[c] - 1) * GAP);
};

test("a guest's cards on staging (warm-up 616, Today 241, quick review 311, sets 208) end within the limit", () => {
  const h = [616, 241, 311, 208];
  const place = balance(h, 2);
  const [a, b] = ends(h, place, new Array(4).fill(0), 2);
  assert.ok(Math.abs(a - b) > 120, "the raw best split of these cards is the 214 px band");
  const extra = stretch(h, place, 2);
  const [x, y] = ends(h, place, extra, 2);
  assert.ok(Math.abs(x - y) <= SLACK + 4, `columns end ${Math.abs(x - y)} px apart`);
});

test("random card sets always end within the limit, and balanced columns are left alone", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 300; t++) {
    const cols = rnd() < 0.5 ? 2 : 3;
    const h = Array.from({ length: 3 + Math.floor(rnd() * 5) }, () => 120 + Math.floor(rnd() * 560));
    const place = balance(h, cols);
    const extra = stretch(h, place, cols);
    const e = ends(h, place, extra, cols).filter((_, c) => place.includes(c));
    assert.ok(Math.max(...e) - Math.min(...e) <= SLACK + 4);
    const raw = ends(h, place, new Array(h.length).fill(0), cols).filter((_, c) => place.includes(c));
    if (Math.max(...raw) - Math.min(...raw) <= SLACK) assert.ok(extra.every((x) => x === 0));
  }
});
