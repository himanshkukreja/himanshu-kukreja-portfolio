"use client";

/**
 * The trie sandbox (`::sandbox[trie]`, dsa-mastery sandbox.yml): a live trie the learner inserts words into, then searches or asks
 * about a prefix. Each operation runs on the step engine (src/lib/dsa/viz/trie.ts) and plays step by step in the StepPlayer; the
 * counter counts letters read or written. "Start from these words" takes a comma-separated list of lowercase words.
 */
import { useState } from "react";
import { makeTrie, prefixesOf, runTrieOp, stillScript as still, trieText, TRIE_OP_LABEL, type TrieModel, type TrieOpName } from "@/lib/dsa/viz/trie";
import type { Script } from "@/lib/dsa/viz/types";
import type { SandboxSpec } from "@/lib/dsa/viz/registry";
import { track } from "@/lib/track";
import StepPlayer from "../viz/StepPlayer";

type LogRow = { label: string; steps: number; after: string };

export default function TrieSandbox({ spec }: { spec: SandboxSpec }) {
  const maxWords = spec.limits.nodes;
  const maxLen = spec.limits.value[1];
  const [auto, setAuto] = useState(true);
  const [predict, setPredict] = useState(false);
  const [model, setModel] = useState<TrieModel>(() => makeTrie(spec.words ?? []));
  const [script, setScript] = useState<Script>(() => still(makeTrie(spec.words ?? []), "Your trie. Insert a word, search for one, or ask about a prefix below, and watch it run letter by letter."));
  const [word, setWord] = useState("cart");
  const [build, setBuild] = useState((spec.words ?? []).join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [log, setLog] = useState<LogRow[]>([]);
  const ops = spec.operations as TrieOpName[];
  const total = log.reduce((a, r) => a + r.steps, 0);

  const clean = (s: string) => s.trim().toLowerCase();
  const okWord = (s: string) => /^[a-z]+$/.test(s) && s.length <= maxLen;

  const run = (op: TrieOpName) => {
    setMsg(null);
    const w = clean(word);
    if (!okWord(w)) {
      setMsg(`Type a word of lowercase letters, up to ${maxLen} letters.`);
      return;
    }
    if (op === "insert" && !model.words.includes(w) && model.words.length >= maxWords) {
      setMsg(`The sandbox holds at most ${maxWords} words. Start again with fewer.`);
      return;
    }
    const r = runTrieOp(model, { op, word: w }, { predict });
    setScript(r.script);
    setModel(r.trie);
    const steps = r.script.frames[r.script.frames.length - 1]?.cost ?? 0;
    setLog((l) => [{ label: r.script.title, steps, after: trieText(r.trie) }, ...l].slice(0, 12));
    track("dsa_sandbox_op", { sandbox: spec.id, op, predict });
  };

  const rebuild = (words: string[]) => {
    const m = makeTrie(words);
    setModel(m);
    setLog([]);
    setScript(still(m, words.length ? `A trie of ${m.words.length} words, built from your list. Shared first letters share nodes.` : "An empty trie: just the root. Insert a word."));
  };

  const onBuild = () => {
    const words = build.split(/[,;\s]+/).map(clean).filter(Boolean);
    if (words.some((w) => !okWord(w)) || words.length > maxWords) {
      setMsg(`Type up to ${maxWords} words of lowercase letters (up to ${maxLen} letters each), separated by commas.`);
      return;
    }
    setMsg(null);
    rebuild(words);
  };

  const preset = (words: string[]) => {
    setBuild(words.join(", "));
    setMsg(null);
    rebuild(words);
  };

  const btn = "min-h-11 border-2 border-signal px-3 text-left text-[14px] font-semibold text-signal-text hover:bg-[var(--c-dsa-hl)] sm:text-center";
  const nodes = prefixesOf(model.words).length - 1;
  const letters = model.words.reduce((a, w) => a + w.length, 0);

  return (
    <div className="dsa-ui flex min-w-0 flex-col gap-4 p-3 sm:p-5">
      <StepPlayer script={script} autoPlay={auto && script.frames.length > 1} label="Trie sandbox" stepMs={1250} />

      <p className="m-0 font-mono text-[12px] text-fg-3" aria-live="polite">
        {model.words.length} word{model.words.length === 1 ? "" : "s"} · {nodes} node{nodes === 1 ? "" : "s"} for {letters} letter{letters === 1 ? "" : "s"}
      </p>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <label className="flex flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Word or prefix
          <input value={word} onChange={(x) => setWord(x.target.value)} autoCapitalize="none" spellCheck={false} className="min-h-11 w-48 max-w-full border border-line-strong bg-surface px-3 font-mono text-[16px] font-normal text-fg focus:border-signal focus:outline-none" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Trie operations">
          {ops.map((o) => (
            <button key={o} type="button" onClick={() => run(o)} className={btn}>
              {TRIE_OP_LABEL[o]} “{clean(word) || "?"}”{o === "starts_with" ? "?" : ""}
            </button>
          ))}
        </div>
        {msg && (
          <p role="alert" className="m-0 text-[14px] text-bad-text">
            {msg}
          </p>
        )}
      </div>

      <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0 text-[14px] text-fg-2">
        <legend className="sr-only">Sandbox options</legend>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={auto} onChange={(x) => setAuto(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Play steps automatically
        </label>
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={predict} onChange={(x) => setPredict(x.target.checked)} className="h-5 w-5 accent-[var(--c-signal)]" />
          Ask me to predict (search and prefix)
        </label>
      </fieldset>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(x) => {
          x.preventDefault();
          onBuild();
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] font-semibold text-fg-2">
          Start from these words
          <input value={build} onChange={(x) => setBuild(x.target.value)} placeholder="car, cat, cart, dog" className="min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 font-mono text-[15px] font-normal text-fg focus:border-signal focus:outline-none" />
        </label>
        <button type="submit" className="min-h-11 bg-signal px-4 text-[14px] font-semibold text-on-signal">
          Build
        </button>
        <button type="button" onClick={() => preset(["car", "card", "care", "cart", "cat"])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Shared start
        </button>
        <button type="button" onClick={() => preset(["ant", "bee", "cow", "dog", "eel"])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Nothing shared
        </button>
        <button type="button" onClick={() => preset([])} className="min-h-11 border border-line-strong px-3 text-[14px] text-fg">
          Empty
        </button>
      </form>

      {log.length > 0 && (
        <details className="border border-line">
          <summary className="min-h-11 cursor-pointer px-3 py-2.5 font-mono text-[12px] text-fg-3">
            This session: {log.length} operation{log.length === 1 ? "" : "s"}, {total} letter{total === 1 ? "" : "s"} in all
          </summary>
          <ol className="m-0 flex list-none flex-col gap-1 px-3 pb-3 font-mono text-[12px] text-fg-2">
            {log.map((r, i) => (
              <li key={i} className="break-words">
                {r.label}: {r.steps} step{r.steps === 1 ? "" : "s"} → {r.after}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
