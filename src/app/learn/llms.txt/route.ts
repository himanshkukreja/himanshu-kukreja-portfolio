import { getCourseMap } from "@/lib/learn/course";
import { getAllStories } from "@/lib/stories";
import { COURSE_ORIGIN as SITE_URL, PORTFOLIO_ORIGIN } from "@/lib/site/hosts";

// systemdesignmastery.dev/llms.txt (the middleware rewrites it here). Static, refreshed daily: a
// plain-text map of the course for AI assistants (llmstxt.org). The portfolio's is src/app/llms.txt.
export const revalidate = 86400;

export async function GET() {
  const [map, stories] = await Promise.all([getCourseMap().catch(() => null), getAllStories().catch(() => [])]);
  const lines: string[] = [
    "# System Design Mastery",
    "",
    "> A free system design course for backend engineers by Himanshu Kukreja: lessons, interview bosses, trials, mock interviews, lectures and shorts, side quests on real systems such as UPI, IRCTC Tatkal, Zerodha and Netflix, and engineering case files on real outages and designs.",
    "",
    "## Main pages",
    `- [System Design Mastery course](${SITE_URL}/): the full course map`,
    `- [Case files](${SITE_URL}/case-files): outages and design write-ups`,
    `- [Interview prep](${SITE_URL}/prep): companies, questions, problem bank, mock interviews`,
    `- [About the author](${PORTFOLIO_ORIGIN}): Himanshu Kukreja's portfolio and projects`,
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
    for (const s of stories) lines.push(`- [${s.title}](${SITE_URL}/case-files/${s.slug})${s.excerpt ? `: ${s.excerpt}` : ""}`);
    lines.push("");
  }
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
