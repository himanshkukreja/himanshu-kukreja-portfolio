import { COURSE_ORIGIN, PORTFOLIO_ORIGIN } from "@/lib/site/hosts";

// himanshukukreja.in/llms.txt: a plain-text map of the portfolio for AI assistants (llmstxt.org).
// The course has its own at systemdesignmastery.dev/llms.txt (src/app/learn/llms.txt/route.ts).
export const dynamic = "force-static";

export function GET() {
  const lines = [
    "# Himanshu Kukreja",
    "",
    "> Backend engineer. Author of System Design Mastery, a free system design course, and of engineering case files on real outages and designs.",
    "",
    "## Main pages",
    `- [Portfolio](${PORTFOLIO_ORIGIN}/): career, skills and contact`,
    `- [Projects](${PORTFOLIO_ORIGIN}/projects): open-source and product work`,
    `- [Now](${PORTFOLIO_ORIGIN}/now): what I'm working on`,
    `- [System Design Mastery](${COURSE_ORIGIN}/): the free course (full map at ${COURSE_ORIGIN}/llms.txt)`,
    `- [Case files](${COURSE_ORIGIN}/case-files): outages and design write-ups`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
