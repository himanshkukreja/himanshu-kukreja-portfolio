/**
 * Course renderer output for a block of markdown inside another page (a war story's body, a mock
 * interview's brief, problem and model answers): the lesson renderer without the stage wrapper and its
 * "Lesson · N min" header. Shared by those pages' loaders and scripts/listen (the narration generator
 * has to read exactly what the page shows).
 */
import { renderLesson } from "./render";
import type { DsaRenderOpts } from "./detect/dsa";

/** `dsa`: render options for a block that uses code tabs or clips (src/lib/course/sdm-extras.ts). */
export async function renderBlockHtml(md: string, dsa?: DsaRenderOpts): Promise<string> {
  if (!md.trim()) return "";
  const r = await renderLesson(md, { kind: "day-content", ...(dsa ? { dsa } : {}) });
  return r.html
    .replace(/<header class="sd-stage-head"[\s\S]*?<\/header>/g, "")
    .replace(/<section data-sd="stage"[^>]*>/g, "")
    .replace(/<\/section>\s*$/g, "");
}
