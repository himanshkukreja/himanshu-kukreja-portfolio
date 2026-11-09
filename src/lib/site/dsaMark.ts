/**
 * DSA Mastery's mark, "the index": an array of three cells with an index pointer under the middle one, the cell it
 * points at lit teal (arr[i]). The course mark's language (square white blocks on a black tile, one accent block,
 * see courseMark.ts), drawn as the first thing every DSA lesson draws. viewBox 0 0 100 100; the header and page
 * marks (components/dsa/DsaMark) and the share card (lib/og/dsa-card) all draw these shapes, so they never drift.
 */
export const DSA_MARK = {
  /** the white cells either side */
  cells: [
    { x: 8, y: 14, w: 26, h: 28 },
    { x: 66, y: 14, w: 26, h: 28 },
  ],
  /** the teal cell: the one the pointer is on */
  accent: { x: 37, y: 14, w: 26, h: 28 },
  /** the pointer: an arrow head (polygon points) and its stem */
  pointer: { head: "50,50 68,70 32,70", stem: { x: 44, y: 68, w: 12, h: 20 } },
} as const;

/** The mark's fixed colours (it sits on its own black tile in every theme, like the course mark). */
export const DSA_MARK_COLORS = { tile: "#000000", ink: "#F3F2EE", accent: "#2DD4BF" } as const;
