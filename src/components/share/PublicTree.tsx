"use client";

/** The course hub's skill tree, read-only, fed by a public profile (no links, no world sheet). */
import { useMemo } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";
import { weekStates, type LessonProgress } from "@/lib/learn/progress";
import { SkillTreeList, SkillTreeRows } from "@/components/learn/hub/SkillTree";
import type { PublicProfile } from "@/lib/share/model";

export default function PublicTree({ map, tree }: { map: CourseMap; tree: NonNullable<PublicProfile["tree"]> }) {
  const { states, lessons, currentKey } = useMemo(() => {
    const lessons: Record<string, LessonProgress> = {};
    Object.entries(tree.lessons).forEach(([k, l]) => {
      lessons[k] = { status: l.status, pct: l.status === "completed" ? 100 : 0, completedStages: [], lastStage: null, lastAt: 0 };
    });
    // weekStates reads bosses and trial parts from game keys; rebuild just those
    const done: Record<string, number> = {};
    tree.boss.forEach((w) => (done[`boss:${w}`] = 1));
    map.weeks.forEach((w) => (tree.trials[w.key] || []).forEach((n) => (done[`trial:${w.trial?.week || w.key}/part-${n}`] = 1)));
    const states = weekStates(map, lessons, done, tree.currentWeek);
    const cur = map.weeks.find((w) => w.key === tree.currentWeek);
    const next = cur ? [...cur.lessons, ...(cur.boss ? [cur.boss] : [])].find((l) => lessons[lessonKey(l.week, l.slug)]?.status !== "completed") : null;
    return { states, lessons, currentKey: next ? lessonKey(next.week, next.slug) : null };
  }, [map, tree]);

  return (
    <>
      <div className="hidden lg:block">
        <SkillTreeRows readOnly states={states} lessons={lessons} currentKey={currentKey} currentWeek={tree.currentWeek} selected="" />
      </div>
      <div className="lg:hidden">
        <SkillTreeList readOnly states={states} lessons={lessons} currentKey={currentKey} currentWeek={tree.currentWeek} />
      </div>
    </>
  );
}
