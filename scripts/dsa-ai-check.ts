/**
 * DSA tutor guarantees that need no model, in a second: npx tsx scripts/dsa-ai-check.ts. The code cap (capCode / codeCapStream) keeps a prefix property while streaming and never lets more than
 * `max` lines of a code block through; plainMd turns the course's directives into words; the BM25 ranking finds the
 * passage a question is about.
 */
import { bm25Index, bm25Scores, capCode, codeCapStream, plainMd, sectionChunks, tokens } from "../src/lib/dsa/ai/text";

let fails = 0;
const check = (name: string, ok: boolean, info?: unknown) => {
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || info === undefined ? "" : ` → ${JSON.stringify(info)}`}`);
};

// the cap
const answer = "The bug is on line 4.\n\n```python\ndef f(a, k):\n    best = 0\n    for i in range(len(a)):\n        best = max(best, a[i])\n    return best\n```\n\nThat's it.";
const capped = capCode(answer, 2);
const codeLines = (t: string) => (t.match(/```python\n([\s\S]*?)```/)?.[1] ?? "").split("\n").filter(Boolean);
check("cap keeps 2 code lines + the cut line", codeLines(capped).length === 3 && capped.includes("the rest is yours to write"), capped);
check("cap keeps the text after the block", capped.endsWith("That's it."));
check("cap leaves short blocks alone", capCode(answer, 10) === answer);
// streaming: every split of the answer gives the same result, and what was sent is always a prefix
for (const size of [1, 2, 3, 5, 8, 13]) {
  let out = "";
  const s = codeCapStream(2, (d) => (out += d));
  for (let i = 0; i < answer.length; i += size) s.push(answer.slice(i, i + size));
  s.flush();
  check(`stream in ${size}-char pieces = capCode`, out === capped, out);
}
const exact = "```js\nconst a = 1;\nconst b = 2;\n```\ndone";
let out2 = "";
const s2 = codeCapStream(2, (d) => (out2 += d));
for (const ch of exact) s2.push(ch);
s2.flush();
check("a block of exactly max lines streams whole (the closing fence isn't cut)", out2 === exact, out2);

// directives
const md = `::::beat[scenario]\n## 1. Scenario\n\n::line[Rights holders need every replay.]{who="sofia"}\n\n:::example[A tally board]{kind="analogy"}\nPicture a room.\n:::\n::handsolve[x]\n::::`;
const plain = plainMd(md);
check("plainMd: speaker lines become quotes", plain.includes('"Rights holders need every replay."'), plain);
check("plainMd: titled blocks keep their title", plain.includes("**Example: A tally board**"), plain);
check("plainMd: no directive syntax left", !/^:{2,}/m.test(plain), plain);
const chunks = sectionChunks("## A\n\nshort\n\n### B\n\nalso short\n\n## C\n\n" + "word ".repeat(600));
check("sectionChunks merges small sections and splits long ones", chunks.length >= 2 && chunks.every((c) => c.text.length <= 1600 * 1.6 + 1), chunks.map((c) => c.text.length));

// ranking
check("tokens stem plurals and -ing", tokens("Sliding windows").join(" ") === tokens("slide window").join(" "), [tokens("Sliding windows"), tokens("slide window")]);
const ix = bm25Index(["Two pointers from opposite ends of a sorted array", "A sliding window keeps a counts map of the values inside the window", "Binary search halves the range"]);
const sc = bm25Scores(ix, tokens("how does a counts map work in a sliding window?"));
check("BM25 ranks the window passage first", sc[1] > sc[0] && sc[1] > sc[2], sc);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
