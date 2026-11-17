import { GATE_ON } from "./flag";
import { gateHtml, gateStagedHtml, type GateResult } from "./split";
import { stepOfStage, type LessonKind } from "@/lib/dsa/lesson-steps";

/** An article's rendered HTML with its gated part marked (src/lib/gate/split.ts), or as it was while the gate is off. */
export function gateArticle(html: string): GateResult {
  return GATE_ON ? gateHtml(html) : { html, gated: false, open: 1 };
}

/** A DSA lesson: the cut is a share of its Learn stages; Try it and Check are behind the card too (see gateStagedHtml). */
export function gateLesson(html: string, kind: LessonKind): GateResult {
  return GATE_ON ? gateStagedHtml(html, (s) => stepOfStage(kind, s) === "learn") : { html, gated: false, open: 1 };
}
