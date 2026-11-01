/**
 * The chapter-segmented progress track shared by the site's own video players (the lecture player
 * and the guide-video player): one segment per chapter with a 2 px gap between, like the big video
 * sites. The segment under the pointer grows, each fills in signal orange as the playhead passes,
 * and a lighter fill shows what has buffered. Put it inside the seek slider, which owns the
 * pointer and keyboard handling and must carry Tailwind's `group` class (hover thickens the track
 * and shows the knob) and `relative`.
 */

export type Segment = {
  key: string | number;
  /** seconds */
  start: number;
  end: number;
  /** the unplayed track's background class, when this segment differs (e.g. a lecture checkpoint) */
  tone?: string;
};

export default function ChapterSegments({
  segments,
  time,
  duration,
  hoverTm = null,
  buffered = 0,
  track = "bg-surface-2",
  bufferTone = "bg-white/35",
  active = false,
}: {
  segments: readonly Segment[];
  time: number;
  duration: number;
  /** the moment under the pointer: its segment grows */
  hoverTm?: number | null;
  /** seconds buffered ahead (0: not shown) */
  buffered?: number;
  /** the unplayed track's background class */
  track?: string;
  bufferTone?: string;
  /** dragging: every segment thick and the knob shown */
  active?: boolean;
}) {
  const d = Math.max(1, duration);
  const frac = (s: Segment, x: number) => Math.max(0, Math.min(1, (x - s.start) / Math.max(0.01, s.end - s.start)));
  return (
    <>
      {segments.map((s) => {
        const hot = hoverTm != null && hoverTm >= s.start && hoverTm < s.end;
        return (
          <div
            key={s.key}
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 overflow-hidden transition-[height] motion-reduce:transition-none ${hot ? "h-2" : active ? "h-1.5" : "h-1 group-hover:h-1.5"} ${s.tone ?? track}`}
            style={{ left: `calc(${(s.start / d) * 100}% + 1px)`, width: `calc(${((s.end - s.start) / d) * 100}% - 2px)` }}
          >
            {buffered > 0 && <div className={`absolute inset-y-0 left-0 ${bufferTone}`} style={{ width: `${frac(s, buffered) * 100}%` }} />}
            <div className="relative h-full bg-signal" style={{ width: `${frac(s, time) * 100}%` }} />
          </div>
        );
      })}
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_10px_rgba(255,107,43,0.7)] transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{ left: `${(Math.min(time, d) / d) * 100}%` }}
      />
    </>
  );
}
