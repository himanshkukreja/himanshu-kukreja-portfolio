import { useId, type ReactNode } from "react";
import type { QuestBrand, QuestLogo } from "./brands";
import LOGOS_JSON from "./logos.json";
import MARKS_JSON from "./marks.json";

/**
 * Quest tiles (64×64, square), drawn like the product's app icon: its real logo in full colour (Gil Barbara's
 * SVG Logos) or in one colour (Simple Icons) on the icon's background, or, for products neither set has, an
 * original emblem drawn for this course (2.5px square-capped strokes, in an inset frame) that evokes the
 * product's engineering problem, in the brand's colours. brands.ts sets the colours and logos; the logos are
 * vendored by scripts/build-quest-logos.mjs and are their owners' trademarks. Decorative: the product is
 * always named next to it, so the SVG is aria-hidden.
 */

/** flat-top hexagon path */
function hex(cx: number, cy: number, r: number): string {
  const pts = [0, 60, 120, 180, 240, 300].map((a) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + r * Math.cos(t)).toFixed(1)} ${(cy + r * Math.sin(t)).toFixed(1)}`;
  });
  return `M${pts.join("L")}Z`;
}

/** the emblem in `ink`, with `hi` for the brand's second colour and `accent` (the tile colour) for knockouts */
function glyph(id: QuestBrand["emblem"], ink: string, accent: string, hi: string): ReactNode {
  const S = { fill: "none", stroke: ink, strokeWidth: 2.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  const F = { fill: ink };
  const H = { fill: "none", stroke: hi, strokeWidth: 2.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
  const HF = { fill: hi };
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
          <path d="M38 39.5h15M38 44.5h15M41 39.5h3a5.5 5.5 0 0 1 0 11h-6l11 10" {...H} />
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
          <path d="M13 34v-1a19 19 0 0 1 38 0v1" {...H} strokeWidth={3} />
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
          <rect x={22} y={34} width={5} height={5} {...HF} />
          <rect x={37} y={34} width={5} height={5} {...HF} />
          <path d="M24 45l-8 11M40 45l8 11M19 52h26" {...S} />
        </>
      );
    case "bolt": // a grocery bag stamped with a lightning bolt, speed lines behind it
      return (
        <>
          <rect x={17} y={24} width={34} height={30} {...S} />
          <path d="M27 24v-5a7 7 0 0 1 14 0v5" {...S} />
          <path d="M37 29l-10 13h7l-3 9 10-13h-7z" {...HF} />
          <path d="M6 33h7M4 39h9M7 45h6" {...S} strokeWidth={2} />
        </>
      );
    case "candles": // three rising candlesticks over a baseline, the last one lit by the open
      return (
        <>
          <path d="M18 29v6M18 47v5M32 20v6M32 40v6M46 10v6M46 31v5" {...S} strokeWidth={2} />
          <rect x={13} y={35} width={10} height={12} {...S} />
          <rect x={27} y={26} width={10} height={14} {...HF} />
          <rect x={41} y={16} width={10} height={15} {...HF} />
          <path d="M8 56h48" {...S} />
        </>
      );
    case "tokens": // a GPU chip streaming tokens out one at a time, above a line being typed with a cursor
      return (
        <>
          <rect x={10} y={17} width={24} height={24} {...S} />
          <path d="M10 23H5M10 29H5M10 35H5M16 17v-5M22 17v-5M28 17v-5M16 41v5M22 41v5M28 41v5" {...S} strokeWidth={2} />
          <rect x={17} y={24} width={10} height={10} {...F} />
          <rect x={38} y={26} width={6} height={6} {...F} />
          <rect x={47} y={26.5} width={5} height={5} {...F} opacity={0.8} />
          <rect x={55} y={27} width={4} height={4} {...F} opacity={0.6} />
          <path d="M14 53h16M34 53h8" {...S} />
          <rect x={45} y={48} width={2.5} height={9} {...F} />
        </>
      );
    case "cursors": // a selected frame with corner handles, two people's cursors editing it at once, one name tag
      return (
        <>
          <rect x={8} y={10} width={34} height={27} {...S} strokeDasharray="4 3" />
          {[
            [8, 10],
            [42, 10],
            [8, 37],
            [42, 37],
          ].map(([x, y]) => (
            <rect key={`h${x}-${y}`} x={x - 3} y={y - 3} width={6} height={6} {...F} />
          ))}
          <path d="M20 16v19l5-5 4 9 4-2-4-9h7z" {...F} />
          <path d="M42 33v20l5-5 4 9 4-2-4-9h7z" {...S} strokeWidth={2} />
          <rect x={22} y={48} width={15} height={7} {...F} />
        </>
      );
    case "seats": // a screen above three rows of seats, two of them held together, one taken
      return (
        <>
          <path d="M11 14q21-7 42 0" {...S} />
          {[22, 33, 44].map((y) =>
            [11, 22, 33, 44].map((x) =>
              y === 33 && (x === 22 || x === 33) ? (
                <rect key={`${x}-${y}`} x={x} y={y} width={9} height={8} {...F} />
              ) : y === 44 && x === 44 ? (
                <rect key={`${x}-${y}`} x={x} y={y} width={9} height={8} {...F} opacity={0.4} />
              ) : (
                <rect key={`${x}-${y}`} x={x + 0.5} y={y + 0.5} width={8} height={7} {...S} strokeWidth={1.8} />
              ),
            ),
          )}
        </>
      );
    case "route": // a takeaway bag at the start of a dashed route that ends at a drop pin
      return (
        <>
          <rect x={9} y={33} width={22} height={21} {...S} />
          <path d="M15 33v-4a5 5 0 0 1 10 0v4" {...S} strokeWidth={2} />
          <path d="M31 47h6a7 7 0 0 0 7-7V31" {...S} strokeWidth={2} strokeDasharray="3 3" />
          <path d="M44 8a8 8 0 0 1 8 8c0 7-8 15-8 15s-8-8-8-15a8 8 0 0 1 8-8z" {...F} />
          <rect x={41.5} y={13.5} width={5} height={5} fill={accent} />
        </>
      );
    case "shield": // a shield carrying a check mark: every payment settled exactly once
      return (
        <>
          <path d="M32 8l20 7v14c0 13-9 21-20 27C21 50 12 42 12 29V15z" {...S} />
          <path d="M22 31l7 7 13-14" {...S} strokeWidth={3.5} />
        </>
      );
    case "upload": // an upload arrow rising out of a film strip
      return (
        <>
          <rect x={9} y={34} width={46} height={22} {...S} />
          {[13, 22, 31, 40, 49].map((x) => (
            <g key={x}>
              <rect x={x - 1} y={36.5} width={4} height={2.5} {...F} />
              <rect x={x - 1} y={51} width={4} height={2.5} {...F} />
            </g>
          ))}
          <rect x={13} y={41.5} width={17} height={7} {...F} opacity={0.75} />
          <rect x={34} y={41.5} width={17} height={7} {...F} opacity={0.75} />
          <path d="M32 27V8M22 18l10-10 10 10" {...S} strokeWidth={3} />
        </>
      );
    case "carets": // a page of text with a folded corner and two people's carets typing in it
      return (
        <>
          <path d="M13 8h27l11 11v38H13z" {...S} />
          <path d="M40 8v11h11" {...S} strokeWidth={2} />
          <path d="M19 28h11M19 38h26M19 48h17" {...S} strokeWidth={2} opacity={0.7} />
          <rect x={32} y={22} width={2.5} height={11} {...F} />
          <rect x={32} y={18} width={9} height={5} {...F} />
          <rect x={38} y={42} width={2.5} height={11} {...F} />
          <rect x={38.8} y={52.8} width={8} height={4.2} {...S} strokeWidth={1.6} />
        </>
      );
    case "tiles": // a route crossing a 2×2 block of map tiles to a drop pin
      return (
        <>
          <rect x={9} y={21} width={17} height={17} {...S} strokeWidth={1.8} opacity={0.7} />
          <rect x={26} y={21} width={17} height={17} {...S} strokeWidth={1.8} opacity={0.7} />
          <rect x={9} y={38} width={17} height={17} {...S} strokeWidth={1.8} opacity={0.7} />
          <rect x={26} y={38} width={17} height={17} {...S} strokeWidth={1.8} opacity={0.7} />
          <path d="M13 51h9v-9h12v-9h12" {...S} strokeWidth={3} />
          <rect x={10.5} y={48.5} width={5} height={5} {...F} />
          <path d="M47 7a8 8 0 0 1 8 8c0 7-8 15-8 15s-8-8-8-15a8 8 0 0 1 8-8z" {...F} />
          <rect x={44.5} y={12.5} width={5} height={5} fill={accent} />
        </>
      );
    case "gallery": // a camera above a 2×2 gallery of video tiles, the active speaker's tile lit with a level meter
      return (
        <>
          <rect x={12} y={8} width={24} height={15} {...S} />
          <path d="M36 15.5l11-6v12z" {...F} />
          <rect x={9} y={30} width={22} height={13} {...F} />
          <rect x={13} y={36} width={2.5} height={4} fill={accent} />
          <rect x={17.5} y={33} width={2.5} height={7} fill={accent} />
          <rect x={22} y={35} width={2.5} height={5} fill={accent} />
          <rect x={34} y={31} width={20} height={11} {...S} strokeWidth={2} />
          <rect x={10} y={47} width={20} height={11} {...S} strokeWidth={2} />
          <rect x={34} y={47} width={20} height={11} {...S} strokeWidth={2} />
        </>
      );
    case "stay": // a house whose walls are a calendar, three nights in a row booked
      return (
        <>
          <path d="M10 31L32 11l22 20" {...S} />
          <rect x={16} y={30} width={32} height={25} {...S} />
          <rect x={20} y={35} width={6} height={6} {...S} strokeWidth={1.6} />
          <rect x={29} y={35} width={6} height={6} {...F} />
          <rect x={38} y={35} width={6} height={6} {...F} />
          <rect x={20} y={45} width={6} height={6} {...F} />
          <rect x={29} y={45} width={6} height={6} {...S} strokeWidth={1.6} />
          <rect x={38} y={45} width={6} height={6} {...S} strokeWidth={1.6} />
          <rect x={31} y={37} width={2} height={2} fill={accent} />
        </>
      );
    case "stumps": // a ball flying in at three stumps with bails, beside a three-row leaderboard whose top row is lit
      return (
        <>
          <circle cx={21} cy={11} r={5} {...F} />
          <path d="M30 8h7M31 13.5h4" {...S} strokeWidth={1.8} opacity={0.7} />
          <path d="M10 23h6.5M19.5 23h6.5" {...S} strokeWidth={2} />
          <path d="M11 27v27M18 27v27M25 27v27" {...S} />
          <path d="M7 56h22" {...S} strokeWidth={1.8} opacity={0.7} />
          <rect x={35} y={21} width={21} height={8} {...F} />
          <rect x={37.5} y={24} width={2.5} height={2.5} fill={accent} />
          <rect x={35.9} y={34.9} width={15} height={6.2} {...S} strokeWidth={1.8} />
          <rect x={35.9} y={46.9} width={10} height={6.2} {...S} strokeWidth={1.8} />
        </>
      );
    case "ring": // a phone ringing between two pairs of ring waves, a verdict banner across its screen
      return (
        <>
          <rect x={20} y={8} width={24} height={48} {...S} />
          <rect x={23} y={13} width={18} height={9} {...F} />
          <rect x={25.5} y={16} width={3} height={3} fill={accent} />
          <path d="M25 29h14M25 35h9" {...S} strokeWidth={1.8} opacity={0.7} />
          <rect x={29} y={48} width={6} height={3} {...F} />
          <path d="M49 22a9 9 0 0 1 0 14M53.5 18a15 15 0 0 1 0 22" {...S} strokeWidth={2} />
          <path d="M15 22a9 9 0 0 0 0 14M10.5 18a15 15 0 0 0 0 22" {...S} strokeWidth={2} />
        </>
      );
    case "tag": // a price tag beside a clock whose hand points at midnight
      return (
        <>
          <circle cx={44} cy={14} r={8.5} {...S} strokeWidth={2} />
          <path d="M44 14V8.5" {...S} strokeWidth={2} />
          <path d="M8 30h30l12 12-12 12H8z" {...S} />
          <rect x={39} y={39.5} width={5} height={5} {...F} />
          <path d="M14 38h16M14 46h10" {...S} strokeWidth={2} opacity={0.7} />
        </>
      );
    case "mail": // an envelope carrying an accepted badge with a tick
      return (
        <>
          <rect x={8} y={14} width={44} height={30} {...S} />
          <path d="M8 14l22 17 22-17" {...S} strokeWidth={2} />
          <rect x={38} y={36} width={18} height={18} {...F} />
          <path d="M42 45l3.5 3.5 6.5-7" fill="none" stroke={accent} strokeWidth={2.5} strokeLinecap="square" />
        </>
      );
    case "branch": // a branch leaving main and merging back, the merge commit lit
      return (
        <>
          <path d="M22 6v52" {...S} />
          <path d="M22 18l18 10v10L22 48" {...S} />
          <rect x={17} y={8} width={10} height={10} {...F} />
          <rect x={35} y={23} width={10} height={10} {...F} />
          <rect x={36.25} y={36.25} width={7.5} height={7.5} fill={accent} stroke={ink} strokeWidth={2.5} />
          <rect x={17} y={46} width={10} height={10} {...F} />
          <rect x={20} y={49} width={4} height={4} fill={accent} />
        </>
      );
    case "swipe": // a full-screen video with a play mark and a progress bar, the next one stacked behind, a swipe-up arrow
      return (
        <>
          <path d="M13 14v38" {...S} strokeWidth={2} opacity={0.5} />
          <rect x={18} y={6} width={28} height={52} {...S} />
          <path d="M28 21v15l12-7.5z" {...F} />
          <path d="M24 47h16" {...S} strokeWidth={2} opacity={0.5} />
          <rect x={24} y={45.75} width={9} height={2.5} {...F} />
          <path d="M53 42V20M48 25l5-5 5 5" {...S} strokeWidth={2} />
        </>
      );
    case "voice": // a speaker sending sound waves over a row of four avatars, the one talking lit
      return (
        <>
          <path d="M10 15h7l9-7v26l-9-7h-7z" {...S} />
          <path d="M32 15a7 7 0 0 1 0 12M37 10a14 14 0 0 1 0 22" {...S} strokeWidth={2} />
          <rect x={8} y={44} width={9} height={9} {...S} strokeWidth={2} />
          <rect x={21} y={44} width={9} height={9} {...S} strokeWidth={2} />
          <rect x={33} y={43} width={11} height={11} {...F} />
          <rect x={36} y={46} width={5} height={5} fill={accent} />
          <rect x={48} y={44} width={9} height={9} {...S} strokeWidth={2} />
        </>
      );
    case "peer": // a buyer's phone and a shop under an awning, a sealed message passing both ways between them
      return (
        <>
          <rect x={7} y={16} width={15} height={30} {...S} />
          <rect x={12} y={40} width={5} height={2.5} {...F} />
          <path d="M40 22h18l-2 7H42z" {...HF} />
          <path d="M42 29v17h14V29" {...S} />
          <path d="M47 46v-8h4v8" {...S} strokeWidth={2} />
          <path d="M25 26h12M33 22l4 4-4 4M37 38H25M29 34l-4 4 4 4" {...H} strokeWidth={2} />
          <rect x={27.5} y={51} width={7} height={7} {...F} />
          <rect x={29.75} y={53.25} width={2.5} height={2.5} fill={accent} />
        </>
      );
    case "ladder": // an order book: asks stepping down to the last-trade line, bids filled below it
      return (
        <>
          <path d="M32 7v50" {...S} strokeWidth={1.8} opacity={0.5} />
          <path d="M34 9h12M34 17h17M34 25h22" {...S} />
          <rect x={6} y={30.5} width={52} height={3} {...HF} />
          <rect x={27} y={29} width={10} height={6} fill={accent} stroke={hi} strokeWidth={2} />
          <rect x={8} y={39} width={22} height={4} {...F} />
          <rect x={13} y={47} width={17} height={4} {...F} />
          <rect x={18} y={55} width={12} height={4} {...F} />
        </>
      );
    case "cart": // a shopping cart carrying one parcel, a single tick above it: one order, placed once
      return (
        <>
          <path d="M7 14h7l6 27h28l6-20H17" {...S} />
          <rect x={24} y={22} width={15} height={13} {...HF} />
          <path d="M24 28.5h15" stroke={accent} strokeWidth={1.5} />
          <rect x={20} y={46} width={6} height={6} {...F} />
          <rect x={42} y={46} width={6} height={6} {...F} />
          <path d="M41 9l4 4 8-8" {...S} strokeWidth={2.5} />
        </>
      );
    case "toll": // a barrier arm lifting over the lane, a windscreen tag answering the reader with radio waves
      return (
        <>
          <rect x={9} y={32} width={9} height={22} {...S} />
          <path d="M18 36L50 14" {...H} strokeWidth={4} />
          <rect x={33} y={36} width={16} height={11} {...F} />
          <rect x={37} y={39.5} width={4} height={4} fill={accent} />
          <path d="M51 31a7 7 0 0 1 7 7M51 26a12 12 0 0 1 9 5" {...S} strokeWidth={2} />
          <path d="M6 57h52" {...S} />
        </>
      );
    case "channels": // a sidebar of channels, one in bold with an unread badge, one message being typed
      return (
        <>
          <rect x={8} y={9} width={48} height={46} {...S} />
          <rect x={14} y={17} width={22} height={4} {...F} opacity={0.55} />
          <rect x={14} y={28} width={27} height={6} {...F} />
          <rect x={45} y={27} width={8} height={8} {...HF} />
          <rect x={14} y={41} width={18} height={4} {...F} opacity={0.55} />
          <rect x={35} y={41} width={2.5} height={7} {...F} />
        </>
      );
    case "grid": // a story ring around an avatar above a square photo grid
      return (
        <>
          <circle cx={32} cy={17} r={10} {...S} />
          <circle cx={32} cy={17} r={5.5} {...F} />
          {[
            [9, 33, 1],
            [25, 33, 0],
            [41, 33, 1],
            [9, 46, 0],
            [25, 46, 1],
            [41, 46, 0],
          ].map(([x, y, f]) =>
            f ? <rect key={`${x}-${y}`} x={x} y={y} width={14} height={11} {...F} /> : <rect key={`${x}-${y}`} x={x + 1} y={y + 1} width={12} height={9} {...S} strokeWidth={2} />,
          )}
        </>
      );
  }
}

type Art = { body: string; viewBox: [number, number, number, number] };
/** full-colour logos (Gil Barbara) and single-colour marks (Simple Icons), by name */
const ART: Record<QuestLogo["from"], Record<string, Art>> = {
  gb: LOGOS_JSON as unknown as Record<string, Art>,
  si: MARKS_JSON as unknown as Record<string, Art>,
};

const MIDDLE: [number, number, number, number] = [12.8, 12.8, 38.4, 38.4];

export default function QuestEmblem({ brand, size = 72, className = "" }: { brand: QuestBrand; size?: number; className?: string }) {
  // ids in the logos (gradients, reused paths) are made unique per tile drawn: a page shows many tiles
  const uid = `q${brand.n}${useId().replace(/[^A-Za-z0-9]/g, "")}-`;
  const logos = (brand.logos ?? []).map((l) => ({ l, art: ART[l.from][l.name] })).filter((x) => x.art);
  const g = brand.tileGradient;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`block shrink-0 ${className}`}
    >
      {g && (
        <defs>
          {g.kind === "linear" ? (
            <linearGradient id={`${uid}tile`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
              {g.stops.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </linearGradient>
          ) : (
            <radialGradient id={`${uid}tile`} cx={g.cx} cy={g.cy} r={g.r}>
              {g.stops.map(([o, c]) => (
                <stop key={o} offset={o} stopColor={c} />
              ))}
            </radialGradient>
          )}
        </defs>
      )}
      <rect width={64} height={64} fill={brand.tile} />
      {g && <rect width={64} height={64} fill={`url(#${uid}tile)`} />}
      {logos.length ? (
        logos.map(({ l, art }) => {
          const [bx, by, bw, bh] = l.box ?? MIDDLE;
          // the logo fitted into its box, centred; the nested svg is exactly that rect, so it clips to the
          // logo's own viewBox: a cropped logo (Dream11's trophy, UPI without its subtitle) shows nothing else
          const [, , vw, vh] = art.viewBox;
          const k = Math.min(bw / vw, bh / vh);
          const [w, h] = [vw * k, vh * k];
          return (
            <svg
              key={l.name}
              x={+(bx + (bw - w) / 2).toFixed(3)}
              y={+(by + (bh - h) / 2).toFixed(3)}
              width={+w.toFixed(3)}
              height={+h.toFixed(3)}
              viewBox={art.viewBox.join(" ")}
              overflow="hidden"
              color={brand.ink}
              dangerouslySetInnerHTML={{ __html: art.body.replaceAll("__Q__", uid) }}
            />
          );
        })
      ) : (
        <>
          <rect x={3} y={3} width={58} height={58} fill="none" stroke={brand.ink} strokeOpacity={0.28} strokeWidth={1} />
          {glyph(brand.emblem, brand.ink, brand.tile, brand.hi ?? brand.ink)}
        </>
      )}
      {/* a hairline edge in the theme's line colour, so white tiles hold their shape on the light theme and black ones on the dark */}
      <rect x={0.5} y={0.5} width={63} height={63} fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ stroke: "var(--c-line-strong, rgba(128,128,128,0.45))" }} />
    </svg>
  );
}
