"use client";

/** The paper under the ink, as SVG in page units (scales crisply with the view). Same geometry as render.ts. */
import { memo } from "react";
import { paperSpec, SHEET, type InkTheme } from "@/lib/learn/ink/render";
import { PAGE_H, PAGE_W, type Paper as PaperKind } from "@/lib/learn/ink/types";

function Paper({ paper, theme }: { paper: PaperKind; theme: InkTheme }) {
  const c = SHEET[theme];
  const spec = paperSpec(paper);
  const pid = `ink-dots-${paper}-${theme}`;
  return (
    <svg aria-hidden width={PAGE_W} height={PAGE_H} viewBox={`0 0 ${PAGE_W} ${PAGE_H}`} className="absolute left-0 top-0 block" style={{ shapeRendering: "crispEdges" }}>
      <rect width={PAGE_W} height={PAGE_H} fill={c.bg} />
      {spec.dots && (
        <>
          <defs>
            <pattern id={pid} x={spec.dots.x0 - spec.dots.gap / 2} y={spec.dots.y0 - spec.dots.gap / 2} width={spec.dots.gap} height={spec.dots.gap} patternUnits="userSpaceOnUse">
              <rect x={spec.dots.gap / 2 - spec.dots.r} y={spec.dots.gap / 2 - spec.dots.r} width={spec.dots.r * 2} height={spec.dots.r * 2} fill={paper === "interview" ? c.line : c.strong} />
            </pattern>
          </defs>
          <rect width={PAGE_W} height={PAGE_H} fill={`url(#${pid})`} />
        </>
      )}
      {spec.lines.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.tone === "margin" ? c.margin : l.tone === "strong" ? c.strong : l.tone === "faint" ? c.faint : c.line} strokeWidth={l.tone === "line" || l.tone === "faint" ? 1.1 : 1.6} />
      ))}
      {spec.boxes.map((b) => (
        <g key={b.label}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c.bg} stroke={c.strong} strokeWidth={2} />
          <text x={b.x + 14} y={b.y + 28} fill={c.label} fontSize={15} fontWeight={600} fontFamily='ui-monospace, "SF Mono", Menlo, monospace' style={{ letterSpacing: "0.06em" }}>
            {b.label.toUpperCase()}
          </text>
        </g>
      ))}
      {spec.labels.map((t) => (
        <text key={t.text} x={t.x} y={t.y} fill={c.label} fontSize={15} fontWeight={600} fontFamily='ui-monospace, "SF Mono", Menlo, monospace' style={{ letterSpacing: "0.06em" }}>
          {t.text}
        </text>
      ))}
    </svg>
  );
}

export default memo(Paper);
