/** The course's pixel "S" mark (public/course-brand/icon.svg, the favicon and app icon), drawn crisp at any size. */
export default function CourseMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden className={`shrink-0 ${className}`}>
      <rect width="16" height="16" fill="#000" />
      <g fill="#F3F2EE">
        <rect x="3" y="3" width="5" height="2" />
        <rect x="2" y="4" width="2" height="3" />
        <rect x="3" y="7" width="4" height="2" />
        <rect x="6" y="8" width="2" height="4" />
        <rect x="2" y="11" width="5" height="2" />
      </g>
      <rect x="10" y="6" width="4" height="7" fill="#FF6B2B" />
    </svg>
  );
}
