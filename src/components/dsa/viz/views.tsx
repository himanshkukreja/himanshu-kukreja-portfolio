"use client";

/**
 * The step engine's views by id (src/lib/dsa/viz/types.ts ViewId). A view draws one frame's state, tweening from the
 * previous frame (t: 0 → 1), and describes the state in words for screen readers. Adding a structure = adding its
 * view here (a stack, queue, tree, heap or graph view takes the same three props).
 */
import type { ComponentType } from "react";
import type { ArrayState, ListState, MemoryState, ViewId } from "@/lib/dsa/viz/types";
import ListView, { describeList } from "./ListView";
import ArrayView, { describeArray } from "./ArrayView";
import MemoryView, { describeMemory } from "./MemoryView";

type ViewDef<S> = { Component: ComponentType<{ state: S; prev: S | null; t: number }>; describe: (s: S) => string };

export const VIEWS: { [K in ViewId]: ViewDef<K extends "list" ? ListState : K extends "array" ? ArrayState : MemoryState> } = {
  list: { Component: ListView, describe: describeList },
  array: { Component: ArrayView, describe: describeArray },
  memory: { Component: MemoryView, describe: describeMemory },
};
