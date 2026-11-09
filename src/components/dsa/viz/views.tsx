"use client";

/**
 * The step engine's views by id (src/lib/dsa/viz/types.ts ViewId). A view draws one frame's state, tweening from the
 * previous frame (t: 0 → 1), and describes the state in words for screen readers. Adding a structure = adding its
 * view here (a stack, queue, tree, heap or graph view takes the same three props). The grid view draws BFS/DFS
 * (search.ts); a graph view will draw the same SearchState with nodes and edges, reusing FrontierPanel and nodeTone.
 */
import type { ComponentType } from "react";
import type { ArrayState, GraphState, HeapState, ListState, MemoryState, QueueState, StackState, TreeState, TrieState, ViewId } from "@/lib/dsa/viz/types";
import type { GridState } from "@/lib/dsa/viz/grid";
import ListView, { describeList } from "./ListView";
import ArrayView, { describeArray } from "./ArrayView";
import MemoryView, { describeMemory } from "./MemoryView";
import GridView, { describeGrid } from "./GridView";
import StackView, { describeStack } from "./StackView";
import QueueView, { describeQueueState } from "./QueueView";
import TreeView, { describeTreeState } from "./TreeView";
import HeapView, { describeHeapState } from "./HeapView";
import GraphView, { describeGraphState } from "./GraphView";
import TrieView, { describeTrieState } from "./TrieView";

type ViewDef<S> = { Component: ComponentType<{ state: S; prev: S | null; t: number }>; describe: (s: S) => string };

export const VIEWS: { [K in ViewId]: ViewDef<K extends "list" ? ListState : K extends "array" ? ArrayState : K extends "grid" ? GridState : K extends "stack" ? StackState : K extends "queue" ? QueueState : K extends "tree" ? TreeState : K extends "heap" ? HeapState : K extends "graph" ? GraphState : K extends "trie" ? TrieState : MemoryState> } = {
  list: { Component: ListView, describe: describeList },
  array: { Component: ArrayView, describe: describeArray },
  memory: { Component: MemoryView, describe: describeMemory },
  grid: { Component: GridView, describe: describeGrid },
  stack: { Component: StackView, describe: describeStack },
  queue: { Component: QueueView, describe: describeQueueState },
  tree: { Component: TreeView, describe: describeTreeState },
  heap: { Component: HeapView, describe: describeHeapState },
  graph: { Component: GraphView, describe: describeGraphState },
  trie: { Component: TrieView, describe: describeTrieState },
};
