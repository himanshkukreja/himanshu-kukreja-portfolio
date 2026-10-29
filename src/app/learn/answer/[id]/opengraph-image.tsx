import { courseCard } from "@/lib/og/course-card";
import { ANSWER_ALT, answerCard } from "@/lib/og/answer-card";
import { ID_RE } from "@/lib/share/answer-model";
import { getSharedAnswer } from "@/lib/share/answers";

export const runtime = "nodejs";
export const alt = ANSWER_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rendered once per answer and cached (answers never change); hiding one revalidates its tag.
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Params = { id: string };

/** Unknown or hidden answers get the plain course card. */
export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { id } = await params;
  const a = ID_RE.test(id) ? await getSharedAnswer(id).catch(() => null) : null;
  return a ? answerCard(a) : courseCard();
}
