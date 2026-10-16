import { courseCard } from "@/lib/og/course-card";
import { achievementCard, profileCard } from "@/lib/og/profile-card";
import { isValidHandle } from "@/lib/share/handle";
import { achievementFor } from "@/lib/share/model";
import { getPublicProfile } from "@/lib/share/stats";

export const runtime = "nodejs";
export const alt = "A System Design Mastery achievement";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Params = { handle: string; achievement: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { handle, achievement } = await params;
  const p = isValidHandle(handle) ? await getPublicProfile(handle).catch(() => null) : null;
  if (!p) return courseCard();
  const a = achievementFor(p, achievement);
  return a ? achievementCard(p, a) : profileCard(p);
}
