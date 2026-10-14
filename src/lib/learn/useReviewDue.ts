"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { REVIEW_CHANGED_EVENT, loadReviewCards, localDate, type ReviewCard } from "./review";

/**
 * Due review cards, shared by the learn sub-nav badge, the hub's standup card and the profile.
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

export function useReviewCards() {
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
  const due = cards ? cards.filter((c) => c.dueAt <= today) : [];
  return { ready: cards !== null, cards: cards || [], due, dueCount: due.length };
}
