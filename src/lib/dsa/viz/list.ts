/**
 * The linked-list model and its operations as step-by-step scripts (the "list" view). Every operation is a pure
 * function: (list, args) → { script, list after }. The cost counter counts pointer hops: each time a cursor (curr,
 * slow, fast) moves from a node to its next node. Changing a pointer costs nothing extra; finding the node does.
 *
 * Plain-word narration, one sentence a step, written for a first-time learner (Academy Part 2).
 */
import type { Frame, ListState, NodeId, Script } from "./types";

export type ListModel = {
  /** node ids from head to tail */
  ids: NodeId[];
  values: Record<NodeId, number>;
  doubly: boolean;
  /** keep a tail pointer (push_back is O(1)); without it, push_back walks the whole list */
  tail: boolean;
  nextId: number;
};

export type ListOp =
  | { op: "push_front"; value: number }
  | { op: "push_back"; value: number }
  | { op: "insert_after"; index: number; value: number }
  | { op: "delete"; value: number }
  | { op: "search"; value: number }
  | { op: "reverse" }
  | { op: "middle" };

export type ListOpName = ListOp["op"];

export const LIST_OPS: ListOpName[] = ["push_front", "push_back", "insert_after", "delete", "search", "reverse", "middle"];

export const LIST_OP_LABEL: Record<ListOpName, string> = {
  push_front: "Insert at head",
  push_back: "Insert at tail",
  insert_after: "Insert after a node",
  delete: "Delete a value",
  search: "Search",
  reverse: "Reverse",
  middle: "Find the middle",
};

export function makeList(values: number[], opts: { doubly?: boolean; tail?: boolean } = {}): ListModel {
  const ids = values.map((_, i) => i);
  return { ids, values: Object.fromEntries(values.map((v, i) => [i, v])), doubly: !!opts.doubly, tail: opts.tail !== false, nextId: values.length };
}

export const listValues = (m: ListModel) => m.ids.map((id) => m.values[id]);

/** "head → 12 → 7 → 30 → null", for screen readers and the history log. */
export const listText = (m: ListModel) => (m.ids.length ? `head → ${listValues(m).join(" → ")} → null` : "head → null (empty)");

/* ------------------------------------------------------------------ frame building */

type Over = Partial<Omit<ListState, "nodes" | "doubly">> & { extra?: { id: NodeId; value: number }[] };

/** A frame's state: the chain as the model has it, with overrides for this step. */
function snap(m: ListModel, o: Over = {}): ListState {
  const ids = m.ids;
  const next: Record<NodeId, NodeId | null> = {};
  ids.forEach((id, i) => (next[id] = i + 1 < ids.length ? ids[i + 1] : null));
  const prev: Record<NodeId, NodeId | null> = {};
  ids.forEach((id, i) => (prev[id] = i > 0 ? ids[i - 1] : null));
  const nodes = [...ids.map((id) => ({ id, value: m.values[id] })), ...(o.extra || [])];
  const labels: Record<string, NodeId | null> = { head: ids[0] ?? null };
  if (m.tail) labels.tail = ids.length ? ids[ids.length - 1] : null;
  return {
    nodes,
    order: o.order ?? [...ids, ...(o.extra || []).map((n) => n.id)],
    next: { ...next, ...(o.next || {}) },
    prev: m.doubly ? { ...prev, ...(o.prev || {}) } : undefined,
    doubly: m.doubly,
    labels: { ...labels, ...(o.labels || {}) },
    mark: o.mark || [],
    changed: o.changed || [],
    detached: o.detached || [],
  };
}

const v = (m: ListModel, id: NodeId | null | undefined) => (id === null || id === undefined ? "null" : String(m.values[id]));

function script(title: string, frames: Frame<ListState>[], result?: string): Script<ListState> {
  return { view: "list", title, costUnit: "pointer hops", frames, result };
}

const clone = (m: ListModel): ListModel => ({ ...m, ids: [...m.ids], values: { ...m.values } });

/** The list as it stands, as a one-frame script (the sandbox before any operation). */
export function stillScript(m: ListModel, note: string): Script<ListState> {
  return script("Your list", [{ state: snap(m), note, cost: 0 }]);
}

/* ------------------------------------------------------------------ operations */

export function pushFront(m0: ListModel, value: number): { script: Script<ListState>; list: ListModel } {
  const m = clone(m0);
  const id = m.nextId++;
  m.values[id] = value;
  const node = { id, value };
  const head = m.ids[0] ?? null;
  const f: Frame<ListState>[] = [];
  f.push({ state: snap(m, { extra: [node], order: [id, ...m.ids], detached: [id], next: { [id]: null }, labels: { new: id } }), note: `Make a new node holding ${value}. Nothing points at it yet.`, cost: 0 });
  f.push({
    state: snap(m, { extra: [node], order: [id, ...m.ids], detached: [id], next: { [id]: head }, prev: head !== null ? { [head]: m.doubly ? id : null, [id]: null } : { [id]: null }, labels: { new: id }, changed: [id] }),
    note: head === null ? "The list is empty, so the new node's next stays null." : `Point the new node's next at the current head, ${v(m, head)}${m.doubly ? `, and point ${v(m, head)}'s prev back at the new node` : ""}.`,
    cost: 0,
  });
  m.ids.unshift(id);
  f.push({ state: snap(m, { mark: [id], labels: { new: id } }), note: `Move head to the new node.${m.ids.length === 1 && m.tail ? " It is also the tail." : ""} No walking was needed: 0 hops, whatever the length.`, cost: 0 });
  return { script: script(`Insert ${value} at the head`, f, `${value} is the new head`), list: m };
}

export function pushBack(m0: ListModel, value: number): { script: Script<ListState>; list: ListModel } {
  const m = clone(m0);
  const id = m.nextId++;
  m.values[id] = value;
  const node = { id, value };
  const f: Frame<ListState>[] = [];
  const last = m.ids[m.ids.length - 1] ?? null;
  let cost = 0;
  f.push({ state: snap(m, { extra: [node], detached: [id], next: { [id]: null }, labels: { new: id } }), note: `Make a new node holding ${value}. Its next is null: it will be the last node.`, cost });
  if (last === null) {
    m.ids.push(id);
    f.push({ state: snap(m, { mark: [id] }), note: "The list was empty, so the new node becomes both head and tail.", cost });
    return { script: script(`Insert ${value} at the tail`, f, `${value} is the only node`), list: m };
  }
  if (!m.tail) {
    // no tail pointer: walk from the head to the last node
    let k = 0;
    f.push({ state: snap(m, { extra: [node], detached: [id], next: { [id]: null }, labels: { new: id, curr: m.ids[0] }, mark: [m.ids[0]] }), note: "There is no tail pointer, so start a cursor, curr, at the head and walk to the last node.", cost });
    while (k < m.ids.length - 1) {
      k++;
      cost++;
      f.push({ state: snap(m, { extra: [node], detached: [id], next: { [id]: null }, labels: { new: id, curr: m.ids[k] }, mark: [m.ids[k]] }), note: `curr moves to ${v(m, m.ids[k])}${k === m.ids.length - 1 ? ": its next is null, so this is the last node." : "."}`, cost });
    }
  }
  f.push({
    state: snap(m, { extra: [node], detached: [id], next: { [last]: id, [id]: null }, prev: { [id]: m.doubly ? last : null }, labels: { new: id, ...(m.tail ? {} : { curr: last }) }, changed: [last] }),
    note: `Point the last node's next (${v(m, last)}) at the new node${m.doubly ? ", and the new node's prev back at it" : ""}.`,
    cost,
  });
  m.ids.push(id);
  f.push({
    state: snap(m, { mark: [id] }),
    note: m.tail ? "Move tail to the new node. With a tail pointer this took 0 hops, however long the list is." : `Done, after ${cost} hops. A tail pointer would have made this 0.`,
    cost,
  });
  return { script: script(`Insert ${value} at the tail`, f, `${value} is the new tail`), list: m };
}

export function insertAfter(m0: ListModel, index: number, value: number): { script: Script<ListState>; list: ListModel } {
  const m = clone(m0);
  if (!m.ids.length) return pushFront(m0, value);
  const at = Math.max(0, Math.min(index, m.ids.length - 1));
  const id = m.nextId++;
  m.values[id] = value;
  const node = { id, value };
  const f: Frame<ListState>[] = [];
  let cost = 0;
  const target = m.ids[at];
  const after = m.ids[at + 1] ?? null;
  const order = [...m.ids.slice(0, at + 1), id, ...m.ids.slice(at + 1)];
  f.push({ state: snap(m, { labels: { curr: m.ids[0] }, mark: [m.ids[0]] }), note: `To insert after position ${at}, first reach that node: start curr at the head.`, cost });
  for (let k = 1; k <= at; k++) {
    cost++;
    f.push({ state: snap(m, { labels: { curr: m.ids[k] }, mark: [m.ids[k]] }), note: `curr moves to ${v(m, m.ids[k])} (position ${k}).`, cost });
  }
  f.push({ state: snap(m, { extra: [node], order, detached: [id], next: { [id]: null }, labels: { curr: target, new: id } }), note: `Make a new node holding ${value}.`, cost });
  f.push({
    state: snap(m, { extra: [node], order, detached: [id], next: { [id]: after }, prev: { [id]: m.doubly ? target : null }, labels: { curr: target, new: id }, changed: [id] }),
    note: `First point the new node's next at ${after === null ? "null (curr is the last node)" : `curr's next, ${v(m, after)}`}. Do this before changing curr, or ${after === null ? "nothing" : `${v(m, after)} and everything after it`} is lost.`,
    cost,
  });
  m.ids.splice(at + 1, 0, id);
  f.push({
    state: snap(m, { labels: { curr: target, new: id }, mark: [id], changed: [target] }),
    note: `Now point curr's next at the new node${m.doubly && after !== null ? `, and ${v(m, after)}'s prev at it too` : ""}. The chain is whole again.`,
    cost,
  });
  return { script: script(`Insert ${value} after position ${at}`, f, `${value} now sits at position ${at + 1}`), list: m };
}

export function search(m: ListModel, value: number): { script: Script<ListState>; list: ListModel } {
  const f: Frame<ListState>[] = [];
  let cost = 0;
  if (!m.ids.length) {
    f.push({ state: snap(m), note: "The list is empty: head is null, so there is nothing to search.", cost });
    return { script: script(`Search for ${value}`, f, "not found"), list: m };
  }
  for (let k = 0; k < m.ids.length; k++) {
    const id = m.ids[k];
    if (k > 0) cost++;
    const hit = m.values[id] === value;
    f.push({
      state: snap(m, { labels: { curr: id }, mark: [id] }),
      note: `${k === 0 ? "Start curr at the head. " : `curr moves to the next node. `}Is ${m.values[id]} equal to ${value}? ${hit ? `Yes: found at position ${k}.` : "No."}`,
      cost,
    });
    if (hit) return { script: script(`Search for ${value}`, f, `found at position ${k} after ${cost} hops`), list: m };
  }
  f.push({ state: snap(m, { labels: { curr: null } }), note: `curr moves past the last node to null. ${value} is not in the list: every node was checked.`, cost: cost + 1 });
  return { script: script(`Search for ${value}`, f, `not found after ${cost + 1} hops`), list: m };
}

export function deleteValue(m0: ListModel, value: number): { script: Script<ListState>; list: ListModel } {
  const m = clone(m0);
  const f: Frame<ListState>[] = [];
  let cost = 0;
  if (!m.ids.length) {
    f.push({ state: snap(m), note: "The list is empty: there is nothing to delete.", cost });
    return { script: script(`Delete ${value}`, f, "nothing to delete"), list: m };
  }
  const head = m.ids[0];
  if (m.values[head] === value) {
    const nxt = m.ids[1] ?? null;
    f.push({ state: snap(m, { labels: { curr: head }, mark: [head] }), note: `The head holds ${value}, so no walk is needed.`, cost });
    f.push({ state: snap(m, { labels: { head: nxt, curr: head }, detached: [head], changed: [], mark: [head] }), note: `Move head to the next node, ${v(m, nxt)}. Nothing points at ${value} any more.`, cost });
    m.ids.shift();
    f.push({ state: snap(m), note: `The old head is unlinked${m.ids.length ? "" : ": the list is now empty"}. Deleting at the head costs 0 hops.`, cost });
    return { script: script(`Delete ${value}`, f, `deleted the head`), list: m };
  }
  // walk with prev and curr (singly); a doubly linked node knows its own prev
  let k = 1;
  f.push({ state: snap(m, { labels: m.doubly ? { curr: head } : { prev: head, curr: m.ids[1] ?? null }, mark: [head] }), note: m.doubly ? `The head is not ${value}. Walk with curr; each node knows its prev.` : `The head is not ${value}. Walk with two cursors: prev, and curr one node ahead.`, cost });
  while (k < m.ids.length) {
    const id = m.ids[k];
    cost++;
    const hit = m.values[id] === value;
    const p = m.ids[k - 1];
    f.push({ state: snap(m, { labels: m.doubly ? { curr: id } : { prev: p, curr: id }, mark: [id] }), note: `curr is at ${m.values[id]}. Equal to ${value}? ${hit ? "Yes." : "No, move on."}`, cost });
    if (hit) {
      const after = m.ids[k + 1] ?? null;
      f.push({
        state: snap(m, { labels: m.doubly ? { curr: id } : { prev: p, curr: id }, next: { [p]: after }, prev: after !== null ? { [after]: p } : {}, detached: [id], changed: [p], mark: [id] }),
        note: `Point ${v(m, p)}'s next past curr, at ${v(m, after)}${m.doubly && after !== null ? `, and ${v(m, after)}'s prev back at ${v(m, p)}` : ""}. Now nothing points at ${value}.`,
        cost,
      });
      m.ids.splice(k, 1);
      f.push({ state: snap(m, { mark: [] }), note: `${value} is unlinked${k === m.ids.length && m.tail ? `, and tail moves back to ${v(m, p)}` : ""}. Unlinking was 1 step; reaching it took ${cost} hops.`, cost });
      return { script: script(`Delete ${value}`, f, `deleted after ${cost} hops`), list: m };
    }
    k++;
  }
  f.push({ state: snap(m), note: `curr reached null: ${value} is not in the list, so nothing changes.`, cost: cost + 1 });
  return { script: script(`Delete ${value}`, f, "not found"), list: m };
}

export function reverse(m0: ListModel, opts: { predict?: boolean } = {}): { script: Script<ListState>; list: ListModel } {
  const m = clone(m0);
  const f: Frame<ListState>[] = [];
  const ids = m.ids;
  const order = [...ids];
  if (ids.length < 2) {
    f.push({ state: snap(m), note: ids.length ? "One node: reversing changes nothing." : "An empty list: reversing changes nothing.", cost: 0 });
    return { script: script("Reverse the list", f, "nothing to change"), list: m };
  }
  const next: Record<NodeId, NodeId | null> = {};
  ids.forEach((id, i) => (next[id] = ids[i + 1] ?? null));
  const prevLinks: Record<NodeId, NodeId | null> = {};
  ids.forEach((id, i) => (prevLinks[id] = ids[i - 1] ?? null));
  let cost = 0;
  let prev: NodeId | null = null;
  let curr: NodeId | null = ids[0];
  const st = (o: Over) => snap(m, { order, next: { ...next }, prev: m.doubly ? { ...prevLinks } : undefined, ...o, labels: { head: ids[0], ...(m.tail ? { tail: ids[ids.length - 1] } : {}), ...(o.labels || {}) } });
  f.push({ state: st({ labels: { prev: null, curr } }), note: "Start with prev at null and curr at the head. Each step turns one arrow around.", cost, marker: 1 });
  while (curr !== null) {
    const nxt: NodeId | null = next[curr];
    f.push({ state: st({ labels: { prev, curr, next: nxt }, mark: [curr] }), note: `Save curr's next (${v(m, nxt)}) in next, so the rest of the list is not lost.`, cost, marker: 2 });
    next[curr] = prev;
    if (m.doubly) prevLinks[curr] = nxt;
    const choices = [
      { label: v(m, prev), correct: true, why: "" },
      { label: v(m, nxt), correct: false, why: `${v(m, nxt)} is where it pointed before: the arrow has to turn around` },
      { label: v(m, curr), correct: false, why: "a node never points at itself here: that would make a loop" },
    ].filter((c, i, a) => a.findIndex((x) => x.label === c.label) === i);
    f.push({
      state: st({ labels: { prev, curr, next: nxt }, mark: [curr], changed: [curr] }),
      note: `Turn curr's arrow around: ${v(m, curr)}.next now points at prev, ${v(m, prev)}.`,
      cost,
      marker: 3,
      ask: opts.predict ? { prompt: `After this step, where does ${v(m, curr)}'s next point?`, choices: choices.sort((a, b) => a.label.localeCompare(b.label)) } : null,
    });
    prev = curr;
    curr = nxt;
    if (curr !== null) cost++;
    f.push({ state: st({ labels: { prev, curr, next: curr } }), note: curr === null ? "Move prev to curr, and curr to next: curr is now null, so every arrow is turned." : `Move prev up to ${v(m, prev)} and curr up to ${v(m, curr)}.`, cost, marker: 4 });
  }
  m.ids = [...ids].reverse();
  f.push({ state: snap(m, { mark: [m.ids[0]], changed: [] }), note: `Point head at prev, ${v(m, prev)}${m.tail ? `, and tail at the old head, ${m.values[ids[0]]}` : ""}. The list now reads from the other end.`, cost, marker: 5 });
  return { script: script("Reverse the list", f, `reversed in ${cost} hops`), list: m };
}

export function middle(m: ListModel, opts: { predict?: boolean } = {}): { script: Script<ListState>; list: ListModel } {
  const f: Frame<ListState>[] = [];
  const ids = m.ids;
  if (!ids.length) {
    f.push({ state: snap(m), note: "The list is empty: there is no middle.", cost: 0 });
    return { script: script("Find the middle", f, "no middle"), list: m };
  }
  let slow = 0;
  let fast = 0;
  let cost = 0;
  f.push({ state: snap(m, { labels: { slow: ids[0], fast: ids[0] }, mark: [ids[0]] }), note: "Start slow and fast at the head. Each round, slow moves one node and fast moves two.", cost });
  while (fast < ids.length && fast + 1 < ids.length) {
    const s2 = slow + 1;
    const f2 = fast + 2;
    const fastId = f2 < ids.length ? ids[f2] : null;
    const opt = opts.predict
      ? {
          prompt: `fast is at ${m.values[ids[fast]]}. Where does fast land after this round?`,
          choices: [
            { label: v(m, fastId), correct: true },
            { label: v(m, ids[fast + 1]), correct: false, why: "that is one node on; fast moves two" },
            ...(s2 !== fast + 1 ? [{ label: v(m, ids[s2]), correct: false, why: "that is where slow lands" }] : []),
          ].filter((c, i, a) => a.findIndex((x) => x.label === c.label) === i),
        }
      : null;
    slow = s2;
    fast = f2;
    cost += 3; // slow: 1 hop; fast: 2 hops (the second may land on null)
    f.push({
      state: snap(m, { labels: { slow: ids[slow], fast: fastId }, mark: [ids[slow]] }),
      note: `slow moves one node to ${m.values[ids[slow]]}; fast moves two, to ${fastId === null ? "null (past the end)" : m.values[fastId]}.`,
      cost,
      ask: opt && opt.choices.length > 1 ? { prompt: opt.prompt, choices: opt.choices.sort((a, b) => a.label.localeCompare(b.label)) } : null,
    });
  }
  const even = ids.length % 2 === 0;
  f.push({
    state: snap(m, { labels: { slow: ids[slow], fast: fast < ids.length ? ids[fast] : null }, mark: [ids[slow]] }),
    note: `fast ${fast < ids.length ? "is on the last node" : "has run off the end"}, so stop. slow is at the middle, ${m.values[ids[slow]]}${even ? ": with an even count this is the second of the two middles" : ""}.`,
    cost,
  });
  return { script: script("Find the middle", f, `middle: ${m.values[ids[slow]]} (position ${slow})`), list: m };
}

export function runListOp(m: ListModel, op: ListOp, opts: { predict?: boolean } = {}): { script: Script<ListState>; list: ListModel } {
  switch (op.op) {
    case "push_front":
      return pushFront(m, op.value);
    case "push_back":
      return pushBack(m, op.value);
    case "insert_after":
      return insertAfter(m, op.index, op.value);
    case "delete":
      return deleteValue(m, op.value);
    case "search":
      return search(m, op.value);
    case "reverse":
      return reverse(m, opts);
    case "middle":
      return middle(m, opts);
  }
}

/**
 * The same operation on an array of the same values, in words: what it would cost there. The sandbox shows it next to
 * the list's pointer hops, so the difference between the two structures is felt, not just stated.
 */
export function arrayCostOf(op: ListOp, values: number[]): string {
  const n = values.length;
  switch (op.op) {
    case "push_front":
      return n ? `${n} shift${n === 1 ? "" : "s"}: every value moves right one cell to make room at index 0` : "0 shifts: the array is empty";
    case "push_back":
      return "0 shifts: write into the next free cell (when the array has spare room)";
    case "insert_after": {
      const k = Math.max(0, Math.min(op.index, n - 1));
      const s = Math.max(0, n - k - 1);
      return `${s} shift${s === 1 ? "" : "s"}: the values after index ${k} move right, but reaching index ${k} itself is 1 jump`;
    }
    case "delete": {
      const k = values.indexOf(op.value);
      if (k < 0) return `${n} comparisons, then nothing to delete`;
      const s = n - k - 1;
      return `${k + 1} comparison${k ? "s" : ""} to find it, then ${s} shift${s === 1 ? "" : "s"} left to close the gap`;
    }
    case "search": {
      const k = values.indexOf(op.value);
      return k < 0 ? `${n} comparisons: also a scan, unless the array is sorted (then binary search)` : `${k + 1} comparison${k ? "s" : ""}: also a scan from the start`;
    }
    case "reverse":
      return `${Math.floor(n / 2)} swaps, two indexes moving inwards`;
    case "middle":
      return "0 walking: read index n / 2 directly";
  }
}
