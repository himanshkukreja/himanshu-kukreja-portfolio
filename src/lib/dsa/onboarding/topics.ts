import type { TopicId } from "./puzzles";

export type Know = 0 | 1 | 2;
export const KNOW_LABEL: Record<Know, string> = { 0: "Never heard of it", 1: "Seen it", 2: "Can code it" };

/** The twelve cards on the desk, in the order the campus teaches them. `region` is the Academy region to start at. */
export const TOPICS: { id: TopicId; label: string; line: string; region: string }[] = [
  { id: "arrays", label: "Arrays & strings", line: "Items in a row, found by index", region: "m2-arrays-strings" },
  { id: "hashing", label: "Hash maps", line: "Look anything up by its key", region: "m3-hashing" },
  { id: "lists", label: "Linked lists", line: "Nodes that point to the next one", region: "s1-linked-lists" },
  { id: "stacks", label: "Stacks", line: "Last in, first out", region: "s2-stacks" },
  { id: "queues", label: "Queues", line: "First in, first out", region: "s3-queues-and-deques" },
  { id: "trees", label: "Trees", line: "Parents, children and branches", region: "s4-trees-and-bst" },
  { id: "heaps", label: "Heaps", line: "Always know the smallest item", region: "s5-heaps" },
  { id: "graphs", label: "Graphs", line: "Places joined by roads", region: "s6-graphs" },
  { id: "bsearch", label: "Binary search", line: "Halve the search every step", region: "m8-binary-search" },
  { id: "recursion", label: "Recursion", line: "A problem made of smaller copies of itself", region: "m6-recursion" },
  { id: "sorting", label: "Sorting", line: "Put things in order, cheaply", region: "m7-sorting" },
  { id: "dp", label: "Dynamic programming", line: "Remember answers, skip repeat work", region: "a6-dynamic-programming" },
];

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t])) as Record<TopicId, (typeof TOPICS)[number]>;

/** The front door of the campus, and where an all-rounder goes next (the pattern lessons). */
export const FRONT_REGION = "m0-toolkit";
export const PATTERNS_REGION = "m4-two-pointers";
