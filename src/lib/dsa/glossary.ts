/**
 * DSA Mastery's jargon glossary (the beginner pass, owner 9 Nov 2026): one-line, plain definitions for the terms a
 * first-time learner trips on. The lesson and problem pages turn the first use of each term in a section into a small
 * button that shows its definition (src/components/dsa/glossary/Jargon.tsx). Curated by hand; keep each line short,
 * accurate and free of other jargon where possible. Order matters: longer phrases come before the words inside them
 * ("sliding window" before "window", "hash map" before "map"), and the first entry that matches a spot wins.
 */

export type GlossaryEntry = {
  /** a stable id (analytics, the popover's id) */
  id: string;
  /** the name shown at the top of the popover */
  term: string;
  /** what it matches in the text (case-insensitive unless `exact`) */
  match: RegExp;
  def: string;
};

const w = (s: string) => new RegExp(`\\b(?:${s})\\b`, "i");
/** big-O forms are matched as written (case-sensitive "O"), with or without spaces inside */
const o = (inner: string) => new RegExp(`O\\(\\s*${inner}\\s*\\)`);

export const GLOSSARY: GlossaryEntry[] = [
  { id: "o-1", term: "O(1)", match: o("1"), def: "Constant time: the work stays the same however big the input gets." },
  { id: "o-log-n", term: "O(log n)", match: o("log\\s*n"), def: "Logarithmic time: doubling the input adds only one more step, like halving a search range each time." },
  { id: "o-n-log-n", term: "O(n log n)", match: o("n\\s*log\\s*n"), def: "About n × log n steps: the cost of a good sort. Slightly more than linear, far less than n²." },
  { id: "o-n2", term: "O(n²)", match: /O\(\s*n\s*(?:\^\s*2|²|\*\s*n)\s*\)/, def: "Quadratic time: double the input and the work grows four times, typical of a loop inside a loop." },
  { id: "o-nk", term: "O(n·k)", match: /O\(\s*n\s*(?:·|\*|×)?\s*k\s*\)/, def: "The work grows with n times k: for example, k steps for each of n positions." },
  { id: "o-n", term: "O(n)", match: o("n"), def: "Linear time: the work grows in step with the input. Twice the data, about twice the time." },
  { id: "big-o", term: "Big O", match: w("big[- ]o(?: notation)?"), def: "A way to describe how an algorithm's work grows as the input grows, ignoring constant factors." },
  { id: "time-complexity", term: "Time complexity", match: w("time complexity"), def: "How the number of steps an algorithm takes grows with the size of its input." },
  { id: "space-complexity", term: "Space complexity", match: w("space complexity|extra space"), def: "How much extra memory an algorithm needs as the input grows, beyond the input itself." },
  { id: "complexity", term: "Complexity", match: w("complexity"), def: "How the time or memory an algorithm needs grows as its input grows, usually written in Big O." },
  { id: "sliding-window", term: "Sliding window", match: w("sliding windows?"), def: "A range over consecutive items that moves along the data, updating a running result instead of starting over." },
  { id: "window", term: "Window", match: w("windows?"), def: "A block of consecutive items, from a left index to a right index, that you look at together." },
  { id: "two-pointers", term: "Two pointers", match: w("two pointers"), def: "Two index variables that move through the data, often from both ends or one behind the other." },
  { id: "pointer", term: "Pointer", match: w("pointers?"), def: "Here, a variable that holds a position (an index) in an array or list, not a memory address." },
  { id: "invariant", term: "Invariant", match: w("invariants?"), def: "A fact your code keeps true at every step; if it holds at the end, the answer is correct." },
  { id: "hash-map", term: "Hash map", match: w("hash ?maps?|dictionar(?:y|ies)|dicts?"), def: "A table of key → value pairs with near-instant lookup by key, like a Python dict or a Java HashMap." },
  { id: "hash-set", term: "Hash set", match: w("hash ?sets?"), def: "A collection of unique values with near-instant 'is it in here?' checks, like a Python set." },
  { id: "hash-table", term: "Hash table", match: w("hash tables?"), def: "The structure behind hash maps and sets: a hash function picks the slot (bucket) each key goes in." },
  { id: "hash-function", term: "Hash function", match: w("hash functions?"), def: "A function that turns a key into a number, used to pick the bucket where the key is stored." },
  { id: "collision", term: "Collision", match: w("collisions?"), def: "When two different keys land in the same bucket of a hash table." },
  { id: "load-factor", term: "Load factor", match: w("load factor"), def: "How full a hash table is: the number of keys divided by the number of buckets." },
  { id: "bucket", term: "Bucket", match: w("buckets?"), def: "One slot of a hash table; it holds the keys whose hash points to it." },
  { id: "frequency-map", term: "Frequency map", match: w("frequency (?:map|table|count)s?"), def: "A hash map from each value to how many times it appears." },
  { id: "subarray", term: "Subarray", match: w("subarrays?"), def: "A run of consecutive items taken from an array, with nothing skipped in between." },
  { id: "substring", term: "Substring", match: w("substrings?"), def: "A run of consecutive characters taken from a string." },
  { id: "subsequence", term: "Subsequence", match: w("subsequences?"), def: "Items taken from a sequence in their original order, where skipping items is allowed." },
  { id: "contiguous", term: "Contiguous", match: w("contiguous|consecutive"), def: "Next to each other, with no gaps: positions i, i+1, i+2 and so on." },
  { id: "prefix-sum", term: "Prefix sum", match: w("prefix sums?"), def: "A running total: prefix[i] is the sum of the first i items, so any range sum is one subtraction." },
  { id: "index", term: "Index", match: w("index|indices|indexes"), def: "An item's position in an array or string; in most languages the first item is at index 0." },
  { id: "array", term: "Array", match: w("arrays?"), def: "An ordered list of items you can reach by position (index) in one step, like a Python list." },
  { id: "in-place", term: "In place", match: w("in[- ]place"), def: "Changing the input directly instead of building a copy, so only a little extra memory is used." },
  { id: "brute-force", term: "Brute force", match: w("brute[- ]force"), def: "Trying every possibility directly. Simple and correct, but often too slow for large inputs." },
  { id: "edge-case", term: "Edge case", match: w("edge cases?"), def: "An unusual input at the limits, such as an empty list, one item, ties or the largest values." },
  { id: "amortized", term: "Amortized", match: w("amortized|amortised"), def: "Averaged over many operations: a rare slow step is paid for by many fast ones." },
  { id: "monotonic", term: "Monotonic", match: w("monotonic"), def: "Only ever moving one way: always going up (or staying) or always going down." },
  { id: "recursion", term: "Recursion", match: w("recursion|recursive"), def: "A function that solves a problem by calling itself on a smaller part of it." },
  { id: "partition", term: "Partition", match: w("partition(?:s|ing)?"), def: "Rearranging items into groups, such as smaller than, equal to and larger than a chosen value." },
  { id: "overflow", term: "Overflow", match: w("overflows?|64-bit"), def: "When a number gets too big for its type; Java and C++ int tops out near 2.1 billion, so totals may need a 64-bit long." },
];

export const GLOSSARY_BY_ID: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));
