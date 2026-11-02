/**
 * The course's mark (public/course-brand/icon.svg): a tiny architecture diagram, a white block wired
 * to a signal-orange block, on a black tile. viewBox 0 0 100 100; the same shapes everywhere (header,
 * share cards, favicon, app icons) so they never drift.
 */
export const COURSE_MARK = {
  /** the wire: across from the white block, then down into the orange one */
  wire: [
    { x: 30, y: 26, w: 44, h: 8 },
    { x: 66, y: 26, w: 8, h: 44 },
  ],
  from: { x: 14, y: 14, w: 32, h: 32 },
  to: { x: 54, y: 54, w: 32, h: 32 },
} as const;
