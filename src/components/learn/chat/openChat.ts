"use client";

/** Open the course chat panel from anywhere (the lesson's Ask AI pill, "Ask here" on a selection, the FAB). */
import { holdSelection } from "./pageContext";

export const COURSE_CHAT_EVENT = "hk:course-chat";
/** The cross-feature contract: tutor:open { prompt?, context?: { kind: "selection", text, href, heading? }, send? } */
export const TUTOR_OPEN_EVENT = "tutor:open";
export type OpenChatDetail = { q?: string; send?: boolean; selection?: string };

export function openCourseChat(d: OpenChatDetail = {}) {
  if (d.selection) holdSelection(d.selection);
  window.dispatchEvent(new CustomEvent<OpenChatDetail>(COURSE_CHAT_EVENT, { detail: d }));
}
