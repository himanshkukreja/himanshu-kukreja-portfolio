/**
 * Names of the classic problems a problem twins (tags.classic: [lc-1]), so the problems search finds a twin by its
 * name ("two sum") as well as its number ("LC 1"). A twin missing here still answers to its number. Pure data.
 */
export const CLASSIC_NAMES: Record<string, string> = {
  "lc-1": "Two Sum", "lc-3": "Longest Substring Without Repeating Characters", "lc-14": "Longest Common Prefix", "lc-15": "3Sum", "lc-16": "3Sum Closest",
  "lc-18": "4Sum", "lc-19": "Remove Nth Node From End of List", "lc-20": "Valid Parentheses", "lc-21": "Merge Two Sorted Lists",
  "lc-26": "Remove Duplicates from Sorted Array", "lc-27": "Remove Element", "lc-49": "Group Anagrams", "lc-75": "Sort Colors",
  "lc-76": "Minimum Window Substring", "lc-80": "Remove Duplicates from Sorted Array II", "lc-88": "Merge Sorted Array",
  "lc-98": "Validate Binary Search Tree", "lc-102": "Binary Tree Level Order Traversal", "lc-104": "Maximum Depth of Binary Tree",
  "lc-125": "Valid Palindrome", "lc-150": "Evaluate Reverse Polish Notation", "lc-155": "Min Stack", "lc-167": "Two Sum II",
  "lc-169": "Majority Element", "lc-200": "Number of Islands", "lc-206": "Reverse Linked List", "lc-207": "Course Schedule",
  "lc-208": "Implement Trie", "lc-209": "Minimum Size Subarray Sum", "lc-210": "Course Schedule II",
  "lc-211": "Design Add and Search Words Data Structure", "lc-215": "Kth Largest Element in an Array", "lc-217": "Contains Duplicate",
  "lc-219": "Contains Duplicate II", "lc-225": "Implement Stack using Queues", "lc-226": "Invert Binary Tree", "lc-259": "3Sum Smaller",
  "lc-283": "Move Zeroes", "lc-286": "Walls and Gates", "lc-340": "Longest Substring with At Most K Distinct Characters",
  "lc-347": "Top K Frequent Elements", "lc-349": "Intersection of Two Arrays", "lc-350": "Intersection of Two Arrays II",
  "lc-424": "Longest Repeating Character Replacement", "lc-438": "Find All Anagrams in a String", "lc-443": "String Compression",
  "lc-454": "4Sum II", "lc-567": "Permutation in String", "lc-622": "Design Circular Queue", "lc-632": "Smallest Range Covering Elements from K Lists",
  "lc-643": "Maximum Average Subarray I", "lc-680": "Valid Palindrome II", "lc-703": "Kth Largest Element in a Stream",
  "lc-705": "Design HashSet", "lc-706": "Design HashMap", "lc-713": "Subarray Product Less Than K", "lc-733": "Flood Fill",
  "lc-739": "Daily Temperatures", "lc-743": "Network Delay Time", "lc-844": "Backspace String Compare", "lc-876": "Middle of the Linked List",
  "lc-881": "Boats to Save People", "lc-904": "Fruit Into Baskets", "lc-930": "Binary Subarrays With Sum", "lc-933": "Number of Recent Calls",
  "lc-973": "K Closest Points to Origin", "lc-977": "Squares of a Sorted Array", "lc-986": "Interval List Intersections",
  "lc-992": "Subarrays with K Different Integers", "lc-994": "Rotting Oranges", "lc-997": "Find the Town Judge", "lc-1004": "Max Consecutive Ones III",
  "lc-1010": "Pairs of Songs With Total Durations Divisible by 60", "lc-1046": "Last Stone Weight", "lc-1047": "Remove All Adjacent Duplicates In String",
  "lc-1091": "Shortest Path in Binary Matrix", "lc-1099": "Two Sum Less Than K", "lc-1208": "Get Equal Substrings Within Budget",
  "lc-1234": "Replace the Substring for Balanced String", "lc-1248": "Count Number of Nice Subarrays",
  "lc-1343": "Number of Sub-arrays of Size K and Average Greater than or Equal to Threshold",
  "lc-1456": "Maximum Number of Vowels in a Substring of Given Length", "lc-1658": "Minimum Operations to Reduce X to Zero",
  "lc-1695": "Maximum Erasure Value", "lc-1700": "Number of Students Unable to Eat Lunch", "lc-1852": "Distinct Numbers in Each Subarray",
  "lc-2161": "Partition Array According to Given Pivot", "lc-2302": "Count Subarrays With Score Less Than K",
  "lc-2461": "Maximum Sum of Distinct Subarrays With Length K", "lc-2516": "Take K of Each Character From Left and Right",
  "lc-2799": "Count Complete Subarrays in an Array", "lc-2824": "Count Pairs Whose Sum is Less than Target",
};

/** "lc-1" to "LC 1 · Two Sum" (the number alone when the name is not known) */
export function classicLabel(id: string): string {
  const n = id.match(/^lc-(\d+)$/i);
  const label = n ? `LC ${n[1]}` : id;
  const name = CLASSIC_NAMES[id.toLowerCase()];
  return name ? `${label} · ${name}` : label;
}
