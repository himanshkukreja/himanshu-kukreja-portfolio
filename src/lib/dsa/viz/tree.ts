/**
 * The binary search tree model and its operations as step-by-step scripts (the "tree" view). Every operation is a pure
 * function: (tree, args) → { script, tree after }. The tree keeps every value in a node's left subtree below it and every
 * value in its right subtree above it, so a search or an insert follows one path down from the root and costs the number
 * of nodes on that path (the height, at worst). The four walks visit every node once.
 *
 * The cost counter counts steps: a node looked at, a link changed. Plain-word narration, one sentence a step, written
 * for a first-time learner (Academy Part 2).
 */
import type { Frame, NodeId, Script, TreeNodeState, TreeState } from "./types";

export type TreeNode = { value: number; left: NodeId | null; right: NodeId | null };

export type TreeModel = {
  nodes: Record<NodeId, TreeNode>;
  root: NodeId | null;
  nextId: number;
};

export type TreeOp =
  | { op: "insert"; value: number }
  | { op: "search"; value: number }
  | { op: "delete"; value: number }
  | { op: "preorder" }
  | { op: "inorder" }
  | { op: "postorder" }
  | { op: "levelorder" };

export type TreeOpName = TreeOp["op"];

export const TREE_OPS: TreeOpName[] = ["insert", "search", "delete", "preorder", "inorder", "postorder", "levelorder"];

export const TREE_OP_LABEL: Record<TreeOpName, string> = {
  insert: "Insert",
  search: "Search",
  delete: "Delete",
  preorder: "Pre-order",
  inorder: "In-order",
  postorder: "Post-order",
  levelorder: "Level order",
};

type Side = "left" | "right";

const SCATTER = [2040, 1312, 3608, 2896, 1760, 3104, 1528, 2472];

export function makeTree(values: number[]): TreeModel {
  const m: TreeModel = { nodes: {}, root: null, nextId: 0 };
  for (const v of values) {
    if (findNode(m, v) !== null) continue;
    const id = m.nextId++;
    m.nodes[id] = { value: v, left: null, right: null };
    if (m.root === null) {
      m.root = id;
      continue;
    }
    let cur = m.root;
    for (;;) {
      const side: Side = v < m.nodes[cur].value ? "left" : "right";
      const next = m.nodes[cur][side];
      if (next === null) {
        m.nodes[cur][side] = id;
        break;
      }
      cur = next;
    }
  }
  return m;
}

const clone = (m: TreeModel): TreeModel => ({ nodes: Object.fromEntries(Object.entries(m.nodes).map(([k, n]) => [k, { ...n }])) as Record<NodeId, TreeNode>, root: m.root, nextId: m.nextId });

/** The ids in the tree, root first (a walk down every link). */
function reach(m: TreeModel): NodeId[] {
  const out: NodeId[] = [];
  const stack: NodeId[] = m.root === null ? [] : [m.root];
  while (stack.length) {
    const id = stack.pop() as NodeId;
    out.push(id);
    const n = m.nodes[id];
    if (n.right !== null) stack.push(n.right);
    if (n.left !== null) stack.push(n.left);
  }
  return out;
}

function findNode(m: TreeModel, value: number): NodeId | null {
  let cur = m.root;
  while (cur !== null) {
    const n = m.nodes[cur];
    if (n.value === value) return cur;
    cur = value < n.value ? n.left : n.right;
  }
  return null;
}

/** The values from the smallest to the largest (an in-order walk). */
export function treeValues(m: TreeModel): number[] {
  const out: number[] = [];
  const walk = (id: NodeId | null) => {
    if (id === null) return;
    walk(m.nodes[id].left);
    out.push(m.nodes[id].value);
    walk(m.nodes[id].right);
  };
  walk(m.root);
  return out;
}

/** The insertion order that rebuilds this tree: root first, then level by level. */
export function treeInsertionOrder(m: TreeModel): number[] {
  const out: number[] = [];
  const q: NodeId[] = m.root === null ? [] : [m.root];
  while (q.length) {
    const id = q.shift() as NodeId;
    out.push(m.nodes[id].value);
    const n = m.nodes[id];
    if (n.left !== null) q.push(n.left);
    if (n.right !== null) q.push(n.right);
  }
  return out;
}

export function treeHeight(m: TreeModel): number {
  const h = (id: NodeId | null): number => (id === null ? 0 : 1 + Math.max(h(m.nodes[id].left), h(m.nodes[id].right)));
  return h(m.root);
}

export const treeSize = (m: TreeModel) => reach(m).length;

/** "height 3, 7 values, in order: 10, 25, 30": for screen readers and the history log. */
export const treeText = (m: TreeModel) => (m.root === null ? "empty tree" : `${treeSize(m)} value${treeSize(m) === 1 ? "" : "s"}, height ${treeHeight(m)}; in order: ${treeValues(m).join(", ")}`);

/** The values rebuilt so the tree is as short as it can be (the median first, then each half). */
export function balancedOrder(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  const go = (lo: number, hi: number) => {
    if (lo > hi) return;
    const mid = (lo + hi) >> 1;
    out.push(sorted[mid]);
    go(lo, mid - 1);
    go(mid + 1, hi);
  };
  go(0, sorted.length - 1);
  return out;
}

type Over = Partial<Omit<TreeState, "nodes" | "root" | "levels">>;

/** A frame's state: the tree as the model has it, with overrides for this step. */
function snap(m: TreeModel, o: Over = {}): TreeState {
  const nodes: TreeNodeState[] = reach(m).map((id) => ({ id, value: String(m.nodes[id].value), left: m.nodes[id].left, right: m.nodes[id].right }));
  return {
    nodes,
    root: m.root,
    path: o.path ?? [],
    current: o.current ?? null,
    found: o.found ?? null,
    mark: o.mark ?? [],
    changed: o.changed ?? [],
    lifted: o.lifted ?? null,
    labels: o.labels ?? {},
    seq: o.seq ?? null,
    out: o.out ?? null,
    levels: false,
    addrs: o.addrs ?? {},
  };
}

const script = (title: string, frames: Frame<TreeState>[], result?: string): Script<TreeState> => ({ view: "tree", title, costUnit: "steps", frames, result });

/** The tree as it stands, as a one-frame script (the sandbox before any operation). */
export function stillScript(m: TreeModel, note: string): Script<TreeState> {
  return script("Your tree", [{ state: snap(m), note, cost: 0 }]);
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The ids from the root down to the node where a search for value ends, and whether it was found. */
function walkTo(m: TreeModel, value: number): { path: NodeId[]; hit: boolean } {
  const path: NodeId[] = [];
  let cur = m.root;
  while (cur !== null) {
    path.push(cur);
    const n = m.nodes[cur];
    if (n.value === value) return { path, hit: true };
    cur = value < n.value ? n.left : n.right;
  }
  return { path, hit: false };
}

const compareNote = (m: TreeModel, id: NodeId, value: number, first: boolean) => {
  const v = m.nodes[id].value;
  const lead = first ? "Start at the root." : "Move down.";
  if (v === value) return `${lead} Compare ${value} with ${v}: equal.`;
  return `${lead} Compare ${value} with ${v}: ${value < v ? "smaller" : "larger"}, so go ${value < v ? "left" : "right"} and throw away the whole ${value < v ? "right" : "left"} subtree.`;
};

/** The frames of a walk down towards `value`: one frame for each node looked at. */
function walkFrames(m: TreeModel, path: NodeId[], value: number, extra: (k: number) => Over = () => ({})): Frame<TreeState>[] {
  return path.map((id, k) => ({ state: snap(m, { path: path.slice(0, k + 1), current: id, ...extra(k) }), note: compareNote(m, id, value, k === 0), cost: k + 1 }));
}

/* ------------------------------------------------------------------ search */

export function search(m: TreeModel, value: number): { script: Script<TreeState>; tree: TreeModel } {
  const f: Frame<TreeState>[] = [];
  if (m.root === null) {
    f.push({ state: snap(m, { out: "not found" }), note: "The tree is empty, so there is nothing to find.", cost: 0 });
    return { script: script(`Search for ${value}`, f, "not found"), tree: m };
  }
  const { path, hit } = walkTo(m, value);
  f.push(...walkFrames(m, path, value));
  const last = path[path.length - 1];
  if (hit) {
    f.push({ state: snap(m, { path, found: last, out: `found ${value}` }), note: `Found ${value} after ${plural(path.length, "step")}: one look for each level of the path. The rest of the tree was never visited.`, cost: path.length });
    return { script: script(`Search for ${value}`, f, `found after ${plural(path.length, "step")}`), tree: m };
  }
  const side: Side = value < m.nodes[last].value ? "left" : "right";
  f.push({
    state: snap(m, { path, current: last, out: "not found" }),
    note: `${m.nodes[last].value} has no ${side} child (null). If ${value} were in the tree it would be there, so it is not in the tree. ${plural(path.length, "step")}.`,
    cost: path.length,
  });
  return { script: script(`Search for ${value}`, f, `not found after ${plural(path.length, "step")}`), tree: m };
}

/* ------------------------------------------------------------------ insert */

export function insert(m0: TreeModel, value: number, opts: { predict?: boolean } = {}): { script: Script<TreeState>; tree: TreeModel } {
  const m = clone(m0);
  const dup = findNode(m0, value);
  if (dup !== null) {
    const f: Frame<TreeState>[] = [{ state: snap(m0, { found: dup, out: "already there" }), note: `${value} is already in the tree. A search tree keeps each value once, so nothing changes.`, cost: walkTo(m0, value).path.length }];
    return { script: script(`Insert ${value}`, f, `${value} is already in the tree`), tree: m0 };
  }
  const id = m.nextId++;
  const lifted = { id, value: String(value) };
  const f: Frame<TreeState>[] = [];
  if (m.root === null) {
    f.push({ state: snap(m0, { lifted }), note: `The tree is empty. ${value} is ready to go in.`, cost: 0 });
    m.nodes[id] = { value, left: null, right: null };
    m.root = id;
    f.push({ state: snap(m, { found: id, changed: [id] }), note: `Make a node for ${value}. It becomes the root. One step.`, cost: 1 });
    return { script: script(`Insert ${value}`, f, `${value} is the root`), tree: m };
  }
  const { path } = walkTo(m0, value);
  f.push(...walkFrames(m0, path, value, () => ({ lifted })));
  const parent = path[path.length - 1];
  const side: Side = value < m0.nodes[parent].value ? "left" : "right";
  const pv = m0.nodes[parent].value;
  const n = path.length;
  m.nodes[id] = { value, left: null, right: null };
  m.nodes[parent][side] = id;
  const wrong: Side = side === "left" ? "right" : "left";
  f.push({
    state: snap(m, { path: [...path, id], found: id, changed: [parent], out: `inserted ${value}` }),
    note: `${pv} has no ${side} child, so that is the spot. Make a node for ${value} and link it as the ${side} child of ${pv}. One link changed: nothing else moves. ${plural(n + 1, "step")} in all.`,
    cost: n + 1,
    ask: opts.predict
      ? {
          prompt: `Where will ${value} go?`,
          choices: [
            { label: `As the ${side} child of ${pv}`, correct: true },
            { label: `As the ${wrong} child of ${pv}`, correct: false, why: `${value} is ${side === "left" ? "smaller" : "larger"} than ${pv}, so it goes on the ${side}` },
            ...(path.length > 1 ? [{ label: "As the new root", correct: false, why: "the root never changes: a new value always goes in at the bottom" }] : []),
          ],
        }
      : null,
  });
  return { script: script(`Insert ${value}`, f, `${value} added as the ${side} child of ${pv}`), tree: m };
}

/* ------------------------------------------------------------------ delete */

/** The leftmost node under `from` (the in-order successor of a node whose right child is `from`). */
function walkEnd(m: TreeModel, from: NodeId): NodeId {
  let s = from;
  while (m.nodes[s].left !== null) s = m.nodes[s].left as NodeId;
  return s;
}

function replaceLink(m: TreeModel, parent: NodeId | null, side: Side, child: NodeId | null) {
  if (parent === null) m.root = child;
  else m.nodes[parent][side] = child;
}

export function remove(m0: TreeModel, value: number, opts: { predict?: boolean } = {}): { script: Script<TreeState>; tree: TreeModel } {
  const f: Frame<TreeState>[] = [];
  const title = `Delete ${value}`;
  if (m0.root === null) {
    f.push({ state: snap(m0, { out: "not found" }), note: "The tree is empty, so there is nothing to delete.", cost: 0 });
    return { script: script(title, f, "nothing to delete"), tree: m0 };
  }
  const { path, hit } = walkTo(m0, value);
  f.push(...walkFrames(m0, path, value));
  const t = path[path.length - 1];
  if (!hit) {
    f.push({ state: snap(m0, { path, current: t, out: "not found" }), note: `A missing child: ${value} is not in the tree, so there is nothing to delete. ${plural(path.length, "step")}.`, cost: path.length });
    return { script: script(title, f, "not found"), tree: m0 };
  }
  const m = clone(m0);
  const tn = m.nodes[t];
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const side: Side | null = parent === null ? null : m.nodes[parent].left === t ? "left" : "right";
  let cost = path.length;
  const kids = (tn.left !== null ? 1 : 0) + (tn.right !== null ? 1 : 0);
  if (kids === 0) {
    f.push({ state: snap(m0, { path, found: t, mark: [t] }), note: `Found ${value}. It has no children: it is a leaf, so cutting one link removes it.`, cost });
    replaceLink(m, parent, side ?? "left", null);
    delete m.nodes[t];
    cost += 1;
    f.push({ state: snap(m, { changed: parent === null ? [] : [parent], out: `deleted ${value}` }), note: parent === null ? `The tree is empty again. ${plural(cost, "step")}.` : `Cut the link from ${m0.nodes[parent].value}. One link changed. ${plural(cost, "step")}.`, cost });
    return { script: script(title, f, `deleted ${value}`), tree: m };
  }
  if (kids === 1) {
    const c = (tn.left ?? tn.right) as NodeId;
    f.push({ state: snap(m0, { path, found: t, mark: [t, c] }), note: `Found ${value}. It has one child, ${m0.nodes[c].value}: the child can take its place.`, cost });
    replaceLink(m, parent, side ?? "left", c);
    delete m.nodes[t];
    cost += 1;
    f.push({ state: snap(m, { found: c, changed: parent === null ? [c] : [parent], out: `deleted ${value}` }), note: parent === null ? `${m0.nodes[c].value} becomes the root. One step: ${plural(cost, "step")}.` : `Link ${m0.nodes[parent].value} straight to ${m0.nodes[c].value}. One link changed. ${plural(cost, "step")}.`, cost });
    return { script: script(title, f, `deleted ${value}`), tree: m };
  }
  // two children: the in-order successor takes its place
  f.push({
    state: snap(m0, { path, found: t, mark: [tn.left as NodeId, tn.right as NodeId] }),
    note: `Found ${value}. It has two children, so it cannot simply be cut out. Its place must go to a value that keeps every left value smaller and every right value larger: the in-order successor, the smallest value of the right subtree.`,
    cost,
  });
  const walk: NodeId[] = [];
  let s = tn.right as NodeId;
  walk.push(s);
  while (m.nodes[s].left !== null) {
    s = m.nodes[s].left as NodeId;
    walk.push(s);
  }
  walk.forEach((id, k) => {
    cost += 1;
    f.push({
      state: snap(m0, { path: [...path, ...walk.slice(0, k + 1)], current: id, found: t }),
      note: k === 0 ? `Go right once, to ${m0.nodes[id].value}. Then go left as far as you can.` : `Go left to ${m0.nodes[id].value}.`,
      cost,
      ask:
        opts.predict && k === 0
          ? {
              prompt: `Which value will take the place of ${value}?`,
              choices: (() => {
                const succ = m0.nodes[walkEnd(m0, tn.right as NodeId)].value;
                const lv = m0.nodes[tn.left as NodeId].value;
                const rv = m0.nodes[tn.right as NodeId].value;
                return [
                  { label: String(succ), correct: true, why: "" },
                  { label: String(lv), correct: false, why: `the successor comes from the right subtree: the smallest value larger than ${value}` },
                  ...(rv !== succ ? [{ label: String(rv), correct: false, why: `${rv} has a smaller value below it on its left, so it is not the smallest on the right` }] : []),
                ].sort((x, y) => Number(x.label) - Number(y.label));
              })(),
            }
          : null,
    });
  });
  const sv = m0.nodes[s].value;
  f.push({ state: snap(m0, { path: [...path, ...walk], found: s, mark: [s] }), note: `${m0.nodes[s].value} has no left child, so it is the smallest value on the right: the in-order successor.`, cost });
  // relink: the successor takes the deleted node's place
  const sp = walk.length > 1 ? walk[walk.length - 2] : t;
  let changes = 1; // the deleted node's parent now points at the successor
  m.nodes[s].left = tn.left;
  changes += 1;
  if (sp !== t) {
    m.nodes[sp].left = m.nodes[s].right;
    m.nodes[s].right = tn.right;
    changes += 2;
  }
  replaceLink(m, parent, side ?? "left", s);
  delete m.nodes[t];
  cost += changes;
  f.push({
    state: snap(m, { found: s, changed: [s, ...(sp !== t ? [sp] : []), ...(parent !== null ? [parent] : [])], out: `deleted ${value}` }),
    note: `Put ${sv} in the gap${sp !== t ? ` and give ${sv}'s old right child to its old parent` : ""}. Every left value is still smaller and every right value still larger. ${plural(cost, "step")} in all.`,
    cost,
  });
  return { script: script(title, f, `deleted ${value}; ${sv} took its place`), tree: m };
}

/* ------------------------------------------------------------------ the four walks */

export function walk(m: TreeModel, kind: "preorder" | "inorder" | "postorder" | "levelorder", opts: { predict?: boolean } = {}): { script: Script<TreeState>; tree: TreeModel } {
  const names = { preorder: "Pre-order", inorder: "In-order", postorder: "Post-order", levelorder: "Level order" } as const;
  const title = names[kind];
  const f: Frame<TreeState>[] = [];
  if (m.root === null) {
    f.push({ state: snap(m, { seq: { title: title.toLowerCase(), values: [] } }), note: "The tree is empty: there is nothing to visit.", cost: 0 });
    return { script: script(title, f, "nothing to visit"), tree: m };
  }
  const order: NodeId[] = [];
  const pathTo = (target: NodeId): NodeId[] => {
    const p: NodeId[] = [];
    let cur: NodeId | null = m.root;
    const tv = m.nodes[target].value;
    while (cur !== null) {
      p.push(cur);
      if (cur === target) break;
      cur = tv < m.nodes[cur].value ? m.nodes[cur].left : m.nodes[cur].right;
    }
    return p;
  };
  const rec = (id: NodeId | null) => {
    if (id === null) return;
    const n = m.nodes[id];
    if (kind === "preorder") order.push(id);
    rec(n.left);
    if (kind === "inorder") order.push(id);
    rec(n.right);
    if (kind === "postorder") order.push(id);
  };
  if (kind === "levelorder") {
    const q: NodeId[] = [m.root];
    while (q.length) {
      const id = q.shift() as NodeId;
      order.push(id);
      if (m.nodes[id].left !== null) q.push(m.nodes[id].left as NodeId);
      if (m.nodes[id].right !== null) q.push(m.nodes[id].right as NodeId);
    }
  } else rec(m.root);
  const intro = {
    preorder: "Pre-order: visit a node, then its left subtree, then its right subtree. The top comes first.",
    inorder: "In-order: visit the left subtree, then the node, then the right subtree. Go left as far as you can first.",
    postorder: "Post-order: visit the left subtree, then the right subtree, then the node. A node comes after everything below it.",
    levelorder: "Level order: row by row from the top, using a queue. Take a node from the front, visit it, and add its children at the back.",
  }[kind];
  f.push({ state: snap(m, { seq: { title: title.toLowerCase(), values: [] } }), note: intro, cost: 0 });
  const seen: string[] = [];
  const queueNow = (i: number): NodeId[] => {
    const q: NodeId[] = [];
    for (let k = i + 1; k < order.length; k++) {
      const parentOf = (id: NodeId) => Object.keys(m.nodes).map(Number).find((p) => m.nodes[p].left === id || m.nodes[p].right === id);
      const p = parentOf(order[k]);
      if (p !== undefined && order.indexOf(p) <= i) q.push(order[k]);
    }
    return q;
  };
  const sortedVals = treeValues(m);
  order.forEach((id, i) => {
    const v = String(m.nodes[id].value);
    seen.push(v);
    const note = {
      preorder: `Visit ${v} before anything below it. Output so far: ${seen.join(", ")}.`,
      inorder: `Visit ${v}: everything smaller in its left subtree is done, so it is next in sorted order. Output so far: ${seen.join(", ")}.`,
      postorder: `Visit ${v}: both of its subtrees are done. Output so far: ${seen.join(", ")}.`,
      levelorder: `Take ${v} from the front of the queue and visit it. ${(() => {
        const q = queueNow(i);
        return q.length ? `The queue now holds ${q.map((x) => m.nodes[x].value).join(", ")}.` : "The queue is empty.";
      })()} Output so far: ${seen.join(", ")}.`,
    }[kind];
    const ask =
      opts.predict && i === 0 && kind === "inorder"
        ? {
            prompt: "Which value does an in-order walk visit first?",
            choices: [
              { label: String(sortedVals[0]), correct: true },
              ...(m.nodes[m.root as NodeId].value !== sortedVals[0] ? [{ label: String(m.nodes[m.root as NodeId].value), correct: false, why: "the root is visited in the middle: its whole left subtree comes first" }] : []),
              ...(sortedVals.length > 1 ? [{ label: String(sortedVals[sortedVals.length - 1]), correct: false, why: "the largest value is visited last" }] : []),
            ].sort((a, b) => Number(a.label) - Number(b.label)),
          }
        : null;
    f.push({
      state: snap(m, { path: kind === "levelorder" ? [] : pathTo(id), current: id, mark: kind === "levelorder" ? queueNow(i) : [], seq: { title: title.toLowerCase(), values: [...seen] } }),
      note,
      cost: i + 1,
      ask,
    });
  });
  const result = kind === "inorder" ? `${seen.join(", ")} (sorted)` : seen.join(", ");
  f.push({ state: snap(m, { seq: { title: title.toLowerCase(), values: [...seen] }, out: kind === "inorder" ? "sorted" : `${order.length} nodes` }), note: `Every node was visited once: ${plural(order.length, "step")}, whatever the shape.${kind === "inorder" ? " The values came out sorted: that is the search tree rule at work." : ""}`, cost: order.length });
  return { script: script(title, f, result), tree: m };
}

/* ------------------------------------------------------------------ the memory picture */

export function treeMemoryPicture(values: number[]): Script<TreeState> {
  const vals = (values.length ? values : [40, 25, 60]).slice(0, 3);
  const full = makeTree(vals);
  const addrOf = (ids: NodeId[]) => Object.fromEntries(ids.map((id) => [id, SCATTER[id]]));
  const upTo = (n: number) => makeTree(vals.slice(0, n));
  const m1 = upTo(1);
  const m2 = upTo(Math.min(2, vals.length));
  const rootV = full.nodes[full.root as NodeId].value;
  const f: Frame<TreeState>[] = [
    { state: snap(m1, { addrs: addrOf(reach(m1)), mark: [full.root as NodeId] }), note: `A tree is made of nodes. Each node holds a value and two pointers, left and right. This node holds ${rootV} and lives at address ${SCATTER[0]}. Both pointers are null: it has no children yet.`, cost: 0 },
  ];
  if (vals.length > 1) {
    const second = m2.nodes[1];
    const side = second.value < rootV ? "left" : "right";
    f.push({ state: snap(m2, { addrs: addrOf(reach(m2)), changed: [m2.root as NodeId], found: 1 }), note: `Add ${second.value}. It is ${second.value < rootV ? "smaller" : "larger"} than ${rootV}, so it goes ${side}. A new node is made wherever memory has room, here at address ${SCATTER[1]}, and the root's ${side} pointer now holds ${SCATTER[1]}.`, cost: 1 });
  }
  if (vals.length > 2) {
    const third = full.nodes[2];
    const side = third.value < rootV ? "left" : "right";
    f.push({ state: snap(full, { addrs: addrOf(reach(full)), changed: [full.root as NodeId], found: 2 }), note: `Add ${third.value}: ${third.value < rootV ? "smaller" : "larger"} than ${rootV}, so it goes ${side}. Another node, at address ${SCATTER[2]}, and the root's ${side} pointer holds it.`, cost: 2 });
  }
  const target = vals.length > 1 ? 1 : (full.root as NodeId);
  f.push({
    state: snap(full, { addrs: addrOf(reach(full)), path: target === full.root ? [full.root as NodeId] : [full.root as NodeId, target], current: target }),
    note: `To reach ${full.nodes[target].value}, the computer starts at the root and follows a pointer: ${target === full.root ? "no hops" : "one hop"}. No arithmetic can jump straight to a node the way it can to an array cell.`,
    cost: target === full.root ? 0 : 1,
  });
  f.push({ state: snap(full, { addrs: addrOf(reach(full)) }), note: "Every operation on a tree follows pointers down from the root. So its cost is the number of hops: at worst the height of the tree.", cost: target === full.root ? 0 : 1 });
  return { view: "tree", title: "A tree in memory", costUnit: "pointer hops", frames: f, result: "nodes joined by pointers: the cost is the number of hops" };
}

/* ------------------------------------------------------------------ running an operation */

type Result = { script: Script<TreeState>; tree: TreeModel };

export function runTreeOp(m: TreeModel, op: TreeOp, opts: { predict?: boolean } = {}): Result {
  switch (op.op) {
    case "insert":
      return insert(m, op.value, opts);
    case "search":
      return search(m, op.value);
    case "delete":
      return remove(m, op.value, opts);
    default:
      return walk(m, op.op, opts);
  }
}

/** The same insert, search or delete on a tree of the same values built to be as short as possible: its cost, for comparison. */
export function balancedCost(m: TreeModel, op: TreeOp): { mine: number; balanced: number; height: number; balancedHeight: number } | null {
  if (op.op !== "insert" && op.op !== "search" && op.op !== "delete") return null;
  const b = makeTree(balancedOrder(treeValues(m)));
  const last = (r: Result) => r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
  return { mine: last(runTreeOp(m, op)), balanced: last(runTreeOp(b, op)), height: treeHeight(m), balancedHeight: treeHeight(b) };
}
