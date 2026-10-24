import { getCourseMap } from "@/lib/learn/course";
import { getAllStories } from "@/lib/stories";
import { SITE_URL } from "@/lib/site";

// Static, refreshed daily: a plain-text map of the site for AI assistants (llmstxt.org).
export const revalidate = 86400;

export async function GET() {
  const [map, stories] = await Promise.all([getCourseMap().catch(() => null), getAllStories().catch(() => [])]);
  const lines: string[] = [
    "# Himanshu Kukreja",
    "",
    "> Backend engineer. Author of System Design Mastery, a free system design course (lessons, interview bosses, trials, mock interviews, side quests on real systems such as UPI, IRCTC Tatkal, Zerodha and Netflix), and of engineering case files on real outages and designs.",
    "",
    "## Main pages",
    `- [System Design Mastery course](${SITE_URL}/learn/system-design-mastery): the full course map`,
    `- [Case files](${SITE_URL}/stories): outages and design write-ups`,
    `- [Projects](${SITE_URL}/projects): open-source and product work`,
    "",
  ];
  if (map) {
    for (const w of map.weeks) {
      lines.push(`## Week ${w.code}: ${w.title}`);
      for (const l of [...w.lessons, ...(w.boss ? [w.boss] : [])]) lines.push(`- [${l.title}](${SITE_URL}${l.href})`);
      lines.push("");
    }
    lines.push("## Side quests: real systems");
    for (const l of map.sideQuests) lines.push(`- [${l.title}](${SITE_URL}${l.href})`);
    lines.push("");
  }
  if (stories.length) {
    lines.push("## Case files");
    for (const s of stories) lines.push(`- [${s.title}](${SITE_URL}/stories/${s.slug})${s.excerpt ? `: ${s.excerpt}` : ""}`);
    lines.push("");
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
