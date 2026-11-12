/**
 * DSA tutor guarantees that need no model, in a second: npx tsx scripts/dsa-ai-check.ts. The code cap (capCode / codeCapStream) keeps a prefix property while streaming and never lets more than
 * `max` lines of a code block through; plainMd turns the course's directives into words; the BM25 ranking finds the
 * passage a question is about.
 */
import { bm25Index, bm25Scores, capCode, codeCapStream, plainMd, sectionChunks, tokens } from "../src/lib/dsa/ai/text";
import { buildDsaProfile, problemFacts, readClientSignals, type DsaLearnerRaw } from "../src/lib/learner/dsa-profile";
import { BRIEF_MAX_LINES, dsaAdaptLines, dsaBriefLines } from "../src/lib/learner/brief-model";

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

// the learner model: the profile from rows, the brief's cap, the memory switch
const lix = {
  problems: new Map([
    ["p1", { title: "Longest fresh session", concept: "windows", level: "medium" }],
    ["p2", { title: "Busiest stretch", concept: "windows", level: "easy" }],
    ["p3", { title: "Lower bound", concept: "bounds", level: "easy" }],
    ["p4", { title: "Pairs", concept: "hash", level: "easy" }],
  ]),
  concepts: new Map([["windows", "Fixed and variable windows"], ["bounds", "Lower and upper bound"], ["hash", "Seen-set"]]),
};
const at = (d: number) => `2026-11-${String(d).padStart(2, "0")}T10:00:00Z`;
const raw: DsaLearnerRaw = {
  done: { "dsa:c:windows": 1 },
  onboarding: { exp: "some", pace: { lang: "java", goal: "interviews" } },
  rows: [],
  subs: [
    { problem_id: "p1", language: "java", verdict: "WA", created_at: at(10) },
    { problem_id: "p1", language: "java", verdict: "WA", created_at: at(10) },
    { problem_id: "p2", language: "java", verdict: "TLE", created_at: at(9) },
    { problem_id: "p3", language: "java", verdict: "TLE", created_at: at(8) },
    { problem_id: "p3", language: "java", verdict: "AC", created_at: at(8) },
    { problem_id: "p4", language: "python", verdict: "AC", created_at: at(7) },
  ],
  prog: [
    { problem_id: "p1", status: "attempted", editorial_viewed: true, updated_at: at(11) },
    { problem_id: "p2", status: "attempted", editorial_viewed: true, updated_at: at(9) },
  ],
};
const prof = buildDsaProfile(raw, lix, null);
check("profile: language from submits", prof.lang === "java", prof.lang);
check("profile: level from the onboarding", prof.level === "some" && prof.levelFrom === "onboarding", prof);
check("profile: show everything wins", buildDsaProfile(raw, lix, readClientSignals({ full: true, exp: "new" })).level === "experienced");
check("profile: windows are a struggle", prof.struggles[0]?.concept === "Fixed and variable windows", prof.struggles);
check("profile: editorial habit 2 of 4", prof.editorialFirst.n === 2 && prof.editorialFirst.of === 4, prof.editorialFirst);
check("profile: TLE pattern", prof.patterns.some((x) => x.includes("time limit")), prof.patterns);
check("facts: p1 has 2 failed submits, revealed", JSON.stringify(problemFacts(raw, "p1")) === JSON.stringify({ fails: 2, solved: false, revealed: true, langs: ["java"] }), problemFacts(raw, "p1"));
const notes = { goals: [], level: "new to coding", prefs: ["brief answers"], studied: [], struggles: ["windows: moving left"], mistakes: ["off-by-one on start index"], sessions: [{ at: "2026-11-11", chat: "c1", summary: "stuck on left edge", course: "dsa" as const }] };
const ref = { problem: { id: "p1", title: "Longest fresh session", concept: "windows", conceptTitle: "Fixed and variable windows", module: "m5-sliding-window" } };
const lines = dsaBriefLines({ feature: "dsa-tutor", profile: prof, notes, client: null, ref, sdmStudied: ["rate limiting"] });
check(`brief: at most ${BRIEF_MAX_LINES} lines`, lines.length <= BRIEF_MAX_LINES, lines);
check("brief: the topic's struggle first", /Found hard: Fixed and variable windows/.test(lines.join("\n")), lines);
const adapt = dsaAdaptLines({ feature: "dsa-tutor", profile: prof, notes, client: null, ref });
check("adapt: beginner words, weak spot, mistakes", adapt.some((a) => a.startsWith("For a beginner")) && adapt.some((a) => a.includes("found this topic hard")) && adapt.some((a) => a.includes("recurring mistakes")), adapt);
const off = dsaBriefLines({ feature: "dsa-chat", profile: null, notes: null, client: readClientSignals({ lang: "cpp" }) });
check("brief: memory off keeps only the page's own choices", off.length === 1 && off[0].includes("C++"), off);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
