import { notFound } from "next/navigation";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import MockInterviewRoom from "@/components/learn/mock/MockInterview";
import { getLecture, lectureCard } from "@/lib/learn/lecture/load";
import { lessonLectureId } from "@/lib/learn/lecture/types";
import { shortsOf } from "@/lib/learn/shorts/load";
import { isLldMockSlug } from "@/lib/learn/mock/lld";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed weekly and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 604800;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const mock = await getMockInterview(slug).catch(() => null);
  if (!mock) return { title: "Not Found" };
  if (mock.kind === "lld")
    return {
      title: `Machine-coding mock · ${mock.lld!.name} · System Design Mastery`,
      description: `A timed ${mock.minutes}-minute machine-coding (LLD) mock interview with an AI interviewer: ${mock.title}. Clarify, model the classes, name the patterns, code it, then concurrency and edge cases, with one requirement change mid-round and a debrief graded against the case study's interview checklist.`,
    };
  return {
    title: `Mock interview ${String(mock.n).padStart(2, "0")} · ${mock.company.name} · System Design Mastery`,
    description: `A timed ${mock.minutes}-minute system design interview with ${mock.interviewer.name} at ${mock.company.name} (fictional): ${mock.title}. Covers ${mock.coversLabel}. Free practice with a levelled rubric and verdict.`,
  };
}

export default async function MockInterviewPage({ params }: Props) {
  const { slug } = await params;
  // machine-coding rounds (/mock/lld-NN-*) have no recorded lecture or shorts of their own
  const lld = isLldMockSlug(slug);
  const [mock, lecture, shorts] = await Promise.all([
    getMockInterview(slug),
    lld ? null : getLecture(lessonLectureId("mock-interviews", slug)).then(lectureCard).catch(() => null),
    lld ? null : shortsOf(lessonLectureId("mock-interviews", slug)).catch(() => null),
  ]);
  if (!mock) notFound();
  return <MockInterviewRoom mock={mock} lecture={lecture} shorts={shorts} />;
}
