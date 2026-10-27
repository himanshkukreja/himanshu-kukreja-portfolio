"use client";

/** /learn/shorts/<id>: in record mode (the exporter) the portrait stage; otherwise straight into the shorts feed. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lecture } from "@/lib/learn/lecture/types";
import LecturePlayer from "./LecturePlayer";

export default function ShortRecord({ lecture, source, mediaBase }: { lecture: Lecture; source: string; mediaBase: string | null }) {
  const router = useRouter();
  const [record, setRecord] = useState<boolean | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {
      const r = new URLSearchParams(window.location.search).has("record");
      setRecord(r);
      if (!r) router.replace(`/learn/shorts?v=${encodeURIComponent(lecture.quest)}`);
    }, 0);
    return () => window.clearTimeout(id);
  }, [lecture.quest, router]);
  return record ? <LecturePlayer lecture={lecture} quest={null} source={source} mediaBase={mediaBase} /> : null;
}
