/**
 * The nightly regression evals (AI quality layer, owner-approved 12 Nov 2026), run by .github/workflows/ai-evals-nightly.yml
 * or by hand. Each eval runs as its own process under the hard spending cap (spend-cap.ts, loaded with --import): the
 * night's cap (EVAL_MAX_USD, default $1.50) is split between the evals by SHARE, so one eval can't starve the others and
 * the night can't pass the cap. A call that would pass its eval's share is refused (never sent); that eval is then marked
 * `capped` and not compared. The judges are Sonnet 5.5 (never Opus).
 *
 *   citations  the citation check on its fixtures (no model calls)                              rate: verdicts right
 *   chat       the course chat, NIGHTLY_CASES (chat.ts), Haiku 5.5, judged one by one              rate: cases passed
 *   dsa        the DSA chat and tutor, NIGHTLY_DSA (dsa.ts)                                        rate: turns passing every check
 *   lld-mock   the LLD interviewer, NIGHTLY_LLD (lld-mock.ts)                                      rate: turns passing every check
 *   brief      the learner brief in each feature (brief.ts), every case                            rate: cases passed
 *
 * Writes <out>/<eval>/… (each eval's own results), <out>/nightly.json (this run: rates, spend, capped, drops) and
 * <out>/summary.md (the step summary / issue body), and appends the run to NIGHTLY_HISTORY (default
 * scripts/ai-eval/nightly/history.json, the last 90 runs). A rate more than 10 points under the previous run's is a drop:
 * listed in nightly.json and summary.md, and `drops=<n>` goes to $GITHUB_OUTPUT so the workflow opens an issue.
 *
 *   SDM_LOCAL_DIR=… DSA_LOCAL_DIR=… npx tsx --env-file=.env.local scripts/ai-eval/nightly.ts <out>
 *   (each eval runs with scripts/ai-eval/tsconfig.eval.json and NODE_PATH=scripts/ai-eval/stubs: server-only and next/cache
 *   stand-ins, so the server modules run outside Next)
 *   NIGHTLY_ONLY=citations,chat   run only these · EVAL_MAX_USD=1.5   the night's cap
 *   NIGHTLY_DRY=1                 every eval with EVAL_NOJUDGE=1 and one case each (a cheap pipeline check)
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

const OUT = path.resolve(process.argv[2] || "nightly-out");
const CAP = Number(process.env.EVAL_MAX_USD) || 1.5;
const HISTORY = path.resolve(process.env.NIGHTLY_HISTORY || "scripts/ai-eval/nightly/history.json");
const ONLY = (process.env.NIGHTLY_ONLY || "").split(",").filter(Boolean);
const DRY = process.env.NIGHTLY_DRY === "1";
const JUDGE = "claude-sonnet-5-5";
const DROP = 0.1;

/** the LLD interviewer's nightly subset: one of each move on the three case studies */
export const NIGHTLY_LLD = ["pl-clarify-good", "pl-clarify-unknown", "pl-tell-classes", "pl-singleton", "pl-change-due", "pl-off-topic", "pl-gil", "el-clarify-vague", "el-name-algorithm", "el-change-due", "dw-clarify-retry", "dw-clarify-unknown"];

type Eval = { id: string; script: string; share: number; env?: Record<string, string>; args?: string[]; rate: (dir: string) => number | null; dry?: string[] };
const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
const EVALS: Eval[] = [
  { id: "citations", script: "scripts/ai-eval/citations.ts", share: 0, rate: (d) => read(path.join(d, "results.json")).summary.verdicts.rate },
  {
    id: "chat",
    script: "scripts/ai-eval/chat.ts",
    share: 0.4,
    env: { EVAL_CASES: "nightly", EVAL_MODELS: "claude-haiku-5-5", EVAL_JUDGE: JUDGE, EVAL_SEARCH_ORIGIN: process.env.EVAL_SEARCH_ORIGIN || "https://systemdesignmastery.dev" },
    dry: ["covered-stampede"],
    rate: (d) => read(path.join(d, "summary.json")).models["claude-haiku-5-5"]?.rate ?? null,
  },
  {
    id: "dsa",
    script: "scripts/ai-eval/dsa.ts",
    share: 0.25,
    env: { EVAL_CASES: "nightly", EVAL_JUDGE: JUDGE },
    dry: ["c-variable-window-invariant"],
    rate: (d) => {
      const r = read(path.join(d, "results.json"));
      return r.all.of ? r.all.pass / r.all.of : null;
    },
  },
  {
    id: "lld-mock",
    script: "scripts/ai-eval/lld-mock.ts",
    share: 0.2,
    env: { EVAL_JUDGE: JUDGE },
    args: NIGHTLY_LLD,
    dry: ["pl-clarify-good"],
    rate: (d) => {
      const r = read(path.join(d, "results.json"));
      return r.summary.all.of ? r.summary.all.pass / r.summary.all.of : null;
    },
  },
  {
    id: "brief",
    script: "scripts/ai-eval/brief.ts",
    share: 0.15,
    env: { EVAL_JUDGE: JUDGE },
    rate: (d) => {
      const rows = read(path.join(d, "results.json")) as { ok: boolean }[];
      return rows.length ? rows.filter((x) => x.ok).length / rows.length : null;
    },
  },
];

type Run = { at: string; sha: string | null; cap: number; spend: number; rates: Record<string, number | null>; capped: string[]; failed: string[]; drops: string[]; dry?: boolean };

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const evals = EVALS.filter((e) => !ONLY.length || ONLY.includes(e.id));
  const run: Run = { at: new Date().toISOString(), sha: process.env.GITHUB_SHA ?? null, cap: CAP, spend: 0, rates: {}, capped: [], failed: [], drops: [], ...(DRY ? { dry: true } : {}) };
  const shareSum = evals.reduce((a, e) => a + e.share, 0) || 1;
  const lines: string[] = [];
  for (const e of evals) {
    const dir = path.join(OUT, e.id);
    fs.mkdirSync(dir, { recursive: true });
    const ledger = path.join(dir, "spend.json");
    fs.rmSync(ledger, { force: true });
    const cap = (CAP * e.share) / shareSum;
    // the stand-ins for server-only and next/cache (scripts/ai-eval/stubs) so server modules run outside Next
    const args = ["tsx", "--tsconfig", "scripts/ai-eval/tsconfig.eval.json", "--import", "./scripts/ai-eval/spend-cap.ts", e.script, dir, ...(DRY ? (e.dry ?? []) : (e.args ?? []))];
    const t0 = Date.now();
    console.log(`\n=== ${e.id} (cap $${cap.toFixed(2)}) npx ${args.join(" ")}`);
    const p = spawnSync("npx", args, {
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 40 * 60_000,
      env: { ...process.env, NODE_PATH: process.env.NODE_PATH || path.resolve("scripts/ai-eval/stubs"), ...e.env, EVAL_MAX_USD: String(cap > 0 ? cap : 0.0001), EVAL_SPEND_LEDGER: ledger, ...(DRY ? { EVAL_NOJUDGE: "1" } : {}) },
    });
    fs.writeFileSync(path.join(dir, "log.txt"), `${p.stdout ?? ""}\n${p.stderr ?? ""}`);
    const tail = `${p.stdout ?? ""}${p.stderr ?? ""}`.trim().split("\n").slice(-4).join("\n");
    console.log(tail);
    let spend = 0;
    let capped = false;
    try {
      const l = read(ledger) as { spent: number; capped: boolean };
      spend = l.spent;
      capped = l.capped;
    } catch {
      /* no calls */
    }
    run.spend += spend;
    let rate: number | null = null;
    if (p.status === 0) {
      try {
        rate = e.rate(dir);
      } catch {
        rate = null;
      }
    }
    // a dry run has no judge, so a judged eval has no rate: it only has to finish
    if (p.status !== 0 || (rate === null && !DRY)) run.failed.push(e.id);
    if (capped) run.capped.push(e.id);
    run.rates[e.id] = rate;
    lines.push(`| ${e.id} | ${rate === null ? (DRY && p.status === 0 ? "ran (no judge)" : "failed") : `${Math.round(rate * 100)}%`} | $${spend.toFixed(3)} / $${cap.toFixed(2)}${capped ? " (capped)" : ""} | ${Math.round((Date.now() - t0) / 1000)} s |`);
  }

  // drops against the previous comparable run
  let history: { runs: Run[] } = { runs: [] };
  try {
    history = read(HISTORY);
  } catch {
    /* the first run */
  }
  const prev = [...history.runs].reverse().find((r) => !r.dry);
  const prevNote: string[] = [];
  if (prev && !DRY)
    for (const [k, v] of Object.entries(run.rates)) {
      const before = prev.rates[k];
      if (v == null || before == null || run.capped.includes(k) || prev.capped?.includes(k)) continue;
      if (before - v > DROP) run.drops.push(k);
      prevNote.push(`${k} ${Math.round(before * 100)}% → ${Math.round(v * 100)}%`);
    }
  history.runs = [...history.runs, run].slice(-90);
  fs.mkdirSync(path.dirname(HISTORY), { recursive: true });
  fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2));
  fs.writeFileSync(path.join(OUT, "nightly.json"), JSON.stringify(run, null, 2));

  const md = [
    `## AI evals ${DRY ? "(dry run) " : ""}· ${run.at.slice(0, 16).replace("T", " ")} UTC`,
    "@@",
    "| eval | pass rate | spend / cap | time |",
    "|---|---|---|---|",
    ...lines,
    "",
    `Spend $${run.spend.toFixed(3)} of the night's $${CAP.toFixed(2)} cap. Judge: ${JUDGE}.`,
    prev ? `Against ${prev.at.slice(0, 10)}: ${prevNote.join(" · ") || "nothing comparable"}.` : "No earlier run to compare with.",
    run.drops.length ? `\n**Dropped more than ${DROP * 100} points: ${run.drops.join(", ")}.** The per-eval results are in the run's artifact.` : "",
    run.capped.length ? `Capped (not compared): ${run.capped.join(", ")}.` : "",
    run.failed.length ? `Failed to run: ${run.failed.join(", ")} (see log.txt in the artifact).` : "",
  ]
    .filter((x) => x !== "")
    .join("\n")
    .replace("@@", "");
  fs.writeFileSync(path.join(OUT, "summary.md"), md);
  console.log(`\n${md}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `drops=${run.drops.length}\nfailed=${run.failed.length}\n`);
}

main();
