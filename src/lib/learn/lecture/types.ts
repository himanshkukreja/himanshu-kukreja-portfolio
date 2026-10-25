/** Experimental video lectures (resources/lectures/<quest slug>.json): scenes of diagrams that build up and light up as the narrator speaks. */
export type LectureStep = { say: string; highlight?: string[]; upto?: number; caption?: string };
export type LectureScene = {
  id: string;
  title: string;
  kind: "title" | "numbers" | "flowchart" | "sequence" | "state";
  heading?: string;
  numbers?: { value: string; label: string }[];
  diagram?: string;
  steps: LectureStep[];
};
export type Lecture = { quest: string; title: string; summary: string; scenes: LectureScene[] };

/** The Mermaid source for one step: flowchart/state nodes lit up, or a sequence cut to its first `upto` messages. */
export function stepSource(scene: LectureScene, step: LectureStep): string | null {
  const src = scene.diagram?.trim();
  if (!src) return null;
  if (scene.kind === "sequence") {
    if (!step.upto) return src;
    const lines = src.split("\n");
    const out: string[] = [];
    let shown = 0;
    let open = 0;
    // blocks opened after the cut are dropped whole: their "end" goes too
    let skipped = 0;
    for (const line of lines) {
      const t = line.trim();
      const isMsg = /(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)/.test(t) || /^Note\s/i.test(t);
      const opens = /^(alt|opt|loop|par|critical|break|rect)\b/i.test(t);
      const isEnd = /^end$/i.test(t);
      if (isMsg) {
        if (shown >= step.upto) continue;
        shown++;
      } else if (opens) {
        if (shown >= step.upto) {
          skipped++;
          continue;
        }
        open++;
      } else if (isEnd) {
        if (skipped > 0) {
          skipped--;
          continue;
        }
        if (open > 0) open--; // else it closes a participant box
      } else if (/^(else|and)\b/i.test(t) && shown >= step.upto) continue;
      out.push(line);
    }
    for (; open > 0; open--) out.push("  end");
    return out.join("\n");
  }
  const ids = (step.highlight || []).filter((x) => /^[A-Za-z0-9_]+$/.test(x));
  if (!ids.length) return src;
  return `${src}\n  classDef lit fill:#3a1a08,stroke:#FF6B2B,stroke-width:3px,color:#ffffff\n  class ${ids.join(",")} lit`;
}
