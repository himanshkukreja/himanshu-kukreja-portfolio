/**
 * Numbers playground calculator: parser + evaluator tests.
 *   node --test scripts/tests/calc.test.mjs
 * (Node ≥ 22.18 strips the TypeScript types of the imported module itself.)
 *
 * Expected values come from W00 · Part 3 (Back-of-the-envelope estimation) worked examples.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calculate, tokenize, fmtNum, fmtBytes, fmtBits, fmtTime } from "../../src/lib/learn/numbers/calc.ts";

const last = (q) => {
  const r = calculate(q);
  assert.ok(r.final, `no result for ${q}: ${JSON.stringify(r.lines)}`);
  return r.final;
};
const err = (q) => {
  const r = calculate(q);
  const bad = r.lines.find((l) => !l.ok);
  assert.ok(bad, `expected an error for ${q}`);
  return bad;
};
const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel + 1e-12, `${a} ≉ ${b}`);

test("the brief's example: 50k QPS × 2 KB × 30 days", () => {
  const l = last("50k QPS × 2 KB × 30 days");
  close(l.value.v, 50_000 * 2_000 * 30 * 86_400);
  assert.equal(l.value.B, 1);
  assert.equal(l.value.s, 0);
  assert.equal(l.display.main, "259.2 TB");
  assert.deepEqual(
    l.steps.map((s) => s.text),
    ["50k QPS × 2 KB = 100 MB/s", "100 MB/s × 30 days = 259.2 TB"]
  );
  assert.equal(l.readAs, "50,000 /s × 2,000 B × 2,592,000 s");
  assert.deepEqual(l.along, [{ kind: "bandwidth", text: "100 MB/s = 800 Mbps" }]);
  // interview shortcut: 1 day ≈ 100,000 s
  assert.equal(l.shortcut, "300 TB");
  assert.ok(l.conversions.includes("30 days = 2,592,000 s"));
});

test("multiplication spellings: ×, x, *, ·, 2x, implicit", () => {
  for (const q of ["6 × 7", "6 x 7", "6 * 7", "6 · 7", "6x 7", "6 (7)"]) assert.equal(last(q).value.v, 42, q);
});

test("division spellings and per", () => {
  close(last("100M / day").value.v, 1e8 / 86_400);
  close(last("100M per day").value.v, 1e8 / 86_400);
  close(last("100M/day").value.v, 1e8 / 86_400);
  close(last("8 ÷ 2").value.v, 4);
});

test("magnitude suffixes k/K/M/m/B/bn/T", () => {
  assert.equal(last("50k").value.v, 50_000);
  assert.equal(last("50K").value.v, 50_000);
  assert.equal(last("1.5M").value.v, 1_500_000);
  assert.equal(last("5m users").value.v, 5_000_000);
  assert.equal(last("4B").value.v, 4e9);
  assert.equal(last("2bn").value.v, 2e9);
  assert.equal(last("3.5T").value.v, 3.5e12);
  assert.equal(last("1,000,000").value.v, 1e6);
  assert.equal(last("1e9").value.v, 1e9);
  assert.equal(last(".5").value.v, 0.5);
});

test("B attached is billion, spaced or spelled is bytes", () => {
  const billion = last("300B");
  assert.equal(billion.value.v, 3e11);
  assert.equal(billion.value.B, 0);
  assert.ok(billion.notes.some((n) => n.includes("billion")));
  const bytes = last("300 B");
  assert.equal(bytes.value.v, 300);
  assert.equal(bytes.value.B, 1);
  assert.equal(last("300 bytes").value.B, 1);
});

test("decimal vs binary data units (course convention: 1 KB = 1,000 B)", () => {
  assert.equal(last("1 KB").value.v, 1000);
  assert.equal(last("1 KiB").value.v, 1024);
  assert.equal(last("1 GB").value.v, 1e9);
  assert.equal(last("1 GiB").value.v, 2 ** 30);
  assert.equal(last("1 TB in GiB").converted, "931.3 GiB");
  assert.equal(last("2^30").value.v, 1_073_741_824);
});

test("bits vs bytes: Gbps ÷ 8 = GB/s, Mb is megabits, mb reads as MB with a note", () => {
  assert.equal(last("10 Gbps in GB/s").converted, "1.25 GB/s");
  assert.equal(last("100 Mbps").display.main, "12.5 MB/s");
  assert.equal(last("8 Mb").value.v, 1e6);
  const mb = last("100 mb");
  assert.equal(mb.value.v, 1e8);
  assert.ok(mb.notes[0].includes("MB"));
  assert.equal(last("100 MB/s × 8 in Mbps").converted, "6,400 Mbps");
  assert.equal(last("100 MB/s in Mbps").converted, "800 Mbps");
});

test("percentages, of, and growth by percent", () => {
  close(last("20%").value.v, 0.2);
  close(last("10% of 100M").value.v, 1e7);
  assert.equal(last("500 GB + 30%").display.main, "650 GB");
  assert.equal(last("500 GB - 10%").display.main, "450 GB");
  assert.equal(last("500 GB + 30%").readAs, "500,000,000,000 B + 30%");
});

test("variables across lines, ;, comments, ans, and peak = 3 × avg", () => {
  const r = calculate("avg = 20k QPS # measured\npeak = 3 × avg; peak × 2 KB");
  assert.ok(r.ok);
  assert.equal(r.lines.length, 3);
  assert.equal(r.lines[1].name, "peak");
  close(r.lines[1].value.v, 60_000);
  assert.equal(r.final.display.main, "120 MB/s");
  close(last("5 KB\nans × 2").value.v, 10_000);
});

test("undefined names and operator names are explained", () => {
  assert.match(err("peak = 3 × avg").error, /avg/);
  assert.match(err("x = 5").error, /operator/);
  assert.match(err("day = 5").error, /unit/);
  assert.match(err("ans").error, /previous line/);
});

test("dimension errors and syntax errors", () => {
  assert.match(err("1 KB + 1 s").error, /different kinds/);
  assert.match(err("(2 + 3").error, /Missing \)/);
  assert.match(err("2 + 3)").error, /Unmatched/);
  assert.match(err("1 GB in Mbps").error, /Divide by a time/);
  assert.match(err("5 / 0").error, /zero/);
  assert.match(err("2 ^ 3 KB").error, /power/);
  assert.match(err("5 $").error, /Unexpected/);
  const bad = err("2 +");
  assert.ok(bad.error.length > 0);
});

test("a failed line doesn't stop later lines; failed definitions are reported honestly", () => {
  const r = calculate("a = 5 KB + 2 s\na × 2\n3 × 3");
  assert.equal(r.lines[0].ok, false);
  assert.equal(r.lines[1].ok, false);
  assert.match(r.lines[1].error, /isn't defined yet/);
  assert.equal(r.lines[2].ok, true);
  assert.equal(r.final.value.v, 9);
  assert.equal(r.ok, false);
});

test("error position points into the original input", () => {
  const r = calculate("1 + 1\n2 × avg");
  const bad = r.lines[1];
  assert.equal(bad.ok, false);
  assert.equal(bad.at, "1 + 1\n2 × ".length);
});

test("functions: ceil, floor, round, min, max, log, sqrt", () => {
  assert.equal(last("ceil(28.57)").value.v, 29);
  assert.equal(last("ceil(3 / 3)").value.v, 1);
  assert.equal(last("floor(2.9)").value.v, 2);
  assert.equal(last("round(2.5)").value.v, 3);
  assert.equal(last("max(1 KB, 3 KB)").display.main, "3 KB");
  assert.equal(last("min(5, 2, 9)").value.v, 2);
  close(last("log(1000)").value.v, 3);
  close(last("log2(1024)").value.v, 10);
  close(last("log(62^6, 62)").value.v, 6);
  assert.equal(last("sqrt(16)").value.v, 4);
  assert.match(err("max(1 KB, 3 s)").error, /same kind/);
  assert.match(err("log(5 KB)").error, /plain numbers/);
});

test("time units and conversions", () => {
  assert.equal(last("1 day").value.v, 86_400);
  assert.equal(last("1 week").value.v, 604_800);
  assert.equal(last("1 month").value.v, 2_592_000);
  assert.equal(last("1 year").value.v, 31_536_000);
  assert.equal(last("1 MB / 100 Mbps in ms").converted, "80 ms"); // W00 · Part 4: transmission delay
  assert.equal(last("150 ms × 4").display.main, "600 ms");
  assert.equal(last("500 µs + 0.5 ms").display.main, "1 ms");
  assert.equal(last("2 Days").value.v, 172_800);
});

// ------------------------------------------------------------- the lesson's worked examples

test("W00·P3 Twitter traffic: 200M DAU × 20 views / day ≈ 46,296 RPS (shortcut 40,000)", () => {
  const l = last("200M DAU × 20 views / day");
  assert.equal(l.display.main, "46,296 /s");
  assert.equal(l.shortcut, "40,000 /s");
  assert.deepEqual(
    l.steps.map((s) => s.text),
    ["200M DAU × 20 views = 4,000,000,000", "4,000,000,000 / day = 46,296 /s"]
  );
});

test("W00·P3 Twitter storage: text 30 GB/day; with media ≈ 7 TB/day", () => {
  assert.equal(last("100M tweets/day × 300 bytes in GB/day").converted, "30 GB/day");
  assert.equal(last("100M/day × (300 B + 10% × 200 KB + 1% × 5 MB) in TB/day").converted, "7.03 TB/day");
  assert.equal(last("30 GB/day × 365 days × 5 × 3").display.main, "164.2 TB"); // 164,250 GB; the lesson rounds to 165 TB
});

test("W00·P3 bandwidth: 46k × 2 KB = 92 MB/s; 1,150 × 300 B = 345 KB/s", () => {
  assert.equal(last("46k QPS × 2 KB").display.main, "92 MB/s");
  assert.equal(last("1,150 QPS × 300 B").display.main, "345 KB/s");
  assert.equal(last("46k QPS × 20% × 200 KB").display.main, "1.84 GB/s");
});

test("W00·P3 servers: 100,000 / (5,000 × 0.7) ≈ 28.6 → 29; replicas 46k / 30k → 2", () => {
  const r = calculate("peak = 100k QPS\nper_server = 5k QPS\nceil(peak / (per_server × 70%))");
  assert.ok(r.ok);
  assert.equal(r.final.value.v, 29);
  assert.deepEqual(
    r.final.steps.map((s) => s.text),
    ["per_server × 70% = 3,500 /s", "peak / 3,500 /s = 28.57", "ceil(28.57) = 29"]
  );
  assert.equal(last("ceil(46k QPS / 30k QPS)").value.v, 2);
  assert.equal(last("ceil(50k QPS / (5k QPS × 70%))").value.v, 15); // quick check: about 15
});

test("W00·P3 cache: 30 GB/day × 7 days = 210 GB", () => {
  assert.equal(last("30 GB/day × 7 days").display.main, "210 GB");
});

test("W00·P3 Instagram: 25B views/day ≈ 250k RPS (shortcut); egress 250k × 2 MB = 4 Tbps; 142 TB/day", () => {
  const views = last("500M DAU × 50 views / day");
  assert.equal(views.shortcut, "250,000 /s");
  assert.equal(last("250k QPS × 2 MB in Tbps").converted, "4 Tbps");
  assert.equal(last("71M photos/day × 2 MB in TB/day").converted, "142 TB/day");
  assert.equal(last("142 TB/day × 365 days × 5").display.main, "259.1 PB"); // 259,150 TB; the lesson says 259 PB
});

test("W00·P3 URL shortener: 62^6 ≈ 56.8B, 62^7 ≈ 3.5T", () => {
  close(last("62^6").value.v, 56_800_235_584);
  close(last("62^7").value.v, 3_521_614_606_208);
});

test("Kafka partitions from throughput (assumed 10 MB/s per partition)", () => {
  const r = calculate("throughput = 100k msgs/s × 1 KB\nper_partition = 10 MB/s\nceil(throughput / per_partition)");
  assert.ok(r.ok);
  assert.equal(r.final.value.v, 10);
});

// ------------------------------------------------------------- formatting + tokens

test("formatting", () => {
  assert.equal(fmtNum(46296.29), "46,296");
  assert.equal(fmtNum(28.5714), "28.57");
  assert.equal(fmtNum(0.736), "0.736");
  assert.equal(fmtNum(2.592e17), "2.59 × 10¹⁷");
  assert.equal(fmtBytes(999), "999 B");
  assert.equal(fmtBytes(1000), "1 KB");
  assert.equal(fmtBytes(1.84e9), "1.84 GB");
  assert.equal(fmtBits(1.25e8), "1 Gbps");
  assert.equal(fmtTime(0.0005), "500 µs");
  assert.equal(fmtTime(86_400), "1 day");
  assert.equal(fmtTime(2_592_000), "30 days");
});

test("tokenizer keeps thousands separators but not function-argument commas with spaces", () => {
  const t = tokenize("max(1, 2) + 1,000");
  assert.deepEqual(
    t.filter((x) => x.k === "num").map((x) => x.v),
    [1, 2, 1000]
  );
});

test("empty input and comment-only input give no result, no crash", () => {
  assert.equal(calculate("").final, null);
  assert.equal(calculate("# nothing\n  \n").lines.length, 0);
});

// ------------------------------------------------------------- presets + reference rows

import { PRESETS, SECTIONS } from "../../src/lib/learn/numbers/reference.ts";

test("every preset evaluates without an error and matches the lesson's answer", () => {
  const want = {
    "qps-from-dau": (r) => {
      assert.equal(r.lines[0].display.main, "46,296 /s");
      assert.equal(r.final.display.main, "92,593 /s");
    },
    "storage-per-year": (r) => {
      assert.equal(r.lines[0].display.alts[1], "30 GB per day · 900 GB per month");
      assert.equal(r.final.display.main, "164.2 TB");
    },
    "storage-media": (r) => assert.equal(r.final.converted, "7.03 TB/day"),
    bandwidth: (r) => assert.equal(r.final.converted, "15.46 Gbps"),
    "storage-bandwidth": (r) => assert.equal(r.final.display.main, "259.2 TB"),
    servers: (r) => assert.equal(r.final.value.v, 29),
    "db-replicas": (r) => assert.equal(r.final.value.v, 2),
    cache: (r) => {
      assert.equal(r.lines[1].display.main, "210 GB");
      assert.equal(r.final.display.main, "2 TB");
    },
    kafka: (r) => assert.equal(r.final.value.v, 10),
    instagram: (r) => {
      assert.equal(r.lines[0].shortcut, "250,000 /s");
      assert.equal(r.lines[2].shortcut, "4 Tbps");
      assert.equal(r.final.shortcut, "25 GB/s");
    },
    "url-codes": (r) => assert.equal(r.final.value.v, 6),
  };
  for (const p of PRESETS) {
    const r = calculate(p.q);
    assert.ok(r.ok, `${p.id}: ${JSON.stringify(r.lines.filter((l) => !l.ok))}`);
    assert.ok(want[p.id], `no expectation for preset ${p.id}`);
    want[p.id](r);
    assert.match(p.taught.href, /^\/learn\/system-design-mastery\//);
  }
});

test("every reference row's 'try it' expression evaluates", () => {
  let n = 0;
  for (const s of SECTIONS)
    for (const t of s.tables) {
      assert.ok(t.taught.length > 0, `${t.id} needs a 'taught in' link`);
      for (const r of t.rows)
        if (r.calc) {
          n++;
          const c = calculate(r.calc);
          assert.ok(c.ok, `${t.id} · ${r.what}: ${JSON.stringify(c.lines)}`);
        }
    }
  assert.ok(n > 20);
});
