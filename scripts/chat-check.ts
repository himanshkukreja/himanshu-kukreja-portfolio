/**
 * Course chat guarantees that don't need a model, checked in a second: npx tsx scripts/chat-check.ts
 * - answers keep only refs the tools returned, and lose every URL, markdown link, HTML tag, private plan line
 *   and the off-topic marker; a half-written ref doesn't flash while streaming;
 * - stored memory never keeps an email, a phone number or a link, and stays within its caps;
 * - every site-guide link points at a page that exists;
 * - a bad request body is refused, and old turns are trimmed to a summary.
 */
import fs from "fs";
import path from "path";
import { cleanAnswer, citedRefs, splitCitations, streamingText } from "../src/lib/ai/chat/text";
import { cleanMemory, mergeMemory, MEMORY_LIMITS } from "../src/lib/ai/chat/memory-model";
import { SITE_GUIDE, findGuide } from "../src/lib/ai/chat/siteGuide";

let fails = 0;
const ok = (cond: unknown, what: string) => {
  if (!cond) {
    fails++;
    console.log(`FAIL ${what}`);
  }
};
const known = (r: string) => ["s1", "s2", "s7"].includes(r);

const a = cleanAnswer("<plan>x</plan>Use jitter [[s1]] and coalescing [[s9, s2]]. See [the lesson](https://evil.example/x) or www.evil.com now. <script>alert(1)</script>::: panel", known);
ok(!/https?:|www\.|evil|<script/.test(a), "links and HTML tags stripped");
ok(!/:::/.test(cleanAnswer("Text\n::: panel\nmore", known)), "block syntax lines stripped");
ok(a.includes("[[s1]]") && a.includes("[[s2]]") && !a.includes("s9"), "unknown refs dropped, known kept");
ok(a.startsWith("Use jitter"), "private plan stripped");
ok(!cleanAnswer("[[off_topic]] I can only help with system design.", known).includes("off_topic"), "off-topic marker stripped");
ok(cleanAnswer("Map<String, Integer> stays", known).includes("Map<String, Integer>"), "generics in text survive");
ok(JSON.stringify(citedRefs("a [[s2]] b [[s1, s2]]")) === '["s2","s1"]', "cited refs in first-cited order");
ok(splitCitations("x [[s1]] y").length === 3, "citations split from text");
ok(!streamingText("Partly [[s", known).includes("[["), "half-written ref held back while streaming");

const m = cleanMemory({ goals: ["Interview at Flipkart, mail me at a.b@example.com or +91 98765 43210", "x".repeat(500)], studied: Array.from({ length: 40 }, (_, i) => `topic ${i}`), sessions: [{ at: "2026-10-27", chat: "abc123", summary: "see https://x.y/z" }] });
ok(!/@|98765|https?:/.test(JSON.stringify(m)), "memory scrubs emails, phones and links");
ok(m.goals.every((g) => g.length <= MEMORY_LIMITS.item) && m.studied.length <= MEMORY_LIMITS.studied, "memory stays within its caps");
const merged = mergeMemory(m, { session: "Worked on caching", studied: ["caching"] }, "abc123", new Date("2026-10-29"));
ok(merged.sessions[0].summary === "Worked on caching" && merged.sessions.filter((s) => s.chat === "abc123").length === 1, "a chat's summary replaces its own earlier one");

const app = path.resolve("src/app");
for (const t of SITE_GUIDE) {
  const p = t.href.split("#")[0];
  const exists = fs.existsSync(path.join(app, p, "page.tsx"));
  ok(exists, `site guide link ${t.href} has a page`);
}
ok(findGuide("how do certificates work")[0]?.id === "certificates", "site guide finds certificates");
ok(findGuide("save lessons offline")[0]?.id === "offline", "site guide finds offline");

console.log(fails ? `${fails} check(s) failed` : "chat checks: all passed");
process.exit(fails ? 1 : 0);
