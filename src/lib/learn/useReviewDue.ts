"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { REVIEW_CHANGED_EVENT, loadReviewCards, localDate, type ReviewCard } from "./review";

/**
 * Due review cards, shared by the course nav badge, the hub's standup card and the profile.
 * One load per change event (module-level de-dupe), not one per component.
 */
let inflight: { key: string; at: number; p: Promise<ReviewCard[]> } | null = null;

function load(key: string): Promise<ReviewCard[]> {
  if (inflight && inflight.key === key && Date.now() - inflight.at < 4000) return inflight.p;
  const p = loadReviewCards()
    .then((r) => r.cards)
    .catch(() => [] as ReviewCard[]);
  inflight = { key, at: Date.now(), p };
  return p;
}

/**
 * `scope` "sdm" (the default: every consumer in System Design Mastery) leaves out DSA Mastery's cards (course_id 'dsa',
 * its own Revise page), so SD Mastery's standup, badges and counts are what they were; "dsa" returns only those.
 */
export function useReviewCards(scope: "sdm" | "dsa" = "sdm") {
  const { user, loading } = useAuth();
  const [cards, setCards] = useState<ReviewCard[] | null>(null);
  const uid = user?.id || "guest";

  useEffect(() => {
    if (loading) return;
    let off = false;
    const run = (force: boolean) => {
      if (force) inflight = null;
      load(uid).then((c) => {
        if (!off) setCards(c);
      });
    };
    run(false);
    const onChange = () => run(true);
    window.addEventListener(REVIEW_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      off = true;
      window.removeEventListener(REVIEW_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [uid, loading]);

  const today = localDate();
  const mine = useMemo(() => (cards ? cards.filter((c) => (scope === "dsa" ? c.courseId === "dsa" : c.courseId !== "dsa")) : null), [cards, scope]);
  const due = mine ? mine.filter((c) => c.dueAt <= today) : [];
  return { ready: mine !== null, cards: mine || [], due, dueCount: due.length };
}
