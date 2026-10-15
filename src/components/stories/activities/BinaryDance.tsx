"use client";

import { useState } from "react";
import ActivityShell from "./ActivityShell";
import { ChoiceStep, Feedback, OPTION, OPT_IDLE, StepPrompt } from "./kit";
import type { ActivityProps } from "./registry";
import type { ActivityDef, StepCtx } from "./types";

const ROUNDS = 4;
const fmt = (n: number) => String(+n.toFixed(4));

function Halving({
  ctx,
  axis,
  value,
  lo0,
  hi0,
  names,
}: {
  ctx: StepCtx;
  axis: string;
  value: number;
  lo0: number;
  hi0: number;
  names: [string, string];
}) {
  const [bits, setBits] = useState<{ mine: number; right: number }[]>([]);
  // Replay the (correct) halvings so far to get the current range.
  let lo = lo0;
  let hi = hi0;
  for (const b of bits) {
    const mid = (lo + hi) / 2;
    if (b.right) lo = mid;
    else hi = mid;
  }
  const mid = (lo + hi) / 2;
  const truth = value >= mid ? 1 : 0;
  const finished = bits.length >= ROUNDS;
  const lastBit = bits[bits.length - 1];
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  const choose = (b: number) => {
    if (finished) return;
    const next = [...bits, { mine: b, right: truth }];
    setBits(next);
    if (next.length === ROUNDS) ctx.done(next.filter((x) => x.mine === x.right).length);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={`GeoHash halves the range ${ROUNDS} times. Each half you pick is one bit: ${names[0].toLowerCase()} = 0, ${names[1].toLowerCase()} = 1.`}>
        Mumbai’s {axis} is <span className="font-mono text-signal-text">{value}</span>. Which half is it in?
      </StepPrompt>

      <div className="flex flex-col gap-2 border border-line-strong bg-bg p-4">
        <div className="flex justify-between font-mono text-[12px] text-fg-3">
          <span>{fmt(lo)}</span>
          <span className="text-fg-2">mid {fmt(mid)}</span>
          <span>{fmt(hi)}</span>
        </div>
        <div className="relative grid h-12 grid-cols-2 border border-line-strong" aria-hidden>
          <span className={`border-r border-line-strong ${finished ? "" : "bg-[repeating-linear-gradient(90deg,transparent_0_11px,var(--c-line)_11px_12px)]"}`} />
          <span className={finished ? "" : "bg-[repeating-linear-gradient(90deg,transparent_0_11px,var(--c-line)_11px_12px)]"} />
          {!finished && (
            <span className="absolute inset-y-0 w-0.5 bg-signal" style={{ left: pos(value) }}>
              <span className="absolute -top-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 bg-signal" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[13px]" aria-label="Bits so far">
          <span className="text-fg-3">bits:</span>
          {Array.from({ length: ROUNDS }, (_, i) => {
            const b = bits[i];
            return (
              <span
                key={i}
                className={`grid h-8 w-8 place-items-center font-semibold ${
                  !b ? "border border-dashed border-line-strong text-fg-4" : b.mine === b.right ? "bg-signal text-on-signal" : "border border-bad text-bad-text"
                }`}
              >
                {b ? b.right : "?"}
              </span>
            );
          })}
        </div>
      </div>

      {!finished && (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={`Halving ${bits.length + 1} of ${ROUNDS}`}>
          {[0, 1].map((b) => (
            <button key={b} type="button" onClick={() => choose(b)} className={`${OPTION} ${OPT_IDLE} flex-col !items-start !gap-0.5`}>
              <span className="font-semibold">
                {names[b]} → {b}
              </span>
              <span className="font-mono text-[11px] text-fg-3">{b ? `[${fmt(mid)}, ${fmt(hi)}]` : `[${fmt(lo)}, ${fmt(mid)})`}</span>
            </button>
          ))}
        </div>
      )}
      <div aria-live="polite">
        {lastBit && (
          <Feedback
            ok={finished ? bits.every((b) => b.mine === b.right) : lastBit.mine === lastBit.right}
            title={
              finished
                ? `${axis} bits: ${bits.map((b) => b.right).join("")}`
                : lastBit.mine === lastBit.right
                  ? `Bit ${lastBit.right}.`
                  : `It's bit ${lastBit.right}: ${value} is ${lastBit.right ? "≥" : "<"} the midpoint.`
            }
          >
            {finished
              ? `${bits.filter((b) => b.mine === b.right).length} of ${ROUNDS} right. Each extra halving doubles the precision; DIGIPIN runs 5 bits per character for 10 characters.`
              : null}
          </Feedback>
        )}
      </div>
      {/* keep the result readable for screen readers once the bar is done */}
      {finished && <span className="sr-only">Range narrowed to {fmt(lo)} to {fmt(hi)}.</span>}
      {finished && (
        <p className="m-0 font-mono text-[12px] text-fg-3">
          narrowed to [{fmt(lo)}, {fmt(hi)}]
        </p>
      )}
    </div>
  );
}

const DEF: ActivityDef = {
  kind: "encoder",
  title: "The binary dance",
  blurb:
    "Encode Priya's Mumbai by hand, the way the DIGIPIN generator does: halve longitude and latitude bit by bit, interleave them, and see the first GeoHash character fall out.",
  minutes: 2,
  steps: [
    {
      id: "lon",
      label: "Halve longitude",
      max: 4,
      render: (ctx) => <Halving ctx={ctx} axis="Longitude" value={72.8777} lo0={-180} hi0={180} names={["Left half", "Right half"]} />,
    },
    {
      id: "lat",
      label: "Halve latitude",
      max: 4,
      render: (ctx) => <Halving ctx={ctx} axis="Latitude" value={19.076} lo0={-90} hi0={90} names={["Lower half", "Upper half"]} />,
    },
    {
      id: "interleave",
      label: "Interleave",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="Longitude gave 1011, latitude gave 1001. GeoHash interleaves them, longitude first. What comes out?"
          options={["10111001", "11001011", "10011011", "11100101"]}
          answer={1}
          explain={
            <>
              lon, lat, lon, lat…: <span className="font-mono">1 1 0 0 1 0 1 1</span>. Base32 eats 5 bits per character: 11001 = 25, and character 25 of
              “0123456789bcdefghjkmnpqrstuvwxyz” is <span className="font-mono font-semibold text-signal-text">t</span>, the first letter of Mumbai’s GeoHash.
            </>
          }
        />
      ),
    },
    {
      id: "prefix",
      label: "Why it scales",
      max: 1,
      render: (ctx) => (
        <ChoiceStep
          ctx={ctx}
          prompt="The logistics planner groups a driver's 40 stops by the first 6 characters of their GeoHash. Why does that work?"
          options={[
            "Codes are assigned in delivery order.",
            "Nearby locations share common prefixes.",
            "Each 6-character prefix is one state's partition.",
            "The checksum digits encode the district.",
          ]}
          answer={1}
          explain="Because every character is a further halving of the same grid, nearby points share prefixes: cluster_by_geohash_prefix() uses a 6-character prefix for roughly 1.2 km clusters, and prefix queries (WHERE geohash LIKE 'te7h2k%') stay fast and sortable."
        />
      ),
    },
  ],
};

export default function BinaryDance({ slug, caseId }: ActivityProps) {
  return <ActivityShell slug={slug} caseId={caseId} def={DEF} />;
}
