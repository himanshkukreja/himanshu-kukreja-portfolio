"use client";

/**
 * /learn/shorts/<id>: in record mode (the exporter, ?record=1) the portrait stage; otherwise the short's
 * own watch page (`children`, server-rendered, so search engines see the video, its transcript and links).
 */
import { useEffect, useState } from "react";
import type { Lecture } from "@/lib/learn/lecture/types";
import LecturePlayer from "./LecturePlayer";

export default function ShortRecord({ lecture, source, mediaBase, children }: { lecture: Lecture; source: string; mediaBase: string | null; children?: React.ReactNode }) {
  const [record, setRecord] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRecord(new URLSearchParams(window.location.search).has("record")), 0);
    return () => window.clearTimeout(id);
  }, []);
  return record ? <LecturePlayer lecture={lecture} quest={null} source={source} mediaBase={mediaBase} /> : <>{children}</>;
}
