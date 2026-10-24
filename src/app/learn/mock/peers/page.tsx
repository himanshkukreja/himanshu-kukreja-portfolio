import { notFound } from "next/navigation";
import { COURSE_ID, getCourseMap } from "@/lib/learn/course";
import PeerMocks from "@/components/learn/mock/PeerMocks";

export const runtime = "nodejs";
// Static shell, cached; the slots load on the client.
export const revalidate = 86400;

export const metadata = {
  title: "Peer mock interviews · System Design Mastery",
  description: "Pair up with another learner for a live system design mock interview: one interviews with the course's rubric, the other designs, then swap. Free.",
  alternates: { canonical: "/learn/mock/peers" },
};

export default async function PeerMocksPage() {
  const map = await getCourseMap(COURSE_ID);
  if (!map) notFound();
  const mocks = (map.mocks || []).map((m) => ({ slug: m.slug, title: m.title, company: m.company }));
  return <PeerMocks mocks={mocks} />;
}
