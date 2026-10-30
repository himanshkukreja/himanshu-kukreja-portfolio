/**
 * Notebook page AI guarantees that don't need a model, checked in a second: npx tsx scripts/ai-notes-check.ts
 * - the image gate (lib/ai/image.ts): PNG and WebP (lossy, lossless, extended) pass with their real size; a renamed
 *   file, bad base64, an oversized or too-large-in-pixels image, a second image, or any image sent to a feature that
 *   takes none is refused; string content still works and counts as text;
 * - the Markdown cleaning (lib/ai/notes.ts cleanNotesMd): fences, preambles, sign-offs, plan lines, course block
 *   syntax and ~~crossed-out~~ text go; bullets are normalised but "— from <source>" and bold stay; EMPTY_PAGE is "";
 *   a huge answer is capped with a [?] note;
 * - the check's grounding (parseCheck): an unknown section or a "wrong" without a real quote from the lesson becomes
 *   "not in this lesson", never wrong; a "wrong" that argues itself round becomes right;
 * - the cards (parseCards): 3-8 clean, distinct cards from messy JSON, none from junk; stable ids per question;
 * - the lesson context for a check (notesLessonContext): a note heading finds its lesson section; each note line
 *   pulls in its own section (by its words and phrases); same-named sections are told apart; code is dropped;
 * - "missing" points the notes already have (notesHave): a formula, a term or a restatement in the notes drops them;
 * - the typed version's ink stamp (inkSignature, withInkStamp, readTyped): hidden, kept across edits, changes with
 *   the ink.
 */
import zlib from "zlib";
import { base64Bytes, checkImage, contentText, gateImages, sniffImage, type AiImageBlock } from "../src/lib/ai/image";
import { cardRef, cleanNotesMd, EMPTY_PAGE, firstJson, inkSignature, NOTES_MD_MAX, notesHave, pageItems, pageItemsText, parseCards, parseCheck, quoteIn, readTyped, withInkStamp } from "../src/lib/ai/notes";
import { notesLessonContext } from "../src/lib/ai/retrieve";
import { notesHtml } from "../src/components/learn/ink/ai/NotesMd";
import { FEATURES } from "../src/lib/ai/features";

let fails = 0;
const ok = (cond: unknown, what: string) => {
  if (!cond) {
    fails++;
    console.log(`  ✗ ${what}`);
  } else console.log(`  ✓ ${what}`);
};

// ---------------------------------------------------------------- fixtures

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(w: number, h: number, noise = false): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((w + 1) * h);
  if (noise) for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: noise ? 0 : 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function webp(kind: "VP8 " | "VP8L" | "VP8X", w: number, h: number): Buffer {
  const b = Buffer.alloc(64);
  b.write("RIFF", 0);
  b.writeUInt32LE(56, 4);
  b.write("WEBP", 8);
  b.write(kind, 12);
  b.writeUInt32LE(44, 16);
  if (kind === "VP8 ") {
    b[23] = 0x9d;
    b[24] = 0x01;
    b[25] = 0x2a;
    b.writeUInt16LE(w, 26);
    b.writeUInt16LE(h, 28);
  } else if (kind === "VP8L") {
    b[20] = 0x2f;
    b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21);
  } else {
    b.writeUIntLE(w - 1, 24, 3);
    b.writeUIntLE(h - 1, 27, 3);
  }
  return b;
}
const block = (buf: Buffer, media: "image/png" | "image/webp" = "image/png"): AiImageBlock => ({ type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } });

// ---------------------------------------------------------------- image gate

console.log("image gate");
const page = png(1000, 1414);
const c1 = checkImage(block(page));
ok(c1.ok && c1.info.width === 1000 && c1.info.height === 1414 && c1.info.mediaType === "image/png", "a 1000x1414 PNG page passes with its size read from IHDR");
ok(c1.ok && c1.info.bytes === page.length, "decoded bytes are counted without decoding (base64Bytes)");
ok(base64Bytes("QQ==") === 1 && base64Bytes("QUI=") === 2 && base64Bytes("QUJD") === 3, "base64Bytes handles padding");
for (const k of ["VP8 ", "VP8L", "VP8X"] as const) {
  const r = checkImage(block(webp(k, 1000, 1414), "image/webp"));
  ok(r.ok && r.info.width === 1000 && r.info.height === 1414, `a WebP (${k.trim()}) passes with its size read from the header`);
}
ok(sniffImage(new Uint8Array([1, 2, 3])) === null, "random bytes are no image");
const renamed = checkImage(block(page, "image/webp"));
ok(!renamed.ok && renamed.reason === "type", "a PNG labelled as WebP is refused (the bytes must match the type)");
ok(!checkImage({ type: "image", source: { type: "base64", media_type: "image/jpeg" as never, data: page.toString("base64") } }).ok, "JPEG (not in the list) is refused");
ok(!checkImage({ type: "image", source: { type: "url" as never, media_type: "image/png", data: "https://x.test/a.png" } }).ok, "a URL source is refused (base64 only)");
const bad = checkImage({ type: "image", source: { type: "base64", media_type: "image/png", data: "not base64 at all!!".repeat(4) } });
ok(!bad.ok && bad.reason === "encoding", "bad base64 is refused");
const big = png(1200, 1300, true);
ok(big.length > 1_500_000, `fixture: a noisy PNG of ${(big.length / 1e6).toFixed(2)} MB`);
const bigC = checkImage(block(big));
ok(!bigC.ok && bigC.reason === "size", "an image over 1.5 MB decoded is refused");
ok(checkImage(block(big), { maxBytes: 2_000_000 }).ok, "the byte cap is the feature's (2 MB allows it)");
const tall = checkImage(block(png(1000, 2600)));
ok(!tall.ok && tall.reason === "dimensions", "an image over 2000 px a side is refused");
const conv = FEATURES["notes-convert"];
const caps = { maxImages: conv.maxImages, maxBytes: conv.maxImageBytes, maxSide: conv.maxImageSide };
const one = gateImages([[block(page), { type: "text", text: "Type up this page." }]], caps);
ok(one.ok && one.images.length === 1, "notes-convert: one page image passes the gate");
const two = gateImages([[block(page), block(page)]], caps);
ok(!two.ok && two.reason === "count", "notes-convert: a second image is refused");
const split = gateImages([[block(page)], [block(page)]], caps);
ok(!split.ok && split.reason === "count", "the count is per call, across messages");
ok(!gateImages([[block(page)]], { maxImages: FEATURES["lesson-qa"].maxImages }).ok, "a feature that takes no images (lesson-qa) refuses one");
ok(!FEATURES["notes-check"].maxImages && !FEATURES["notes-cards"].maxImages, "check and cards take no images (they send the typed notes)");
ok(gateImages(["plain text"], { maxImages: 0 }).ok, "string content still passes (backward compatible)");
ok(contentText("hello") === "hello" && contentText([block(page), { type: "text", text: "a" }, { type: "text", text: "b" }]) === "a\nb", "text is counted from strings and text blocks, never the image");

// ---------------------------------------------------------------- Markdown cleaning

console.log("Markdown cleaning");
ok(cleanNotesMd("```markdown\n# Title\n- a\n```") === "# Title\n- a", "a fence around the whole answer goes");
ok(cleanNotesMd("Here is the transcription of the page:\n\n# T\n- a") === "# T\n- a", "a chatty first line goes");
ok(cleanNotesMd("# T\n- a\n\nLet me know if you need anything else.") === "# T\n- a", "a sign-off goes");
ok(cleanNotesMd("<plan>read it</plan>\n# T") === "# T", "a private plan line goes");
ok(cleanNotesMd(EMPTY_PAGE) === "" && cleanNotesMd("  EMPTY_PAGE\n") === "", "EMPTY_PAGE is an empty result");
ok(cleanNotesMd("# T\n::: callout\nx\n:::") === "# T\n\nx".replace("\n\n", "\n\n"), "course block syntax lines go");
ok(cleanNotesMd("• one\n  ◦ two\n* three\n+ four") === "- one\n  - two\n- three\n- four", "bullets are normalised, nesting kept");
ok(cleanNotesMd("> a clip\n— from Caching patterns") === "> a clip\n— from Caching patterns", "a clip's “— from” line is not turned into a bullet");
ok(cleanNotesMd("**bold** line\n- **key** point") === "**bold** line\n- **key** point", "bold stays bold");
ok(cleanNotesMd("async: ~~semi-sync~~ faster writes") === "async: faster writes", "~~crossed-out~~ text is dropped");
ok(cleanNotesMd("failover takes ~~[?]~~ 10-30 s") === "failover takes 10-30 s", "a crossed-out [?] is dropped too");
ok(cleanNotesMd("a\n\n\n\nb") === "a\n\nb", "blank runs collapse");
ok(cleanNotesMd("QPS = 10M / 86,400 ≈ 115\n2^32 ≈ 4.3 billion") === "QPS = 10M / 86,400 ≈ 115\n2^32 ≈ 4.3 billion", "maths is untouched");
ok(cleanNotesMd("Diagram: client → LB → app → cache → DB") === "Diagram: client → LB → app → cache → DB", "diagram lines are untouched");
const huge = cleanNotesMd(("- a line of notes\n").repeat(2000));
ok(huge.length <= NOTES_MD_MAX + 80 && /\[\?\] \(the rest of the page was too long to type\)$/.test(huge), "a huge answer is capped with a note");

const items = pageItems({
  items: [
    { id: "2", kind: "text", text: "my own box", x: 0, y: 500, w: 100 },
    { id: "1", kind: "clip", text: "clipped text", source: { href: "/x", title: "Caching patterns" }, x: 0, y: 100, w: 100 },
    { id: "3", kind: "snip", path: "u/p/3.webp", pw: 10, ph: 10, source: { href: "/x", title: "t" }, x: 0, y: 50, w: 10, h: 10 },
    { id: "4", kind: "text", text: "   ", x: 0, y: 900, w: 100 },
  ],
});
ok(items.length === 2 && items[0].kind === "clip" && items[1].text === "my own box", "typed items: clips and text boxes in page order, no snips, no empty boxes");
const it = pageItemsText([{ kind: "clip", text: "x", source: 'evil" onload="1' }]);
ok(it.includes('from="evil onload=1"'), "a clip's source can't break out of its tag");
ok(pageItemsText(Array.from({ length: 40 }, () => ({ kind: "text" as const, text: "y".repeat(1900) }))).length <= 6000, "typed items are capped at 6,000 characters");

// ---------------------------------------------------------------- check grounding

console.log("check grounding");
const heads = ["2.1 Pattern 1: Cache-Aside (Lazy Loading)", "2.3 Pattern 3: Write-Through"];
const texts = { [heads[0]]: "Read the cache first. On a miss, read the database and store it.", [heads[1]]: "Stale reads are rare (concurrent writers or a failed cache write can still leave an old value)." };
const res = parseCheck(
  "Sure! ```json\n" +
    JSON.stringify({
      summary: "Mostly right.",
      right: [{ note: "cache first, then DB on a miss", section: "2.1 pattern 1: cache-aside (lazy loading)" }, { note: "an invented claim", section: "9.9 Nowhere" }],
      wrong: [
        { note: "write-through: always fresh", lesson: "Stale reads are rare but possible.", quote: "concurrent writers or a failed cache write can still leave an old value", section: "Pattern 3: Write-Through" },
        { note: "write-around goes to cache", lesson: "Write-around is not one of the four patterns in this lesson.", quote: "Read the cache first", section: heads[0] },
        { note: "TTL 300 s", lesson: "The lesson says 5 minutes, which is 300 s, so this matches.", quote: "Read the cache first", section: heads[0] },
        { note: "made-up contradiction", lesson: "The lesson says the opposite.", quote: "caches are always written with Paxos", section: heads[1] },
        { note: "no section", lesson: "x", quote: "y" },
      ],
      missing: [{ note: "a real gap", section: heads[1] }, { note: "an ungrounded gap", section: "" }],
      outside: ["Redis uses Raft"],
    }) +
    "\n```",
  heads,
  texts,
);
const kinds = (k: string) => res?.items.filter((x) => x.kind === k).map((x) => x.note) ?? [];
ok(!!res && res.summary === "Mostly right.", "the JSON is found inside a fence and a sentence");
ok(kinds("right").includes("cache first, then DB on a miss"), "a section named loosely (case, prefix) matches the real heading");
ok(kinds("outside").includes("an invented claim"), "a 'right' with an unknown section is not in this lesson");
ok(kinds("wrong").length === 1 && kinds("wrong")[0] === "write-through: always fresh", "only the wrong with a real quote from its section stays wrong");
ok(res?.items.find((x) => x.kind === "wrong")?.quote?.startsWith("concurrent writers"), "the verified quote is kept for the panel");
ok(kinds("outside").includes("write-around goes to cache"), "'the lesson doesn't cover it' is not in this lesson, never wrong");
ok(kinds("right").includes("TTL 300 s"), "a wrong that says it matches becomes right");
ok(kinds("outside").includes("made-up contradiction"), "a wrong whose quote isn't in the lesson is not in this lesson");
ok(kinds("missing").length === 1, "a missing point without a real section is dropped");
ok(kinds("outside").includes("Redis uses Raft"), "plain-string outside items are kept");
ok(parseCheck("I couldn't do that", heads) === null, "no JSON → null (the route shows the text instead)");
ok(quoteIn("Stale reads are rare", texts[heads[1]]) && !quoteIn("Paxos is used", texts[heads[1]]) && !quoteIn("rare", texts[heads[1]]), "quoteIn: real quotes yes, invented or tiny ones no");

// ---------------------------------------------------------------- missing points the notes already have

console.log("missing points the notes have");
const qnotes = "# Replication notes\nsync repl = slower writes but no data loss\nread-your-writes → read from leader for 1 min after a write\nquorum: W + R > N e.g. N=3, W=2, R=2\n**split brain!!** → fencing token\nfailover takes 10-30 s";
ok(notesHave({ note: "Quorum rule W + R > N ensures reads see the latest write, with example N=3, W=2, R=2", term: "Quorum overlap" }, qnotes), "a formula in the notes (W + R > N) covers the point, whatever its term");
ok(notesHave({ note: "Reads overlap writes when enough nodes answer.", term: "quorum rule" }, qnotes), "a term in the notes ('quorum', generic 'rule' aside) covers the point");
ok(notesHave({ note: "x", term: "Read-your-writes" }, qnotes) && notesHave({ note: "x", term: "split-brain" }, qnotes), "hyphenated terms match the notes' spelling");
ok(!notesHave({ note: "Semi-synchronous replication waits for one follower.", term: "semi-synchronous replication" }, qnotes), "a term the notes lack (semi-sync) stays missing");
ok(!notesHave({ note: "Fence the old primary before promoting a new one.", term: "fencing the old primary" }, qnotes), "a term only partly in the notes stays missing");
ok(!notesHave({ note: "Monotonic reads stop a user seeing time go backwards." }, qnotes), "with no term, a new point stays missing");
ok(notesHave({ note: "x", term: "synchronous replication" }, "sync repl = slower writes"), "a notes abbreviation (repl, sync) counts");
const qres = parseCheck(
  JSON.stringify({ summary: "s", right: [], wrong: [], missing: [{ note: "The quorum rule W + R > N means reads see the latest write.", term: "quorum overlap", section: heads[1] }, { note: "Semi-sync waits for one follower.", term: "semi-synchronous replication", section: heads[1] }], outside: [] }),
  heads,
  texts,
  qnotes,
);
ok(qres?.items.filter((x) => x.kind === "missing").length === 1 && qres.items[0].term === "semi-synchronous replication", "parseCheck drops a missing point the notes have and keeps the real one with its term");
const ores = parseCheck(
  JSON.stringify({ summary: "s", right: [{ note: "split brain → fencing token", section: "8.2 Fencing: The Solution to Split-Brain" }, { note: "Redis uses Raft", section: "8.2 Fencing: The Solution to Split-Brain" }], wrong: [], missing: [], outside: [] }),
  heads,
  texts,
  qnotes,
  [...heads, "8.2 Fencing: The Solution to Split-Brain"],
);
ok(ores?.items[0].kind === "right" && ores.items[0].section === "8.2 Fencing: The Solution to Split-Brain", "a right claim under a real (unshown) section named for its topic stays right");
ok(ores?.items[1].kind === "outside", "a right claim under a real section about something else is still not in this lesson");
const gres = parseCheck(JSON.stringify({ summary: "s", right: [{ note: "quorum: W + R > N e.g. N=3", section: "Chapter 2: Replication Architectures" }], wrong: [], missing: [], outside: [] }), ["Quorums"], { Quorums: "If **W + R > N**, every read sees the latest write." }, qnotes, ["Chapter 2: Replication Architectures", "Quorums"]);
ok(gres?.items[0].kind === "right" && gres.items[0].section === "Quorums", "a right claim citing the chapter above is grounded in the shown section that holds its formula");
ok(firstJson<{ outside: { note: string }[] }>('{"outside":[{"note":"a"},{"note":"b.","}]}')?.outside[1].note === "b.", "a stray quote before the closing brackets is repaired");
ok(firstJson<{ a: number[] }>('{"a":[1,2,],}')?.a.length === 2, "trailing commas are repaired");

// ---------------------------------------------------------------- the ink stamp

console.log("ink stamp");
const st = (id: string, pts: number[]) => ({ id, tool: "pen" as const, color: "ink" as const, size: 2, pts });
const pg = { strokes: [st("a", [10, 10, 0, 20, 20, 0, 30, 30, 0])], items: [{ id: "t", kind: "text" as const, text: "hi", x: 1, y: 2, w: 300 }] };
const sig = inkSignature(pg);
ok(sig === inkSignature({ ...pg }) && sig !== inkSignature({ ...pg, strokes: [...pg.strokes, st("b", [1, 1, 0, 2, 2, 0, 3, 3, 0])] }), "a new stroke changes the signature");
ok(sig !== inkSignature({ ...pg, strokes: [st("a", [15, 10, 0, 25, 20, 0, 35, 30, 0])] }) && sig !== inkSignature({ ...pg, items: [{ ...pg.items[0], text: "hi!" }] }) && sig !== inkSignature({ ...pg, strokes: [] }), "moving, typing and erasing change it too");
const stamped = withInkStamp("# Notes\n- a", sig);
ok(stamped.endsWith(`<!-- ink:v1:${sig} -->`) && readTyped(stamped).md === "# Notes\n- a" && readTyped(stamped).sig === sig && !readTyped(stamped).edited, "the stamp is a hidden last line, read back exactly");
ok(readTyped(withInkStamp(stamped, sig, true)).edited && readTyped(withInkStamp(stamped, sig, true)).md === "# Notes\n- a", "re-stamping keeps one stamp and can mark edits");
ok(readTyped("plain old text").sig === null && readTyped(null).md === "" && withInkStamp("", sig) === "", "unstamped (older) text has no signature; empty text stays empty");
ok(!notesHtml(readTyped(stamped).md).includes("ink:v1"), "the stamp never renders");

// ---------------------------------------------------------------- cards

console.log("cards");
const cards = parseCards(
  JSON.stringify({
    cards: [
      { q: "What does cache-aside do on a miss", a: "Reads the DB, then fills the cache." },
      { question: "What does cache-aside do on a miss?", answer: "duplicate" },
      { q: "Why?", a: "too short a question" },
      { q: "What is the write QPS for 10M writes a day?", a: "10M / 86,400 ≈ 115" },
      { q: "No answer here?", a: "" },
      ...Array.from({ length: 10 }, (_, i) => ({ front: `Question number ${i} about caching?`, back: `Answer ${i}` })),
    ],
  }),
);
ok(cards.length === 8, "at most 8 cards");
ok(cards[0].q.endsWith("?") && cards[0].a.startsWith("Reads"), "a question gets its question mark");
ok(!cards.some((c) => c.a === "duplicate") && !cards.some((c) => c.q === "Why?"), "duplicates and too-short questions go");
ok(cards.some((c) => c.a === "10M / 86,400 ≈ 115"), "numbers are kept exactly");
ok(parseCards("OFF_TOPIC").length === 0 && parseCards('{"cards":[]}').length === 0 && parseCards("{broken").length === 0, "junk, empty and OFF_TOPIC give no cards");
ok(cardRef("p1", "What is X?") === cardRef("p1", "what is x") && cardRef("p1", "What is X?") !== cardRef("p2", "What is X?") && /^ink:p1:[a-z0-9]+$/.test(cardRef("p1", "What is X?")), "card ids are stable per page and question");

// ---------------------------------------------------------------- lesson context

console.log("lesson context");
const lesson = [
  "# Day 1",
  "",
  "## Chapter 1: What Is Caching?",
  "",
  "Caching keeps copies close.",
  "",
  "### 2.3 Pattern 3: Write-Through",
  "",
  "Writes go to cache and database together.",
  "",
  "```python",
  "# not a heading",
  "def write(): pass",
  "```",
  "",
  "### 2.4 Pattern 4: Write-Behind (Write-Back)",
  "",
  "Writes go to the cache; the database is updated later.",
].join("\n");
const ctx = notesLessonContext(lesson, "## Write-through\n- write goes to cache and DB together\n## Write-back\n- DB updated later");
ok(ctx.sections.includes("2.3 Pattern 3: Write-Through") && ctx.sections.includes("2.4 Pattern 4: Write-Behind (Write-Back)"), "each note heading finds its lesson section");
ok(!ctx.text.includes("def write") && !ctx.text.includes("not a heading"), "code blocks are left out of the context");
ok(ctx.text.startsWith("Lesson outline (all sections):") && ctx.texts["2.3 Pattern 3: Write-Through"].includes("together"), "the outline comes first, and each shown section's text is returned for quote checks");
const lesson2 = [
  "# Day 2",
  "",
  "## 2.1 Leader-Follower",
  "",
  "#### How It Works",
  "",
  "One leader takes writes and streams them to followers.",
  "",
  "## 2.3 Leaderless",
  "",
  "#### How It Works",
  "",
  "Any node takes writes; clients read from several.",
  "",
  "#### Quorums: The Math of Consistency",
  "",
  "Background on replication and nodes. ".repeat(60),
  "",
  "If **W + R > N**, every read is guaranteed to see the latest write.",
  "",
  "## 8.2 Fencing: The Solution to Split-Brain",
  "",
  "Fencing ensures the old primary can't accept writes after failover.",
  "",
  "## 9.9 Filler",
  "",
  "Replication replication leader follower writes reads. ".repeat(40),
].join("\n");
const ctx2 = notesLessonContext(lesson2, "# Replication notes\nleader → followers\nquorum: W + R > N e.g. N=3\nsplit brain → fencing token", 2400);
ok(ctx2.sections.includes("Quorums: The Math of Consistency") && ctx2.sections.includes("8.2 Fencing: The Solution to Split-Brain"), "each note line pulls in its own section, within a small budget");
ok(ctx2.texts["Quorums: The Math of Consistency"].includes("W + R > N"), "a long section is cut around the paragraph the note is about");
const ctx3 = notesLessonContext(lesson2, "## How it works\n- leader streams writes to followers\n- any node takes writes");
ok(ctx3.text.includes("- How It Works (2.1 Leader-Follower)") && ctx3.text.includes("How It Works (2.3 Leaderless)"), "same-named sections are told apart by their parent heading");

// ---------------------------------------------------------------- rendering

console.log("rendering");
const html = notesHtml('# T\n- <img src=x onerror=alert(1)> **b**\n  - nested [?]\n> clip "q"\nDiagram: a → b');
ok(!html.includes("<img") && html.includes("&lt;img"), "model output is escaped (no HTML injection)");
ok(html.includes("<strong") && html.includes("padding-left:1.1rem") && html.includes("title=\"the AI couldn&#39;t read this word\""), "bold, nesting and [?] marks render");
ok(html.includes("<blockquote") && html.includes("Diagram: a → b"), "clip quotes and diagram lines render");

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
