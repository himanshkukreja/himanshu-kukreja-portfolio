/**
 * Builds the "ask about this moment" request for a side-quest lecture: the system prompt (outline,
 * current scene, what's on screen, the quest's most relevant sections) and the learner's message.
 * Pure, so the route and the prompt test send exactly the same thing.
 */
import type { Lecture } from "@/lib/learn/lecture/types";
import { isQuizLocked, LECTURE_PRESETS, lectureOutline, onScreen, sceneInFull, showableNodes, type LecturePreset } from "@/lib/learn/lecture/moment";
import { lectureQaSystem } from "./prompts";
import { lessonContext } from "./retrieve";

export function buildLectureQa(a: {
  lecture: Lecture;
  questTitle: string;
  questMarkdown: string;
  sceneId: string;
  step: number;
  picked: number | null;
  question: string;
  preset?: LecturePreset | null;
  previous?: { q: string; a: string } | null;
}) {
  const scene = a.lecture.scenes.find((s) => s.id === a.sceneId);
  if (!scene) return null;
  const step = Math.max(0, Math.min(scene.steps.length - 1, Math.floor(a.step) || 0));
  const picked = scene.kind === "quiz" && a.picked != null && a.picked >= 0 && a.picked < (scene.options?.length ?? 0) ? a.picked : null;
  const locked = isQuizLocked(scene, step, picked);
  const ask = [a.question, a.preset ? LECTURE_PRESETS[a.preset].ask : ""].filter(Boolean).join("\n\n") || "Explain this moment.";
  const narration = scene.steps[step]?.say ?? "";
  const system = lectureQaSystem({
    lecture: a.lecture.title,
    quest: a.questTitle,
    outline: lectureOutline(a.lecture, scene.id),
    scene: sceneInFull(scene, step, picked),
    onScreen: onScreen(a.lecture, scene, step, picked),
    showable: showableNodes(scene),
    quizLocked: locked,
    questText: a.questMarkdown ? lessonContext(a.questMarkdown, ask, `${scene.title}. ${narration}`, 9000) : "(not available)",
    previous: a.previous ? { q: a.previous.q.slice(0, 300), a: a.previous.a.slice(0, 700) } : null,
  });
  return { scene, step, system, ask };
}
