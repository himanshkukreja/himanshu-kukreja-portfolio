/**
 * The stylesheet the lesson shell generates: OneStage's mechanism (hide every beat outside the shown set with CSS, so
 * the lesson stays one server-rendered DOM and highlights, Listen, the progress engine and the hydrators keep working),
 * generalised from "one stage" to the step groups of lib/dsa/lesson-steps.ts. Hidden beats have no height, so reading
 * time only counts for what is on screen.
 */
import { hideStagesCss } from "@/lib/dsa/lesson-steps";

export function stepCss(opts: { visible: string[]; foldedStage?: string | null }): string {
  return (
    hideStagesCss(opts.visible) +
    // the practice ladder inside the closing beat is the Practice step's list now
    `[data-dsa-one] #practice-ladder,[data-dsa-one] #practice-ladder + .sd-table{display:none!important}` +
    // a folded beat (a concept's edge cases) shows only its header until "Show edge cases"
    (opts.foldedStage ? `[data-dsa-one] section[data-sd="stage"][data-stage-id="${opts.foldedStage.replace(/[^a-z0-9_-]/gi, "")}"]>:not(header){display:none!important}` : "")
  );
}
