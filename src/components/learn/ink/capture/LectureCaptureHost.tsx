"use client";

/**
 * Capture on a lecture page: snip a frame of the lecture (S, or the player's Snip button) into the notebook, or have it
 * explained. The page's <main> is the content root. The player marks its stage with the moment on screen
 * (data-hk-lecture / -scene / -step / -at), which the snip's link back (?t=) and "Explain this" read; it pauses while
 * the learner snips, so the frame and the narration match.
 */
import { useEffect, useRef } from "react";
import CaptureHost from "./CaptureHost";

export default function LectureCaptureHost({ title }: { title: string }) {
  const root = useRef<Element | null>(null);
  useEffect(() => {
    root.current = document.querySelector("main");
  }, []);
  return <CaptureHost rootRef={root} title={title} lessonKey={null} />;
}
