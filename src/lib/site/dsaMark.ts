/**
 * DSA Mastery's mark: the course mark's language (square blocks wired together on a black tile, see
 * courseMark.ts) drawn as a tiny binary tree: a white root wired to two children, the right one teal.
 * viewBox 0 0 100 100; the page wordmark (components/dsa/DsaMark) and the share card (lib/og/dsa-card)
 * both draw these shapes, so they never drift.
 */
export const DSA_MARK = {
  /** the wires: the root's stem, the crossbar, and a leg down to each child */
  wire: [
    { x: 47, y: 36, w: 6, h: 16 },
    { x: 22, y: 50, w: 56, h: 6 },
    { x: 22, y: 50, w: 6, h: 14 },
    { x: 72, y: 50, w: 6, h: 14 },
  ],
  /** white blocks: the root and the left child */
  nodes: [
    { x: 37, y: 12, w: 26, h: 26 },
    { x: 12, y: 62, w: 26, h: 26 },
  ],
  /** the teal block: the right child */
  accent: { x: 62, y: 62, w: 26, h: 26 },
} as const;

/** The mark's fixed colours (it sits on its own black tile in every theme, like the course mark). */
export const DSA_MARK_COLORS = { tile: "#000000", ink: "#F3F2EE", accent: "#2DD4BF" } as const;
