"use client";

import { useEffect, useState } from "react";
import type { LessonFaq } from "@/lib/learn/faq/parse";

/** The lesson's "Questions learners ask" (static JSON, cached by the CDN). `week` null: none to load. */
export function useLessonFaq(week: string | null, slug: string): LessonFaq | null {
  const [faq, setFaq] = useState<{ key: string; f: LessonFaq | null } | null>(null);
  const key = `${week}/${slug}`;
  useEffect(() => {
    if (!week) return;
    let off = false;
    fetch(`/api/learn/faq/${week}/${slug}`)
      .then((r) => (r.ok ? (r.json() as Promise<LessonFaq>) : null))
      .then((f) => !off && setFaq({ key, f: f?.items?.length ? f : null }))
      .catch(() => !off && setFaq({ key, f: null }));
    return () => {
      off = true;
    };
  }, [week, slug, key]);
  return faq?.key === key ? faq.f : null;
}
