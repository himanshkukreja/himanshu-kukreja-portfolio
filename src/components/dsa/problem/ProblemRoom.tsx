"use client";

/**
 * The problem room (plan §7.2), split in the Nov 2026 redesign: useProblemRoom holds the state (judge calls, solve
 * recording, hint ladder, editorial reveal), ProblemShell lays out the page (ProblemHeader, ProblemTabs, EditorPane,
 * ResultsPanel, drawers for the tutor and the interview). The beginner pass is kept: the first-problem walkthrough
 * (FirstProblemGuide), "Explain this problem simply", plain-language errors and jargon tooltips.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import "../dsa.css";
import type { ProblemPage } from "@/lib/dsa/types";
import ProblemShell from "./ProblemShell";
import { useProblemRoom, type ProblemPosition, type VideoTeaser } from "./useProblemRoom";

export type { VideoTeaser, ProblemPosition };

export default function ProblemRoom({ p, videoTeaser = null, position = null }: { p: ProblemPage; videoTeaser?: VideoTeaser | null; position?: ProblemPosition | null }) {
  const room = useProblemRoom(p, videoTeaser);
  return <ProblemShell room={room} position={position} />;
}
