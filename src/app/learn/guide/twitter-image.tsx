import { COURSE_ALT, courseCard } from "@/lib/og/course-card";

export const runtime = "nodejs";
export const alt = COURSE_ALT;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return courseCard();
}
