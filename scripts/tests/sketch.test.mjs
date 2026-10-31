/**
 * The whiteboard as text for the AI reviews (src/lib/learn/mock/sketch.ts sketchSummary): bound arrows by their
 * bindings, and arrows drawn up to a shape but not attached by the nearest shape within ARROW_SNAP of each end.
 *   node --test scripts/tests/sketch.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported module.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ARROW_SNAP, sketchSummary } from "../../src/lib/learn/mock/sketch.ts";

let n = 0;
const id = (p) => `${p}${++n}`;

/** a library box block: its container rectangle (label, kind), the bound label text and the icon, in one group */
function box(label, kind, x, y, w = 180, h = 90) {
  const g = id("g");
  const rect = { id: id("r"), type: "rectangle", x, y, width: w, height: h, angle: 0, groupIds: [g], customData: { kind }, boundElements: [] };
  const text = { id: id("t"), type: "text", x: x + 10, y: y + h - 30, width: w - 20, height: 20, text: label, containerId: rect.id, groupIds: [g] };
  rect.boundElements.push({ id: text.id, type: "text" });
  const icon = { id: id("i"), type: "image", x: x + w / 2 - 14, y: y + 12, width: 28, height: 28, groupIds: [g] };
  return { rect, els: [rect, text, icon] };
}

/** a SQL database cylinder block (lid and bottom ellipses, side lines, the labelled body), as the library draws it */
function cylinder(label, x, y, w = 160, h = 110) {
  const g = id("g");
  const e = 22;
  const body = { id: id("r"), type: "rectangle", x, y: y + e / 2, width: w, height: h - e, groupIds: [g], customData: { kind: "sql-db" }, boundElements: [] };
  const text = { id: id("t"), type: "text", x: x + 10, y: y + h - 34, width: w - 20, height: 20, text: label, containerId: body.id, groupIds: [g] };
  body.boundElements.push({ id: text.id, type: "text" });
  const side = (sx) => ({ id: id("l"), type: "line", x: sx, y: y + e / 2, width: 0, height: h - e, points: [[0, 0], [0, h - e]], groupIds: [g] });
  return {
    rect: body,
    els: [
      { id: id("e"), type: "ellipse", x, y: y + h - e, width: w, height: e, groupIds: [g] },
      body,
      text,
      side(x),
      side(x + w),
      { id: id("e"), type: "ellipse", x, y, width: w, height: e, groupIds: [g] },
    ],
  };
}

/** an arrow from (x1, y1) to (x2, y2), optionally bound at either end */
function arrow(x1, y1, x2, y2, { from, to, label } = {}) {
  const a = { id: id("a"), type: "arrow", x: x1, y: y1, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), angle: 0, points: [[0, 0], [x2 - x1, y2 - y1]], startBinding: from ? { elementId: from.id } : null, endBinding: to ? { elementId: to.id } : null, boundElements: [] };
  const els = [a];
  if (label) {
    const t = { id: id("t"), type: "text", x: (x1 + x2) / 2, y: (y1 + y2) / 2, width: 60, height: 20, text: label, containerId: a.id };
    a.boundElements.push({ id: t.id, type: "text" });
    els.push(t);
  }
  return els;
}

const scene = (...groups) => JSON.stringify({ elements: groups.flat() });
const arrowsLine = (s) => sketchSummary(s).split("\n").find((l) => l.startsWith("Arrows:")) ?? "";

// Service at x 0-180, y 0-90; the database at x 400-560, y 0-110 (body y 11-99)
const svc = box("Orders service", "service", 0, 0);
const db = cylinder("Orders DB", 400, 0);

test("an arrow drawn between two blocks but attached to neither reads as a connection (the reported case)", () => {
  // stops 12 units short of the service's right edge and 10 short of the database's left side
  const s = scene(svc.els, db.els, arrow(192, 45, 390, 45));
  assert.equal(arrowsLine(s), "Arrows: Orders service → Orders DB");
});

test("bound arrows are read from their bindings, as before", () => {
  // drawn far from both (the bindings say where it goes, not the geometry)
  const s = scene(svc.els, db.els, arrow(900, 900, 1000, 1000, { from: svc.rect, to: db.rect, label: "writes" }));
  assert.equal(arrowsLine(s), "Arrows: Orders service → Orders DB (writes)");
});

test("one end bound, the other drawn up to a shape: both ends named", () => {
  const s = scene(svc.els, db.els, arrow(180, 45, 395, 50, { from: svc.rect }));
  assert.equal(arrowsLine(s), "Arrows: Orders service → Orders DB");
});

test("an end ending on a block's icon or lid names the block", () => {
  // ends inside the cylinder's lid ellipse (above the labelled body) and starts on the service's icon
  const s = scene(svc.els, db.els, arrow(90, 26, 480, 6));
  assert.equal(arrowsLine(s), "Arrows: Orders service → Orders DB");
});

test(`an end more than ${ARROW_SNAP} units from every shape stays unknown`, () => {
  const s = scene(svc.els, db.els, arrow(192, 45, 300, 45));
  assert.equal(arrowsLine(s), "Arrows: Orders service → ?");
  // neither end near anything: no arrow line at all (as for any unconnected stroke)
  assert.equal(arrowsLine(scene(svc.els, db.els, arrow(250, 300, 330, 300))), "");
});

test("the nearest shape wins, and a small box inside a region wins over the region", () => {
  const cache = box("Redis", "cache", 400, 200);
  const region = { id: id("r"), type: "rectangle", x: 380, y: 180, width: 400, height: 300, boundElements: [] };
  const regionText = { id: id("t"), type: "text", text: "Data tier", containerId: region.id, x: 390, y: 190, width: 80, height: 20 };
  region.boundElements.push({ id: regionText.id, type: "text" });
  // from the service's bottom edge (8 below it) to a point inside both the region and the Redis box
  const s = scene(svc.els, db.els, [region, regionText], cache.els, arrow(90, 98, 450, 240));
  assert.equal(arrowsLine(s), "Arrows: Orders service → Redis");
  // ending 20 units left of the database and 28 below the service's corner: the database is nearer
  const s2 = scene(svc.els, db.els, arrow(10, 200, 380, 60));
  assert.match(arrowsLine(s2), /→ Orders DB$/);
});

test("an arrow never joins a block to itself, and a block's own lines are not arrows", () => {
  // both ends inside the service: the start names it, the end finds nothing else
  const s = scene(svc.els, db.els, arrow(20, 45, 160, 45));
  assert.equal(arrowsLine(s), "Arrows: Orders service → ?");
  // the cylinder's side lines (grouped, unbound) sit right on its body: never read as connections
  assert.equal(arrowsLine(scene(svc.els, db.els)), "");
});

test("free text on the board is a target too, and a rotated shape is measured in its own frame", () => {
  const users = { id: id("t"), type: "text", x: -300, y: 30, width: 80, height: 24, text: "Users" };
  // a tall box turned 90°: drawn 40 wide x 200 tall at x 700, so on the canvas it spans x 620-820, y 80-120
  const rot = { id: id("r"), type: "rectangle", x: 700, y: 0, width: 40, height: 200, angle: Math.PI / 2, boundElements: [] };
  const rotText = { id: id("t"), type: "text", text: "Workers", containerId: rot.id, x: 700, y: 90, width: 40, height: 20 };
  rot.boundElements.push({ id: rotText.id, type: "text" });
  const s = scene(svc.els, [users], arrow(-210, 42, -10, 42), [rot, rotText], arrow(190, 100, 610, 100));
  assert.equal(arrowsLine(s), "Arrows: Users → Orders service; Orders service → Workers");
});
