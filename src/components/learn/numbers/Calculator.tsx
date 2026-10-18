"use client";

/**
 * The estimation calculator: free-text input, live answer, worked solution, presets, share link.
 * Controlled by the page (the reference tables can send it an expression).
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculate, type CalcResult, type LineOk } from "@/lib/learn/numbers/calc";
import { PRESETS } from "@/lib/learn/numbers/reference";
import { track } from "@/lib/track";

export type CalcSource = "typed" | "preset" | "link" | "table" | "default";

export const DEFAULT_Q = "50k QPS × 2 KB × 30 days";

const KEYS: { label: string; insert: string; aria?: string }[] = [
  { label: "×", insert: " × ", aria: "times" },
  { label: "/", insert: " / ", aria: "divided by" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "%", insert: "%" },
  { label: "k", insert: "k" },
  { label: "M", insert: "M" },
  { label: "KB", insert: " KB" },
  { label: "MB", insert: " MB" },
  { label: "GB", insert: " GB" },
  { label: "QPS", insert: " QPS" },
  { label: "/day", insert: " / day" },
  { label: "days", insert: " days" },
  { label: "in Gbps", insert: " in Gbps" },
  { label: "↵", insert: "\n", aria: "new line" },
];

function safeCalc(q: string): CalcResult {
  try {
    return calculate(q);
  } catch {
    return { lines: [{ ok: false, src: q, error: "Something went wrong with that one. Try writing it another way.", at: null }], final: null, ok: false };
  }
}

type Props = { q: string; source: CalcSource; onChange: (q: string, source: CalcSource) => void };

export default function Calculator({ q, source, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const result = useMemo(() => safeCalc(q), [q]);
  const preset = useMemo(() => PRESETS.find((p) => p.q === q) || null, [q]);
  const [copied, setCopied] = useState<"link" | "shared" | null>(null);
  const tracked = useRef<{ last: string; n: number }>({ last: "", n: 0 });

  // ?q= mirrors the input, so the address bar is always a link to this calculation
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        if (q.trim() && q !== DEFAULT_Q) url.searchParams.set("q", q);
        else url.searchParams.delete("q");
        window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      } catch {
        // history blocked (sandboxed frame): the copy-link button still works
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [q]);

  // one numbers_calc per settled calculation (not per keystroke), at most 30 a page view
  useEffect(() => {
    const final = result.final;
    if (!final || source === "default") return;
    const t = window.setTimeout(() => {
      if (tracked.current.last === q || tracked.current.n >= 30) return;
      tracked.current = { last: q, n: tracked.current.n + 1 };
      track("numbers_calc", {
        source,
        preset: preset?.id ?? null,
        kind: final.display.kind,
        lines: result.lines.length,
        ok: result.ok,
        shortcut: !!final.shortcut,
        converted: !!final.converted,
        length: q.length,
      });
    }, 1800);
    return () => window.clearTimeout(t);
  }, [q, result, source, preset]);

  const insert = (text: string) => {
    const el = ref.current;
    const start = el?.selectionStart ?? q.length;
    const end = el?.selectionEnd ?? q.length;
    const next = q.slice(0, start) + text + q.slice(end);
    onChange(next, "typed");
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const shareUrl = () => {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    if (q.trim()) url.searchParams.set("q", q);
    return url.toString();
  };

  const copy = async () => {
    const url = shareUrl();
    try {
      if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Numbers playground", text: q.split("\n").filter((l) => !l.trim().startsWith("#")).join("; "), url });
        setCopied("shared");
      } else {
        await navigator.clipboard.writeText(url);
        setCopied("link");
      }
    } catch {
      // share sheet dismissed or clipboard blocked: select a fallback field instead
      window.prompt("Copy this link", url);
    }
    window.setTimeout(() => setCopied(null), 2200);
  };

  const rows = Math.min(10, Math.max(3, q.split("\n").length + 1));
  const errors = result.lines.filter((l) => !l.ok);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            <span className="text-signal-text">01</span> · calculator
          </span>
          <h2 id="calc-h" className="font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[36px]">
            Estimate it
          </h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copy()} disabled={!q.trim()} className="inline-flex min-h-11 items-center border border-line-strong px-4 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:opacity-50">
            {copied === "link" ? "link copied ✓" : copied === "shared" ? "shared ✓" : "copy link"}
          </button>
          <button type="button" onClick={() => onChange("", "typed")} className="inline-flex min-h-11 items-center border border-line px-3 font-mono text-[13px] text-fg-3 hover:text-fg">
            clear
          </button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-6">
        {/* input */}
        <div className="flex min-w-0 flex-col gap-3">
          <label htmlFor="calc-q" className="font-mono text-[11px] uppercase tracking-label text-fg-3">
            your estimate · one step per line
          </label>
          <textarea
            id="calc-q"
            ref={ref}
            value={q}
            rows={rows}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            placeholder={"50k QPS × 2 KB × 30 days\npeak = 3 × avg"}
            onChange={(e) => onChange(e.target.value, "typed")}
            aria-describedby="calc-help"
            aria-invalid={errors.length > 0}
            className="w-full resize-y border border-line-strong bg-bg px-4 py-3 font-mono text-[16px] leading-relaxed text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none sm:text-[17px]"
          />
          <div role="toolbar" aria-label="Insert" className="flex flex-wrap gap-1.5">
            {KEYS.map((k) => (
              <button
                key={k.label}
                type="button"
                aria-label={k.aria ? `Insert ${k.aria}` : `Insert ${k.label.trim()}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insert(k.insert)}
                className="inline-flex min-h-10 min-w-10 items-center justify-center border border-line px-2.5 font-mono text-[13px] text-fg-2 hover:border-fg-4 hover:text-fg"
              >
                {k.label}
              </button>
            ))}
          </div>
          <Help />
          <Presets current={preset?.id ?? null} onPick={(p) => onChange(p, "preset")} />
        </div>

        {/* answer + working */}
        <div className="flex min-w-0 flex-col gap-3" aria-live="polite">
          <Answer result={result} />
          {preset && (
            <div className="flex flex-col gap-1 border border-dashed border-line-strong px-4 py-3 text-[14px] leading-snug text-fg-2">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">the lesson gets</span>
              <span>{preset.expect}</span>
              <Link href={preset.taught.href} className="mt-1 inline-flex min-h-9 items-center self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                taught in {preset.taught.label} →
              </Link>
            </div>
          )}
          <Working result={result} />
        </div>
      </div>
    </div>
  );
}

function Answer({ result }: { result: CalcResult }) {
  const final = result.final;
  if (!final) {
    const err = result.lines.find((l) => !l.ok);
    return (
      <div className="flex min-h-[180px] flex-col justify-center gap-2 border border-line bg-surface p-5">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">answer</span>
        {err && !err.ok ? (
          <p role="alert" className="m-0 text-[15px] leading-relaxed text-bad-text">
            {err.error}
          </p>
        ) : (
          <p className="m-0 text-[15px] text-fg-3">Type an estimate, or pick a preset.</p>
        )}
      </div>
    );
  }
  const main = final.converted ?? final.display.main;
  return (
    <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          answer{final.name ? ` · ${final.name}` : ""} · {final.converted ? final.display.main : final.display.caption}
        </span>
        {!result.ok && <span className="font-mono text-[11px] text-bad-text">a line above has an error</span>}
      </div>
      <output htmlFor="calc-q" className="block break-words font-mono text-[clamp(34px,5vw,56px)] font-semibold leading-none tracking-[-0.03em] text-signal-text">
        {main}
      </output>
      {final.along.length > 0 && (
        <div className="flex flex-col gap-1">
          {final.along.map((a) => (
            <span key={a.kind} className="font-mono text-[14px] text-fg">
              <span className="text-fg-3">{a.kind === "bandwidth" ? "bandwidth on the way · " : "rate on the way · "}</span>
              {a.text}
            </span>
          ))}
        </div>
      )}
      {final.shortcut && (
        <span className="font-mono text-[13px] text-fg-2">
          <span className="text-fg-3">interview shortcut (1 day ≈ 10⁵ s): </span>
          {final.shortcut}
        </span>
      )}
      {final.display.alts.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 border-t border-line p-0 pt-2.5">
          {final.display.alts.map((a) => (
            <li key={a} className="font-mono text-[12.5px] leading-snug text-fg-3">
              = {a}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Working({ result }: { result: CalcResult }) {
  if (!result.lines.length) return null;
  return (
    <div className="flex flex-col gap-3 border border-line bg-bg p-4 sm:p-5">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">worked solution</span>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {result.lines.map((l, i) => (
          <li key={i} className="flex flex-col gap-1.5">{l.ok ? <LineWork line={l} n={i + 1} many={result.lines.length > 1} /> : <LineError src={l.src} error={l.error} />}</li>
        ))}
      </ol>
    </div>
  );
}

function LineWork({ line, n, many }: { line: LineOk; n: number; many: boolean }) {
  const value = line.converted ?? line.display.main;
  return (
    <>
      {many && (
        <span className="font-mono text-[12px] text-fg-3">
          <span className="text-signal-text">{n}.</span> {line.src}
        </span>
      )}
      {line.readAs !== line.src && <span className="font-mono text-[12.5px] leading-snug text-fg-3">read as: {line.readAs}</span>}
      {line.steps.map((s, k) => (
        <span key={k} className="font-mono text-[14px] leading-snug text-fg-2">
          {s.text}
        </span>
      ))}
      <span className="font-mono text-[15px] font-semibold leading-snug text-fg">
        {line.name ? `${line.name} = ` : "→ "}
        {value}
        {line.converted && <span className="font-normal text-fg-3"> ({line.display.main})</span>}
      </span>
      {line.conversions.length > 0 && <span className="font-mono text-[12px] leading-snug text-fg-4">units: {line.conversions.join(" · ")}</span>}
      {line.notes.map((note) => (
        <span key={note} className="text-[12.5px] leading-snug text-signal-text">
          note: {note}
        </span>
      ))}
    </>
  );
}

function LineError({ src, error }: { src: string; error: string }) {
  return (
    <>
      <span className="font-mono text-[12px] text-fg-3">{src}</span>
      <span role="alert" className="text-[14px] leading-snug text-bad-text">
        {error}
      </span>
    </>
  );
}

function Help() {
  return (
    <details id="calc-help" className="group border border-line bg-surface text-[14px] text-fg-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-mono text-[13px] text-fg-3 hover:text-fg">
        what can I type?
        <span aria-hidden className="transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="grid gap-x-6 gap-y-2 border-t border-line px-4 py-3 text-[13.5px] leading-relaxed sm:grid-cols-2">
        <p className="m-0">
          <b className="text-fg">Numbers</b> 50k · 1.5M · 4B (billion) · 3.5T · 1,000 · 1e9 · 20%
        </p>
        <p className="m-0">
          <b className="text-fg">Maths</b> × x * · / ÷ per · + − · ^ · ( ) · of (20% of 10 TB)
        </p>
        <p className="m-0">
          <b className="text-fg">Data</b> B KB MB GB TB PB (×1,000) · KiB MiB GiB (×1,024) · bit Kb Mb Gb
        </p>
        <p className="m-0">
          <b className="text-fg">Rates</b> QPS RPS /s · Mbps Gbps · MB/s · 100M/day · per day
        </p>
        <p className="m-0">
          <b className="text-fg">Time</b> ns µs ms s min h day week month (30 d) year (365 d)
        </p>
        <p className="m-0">
          <b className="text-fg">Lines</b> peak = 3 × avg · one step per line or ; · # comment · ans
        </p>
        <p className="m-0">
          <b className="text-fg">Convert</b> … in Gbps · … in TB/day · … in ms
        </p>
        <p className="m-0">
          <b className="text-fg">Functions</b> ceil floor round min max log(x, base) log2 sqrt
        </p>
        <p className="m-0 sm:col-span-2 text-fg-3">
          Words after a number are counts (200M users, 20 views/day) and multiply by 1. &ldquo;4B&rdquo; is 4 billion; &ldquo;4 B&rdquo; or &ldquo;4 bytes&rdquo; is bytes. &ldquo;Mb&rdquo; is megabits, &ldquo;MB&rdquo; megabytes.
        </p>
      </div>
    </details>
  );
}

function Presets({ current, onPick }: { current: string | null; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">interview presets</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={current === p.id}
            onClick={() => onPick(p.q)}
            className={`flex min-h-[64px] flex-col items-start justify-center gap-0.5 border px-3 py-2 text-left ${current === p.id ? "border-signal bg-surface-2" : "border-line bg-bg hover:border-fg-4"}`}
          >
            <span className="text-[14px] font-semibold leading-tight text-fg">{p.title}</span>
            <span className="text-[12px] leading-snug text-fg-3">{p.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
