import { COURSE_MARK as M } from "@/lib/site/courseMark";

/** The course's mark (public/course-brand/icon.svg, the favicon and app icon): white block wired to an orange one. */
export default function CourseMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" shapeRendering="crispEdges" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="100" height="100" fill="#000" />
      {[...M.wire, M.from].map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill="#F3F2EE" />
      ))}
      <rect x={M.to.x} y={M.to.y} width={M.to.w} height={M.to.h} fill="#FF6B2B" />
    </svg>
  );
}
