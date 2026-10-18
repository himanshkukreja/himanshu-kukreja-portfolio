// Server-only: story markdown → the article HTML + checkpoints StoryReader shows. Shared by the public
// reader (/stories/[slug]) and the admin CMS preview, so a draft previews exactly as it will publish.
import { renderLessonDetailed, type RenderStats } from "@/lib/course/render";
import type { TermsOpts } from "@/lib/course/terms";
import { extractHeadings, addHeadingIds } from "@/lib/toc";
import { markdownToHtml } from "@/lib/markdown";
import type { Checkpoint } from "./StoryReader";
import type { TocItem } from "@/lib/course/types";

/** "Crisis Scenario: The 10 Seconds That Decide Everything" → "The 10 Seconds That Decide Everything" */
export function checkpointLabel(text: string): string {
  const i = text.indexOf(": ");
  if (i > 0 && i < text.length - 2) {
    const rest = text.slice(i + 2).trim();
    if (rest.length >= 8) return rest;
  }
  return text;
}

export type RenderedStory = { htmlContent: string; checkpoints: Checkpoint[]; toc: TocItem[]; stats: RenderStats | null };

/** Stories go through the same rich renderer as course lessons; the plain pipeline stays as a fallback. */
export async function renderStoryBody(markdown: string, opts: { terms?: TermsOpts } = {}): Promise<RenderedStory> {
  const rendered = markdown ? await renderLessonDetailed(markdown, { kind: "day-content", terms: opts.terms }).catch(() => null) : null;
  if (rendered) {
    const { lesson, stats } = rendered;
    return {
      htmlContent: lesson.html,
      checkpoints: lesson.toc.filter((t) => t.level === 2).map((t) => ({ id: t.id, label: checkpointLabel(t.text) })),
      toc: lesson.toc,
      stats,
    };
  }
  const htmlContent = addHeadingIds(await markdownToHtml(markdown));
  return {
    htmlContent,
    checkpoints: extractHeadings(htmlContent)
      .filter((h) => h.level === 2)
      .map((h) => ({ id: h.id, label: checkpointLabel(h.text) })),
    toc: [],
    stats: null,
  };
}
