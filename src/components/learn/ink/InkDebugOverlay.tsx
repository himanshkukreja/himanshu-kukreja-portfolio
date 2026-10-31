"use client";

/**
 * ?inkdebug=1: a small translucent panel over the ink surfaces listing the last contact decisions (lib/learn/ink/
 * inputMode.ts: pointer type, size, pressure, contacts down, each one's travel, decision and reason), with "Copy log"
 * and "Off". For a tablet owner to show what the ink engine saw. It takes no input except its two buttons
 * (pointer-events: none elsewhere; data-ink-ui / data-annot-ui so no surface writes under them). Rendered once per
 * page, by whichever surface mounted first.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { inkDebugText, setInkDebug, useInkDebug, useInkInput } from "@/lib/learn/ink/inputMode";

let seq = 0;
let owners: number[] = [];
const ownerListeners = new Set<() => void>();
const firstOwner = () => owners[0] ?? 0;

export default function InkDebugOverlay() {
  const { on, rows } = useInkDebug();
  const { mode } = useInkInput();
  const [me] = useState(() => ++seq);
  useEffect(() => {
    owners = [...owners, me];
    ownerListeners.forEach((l) => l());
    return () => {
      owners = owners.filter((o) => o !== me);
      ownerListeners.forEach((l) => l());
    };
  }, [me]);
  const owner = useSyncExternalStore(
    (cb) => {
      ownerListeners.add(cb);
      return () => ownerListeners.delete(cb);
    },
    firstOwner,
    () => 0
  );
  const [copied, setCopied] = useState(false);
  if (!on || owner !== me) return null;

  const copy = async () => {
    const text = inkDebugText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // no clipboard permission (an in-app browser): select it in a prompt the learner can copy from
      window.prompt("Copy the ink log:", text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return createPortal(
    <div
      aria-live="off"
      data-ink-debug
      className="pointer-events-none fixed left-2 top-16 font-mono text-[10.5px] leading-[1.35] text-white"
      style={{ zIndex: 9995, width: "min(430px, calc(100vw - 16px))", background: "rgba(0,0,0,0.72)", padding: "6px 8px" }}
    >
      <div className="flex items-center gap-2">
        <span className="flex-1 font-semibold">ink debug · mode {mode}</span>
        <button type="button" data-ink-ui data-annot-ui onClick={() => void copy()} className="pointer-events-auto border border-white/60 px-2 py-1">
          {copied ? "copied" : "copy log"}
        </button>
        <button type="button" data-ink-ui data-annot-ui onClick={() => setInkDebug(false)} className="pointer-events-auto border border-white/60 px-2 py-1">
          off
        </button>
      </div>
      {rows.length === 0 && <p className="m-0 mt-1 opacity-80">Touch the page: each contact&apos;s decision shows here.</p>}
      <ol className="m-0 mt-1 list-none p-0">
        {rows.slice(-8).map((r, i) => (
          <li key={`${r.t}-${r.id}-${i}`} className="border-t border-white/20 py-0.5">
            <span className={r.decision === "write" || r.decision === "stroke" ? "text-[#7CFFB2]" : r.decision === "gesture" ? "text-[#7CC7FF]" : r.decision === "drop" ? "text-[#FF9C7C]" : ""}>{r.decision}</span> {r.type}#{r.id} {r.size} p {r.p} · {r.n} down · travel {r.travel}
            <br />
            <span className="opacity-80">{r.reason}</span>
          </li>
        ))}
      </ol>
    </div>,
    document.body
  );
}
