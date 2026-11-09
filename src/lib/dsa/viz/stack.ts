/**
 * The stack model and its operations as step-by-step scripts (the "stack" view). Every operation is a pure function:
 * (stack, args) → { script, stack after }. A stack is a rule (last in, first out) on top of either an array (a block of
 * cells and a top index) or a linked list (nodes, with head as the top), so each operation can be played on both.
 *
 * The cost counter counts steps: a cell written, a pointer changed, a value copied or an item looked at. Push, pop and
 * peek touch only the top, so their cost never depends on the height, except the one push that finds a full array.
 * The call stack ("calls") plays a recursive function's frames going on and coming off, and counts the frames.
 *
 * Plain-word narration, one sentence a step, written for a first-time learner (Academy Part 2).
 */
import type { Frame, NodeId, Script, StackItem, StackState } from "./types";

export type StackBacking = "array" | "list";

export type StackModel = {
  /** item ids from the bottom to the top */
  ids: NodeId[];
  values: Record<NodeId, number>;
  backing: StackBacking;
  /** array-backed: the cells in the block (grows by doubling when a push finds it full) */
  capacity: number;
  nextId: number;
};

export type StackOp =
  | { op: "push"; value: number }
  | { op: "pop" }
  | { op: "peek" }
  | { op: "search"; value: number }
  | { op: "calls"; value: number }
  | { op: "overflow" };

export type StackOpName = StackOp["op"];

export const STACK_OPS: StackOpName[] = ["push", "pop", "peek", "search", "calls", "overflow"];

export const STACK_OP_LABEL: Record<StackOpName, string> = {
  push: "Push",
  pop: "Pop",
  peek: "Peek",
  search: "Search",
  calls: "Run factorial",
  overflow: "Recurse for ever",
};

export const STACK_START_CAPACITY = 4;
/** the call stack in the overflow demo: frames that fit before the error */
export const CALL_LIMIT = 6;

export function makeStack(values: number[], opts: { backing?: StackBacking; capacity?: number } = {}): StackModel {
  let capacity = Math.max(1, opts.capacity ?? STACK_START_CAPACITY);
  while (capacity < values.length) capacity *= 2;
  return {
    ids: values.map((_, i) => i),
    values: Object.fromEntries(values.map((v, i) => [i, v])),
    backing: opts.backing ?? "array",
    capacity,
    nextId: values.length,
  };
}

export const stackValues = (m: StackModel) => m.ids.map((id) => m.values[id]);

/** "bottom → 12, 7, 30 ← top", for screen readers and the history log. */
export const stackText = (m: StackModel) => (m.ids.length ? `bottom → ${stackValues(m).join(", ")} ← top` : "empty stack");

const clone = (m: StackModel): StackModel => ({ ...m, ids: [...m.ids], values: { ...m.values } });
const item = (m: StackModel, id: NodeId): StackItem => ({ id, value: String(m.values[id]) });

type Over = Partial<Omit<StackState, "mode" | "capacity">> & { capacity?: number | null; ids?: NodeId[] };

/** A frame's state: the stack as the model has it, with overrides for this step. */
function snap(m: StackModel, o: Over = {}): StackState {
  const ids = o.ids ?? m.ids;
  return {
    mode: m.backing,
    items: ids.map((id) => item(m, id)),
    lifted: o.lifted ?? null,
    capacity: o.capacity !== undefined ? o.capacity : m.backing === "array" ? m.capacity : null,
    mark: o.mark ?? [],
    changed: o.changed ?? [],
    labels: { top: ids.length ? ids[ids.length - 1] : null, ...(o.labels ?? {}) },
    ret: o.ret ?? {},
    addrs: o.addrs ?? {},
    out: o.out ?? null,
  };
}

const script = (title: string, frames: Frame<StackState>[], result?: string): Script<StackState> => ({ view: "stack", title, costUnit: "steps", frames, result });

/** The stack as it stands, as a one-frame script (the sandbox before any operation). */
export function stillScript(m: StackModel, note: string): Script<StackState> {
  return script("Your stack", [{ state: snap(m), note, cost: 0 }]);
}

const word = (m: StackModel) => (m.backing === "array" ? "array" : "linked list");
const where = (n: number) => (n === 0 ? "the bottom" : `index ${n}`);

/* ------------------------------------------------------------------ operations */

export function push(m0: StackModel, value: number, opts: { predict?: boolean } = {}): { script: Script<StackState>; stack: StackModel } {
  const m = clone(m0);
  const id = m.nextId++;
  m.values[id] = value;
  const lifted = item(m, id);
  const old = [...m0.ids];
  const top = old[old.length - 1] ?? null;
  const f: Frame<StackState>[] = [];
  const tv = top === null ? "null" : String(m.values[top]);
  if (m.backing === "list") {
    f.push({ state: snap(m, { ids: old, lifted, labels: { top } }), note: `A new value, ${value}, is ready to go on top. In a linked list, make a node to hold it.`, cost: 0 });
    f.push({
      state: snap(m, { ids: old, lifted, labels: { top }, changed: [id] }),
      note: top === null ? "The stack is empty, so the new node's next stays null." : `Point the new node's next at the current top, ${tv}.`,
      cost: 1,
    });
    m.ids.push(id);
    f.push({ state: snap(m, { mark: [id] }), note: `Move top to the new node. Two pointer changes, and nothing else touched: the same for ${old.length} items or a million.`, cost: 2 });
    return { script: script(`Push ${value}`, f, `${value} is on top`), stack: m };
  }
  // array-backed
  const full = old.length >= m.capacity;
  f.push({
    state: snap(m, { ids: old, lifted, labels: { top } }),
    note: full ? `A new value, ${value}, is ready to go on top. But the array has ${m.capacity} cells and all ${old.length} are used.` : `A new value, ${value}, is ready to go on top. The array has room: ${old.length} of ${m.capacity} cells are used.`,
    cost: 0,
    ask: full && opts.predict
      ? {
          prompt: `The array is full. What must happen before ${value} can go on?`,
          choices: [
            { label: "Copy everything into a bigger block", correct: true },
            { label: "Drop the bottom value", correct: false, why: "a stack never throws values away on its own" },
            { label: "Overwrite the top value", correct: false, why: "that would lose a value the stack still holds" },
          ],
        }
      : null,
  });
  let cost = 0;
  if (full) {
    const next = m.capacity * 2;
    f.push({ state: snap(m, { ids: old, lifted, labels: { top }, capacity: next }), note: `Make a new block twice as big: ${next} cells. The old block cannot grow in place.`, cost });
    cost += old.length;
    f.push({ state: snap(m, { ids: old, lifted, labels: { top }, capacity: next, changed: old }), note: `Copy the ${old.length} values across, one by one: ${old.length} steps. This is the one slow push.`, cost });
    m.capacity = next;
    cost += 1;
    m.ids.push(id);
    f.push({ state: snap(m, { mark: [id], changed: [id] }), note: `Write ${value} into cell ${old.length} and move top up. After that, the next ${next - old.length - 1} pushes are cheap again.`, cost });
    return { script: script(`Push ${value} (the array grows)`, f, `${value} is on top; the array grew to ${next} cells after ${cost} steps`), stack: m };
  }
  cost = 1;
  m.ids.push(id);
  f.push({ state: snap(m, { labels: { top }, changed: [id] }), note: `Write ${value} into the next free cell, ${where(old.length)}.`, cost });
  f.push({ state: snap(m, { mark: [id] }), note: `Move top up to the new cell. One write, however tall the stack is.`, cost });
  return { script: script(`Push ${value}`, f, `${value} is on top`), stack: m };
}

export function pop(m0: StackModel, opts: { predict?: boolean } = {}): { script: Script<StackState>; stack: StackModel } {
  const m = clone(m0);
  const f: Frame<StackState>[] = [];
  if (!m.ids.length) {
    f.push({ state: snap(m, { out: "empty" }), note: "The stack is empty: there is nothing to pop. A real stack reports an error here (or returns a marker value), so check before you pop.", cost: 0 });
    return { script: script("Pop", f, "nothing to pop: the stack is empty"), stack: m };
  }
  const topId = m.ids[m.ids.length - 1];
  const v = m.values[topId];
  const rest = m.ids.slice(0, -1);
  const newTop = rest[rest.length - 1] ?? null;
  f.push({ state: snap(m, { mark: [topId] }), note: `pop removes the top item: the one that went on last, ${v}.`, cost: 0 });
  const bottom = m.ids[0];
  const second = m.ids[m.ids.length - 2];
  const choices = [
    { label: String(v), correct: true, why: "" },
    ...(bottom !== topId ? [{ label: String(m.values[bottom]), correct: false, why: `${m.values[bottom]} went on first, so it comes off last` }] : []),
    ...(second !== undefined && second !== bottom ? [{ label: String(m.values[second]), correct: false, why: `${m.values[second]} is under the top: it comes off after ${v}` }] : []),
  ].filter((c, i, a) => a.findIndex((x) => x.label === c.label) === i);
  f.push({
    state: snap(m, { ids: rest, lifted: item(m, topId), labels: { top: newTop }, out: `popped ${v}` }),
    note: m.backing === "list" ? `Move top to the next node, ${newTop === null ? "null" : m.values[newTop]}, and hand ${v} back. One pointer change.` : `Move top down one cell and hand ${v} back. One step: the cell is simply no longer counted.`,
    cost: 1,
    ask: opts.predict && choices.length > 1 ? { prompt: "Which value does pop remove?", choices: choices.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) } : null,
  });
  m.ids = rest;
  f.push({ state: snap(m, { out: `popped ${v}` }), note: m.ids.length ? `The stack is one shorter. The new top is ${m.values[newTop as number]}.` : "The stack is empty again.", cost: 1 });
  return { script: script("Pop", f, `popped ${v}`), stack: m };
}

export function peek(m: StackModel): { script: Script<StackState>; stack: StackModel } {
  if (!m.ids.length) return { script: script("Peek", [{ state: snap(m, { out: "empty" }), note: "The stack is empty: there is no top to read. Check before you peek.", cost: 0 }], "empty"), stack: m };
  const topId = m.ids[m.ids.length - 1];
  const v = m.values[topId];
  return { script: script("Peek", [{ state: snap(m, { mark: [topId], out: `top is ${v}` }), note: `peek reads the top, ${v}, and leaves the stack exactly as it was. One step.`, cost: 1 }], `top is ${v}`), stack: m };
}

export function search(m: StackModel, value: number): { script: Script<StackState>; stack: StackModel } {
  const f: Frame<StackState>[] = [];
  if (!m.ids.length) {
    f.push({ state: snap(m), note: "The stack is empty: there is nothing to search.", cost: 0 });
    return { script: script(`Search for ${value}`, f, "not found"), stack: m };
  }
  const ids = [...m.ids].reverse();
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    const hit = m.values[id] === value;
    f.push({
      state: snap(m, { labels: { curr: id }, mark: [id] }),
      note: `${k === 0 ? "Start at the top." : "Look one item deeper."} Is ${m.values[id]} equal to ${value}? ${hit ? `Yes: found ${k === 0 ? "on top" : `${k} item${k === 1 ? "" : "s"} below the top`}.` : "No."}`,
      cost: k + 1,
    });
    if (hit) return { script: script(`Search for ${value}`, f, `found after ${k + 1} look${k ? "s" : ""}`), stack: m };
  }
  f.push({ state: snap(m, { labels: { curr: null } }), note: `Past the bottom. ${value} is not in the stack, and every item had to be checked. A stack is not built for searching.`, cost: ids.length });
  return { script: script(`Search for ${value}`, f, `not found after ${ids.length} looks`), stack: m };
}

/* ------------------------------------------------------------------ the call stack */

function callState(frames: string[], o: { lifted?: string | null; ret?: Record<number, string>; mark?: number[]; changed?: number[]; capacity?: number | null; out?: string | null } = {}): StackState {
  return {
    mode: "calls",
    items: frames.map((value, id) => ({ id, value })),
    lifted: o.lifted ? { id: frames.length, value: o.lifted } : null,
    capacity: o.capacity ?? null,
    mark: o.mark ?? [],
    changed: o.changed ?? [],
    labels: { top: frames.length ? frames.length - 1 : null },
    ret: o.ret ?? {},
    addrs: {},
    out: o.out ?? null,
  };
}

/** factorial(n) as the call stack sees it: frames go on while it recurses, and come off as each returns. */
export function callStack(n0: number): Script<StackState> {
  const n = Math.max(1, Math.min(6, Math.round(n0) || 1));
  const f: Frame<StackState>[] = [];
  const names: string[] = [];
  let depth = 0;
  for (let k = n; k >= 1; k--) {
    names.push(`fact(${k})`);
    depth++;
    f.push({
      state: callState(names, { mark: [names.length - 1], changed: [names.length - 1] }),
      note:
        k === n
          ? `Call fact(${n}). The computer puts a frame for this call on the call stack.`
          : `fact(${k + 1}) needs fact(${k}) before it can finish, so it calls it. A new frame goes on top, and fact(${k + 1}) waits underneath.`,
      cost: depth,
    });
  }
  f.push({ state: callState(names, { mark: [names.length - 1], ret: { [names.length - 1]: "returns 1" } }), note: "fact(1) is the base case: it returns 1 at once, with no further call. This is what stops the recursion.", cost: depth });
  let acc = 1;
  for (let k = 1; k <= n; k++) {
    if (k > 1) acc *= k;
    const gone = names.pop() as string;
    depth--;
    f.push({
      state: callState(names, { lifted: gone, ret: { [names.length]: `returns ${acc}` }, out: `${gone} = ${acc}` }),
      note:
        k === 1
          ? "fact(1)'s frame comes off the stack, and the value 1 goes back to the caller."
          : `fact(${k}) gets ${acc / k} back, multiplies by ${k} and returns ${acc}. Its frame comes off: last in, first out.`,
      cost: depth,
    });
  }
  f.push({ state: callState([], { out: `fact(${n}) = ${acc}` }), note: `The call stack is empty and fact(${n}) = ${acc}. At its tallest the stack held ${n} frame${n === 1 ? "" : "s"}.`, cost: 0 });
  return { view: "stack", title: `fact(${n}) on the call stack`, costUnit: "frames on the stack", frames: f, result: `fact(${n}) = ${acc}, at most ${n} frame${n === 1 ? "" : "s"} deep` };
}

/** A recursion with no base case: the call stack has a fixed size, so it ends in a stack overflow. */
export function overflowScript(): Script<StackState> {
  const f: Frame<StackState>[] = [];
  const names: string[] = [];
  for (let k = 1; k <= CALL_LIMIT; k++) {
    names.push(`loop(${k})`);
    f.push({
      state: callState(names, { mark: [names.length - 1], changed: [names.length - 1], capacity: CALL_LIMIT }),
      note: k === 1 ? "loop(1) calls loop(2), which calls loop(3), and so on. There is no base case to stop it." : `loop(${k - 1}) calls loop(${k}). A new frame goes on top.`,
      cost: k,
    });
  }
  f.push({
    state: callState(names, { lifted: `loop(${CALL_LIMIT + 1})`, capacity: CALL_LIMIT, out: "stack overflow" }),
    note: `The call stack has a fixed size, and it holds ${CALL_LIMIT} frames here. loop(${CALL_LIMIT + 1}) has no room: the program stops with a stack overflow error. Every recursion needs a base case.`,
    cost: CALL_LIMIT,
  });
  return { view: "stack", title: "Recursion with no base case", costUnit: "frames on the stack", frames: f, result: "stack overflow" };
}

/* ------------------------------------------------------------------ the memory picture */

const SCATTER = [2040, 1312, 3608, 2896, 1760, 3104, 1528, 2472];
const BASE = 1000;

/**
 * Stacks in memory: a stack is a rule on top of an array or a linked list. A fixed seven-step story: the array-backed
 * stack (cells side by side, top marks the last one used), a push and a pop on it, then the linked-list one (nodes
 * anywhere, head is the top) and its push. The values come from the demo's `start`.
 */
export function stackMemoryPicture(values: number[]): Script<StackState> {
  const vals = (values.length ? values : [12, 7, 30]).slice(0, 5);
  const arr = makeStack(vals, { backing: "array", capacity: 6 });
  const lst = makeStack(vals, { backing: "list" });
  const addrOf = (ids: NodeId[], scatter: boolean) => Object.fromEntries(ids.map((id, i) => [id, scatter ? SCATTER[i] : BASE + 4 * i]));
  const extra = 99;
  const arrP = push(arr, extra).script.frames;
  const lstP = push(lst, extra).script.frames;
  const withAddr = (s: StackState, scatter: boolean): StackState => ({ ...s, addrs: addrOf([...s.items, ...(s.lifted ? [s.lifted] : [])].map((x) => x.id), scatter) });
  const f: Frame<StackState>[] = [
    { state: withAddr(snap(arr), false), note: `A stack is a rule, not a kind of memory. It can sit on an array: the values are side by side, the bottom at index 0, and top marks the last cell in use. The block here starts at address ${BASE}.`, cost: 0 },
    { state: withAddr(arrP[arrP.length - 1].state, false), note: `Push ${extra}: write it into the next free cell and move top up. The other values do not move.`, cost: 1 },
    { state: withAddr(snap(arr, { out: "popped 99" }), false), note: "Pop: move top down one cell. The value is still in memory, but nothing counts it any more.", cost: 1 },
    { state: withAddr(snap(lst), true), note: "Or it can sit on a linked list: each value is a node wherever memory had room, and head is the top. Each node stores the address of the node under it.", cost: 0 },
    { state: withAddr(lstP[1].state, true), note: `Push ${extra}: make a node and point it at the old top.`, cost: 1 },
    { state: withAddr(lstP[lstP.length - 1].state, true), note: "Then move head to the new node. Two pointer changes, and no value moved.", cost: 2 },
    { state: withAddr(snap(lst, { mark: [lst.ids[lst.ids.length - 1]] }), true), note: "Either way, push, pop and peek touch only the top. That is why they cost the same for any height.", cost: 0 },
  ];
  return { view: "stack", title: "A stack in memory", costUnit: "steps", frames: f, result: "array-backed or list-backed, the work is at the top" };
}

export function runStackOp(m: StackModel, op: StackOp, opts: { predict?: boolean } = {}): { script: Script<StackState>; stack: StackModel } {
  switch (op.op) {
    case "push":
      return push(m, op.value, opts);
    case "pop":
      return pop(m, opts);
    case "peek":
      return peek(m);
    case "search":
      return search(m, op.value);
    case "calls":
      return { script: callStack(op.value), stack: m };
    case "overflow":
      return { script: overflowScript(), stack: m };
  }
}

/** What the same operation costs on the other backing, for the sandbox's side-by-side line. */
export function otherBackingCost(m: StackModel, op: StackOp): { mine: number; other: number; otherName: string; why: string } {
  const run = (mm: StackModel) => runStackOp(mm, op).script.frames.at(-1)?.cost ?? 0;
  const mine = run(m);
  const o = { ...m, backing: m.backing === "array" ? ("list" as const) : ("array" as const) };
  const other = run(o);
  const why =
    op.op === "push"
      ? m.backing === "array" && m.ids.length >= m.capacity
        ? "This push found the array full, so every value was copied to a bigger block. A linked list never runs out of room."
        : "A push writes one cell in an array. In a linked list it makes a node and changes two pointers."
      : op.op === "pop"
        ? "A pop moves top by one in both: a cell index in the array, a pointer in the list."
        : op.op === "peek"
          ? "A peek reads the top in both."
          : op.op === "search"
            ? "Both have to look at the items one by one from the top: a stack is not built for searching."
            : "";
  return { mine, other, otherName: word(o), why };
}
