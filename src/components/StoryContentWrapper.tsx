"use client";

import { useMemo, useRef, type RefObject } from "react";
import ReadAloud from "./ReadAloud";

type StoryContentWrapperProps = {
  htmlContent: string;
  /** Share the content element with the caller (checkpoints, read-aloud bridge). */
  contentRef?: RefObject<HTMLDivElement | null>;
  /** Class for the content element; defaults to the legacy `md-content`. */
  className?: string;
  /** Render the floating ReadAloud controls here (default). Pass false when the caller docks them itself. */
  withReadAloud?: boolean;
};

export default function StoryContentWrapper({
  htmlContent,
  contentRef,
  className = "md-content",
  withReadAloud = true,
}: StoryContentWrapperProps) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = contentRef || ownRef;
  // Stable object: React 19 re-applies innerHTML whenever this prop object changes, which would
  // re-inject the whole article (and re-render its diagrams) on every parent re-render, e.g. on scroll.
  const html = useMemo(() => ({ __html: htmlContent }), [htmlContent]);

  return (
    <>
      <div ref={ref} className={className}>
        <div dangerouslySetInnerHTML={html} />
      </div>
      {withReadAloud && <ReadAloud contentRef={ref} />}
    </>
  );
}
