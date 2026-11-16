"use client";

/**
 * "Your tutor · where you left off": two or three plain sentences from the learner's own progress and submit history (no
 * AI call, so it costs nothing), plus "Ask about this lesson". Signed-in learners whose memory is on only; otherwise it is
 * hidden (the header's Ask still opens the tutor).
 */
import { useEffect, useMemo, useState } from "react";
import { userFetch } from "@/components/learn/progress/userFetch";
import { useAuth } from "@/contexts/AuthContext";
import { openCourseChat } from "@/components/learn/chat/openChat";
import { track } from "@/lib/track";
import type { NextStep } from "@/lib/dsa/continue";
import { leftOffText, type PracticeRef } from "@/lib/dsa/left-off";
import { useResolves } from "../revise/useResolves";
import { BTN_SECONDARY, KICKER, SIDE_CARD, SM } from "../ui/kit";

export type { PracticeRef };

export default function TutorCard({ next, problems }: { next: NextStep; /** the practice problems of the lesson Continue is on */ problems: PracticeRef[] }) {
  const { user, loading } = useAuth();
  const r = useResolves();
  const [memory, setMemory] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user) return;
    let off = false;
    userFetch("/api/learn/ai/chat/memory")
      .then(async (res) => (res.ok ? ((await res.json()) as { available?: boolean; paused?: boolean }) : null))
      .then((b) => !off && setMemory(!!b?.available && !b.paused))
      .catch(() => !off && setMemory(false));
    return () => {
      off = true;
    };
  }, [user]);

  const text = useMemo(() => {
    if (next.state !== "continue") return "";
    const fails: Record<string, Record<string, number>> = {};
    for (const i of [...r.due, ...r.upcoming, ...r.done]) fails[i.id] = i.fails;
    const nextTitle = next.step === "practice" ? next.label.replace(/^Continue: /, "") : null;
    return leftOffText({ lesson: next.lessonTitle, solved: next.practice.solved, total: next.practice.total, problems, fails, nextTitle });
  }, [next, r.due, r.upcoming, r.done, problems]);

  if (loading || !user || !memory || next.state !== "continue" || !r.ready) return null;
  return (
    <section aria-labelledby="dsa-tutor-h" className={SIDE_CARD}>
      <h2 id="dsa-tutor-h" className={KICKER}>
        Your tutor · where you left off
      </h2>
      <p className="m-0 text-[14px] leading-[1.55] text-fg-2">{text}</p>
      <button
        type="button"
        onClick={() => {
          track("dsa_home_ask", { lesson: next.lessonId });
          openCourseChat({ q: `Help me with the lesson "${next.lessonTitle}"` });
        }}
        className={`${BTN_SECONDARY} ${SM} self-start`}
      >
        Ask about this lesson
      </button>
    </section>
  );
}
