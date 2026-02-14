"use client";

import { useRef } from "react";
import ReadAloud from "./ReadAloud";

type StoryContentWrapperProps = {
  htmlContent: string;
};

export default function StoryContentWrapper({
  htmlContent,
}: StoryContentWrapperProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={contentRef} className="md-content">
        <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
      <ReadAloud contentRef={contentRef} />
    </>
  );
}
