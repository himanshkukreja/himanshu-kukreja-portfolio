// JavaScript driver (server-side verified re-judges). The learner writes a
// top-level `function busiestStretch(plays, k)` or `class Solution` with that
// method. The driver is appended to the learner's code in one CommonJS file so
// error line numbers match the editor. ListNode/TreeNode are provided as
// globals unless the learner defines their own.

import type { ParsedSignature } from "./types.ts";
import { camelCase } from "./types.ts";
import type { GeneratedSource } from "./cpp.ts";
import { RESULT_FILE } from "./cpp.ts";
import { typeDescriptor } from "./python.ts";

const DRIVER = `
;(function __judgeMain() {
  const fs = require("fs");
  const G = globalThis;
  if (typeof ListNode === "undefined") G.ListNode = function ListNode(val, next) { this.val = val === undefined ? 0 : val; this.next = next === undefined ? null : next; };
  if (typeof TreeNode === "undefined") G.TreeNode = function TreeNode(val, left, right) { this.val = val === undefined ? 0 : val; this.left = left === undefined ? null : left; this.right = right === undefined ? null : right; };
  const LN = typeof ListNode !== "undefined" ? ListNode : G.ListNode;
  const TN = typeof TreeNode !== "undefined" ? TreeNode : G.TreeNode;
  const to = (t, v) => {
    if (Array.isArray(t)) return v == null ? null : v.map((x) => to(t[1], x));
    if (t === "ListNode") { const d = new LN(0); let c = d; for (const x of v || []) { c.next = new LN(x); c = c.next; } return d.next; }
    if (t === "TreeNode") {
      if (!v || !v.length || v[0] == null) return null;
      const root = new TN(v[0]); const q = [root]; let h = 0, k = 1;
      while (h < q.length && k < v.length) {
        const n = q[h++];
        if (k < v.length) { if (v[k] != null) { n.left = new TN(v[k]); q.push(n.left); } k++; }
        if (k < v.length) { if (v[k] != null) { n.right = new TN(v[k]); q.push(n.right); } k++; }
      }
      return root;
    }
    return v;
  };
  const from = (t, v) => {
    if (Array.isArray(t)) return v == null ? null : Array.from(v, (x) => from(t[1], x));
    if (t === "ListNode") { const o = []; while (v != null && o.length < 1e7) { o.push(v.val); v = v.next; } return o; }
    if (t === "TreeNode") {
      const order = []; const q = v == null ? [] : [v]; let h = 0;
      while (h < q.length) { const n = q[h++]; order.push(n); if (n != null) { q.push(n.left ?? null); q.push(n.right ?? null); } }
      while (order.length && order[order.length - 1] == null) order.pop();
      return order.map((n) => (n == null ? null : n.val));
    }
    if (t === "int" || t === "long") return typeof v === "bigint" ? v : Math.trunc(Number(v));
    if (t === "double") { const f = Number(v); return Number.isFinite(f) ? f : null; }
    if (t === "bool") return Boolean(v);
    if (t === "string" || t === "char") return String(v);
    return v;
  };
  let target = null;
  if (typeof Solution === "function") { const s = new Solution(); if (typeof s[FN] === "function") target = s[FN].bind(s); }
  if (!target && typeof G[FN] === "function") target = G[FN];
  if (!target) { try { target = eval(FN); } catch (e) { target = null; } }
  if (typeof target !== "function") { process.stderr.write("judge: define a function named " + FN + " (or class Solution with that method)\\n"); process.exit(96); }
  const raw = JSON.parse(fs.readFileSync(0, "utf8"));
  const args = PARAMS.map((t, i) => to(t, raw[i]));
  const res = target(...args);
  const out = JSON.stringify(from(RETURNS, res), (_k, x) => (typeof x === "bigint" ? (typeof JSON.rawJSON === "function" ? JSON.rawJSON(x.toString()) : Number(x)) : x));
  fs.writeFileSync(RESULT_FILE, out === undefined ? "null" : out);
})();
`;

export function generateJavaScript(sig: ParsedSignature, learnerCode: string): GeneratedSource {
  const consts =
    `const FN = ${JSON.stringify(camelCase(sig.fn))};\n` +
    `  const PARAMS = ${JSON.stringify(sig.params.map((p) => typeDescriptor(p.type)))};\n` +
    `  const RETURNS = ${JSON.stringify(typeDescriptor(sig.returns))};\n` +
    `  const RESULT_FILE = ${JSON.stringify(RESULT_FILE)};\n`;
  const driver = DRIVER.replace(`const fs = require("fs");`, `const fs = require("fs");\n  ${consts}`);
  return { files: { "main.js": learnerCode + "\n" + driver } };
}
