import type { ReactNode } from "react";
import type { QuestBrand } from "./brands";

/**
 * Original quest emblems, drawn for this course (64×64, square tile, 2.5px square-capped strokes).
 * They evoke each product's engineering problem; none reproduces a company logo or trademark.
 * Decorative: the product is always named next to it, so the SVG is aria-hidden.
 */

/** flat-top hexagon path */
function hex(cx: number, cy: number, r: number): string {
  const pts = [0, 60, 120, 180, 240, 300].map((a) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

function glyph(id: QuestBrand["emblem"], ink: string, accent: string): ReactNode {
  const S = { fill: "none", stroke: ink, strokeWidth: 2.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  const F = { fill: ink };
  switch (id) {
    case "upi": // QR finder squares + a rupee mark in the fourth corner
      return (
        <>
          {[
            [11, 11],
            [39, 11],
            [11, 39],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width={14} height={14} {...S} />
              <rect x={x + 4.5} y={y + 4.5} width={5} height={5} {...F} />
            </g>
          ))}
          {[
            [29, 12],
            [30, 20],
            [12, 30],
            [20, 31],
            [29, 29],
          ].map(([x, y]) => (
            <rect key={`m${x}-${y}`} x={x} y={y} width={3.5} height={3.5} {...F} />
          ))}
          <path d="M38 39.5h15M38 44.5h15M41 39.5h3a5.5 5.5 0 0 1 0 11h-6l11 10" {...S} />
        </>
      );
    case "chat": // a message bubble carrying a double tick
      return (
        <>
          <path d="M11 13h42v29H27l-9 8v-8h-7z" {...S} />
          <path d="M18 28l5 5 9-10M28 33l9-10" {...S} />
        </>
      );
    case "fingerprint": // ridges of a fingerprint
      return (
        <>
          <path d="M28 37a4 4 0 0 1 8 0v5" {...S} />
          <path d="M23 43v-6a9 9 0 0 1 18 0v9" {...S} />
          <path d="M18 46v-9a14 14 0 0 1 28 0v3" {...S} />
          <path d="M13 34v-1a19 19 0 0 1 38 0v1" {...S} />
          <path d="M32 38v12" {...S} />
        </>
      );
    case "card": // a payment card: chip, number groups
      return (
        <>
          <rect x={8} y={15} width={48} height={34} {...S} />
          <rect x={14} y={22} width={12} height={9} fill="#F7B600" />
          <path d="M14 26.5h12M20 22v9" stroke="#7A5A00" strokeWidth={1} />
          {[14, 25, 36, 47].map((x) => (
            <g key={x}>
              {[0, 2.6, 5.2].map((d) => (
                <rect key={d} x={x + d} y={39} width={1.8} height={1.8} {...F} />
              ))}
            </g>
          ))}
          <path d="M40 24h10" {...S} />
        </>
      );
    case "search": // a lens over index lines
      return (
        <>
          <rect x={14} y={14} width={26} height={26} {...S} />
          <path d="M19 22h16M19 27h16M19 32h10" {...S} strokeWidth={2} />
          <path d="M40 40l11 11" {...S} strokeWidth={5} />
        </>
      );
    case "play": // a screen with a play glyph and a bitrate ladder
      return (
        <>
          <rect x={9} y={12} width={46} height={32} {...S} />
          <path d="M27 20l12 8-12 8z" {...F} />
          <path d="M32 44v7M24 52h16" {...S} />
          {[0, 1, 2].map((k) => (
            <rect key={k} x={14} y={36 - k * 5} width={3 + k * 2} height={2.4} {...F} opacity={0.75} />
          ))}
        </>
      );
    case "eq": // equaliser bars on a baseline
      return (
        <>
          {[
            [12, 14],
            [20, 26],
            [28, 34],
            [36, 20],
            [44, 28],
          ].map(([x, hgt]) => (
            <rect key={x} x={x} y={48 - hgt} width={6} height={hgt} {...F} />
          ))}
          <path d="M9 52h46" {...S} />
        </>
      );
    case "bucket": // a bucket with objects dropping in
      return (
        <>
          <path d="M11 30h42M14 30l4 21h28l4-21" {...S} />
          <rect x={19} y={16} width={8} height={8} {...S} strokeWidth={2} />
          <rect x={30} y={10} width={8} height={8} {...F} />
          <rect x={40} y={18} width={7} height={7} {...S} strokeWidth={2} />
          <path d="M22 38h20M24 44h16" {...S} strokeWidth={1.6} opacity={0.6} />
        </>
      );
    case "map": // hex cells and a pickup pin
      return (
        <>
          <path d={hex(20, 41, 9)} {...S} strokeWidth={1.8} opacity={0.7} />
          <path d={hex(33.5, 48.8, 9)} {...S} strokeWidth={1.8} opacity={0.7} />
          <path d={hex(47, 41, 9)} {...S} strokeWidth={1.8} opacity={0.7} />
          <path d="M33.5 12a9 9 0 0 1 9 9c0 8-9 18-9 18s-9-10-9-18a9 9 0 0 1 9-9z" {...F} />
          <rect x={31} y={18.5} width={5} height={5} fill={accent} />
        </>
      );
    case "fanout": // one post fanning out to many timelines
      return (
        <>
          <path d="M32 16v8M32 24H15v8M32 24h17v8M32 24v8M15 38v6M15 38H9v6M15 38h6v6M49 38v6M49 38h-6v6M49 38h6v6M32 38v6" {...S} strokeWidth={2} />
          <rect x={27} y={9} width={10} height={9} {...F} />
          <rect x={11} y={31} width={8} height={7} {...F} />
          <rect x={28} y={31} width={8} height={7} {...F} />
          <rect x={45} y={31} width={8} height={7} {...F} />
          {[7, 13, 19, 30, 41, 47, 53].map((x) => (
            <rect key={x} x={x} y={46} width={4} height={4} {...F} />
          ))}
        </>
      );
    case "train": // a locomotive face on rails
      return (
        <>
          <rect x={18} y={9} width={28} height={36} {...S} />
          <rect x={22.5} y={14} width={19} height={12} {...S} strokeWidth={2} />
          <rect x={22} y={34} width={5} height={5} {...F} />
          <rect x={37} y={34} width={5} height={5} {...F} />
          <path d="M24 45l-8 11M40 45l8 11M19 52h26" {...S} />
        </>
      );
    case "bolt": // a grocery bag stamped with a lightning bolt, speed lines behind it
      return (
        <>
          <rect x={17} y={24} width={34} height={30} {...S} />
          <path d="M27 24v-5a7 7 0 0 1 14 0v5" {...S} />
          <path d="M37 29l-10 13h7l-3 9 10-13h-7z" {...F} />
          <path d="M6 33h7M4 39h9M7 45h6" {...S} strokeWidth={2} />
        </>
      );
    case "candles": // three rising candlesticks over a baseline, the last one lit by the open
      return (
        <>
          <path d="M18 29v6M18 47v5M32 20v6M32 40v6M46 10v6M46 31v5" {...S} strokeWidth={2} />
          <rect x={13} y={35} width={10} height={12} {...S} />
          <rect x={27} y={26} width={10} height={14} {...F} />
          <rect x={41} y={16} width={10} height={15} {...F} />
          <path d="M8 56h48" {...S} />
        </>
      );
  }
}

export default function QuestEmblem({ brand, size = 72, className = "" }: { brand: QuestBrand; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`block shrink-0 ${className}`}
    >
      <rect width={64} height={64} fill={brand.accent} />
      <rect x={3} y={3} width={58} height={58} fill="none" stroke={brand.ink} strokeOpacity={0.28} strokeWidth={1} />
      {glyph(brand.emblem, brand.ink, brand.accent)}
    </svg>
  );
}
