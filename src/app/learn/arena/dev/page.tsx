import { notFound } from "next/navigation";
import { renderLesson } from "@/lib/course/render";
import QuizFixture from "./QuizFixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quiz fixture (dev) · Arena", robots: { index: false } };

/** Dev-only scratch lesson for QA of ```quiz blocks (never served in production). */
const FIXTURE = `# Week 2 — Day 3: Circuit Breakers (quiz fixture)

## System Design Mastery Series

---

# Part I: The breaker

A circuit breaker sits between a caller and a dependency. When failures pile up it **opens** and fails fast; after a timeout it goes **half-open** and lets a trial request through.

\`\`\`quiz
%% title: Quick check · Circuit breaker states
? A circuit breaker has been OPEN for its full timeout. What happens to the next request?
- [ ] It fails immediately, the breaker stays OPEN
- [x] It is let through as a trial; the breaker is HALF-OPEN
- [ ] It is retried three times with backoff
> After the timeout the breaker moves to HALF-OPEN and lets a limited number of trial requests through.
> Success closes it again; a failure sends it straight back to OPEN.

? Which signal should trip the breaker?
- [x] Failure rate over a sliding window crossing a threshold
- [ ] A single slow response
- [ ] CPU usage on the caller
> One slow call is noise. Breakers act on a failure (or slow-call) rate over a window, e.g. 50% of the last 20 calls.
\`\`\`

More prose after the quiz so highlights have something to land on.

# Part II: Fallbacks

When the breaker is open, serve a fallback: cached data, a default, or a degraded page.

\`\`\`quiz
? The recommendations service is down and its breaker is open. What should the home page do?
- [ ] Wait for the 30 s timeout on every request
- [x] Render without recommendations (or with cached ones)
- [ ] Return a 503 for the whole page
> The point of failing fast is to degrade gracefully: the page loads, minus the broken widget.
\`\`\`
`;

export default async function QuizFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();
  const lesson = await renderLesson(FIXTURE, { kind: "day-content" });
  return <QuizFixture html={lesson.html} title={lesson.title} />;
}
