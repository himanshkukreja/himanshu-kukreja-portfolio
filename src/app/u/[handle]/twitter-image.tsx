import { courseCard } from "@/lib/og/course-card";
import { profileCard } from "@/lib/og/profile-card";
import { isValidHandle } from "@/lib/share/handle";
import { getPublicProfile } from "@/lib/share/stats";

export const runtime = "nodejs";
export const alt = "A learner's progress on System Design Mastery, a free system design course";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Rendered once per path and cached; a share-settings save revalidates the handle's tag.
export const revalidate = 300;
export const dynamicParams = true;
/** None at build: each image renders on its first request, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Params = { handle: string };

/** Unknown / unpublished handles get the plain course card (nothing about the learner leaks). */
export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { handle } = await params;
  const p = isValidHandle(handle) ? await getPublicProfile(handle).catch(() => null) : null;
  return p ? profileCard(p) : courseCard();
}
