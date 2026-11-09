/**
 * The sniff test's micro-puzzles for the signed-in onboarding. Two per topic, tiny and
 * language-neutral. A "tf" puzzle is a statement (swipe right = true, left = false, or the two buttons); a "pick"
 * puzzle has 2 to 4 answers (tap one). `answer` is the index of the right option. `why` is the one-line reveal.
 */
export type TopicId = "arrays" | "hashing" | "lists" | "stacks" | "queues" | "trees" | "heaps" | "graphs" | "bsearch" | "recursion" | "sorting" | "dp";

export type Puzzle = {
  id: string;
  topic: TopicId;
  kind: "tf" | "pick";
  q: string;
  /** a few lines of code to read, optional */
  code?: string;
  options: string[];
  answer: number;
  why: string;
};

const TF = ["True", "False"];

export const PUZZLES: Puzzle[] = [
  { id: "arrays-1", topic: "arrays", kind: "tf", q: "Reading arr[2] takes the same time as reading arr[0]: no walking past other items.", options: TF, answer: 0, why: "An array knows exactly where item 2 lives (start + 2 slots), so any index is one jump." },
  { id: "arrays-2", topic: "arrays", kind: "pick", q: "How many existing items have to shift right?", code: "a = [1, 2, 3, 4]\na.insert(0, 9)", options: ["0", "1", "3", "4"], answer: 3, why: "Inserting at the front pushes all four items one slot right to make room." },
  { id: "hashing-1", topic: "hashing", kind: "tf", q: "Looking up a key in a hash map takes about the same time with 10 keys or with 10 million (on average).", options: TF, answer: 0, why: "The key is turned straight into a bucket number, so the map does not search through the keys." },
  { id: "hashing-2", topic: "hashing", kind: "pick", q: "What is counts['a'] at the end?", code: "counts = {}\nfor c in \"banana\":\n    counts[c] = counts.get(c, 0) + 1", options: ["1", "2", "3", "4"], answer: 2, why: "b-A-n-A-n-A: three a's, two n's, one b." },
  { id: "lists-1", topic: "lists", kind: "tf", q: "In a singly linked list you can reach the 5th node without visiting the first four.", options: TF, answer: 1, why: "Each node only knows the next one, so you have to follow the chain from the head." },
  { id: "lists-2", topic: "lists", kind: "pick", q: "You already hold a pointer to node X. What does inserting a new node right after X cost?", options: ["One step: O(1)", "A walk down the list: O(n)", "O(log n)", "O(n squared)"], answer: 0, why: "Point the new node at X's next, then X at the new node. Two pointer edits, no walking." },
  { id: "stacks-1", topic: "stacks", kind: "pick", q: "What does this print?", code: "s = []\ns.append(1)\ns.append(2)\ns.pop()\ns.append(3)\nprint(s.pop())", options: ["1", "2", "3", "[1, 3]"], answer: 2, why: "The pop removes 2, then 3 goes on top, and the last pop takes that 3. Last in, first out." },
  { id: "stacks-2", topic: "stacks", kind: "tf", q: "A stack is the right tool for checking that brackets like ( [ ] ) are balanced.", options: TF, answer: 0, why: "Each closing bracket must match the most recent opening one, which is exactly what the top of a stack holds." },
  { id: "queues-1", topic: "queues", kind: "pick", q: "Which structure serves the oldest request first?", options: ["Stack", "Queue", "Hash map", "Binary tree"], answer: 1, why: "A queue is first in, first out: the line at a ticket counter." },
  { id: "queues-2", topic: "queues", kind: "pick", q: "What does this print?", code: "q = deque([1, 2, 3])\nq.append(4)\nprint(q.popleft())", options: ["1", "3", "4", "[2, 3, 4]"], answer: 0, why: "New items join the back; popleft takes from the front, and 1 has been waiting longest." },
  { id: "trees-1", topic: "trees", kind: "tf", q: "In a binary search tree, everything in a node's left subtree is smaller than that node.", options: TF, answer: 0, why: "That one rule is what lets a search throw away half the tree at every step." },
  { id: "trees-2", topic: "trees", kind: "pick", q: "A perfectly balanced binary tree has 7 nodes. How many levels is that?", options: ["2", "3", "4", "7"], answer: 1, why: "1 + 2 + 4 = 7: a root, its two children and four grandchildren make three levels." },
  { id: "heaps-1", topic: "heaps", kind: "pick", q: "In a min-heap, where is the smallest value?", options: ["At the root", "At a leaf", "In the middle", "Anywhere"], answer: 0, why: "Every parent is at most its children, so the minimum always floats to the top." },
  { id: "heaps-2", topic: "heaps", kind: "tf", q: "A heap keeps all of its items fully sorted.", options: TF, answer: 1, why: "A heap only promises that the top is the smallest or largest; the rest is just loosely ordered." },
  { id: "graphs-1", topic: "graphs", kind: "pick", q: "Roads: A-B, B-C, C-D. What is the fewest roads from A to D?", options: ["1", "2", "3", "4"], answer: 2, why: "A to B, B to C, C to D: three hops, no shortcut exists." },
  { id: "graphs-2", topic: "graphs", kind: "tf", q: "BFS (breadth-first search) finds the path with the fewest edges in an unweighted graph.", options: TF, answer: 0, why: "BFS explores in rings: everything one hop away, then two hops, so the first time it reaches a node is the shortest." },
  { id: "bsearch-1", topic: "bsearch", kind: "pick", q: "About how many looks does binary search need, at most, on a sorted list of 1,000 items?", options: ["3", "10", "100", "1,000"], answer: 1, why: "Each look halves what is left, and 2 to the power 10 is 1,024." },
  { id: "bsearch-2", topic: "bsearch", kind: "tf", q: "Binary search works on any list, sorted or not.", options: TF, answer: 1, why: "It only works because sorted order tells you which half to throw away." },
  { id: "recursion-1", topic: "recursion", kind: "pick", q: "What does f(4) return?", code: "def f(n):\n    return 1 if n == 0 else n * f(n - 1)", options: ["4", "10", "24", "64"], answer: 2, why: "4 x 3 x 2 x 1 x 1 = 24. It is the factorial." },
  { id: "recursion-2", topic: "recursion", kind: "tf", q: "A recursive function with no base case never stops by itself (it ends in a stack overflow).", options: TF, answer: 0, why: "Without a base case every call makes another call, until the call stack runs out of room." },
  { id: "sorting-1", topic: "sorting", kind: "tf", q: "Merge sort needs about n log n steps even in its worst case.", options: TF, answer: 0, why: "It always splits in half (log n levels) and merges each level in n steps." },
  { id: "sorting-2", topic: "sorting", kind: "pick", q: "A stable sort orders (2,'b'), (1,'a'), (2,'a') by the number only. Which pair comes first among the 2s?", options: ["(2,'a')", "(2,'b')", "(1,'a')", "Can't tell"], answer: 1, why: "Stable means equal keys keep their original order, and (2,'b') was listed before (2,'a')." },
  { id: "dp-1", topic: "dp", kind: "pick", q: "ways(1) = 1, ways(2) = 2 and ways(n) = ways(n-1) + ways(n-2). What is ways(5)?", options: ["5", "7", "8", "10"], answer: 2, why: "1, 2, 3, 5, 8: each answer is the sum of the two before it." },
  { id: "dp-2", topic: "dp", kind: "tf", q: "Dynamic programming saves work by remembering answers to subproblems it has already solved.", options: TF, answer: 0, why: "Solve each small piece once, store it, and reuse it instead of recomputing." },
];

export const PUZZLE_BY_ID: Record<string, Puzzle> = Object.fromEntries(PUZZLES.map((p) => [p.id, p]));

/** Right and wrong lead-ins, one line each, varied by position so a run does not repeat itself. */
export const RIGHT_LINES = ["Nailed it.", "Clean.", "Sharp eyes.", "Right on the index.", "Ship it."];
export const WRONG_LINES = ["Close call.", "Good to know before day one.", "Easy one to trip on.", "That is what the lessons are for.", "Not yet, and that is fine."];
