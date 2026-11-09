/**
 * The memory picture ("memory" view): an array's one contiguous block next to a linked list's nodes scattered through
 * memory, each holding the next node's address. A fixed six-step story; the values come from the demo's `start`.
 */
import type { Frame, MemoryState, Script } from "./types";

/** Made-up but plausible addresses for nodes: anywhere there was free room when each node was made. */
const SCATTER = [2040, 1312, 3608, 2896, 1760, 3104, 1528, 2472];
const BASE = 1000;

export function memoryPicture(values: number[]): Script<MemoryState> {
  const vals = values.slice(0, SCATTER.length);
  const nodes = vals.map((value, i) => ({ value, addr: SCATTER[i] }));
  const k = Math.min(2, Math.max(0, vals.length - 1));
  const at = (o: { array?: Partial<MemoryState["array"]>; list?: Partial<MemoryState["list"]> }): MemoryState => ({
    array: { base: BASE, values: vals, show: true, lit: null, ...o.array },
    list: { nodes, show: false, lit: null, showLinks: false, head: false, ...o.list },
  });
  const f: Frame<MemoryState>[] = [
    { state: at({}), note: `An array keeps its values side by side in one block of memory. Here the block starts at address ${BASE}, 4 bytes a value.`, cost: 0 },
    {
      state: at({ array: { lit: k } }),
      note: `To read index ${k}, the computer works out ${BASE} + ${k} × 4 = ${BASE + 4 * k} and jumps straight there. One step, whatever the index.`,
      cost: 0,
    },
    { state: at({ list: { show: true } }), note: "A linked list puts each value in its own node, wherever memory has room. The nodes are not side by side.", cost: 0 },
    { state: at({ list: { show: true, showLinks: true } }), note: "So each node also stores the address of the next node. That stored address is the next pointer. The last node stores null.", cost: 0 },
    { state: at({ list: { show: true, showLinks: true, head: true, lit: 0 } }), note: `The list itself remembers one address: the head, ${nodes[0]?.addr ?? "null"}. Everything else is found by following next.`, cost: 0 },
    {
      state: at({ list: { show: true, showLinks: true, head: true, lit: k } }),
      note: `To reach position ${k}, start at the head and follow next ${k} time${k === 1 ? "" : "s"}: ${k} hop${k === 1 ? "" : "s"}. Position 1,000 would take 1,000 hops. No arithmetic can skip ahead.`,
      cost: k,
    },
  ];
  return { view: "memory", title: "An array and a linked list in memory", costUnit: "pointer hops", frames: f, result: `index ${k}: 1 jump in the array, ${k} hops in the list` };
}
