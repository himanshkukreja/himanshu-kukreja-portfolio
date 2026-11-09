/**
 * The queue and deque models and their operations as step-by-step scripts (the "queue" view). Every operation is a pure
 * function: (queue, args) → { script, queue after }. A queue is a rule (first in, first out: add at the back, remove from
 * the front) on top of either an array used as a ring (a block of cells, a head index and a tail index that wrap round) or
 * a linked list (nodes, a head and a tail), so each operation can be played on both. A deque keeps the same storage but
 * works at both ends: push and pop at the front and at the back.
 *
 * The cost counter counts steps: a cell written, a pointer changed, a value copied or a node looked at. In a ring every
 * operation at either end is one step, except the one add that finds the block full: it copies every value into a block
 * twice as big, in queue order, which also straightens the ring out. In a linked list the front and the back are one
 * pointer away, except removing the back of a singly linked list, which must walk from the head to find the node before it.
 *
 * `windowMax` plays the sliding-window maximum with a monotonic deque (the "window" mode of the view).
 *
 * Plain-word narration, one sentence a step, written for a first-time learner (Academy Part 2).
 */
import type { Frame, NodeId, QueueItem, QueueState, Script, WindowState } from "./types";

export type QueueBacking = "ring" | "list" | "doubly";

export type QueueModel = {
  /** item ids from the front to the back */
  ids: NodeId[];
  values: Record<NodeId, number>;
  backing: QueueBacking;
  /** ring: the cells in the block (it grows by doubling when an add finds it full) */
  capacity: number;
  /** ring: the cell that holds the front item */
  head: number;
  nextId: number;
};

export type QueueOp =
  | { op: "enqueue"; value: number }
  | { op: "push_back"; value: number }
  | { op: "push_front"; value: number }
  | { op: "dequeue" }
  | { op: "pop_front" }
  | { op: "pop_back" }
  | { op: "peek" }
  | { op: "window_max"; value: number };

export type QueueOpName = QueueOp["op"];

export const QUEUE_OPS: QueueOpName[] = ["enqueue", "dequeue", "peek", "push_front", "push_back", "pop_front", "pop_back", "window_max"];

export const QUEUE_OP_LABEL: Record<QueueOpName, string> = {
  enqueue: "Enqueue",
  dequeue: "Dequeue",
  peek: "Peek",
  push_front: "Push front",
  push_back: "Push back",
  pop_front: "Pop front",
  pop_back: "Pop back",
  window_max: "Slide a window",
};

export const QUEUE_START_CAPACITY = 4;
/** the longest stream the window demo draws */
export const WINDOW_MAX_LEN = 9;

export function makeQueue(values: number[], opts: { backing?: QueueBacking; capacity?: number; head?: number } = {}): QueueModel {
  let capacity = Math.max(1, opts.capacity ?? QUEUE_START_CAPACITY);
  while (capacity < values.length) capacity *= 2;
  const head = opts.head !== undefined ? ((opts.head % capacity) + capacity) % capacity : 0;
  return {
    ids: values.map((_, i) => i),
    values: Object.fromEntries(values.map((v, i) => [i, v])),
    backing: opts.backing ?? "ring",
    capacity,
    head,
    nextId: values.length,
  };
}

export const queueValues = (m: QueueModel) => m.ids.map((id) => m.values[id]);

/** "front → 12, 7, 30 ← back", for screen readers and the history log. */
export const queueText = (m: QueueModel) => (m.ids.length ? `front → ${queueValues(m).join(", ")} ← back` : "empty queue");

const clone = (m: QueueModel): QueueModel => ({ ...m, ids: [...m.ids], values: { ...m.values } });
const item = (m: QueueModel, id: NodeId): QueueItem => ({ id, value: String(m.values[id]) });
const mod = (a: number, n: number) => ((a % n) + n) % n;

type Over = {
  ids?: NodeId[];
  head?: number;
  tail?: number;
  capacity?: number;
  /** the modulus the items are placed with (the block they are still in while a bigger one is made) */
  cellMod?: number;
  lifted?: QueueItem | null;
  liftAt?: "front" | "back";
  liftCell?: number | null;
  mark?: NodeId[];
  changed?: NodeId[];
  wrapped?: "head" | "tail" | null;
  labels?: Record<string, NodeId | null>;
  out?: string | null;
  base?: number | null;
  addrs?: Record<NodeId, number>;
};

/** A frame's state: the queue as the model has it, with overrides for this step. */
function snap(m: QueueModel, o: Over = {}): QueueState {
  const ids = o.ids ?? m.ids;
  const ring = m.backing === "ring";
  const cap = o.capacity ?? m.capacity;
  const head = o.head ?? m.head;
  const place = o.cellMod ?? cap;
  let cells: (QueueItem | null)[] | null = null;
  if (ring) {
    cells = Array.from({ length: cap }, () => null as QueueItem | null);
    ids.forEach((id, i) => {
      cells![mod(head + i, place)] = item(m, id);
    });
  }
  return {
    mode: ring ? "ring" : "list",
    doubly: m.backing === "doubly",
    items: ids.map((id) => item(m, id)),
    cells,
    head,
    tail: o.tail ?? mod(head + ids.length, place),
    lifted: o.lifted ?? null,
    liftAt: o.liftAt ?? "back",
    liftCell: o.liftCell ?? null,
    mark: o.mark ?? [],
    changed: o.changed ?? [],
    wrapped: o.wrapped ?? null,
    labels: o.labels ?? {},
    out: o.out ?? null,
    base: o.base ?? null,
    addrs: o.addrs ?? {},
    win: null,
  };
}

const script = (title: string, frames: Frame<QueueState>[], result?: string): Script<QueueState> => ({ view: "queue", title, costUnit: "steps", frames, result });

/** The queue as it stands, as a one-frame script (the sandbox before any operation). */
export function stillScript(m: QueueModel, note: string): Script<QueueState> {
  return script("Your queue", [{ state: snap(m), note, cost: 0 }]);
}

const word = (b: QueueBacking) => (b === "ring" ? "ring buffer" : b === "doubly" ? "doubly linked list" : "linked list");

type Result = { script: Script<QueueState>; queue: QueueModel };

/* ------------------------------------------------------------------ adding: at the back (enqueue) or the front (push_front) */

function add(m0: QueueModel, value: number, end: "back" | "front", name: string, opts: { predict?: boolean } = {}): Result {
  const m = clone(m0);
  const id = m.nextId++;
  m.values[id] = value;
  const lifted = item(m, id);
  const old = [...m0.ids];
  const size = old.length;
  const f: Frame<QueueState>[] = [];
  const title = `${name === "enqueue" ? "Enqueue" : name === "push_back" ? "Push back" : "Push front"} ${value}`;
  const joins = end === "back" ? "join the back of the queue" : "go on at the front";

  if (m.backing === "ring") {
    const cap = m.capacity;
    const full = size >= cap;
    const head0 = m0.head;
    const tail0 = mod(head0 + size, cap);
    const frontCell = mod(head0 - 1, cap);
    const hover = end === "back" ? tail0 : frontCell;
    f.push({
      state: snap(m, { ids: old, lifted, liftAt: end, liftCell: hover }),
      note: full
        ? `A new value, ${value}, is ready to ${joins}. But the ring has ${cap} cells and all ${size} are in use: the tail has caught up with the head.`
        : `A new value, ${value}, is ready to ${joins}. The ring has ${cap} cells and ${size} ${size === 1 ? "is" : "are"} in use.`,
      cost: 0,
      ask:
        full && opts.predict
          ? {
              prompt: `The ring is full. What must happen before ${value} can go in?`,
              choices: [
                { label: "Copy everything into a bigger block", correct: true },
                { label: "Overwrite the front value", correct: false, why: "that would lose a value the queue still holds" },
                { label: "Drop the newest value", correct: false, why: "a queue never throws values away on its own" },
              ],
            }
          : null,
    });
    if (full) {
      const next = cap * 2;
      f.push({ state: snap(m, { ids: old, lifted, liftAt: end, liftCell: hover, capacity: next, cellMod: cap }), note: `A block cannot grow in place. Make a new block twice as big: ${next} cells.`, cost: 0 });
      f.push({
        state: snap(m, { ids: old, lifted, liftAt: end, liftCell: hover, capacity: next, head: 0, changed: old }),
        note: `Copy the ${size} values across in queue order, front first, into cells 0 to ${size - 1}. That straightens out any wrap-around, and costs ${size} steps. This is the one slow add.`,
        cost: size,
      });
      m.capacity = next;
      if (end === "back") {
        m.head = 0;
        m.ids.push(id);
        f.push({ state: snap(m, { mark: [id], changed: [id] }), note: `Write ${value} into cell ${size} and move the tail on. After that, the next ${next - size - 1} adds are cheap again.`, cost: size + 1 });
      } else {
        const nh = mod(-1, next);
        m.head = nh;
        m.ids.unshift(id);
        f.push({
          state: snap(m, { mark: [id], changed: [id], wrapped: "head" }),
          note: `Move the head back one cell: from cell 0 it wraps round to the last cell, ${nh}. Write ${value} there. After that, the next ${next - size - 1} adds are cheap again.`,
          cost: size + 1,
        });
      }
      return { script: script(`${title} (the ring grows)`, f, `${value} is at the ${end}; the block grew to ${next} cells after ${size + 1} steps`), queue: m };
    }
    if (end === "back") {
      m.ids.push(id);
      f.push({ state: snap(m, { tail: tail0, changed: [id] }), note: `Write ${value} into the cell the tail points at, cell ${tail0}.`, cost: 1 });
      const t1 = mod(tail0 + 1, cap);
      const wraps = tail0 === cap - 1;
      f.push({
        state: snap(m, { mark: [id], wrapped: wraps ? "tail" : null }),
        note: wraps
          ? `Move the tail on. It was at the last cell, ${cap - 1}, so it wraps round to cell 0: (${tail0} + 1) mod ${cap} = 0. Nothing was shifted.`
          : `Move the tail on to cell ${t1}. Nothing was shifted: one write, however long the queue is.`,
        cost: 1,
      });
    } else {
      const wraps = head0 === 0;
      f.push({
        state: snap(m, { ids: old, head: frontCell, lifted, liftAt: "front", liftCell: frontCell, wrapped: wraps ? "head" : null, tail: tail0 }),
        note: wraps ? `Move the head back one cell. It was at cell 0, so it wraps round to the last cell, ${cap - 1}: (0 - 1 + ${cap}) mod ${cap} = ${cap - 1}.` : `Move the head back one cell, to cell ${frontCell}.`,
        cost: 0,
      });
      m.head = frontCell;
      m.ids.unshift(id);
      f.push({ state: snap(m, { mark: [id], changed: [id] }), note: `Write ${value} into that cell. One write, and nothing else moved.`, cost: 1 });
    }
    return { script: script(title, f, `${value} is at the ${end}`), queue: m };
  }

  // linked list (singly or doubly)
  const dbl = m.backing === "doubly";
  const head = old[0] ?? null;
  const tailId = old[size - 1] ?? null;
  const labelsBefore = { head, tail: tailId };
  f.push({ state: snap(m, { ids: old, lifted, liftAt: end, labels: labelsBefore }), note: `A new value, ${value}, is ready to ${joins}. In a linked list, make a node to hold it.`, cost: 0 });
  if (size === 0) {
    m.ids = [id];
    f.push({ state: snap(m, { ids: old, lifted, liftAt: end, changed: [id], labels: labelsBefore }), note: "The queue is empty, so there is no old node whose next must change.", cost: 0 });
    f.push({ state: snap(m, { mark: [id], labels: { head: id, tail: id } }), note: "Point head and tail at the new node: it is both the front and the back. Two pointer changes.", cost: 2 });
    return { script: script(title, f, `${value} is the only item`), queue: m };
  }
  if (end === "back") {
    f.push({
      state: snap(m, { ids: old, lifted, liftAt: "back", changed: [id], labels: labelsBefore }),
      note: `Point the old tail's next at the new node.${dbl ? " The new node's prev points back at the old tail." : ""}`,
      cost: dbl ? 2 : 1,
    });
    m.ids.push(id);
    f.push({
      state: snap(m, { mark: [id] }),
      note: `Move tail to the new node. ${dbl ? "Three" : "Two"} pointer changes, and no other node was touched: the same for ${size} items or a million.`,
      cost: dbl ? 3 : 2,
    });
    return { script: script(title, f, `${value} is at the back`), queue: m };
  }
  f.push({
    state: snap(m, { ids: old, lifted, liftAt: "front", changed: [id], labels: labelsBefore }),
    note: `Point the new node's next at the old head.${dbl ? " The old head's prev points back at the new node." : ""}`,
    cost: dbl ? 2 : 1,
  });
  m.ids.unshift(id);
  f.push({
    state: snap(m, { mark: [id] }),
    note: `Move head to the new node. ${dbl ? "Three" : "Two"} pointer changes, and no other node was touched.`,
    cost: dbl ? 3 : 2,
  });
  return { script: script(title, f, `${value} is at the front`), queue: m };
}

/* ------------------------------------------------------------------ removing: from the front (dequeue) or the back (pop_back) */

function remove(m0: QueueModel, end: "front" | "back", name: string, opts: { predict?: boolean } = {}): Result {
  const m = clone(m0);
  const f: Frame<QueueState>[] = [];
  const title = name === "dequeue" ? "Dequeue" : name === "pop_front" ? "Pop front" : "Pop back";
  const size = m.ids.length;
  if (!size) {
    f.push({
      state: snap(m, { out: "empty" }),
      note: `The queue is empty: there is nothing to ${name === "dequeue" ? "dequeue" : "pop"}. A real queue reports an error here, or returns a marker value, so check first.`,
      cost: 0,
    });
    return { script: script(title, f, "nothing to remove: the queue is empty"), queue: m };
  }
  const goneId = end === "front" ? m.ids[0] : m.ids[size - 1];
  const v = m.values[goneId];
  const rest = end === "front" ? m.ids.slice(1) : m.ids.slice(0, -1);
  const newFront = rest[0] ?? null;
  const newBack = rest[rest.length - 1] ?? null;
  const first = m.ids[0];
  const last = m.ids[size - 1];
  const second = m.ids[1];
  const choices =
    end === "front"
      ? [
          { label: String(v), correct: true, why: "" },
          ...(last !== goneId ? [{ label: String(m.values[last]), correct: false, why: `${m.values[last]} joined last, so it leaves last: a queue is first in, first out` }] : []),
          ...(second !== undefined && second !== last ? [{ label: String(m.values[second]), correct: false, why: `${m.values[second]} is second in line: it leaves after ${v}` }] : []),
        ]
      : [];
  const ask =
    opts.predict && end === "front" && choices.length > 1
      ? { prompt: "Which value does dequeue remove?", choices: choices.filter((c, i, a) => a.findIndex((x) => x.label === c.label) === i).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })) }
      : null;
  const out = `${name === "dequeue" ? "dequeued" : "popped"} ${v}`;
  f.push({
    state: snap(m, { mark: [goneId], labels: m.backing === "ring" ? {} : { head: first, tail: last } }),
    note: end === "front" ? `${name === "dequeue" ? "dequeue" : "pop front"} removes the item at the front: the one that has waited longest, ${v}.` : `pop back removes the item at the back: the one that joined last, ${v}.`,
    cost: 0,
  });

  if (m.backing === "ring") {
    const cap = m.capacity;
    const head0 = m.head;
    const tail0 = mod(head0 + size, cap);
    if (end === "front") {
      const nh = mod(head0 + 1, cap);
      const wraps = head0 === cap - 1;
      f.push({
        state: snap(m, { ids: rest, head: nh, lifted: item(m, goneId), liftAt: "front", liftCell: head0, wrapped: wraps ? "head" : null, out, tail: tail0 }),
        note: wraps
          ? `Hand back ${v} and move the head on. It was at the last cell, ${cap - 1}, so it wraps round to cell 0: (${head0} + 1) mod ${cap} = 0.`
          : `Hand back ${v} and move the head on to cell ${nh}. One step: the cell is simply no longer counted, and nothing shifts.`,
        cost: 1,
        ask,
      });
      m.head = nh;
    } else {
      const lastCell = mod(head0 + size - 1, cap);
      const wraps = tail0 === 0;
      f.push({
        state: snap(m, { ids: rest, lifted: item(m, goneId), liftAt: "back", liftCell: lastCell, wrapped: wraps ? "tail" : null, out, tail: lastCell }),
        note: wraps ? `Hand back ${v} and move the tail back one cell. It was at cell 0, so it wraps round to the last cell, ${cap - 1}.` : `Hand back ${v} and move the tail back to cell ${lastCell}. One step: nothing shifts.`,
        cost: 1,
      });
    }
    m.ids = rest;
    f.push({
      state: snap(m, { out }),
      note: rest.length
        ? `The queue is one shorter. The new ${end === "front" ? `front is ${m.values[newFront as number]}` : `back is ${m.values[newBack as number]}`}.`
        : "The queue is empty again. An empty ring looks like this: the head and the tail meet.",
      cost: 1,
    });
    return { script: script(title, f, out), queue: m };
  }

  // linked list
  const dbl = m.backing === "doubly";
  if (end === "front") {
    f.push({
      state: snap(m, { ids: rest, lifted: item(m, goneId), liftAt: "front", out, labels: { head: newFront, tail: newBack } }),
      note: `Move head to the next node, ${newFront === null ? "null" : m.values[newFront]}, and hand ${v} back.${dbl && newFront !== null ? " Set the new head's prev to null." : ""}`,
      cost: dbl && newFront !== null ? 2 : 1,
      ask,
    });
    m.ids = rest;
    if (!rest.length) {
      f.push({ state: snap(m, { out, labels: { head: null, tail: null } }), note: "The queue is empty, so tail must become null as well. Forgetting this leaves tail pointing at a node that was removed.", cost: 2 });
    } else {
      f.push({ state: snap(m, { out, labels: { head: newFront, tail: newBack } }), note: `The queue is one shorter. The new front is ${m.values[newFront as number]}.`, cost: dbl ? 2 : 1 });
    }
    return { script: script(title, f, out), queue: m };
  }
  // pop back
  if (dbl || size === 1) {
    f.push({
      state: snap(m, { ids: rest, lifted: item(m, goneId), liftAt: "back", out, labels: { head: newFront, tail: newBack } }),
      note: size === 1 ? `This is the only node: head and tail both become null, and ${v} is handed back.` : `The tail's prev is the node before it. Move tail there, set its next to null and hand ${v} back. Two pointer changes.`,
      cost: size === 1 ? 2 : 2,
    });
    m.ids = rest;
    f.push({ state: snap(m, { out, labels: { head: newFront, tail: newBack } }), note: rest.length ? `The queue is one shorter. The new back is ${m.values[newBack as number]}.` : "The queue is empty again.", cost: size === 1 ? 2 : 2 });
    return { script: script(title, f, out), queue: m };
  }
  // singly linked: the node before the tail can only be found by walking from the head
  let cost = 0;
  for (let k = 0; k < size - 1; k++) {
    cost++;
    const id = m.ids[k];
    const isPrev = k === size - 2;
    f.push({
      state: snap(m, { mark: [id], labels: { head: first, tail: last, curr: id } }),
      note: isPrev ? `Look at ${m.values[id]}: its next is the tail, so this is the node before the tail. A singly linked list cannot step back from the tail, so it had to walk here.` : `Walk on from the head: look at ${m.values[id]}. Is its next the tail? No.`,
      cost,
    });
  }
  f.push({
    state: snap(m, { ids: rest, lifted: item(m, goneId), liftAt: "back", out, labels: { head: newFront, tail: newBack } }),
    note: `Set that node's next to null and move tail to it. ${v} is handed back. In all, ${size - 1} look${size - 1 === 1 ? "" : "s"} and 1 change: this is why a deque is built on a doubly linked list.`,
    cost: cost + 1,
  });
  m.ids = rest;
  f.push({ state: snap(m, { out, labels: { head: newFront, tail: newBack } }), note: `The queue is one shorter. The new back is ${m.values[newBack as number]}.`, cost: cost + 1 });
  return { script: script(title, f, `${out} after ${cost + 1} steps`), queue: m };
}

export function peek(m: QueueModel): Result {
  if (!m.ids.length) return { script: script("Peek", [{ state: snap(m, { out: "empty" }), note: "The queue is empty: there is no front to read. Check before you peek.", cost: 0 }], "empty"), queue: m };
  const id = m.ids[0];
  const v = m.values[id];
  return {
    script: script("Peek", [{ state: snap(m, { mark: [id], out: `front is ${v}`, labels: m.backing === "ring" ? {} : { head: id, tail: m.ids[m.ids.length - 1] } }), note: `peek reads the front, ${v}, and leaves the queue exactly as it was. One step.`, cost: 1 }], `front is ${v}`),
    queue: m,
  };
}

/* ------------------------------------------------------------------ the monotonic deque: the maximum of every window */

const winState = (m: QueueModel, w: WindowState, out: string | null): QueueState => ({ ...snap(m), mode: "window", win: w, out });

/**
 * The sliding-window maximum, with a deque of indexes whose values go down from the front to the back. A new value
 * removes every smaller value from the back (they can never be a maximum while it is in the window), goes on at the back,
 * and the front is dropped when it slides out of the window. The front is always the maximum of the window.
 */
export function windowMax(stream0: number[], k0: number, opts: { predict?: boolean } = {}): Script<QueueState> {
  const stream = stream0.slice(0, WINDOW_MAX_LEN);
  const n = stream.length;
  const k = Math.max(1, Math.min(n || 1, Math.round(k0) || 1));
  const m = makeQueue([], { backing: "doubly" });
  const f: Frame<QueueState>[] = [];
  const dq: number[] = [];
  const results: number[] = [];
  let cost = 0;
  let asked = false;
  const w = (i: number | null, dropping: number | null = null): WindowState => ({
    stream,
    window: i === null ? null : [Math.max(0, i - k + 1), i],
    cur: i,
    deque: [...dq],
    results: [...results],
    dropping,
    k,
  });
  if (!n) {
    f.push({ state: winState(m, w(null), "empty"), note: "There are no values to slide a window over. Build a queue first.", cost: 0 });
    return { view: "queue", title: "Sliding maximum", costUnit: "deque steps", frames: f, result: "no values" };
  }
  f.push({
    state: winState(m, w(null), null),
    note: `Find the largest value in every window of ${k} values. A deque of indexes will keep the answer at its front, and every value goes on it once and comes off at most once.`,
    cost: 0,
  });
  for (let i = 0; i < n; i++) {
    f.push({ state: winState(m, w(i), null), note: `Value ${stream[i]} arrives, at index ${i}.${dq.length ? ` The deque's back holds ${stream[dq[dq.length - 1]]}.` : " The deque is empty."}`, cost });
    while (dq.length && stream[dq[dq.length - 1]] <= stream[i]) {
      const b = dq[dq.length - 1];
      const ask =
        opts.predict && !asked
          ? {
              prompt: `${stream[i]} has arrived, and the back of the deque holds ${stream[b]}. What happens to ${stream[b]}?`,
              choices: [
                { label: `It is removed from the back`, correct: true },
                { label: `It stays: it might be the maximum later`, correct: false, why: `${stream[i]} arrived later and is at least as big, so it stays in every window that also holds ${stream[b]}, and lasts longer` },
                { label: `The new value ${stream[i]} is dropped instead`, correct: false, why: "the new value is the newest and may be the maximum for a long time: it always goes on" },
              ],
            }
          : null;
      if (ask) asked = true;
      cost++;
      dq.pop();
      f.push({
        state: winState(m, w(i, b), null),
        note: `${stream[b]} is not bigger than ${stream[i]}. While ${stream[i]} is in the window, ${stream[b]} can never be the maximum, so remove it from the back.`,
        cost,
        ask,
      });
    }
    cost++;
    dq.push(i);
    f.push({
      state: winState(m, w(i), null),
      note: dq.length === 1 ? `Push index ${i} at the back. The deque holds one value, so it is the front.` : `Push index ${i} at the back. The values still go down from the front to the back, so the front is the largest.`,
      cost,
    });
    if (dq[0] <= i - k) {
      const fr = dq[0];
      cost++;
      dq.shift();
      f.push({ state: winState(m, w(i, fr), null), note: `The front holds index ${fr}, which has slid out of the window. Remove it from the front.`, cost });
    }
    if (i >= k - 1) {
      results.push(stream[dq[0]]);
      f.push({ state: winState(m, w(i), `max ${stream[dq[0]]}`), note: `The window from index ${i - k + 1} to ${i} is full. Its maximum is at the front of the deque: ${stream[dq[0]]}.`, cost });
    }
  }
  f.push({
    state: winState(m, w(n - 1), null),
    note: `Done: ${results.length} answer${results.length === 1 ? "" : "s"} in ${cost} deque steps. Each value went on once and came off at most once, so the work is at most ${2 * n}, not ${n} × ${k} = ${n * k}.`,
    cost,
  });
  return { view: "queue", title: `Maximum of every window of ${k}`, costUnit: "deque steps", frames: f, result: `maximums: ${results.join(", ")}` };
}

/* ------------------------------------------------------------------ the memory picture */

const SCATTER = [2040, 1312, 3608, 2896, 1760, 3104, 1528, 2472];
const BASE = 1000;

/**
 * Queues in memory: a queue is a rule on top of an array or a linked list. A fixed story: the ring buffer (cells side by
 * side, head the front, tail the next free cell), a dequeue, an enqueue that wraps the tail round to cell 0, one more that
 * fills the ring, then the linked-list queue (nodes anywhere, head and tail) and its enqueue.
 */
export function queueMemoryPicture(values: number[]): Script<QueueState> {
  const vals = (values.length ? values : [12, 7, 30]).slice(0, 3);
  const ring = makeQueue(vals, { backing: "ring", capacity: 4 });
  const lst = makeQueue(vals, { backing: "list" });
  const addr = (ids: NodeId[]) => Object.fromEntries(ids.map((id, i) => [id, SCATTER[i]]));
  const r1 = remove(ring, "front", "dequeue");
  const afterDeq = r1.queue;
  const r2 = add(afterDeq, 99, "back", "enqueue");
  const afterWrap = r2.queue;
  const r3 = add(afterWrap, 5, "back", "enqueue");
  const l1 = add(lst, 99, "back", "enqueue");
  const ringBase = { base: BASE };
  const lastOf = (s: Script<QueueState>) => s.frames[s.frames.length - 1].state;
  const withBase = (s: QueueState): QueueState => ({ ...s, base: BASE });
  const listWithAddr = (s: QueueState): QueueState => ({ ...s, addrs: addr([...s.items, ...(s.lifted ? [s.lifted] : [])].map((x) => x.id)) });
  const full = { ...withBase(lastOf(r3.script)), out: "full: head = tail" };
  void ringBase;
  const f: Frame<QueueState>[] = [
    { state: withBase(snap(ring)), note: `A queue is a rule, not a kind of memory. It can sit on an array used as a ring: the values lie side by side, head is the cell holding the front, and tail is the next free cell. The block starts at address ${BASE}, 4 bytes a cell.`, cost: 0 },
    { state: withBase(lastOf(r1.script)), note: "Dequeue: hand back the front value and move head on one cell. The value is still in memory, but nothing counts it, and nothing shifts.", cost: 1 },
    { state: withBase(lastOf(r2.script)), note: "Enqueue 99: write it where tail points, cell 3. Tail was at the last cell, so it wraps round to cell 0: that is the ring.", cost: 1 },
    { state: full, note: "Enqueue 5 into cell 0. Now the queue wraps round the end of the block, and head and tail point at the same cell again. Here that means full, but an empty ring looks the same: so keep a count as well.", cost: 1 },
    { state: listWithAddr(snap(lst, { labels: { head: lst.ids[0], tail: lst.ids[lst.ids.length - 1] } })), note: "Or it can sit on a linked list: each value is a node wherever memory had room. Head is the front, tail is the back, and each node stores the address of the next one.", cost: 0 },
    { state: listWithAddr(l1.script.frames[1].state), note: "Enqueue 99: make a node and point the old tail's next at it.", cost: 1 },
    { state: listWithAddr(lastOf(l1.script)), note: "Then move tail to the new node. Two pointer changes, and no value moved. Either way, the work is at the two ends, so it costs the same for any length.", cost: 2 },
  ];
  return { view: "queue", title: "A queue in memory", costUnit: "steps", frames: f, result: "ring-backed or list-backed, the work is at the ends" };
}

export function runQueueOp(m: QueueModel, op: QueueOp, opts: { predict?: boolean } = {}): Result {
  switch (op.op) {
    case "enqueue":
    case "push_back":
      return add(m, op.value, "back", op.op, opts);
    case "push_front":
      return add(m, op.value, "front", op.op, opts);
    case "dequeue":
    case "pop_front":
      return remove(m, "front", op.op, opts);
    case "pop_back":
      return remove(m, "back", op.op, opts);
    case "peek":
      return peek(m);
    case "window_max":
      return { script: windowMax(queueValues(m), op.value, opts), queue: m };
  }
}

/** What the same operation costs on the other storage, for the sandbox's side-by-side line. */
export function otherBackingCost(m: QueueModel, op: QueueOp): { mine: number; other: number; otherName: string; why: string } {
  const run = (mm: QueueModel) => runQueueOp(mm, op).script.frames.at(-1)?.cost ?? 0;
  const mine = run(m);
  const o: QueueModel = { ...m, backing: m.backing === "ring" ? "list" : "ring" };
  const other = run(o);
  const full = m.backing === "ring" && m.ids.length >= m.capacity;
  const adds = op.op === "enqueue" || op.op === "push_back" || op.op === "push_front";
  const why = adds
    ? full
      ? "This add found the ring full, so every value was copied to a bigger block. A linked list never runs out of room."
      : "An add writes one cell in a ring. In a linked list it makes a node and changes pointers."
    : op.op === "dequeue" || op.op === "pop_front"
      ? "A removal at the front moves the head by one: a cell index in the ring, a pointer in the list."
      : op.op === "pop_back"
        ? m.backing === "list"
          ? "A singly linked list has to walk from the head to find the node before the tail. A ring, or a doubly linked list, steps back at once."
          : "A ring steps the tail back by one cell. A singly linked list would have to walk the whole list."
        : op.op === "peek"
          ? "A peek reads the front in both."
          : "";
  return { mine, other, otherName: word(o.backing), why };
}

export { word as backingWord };
