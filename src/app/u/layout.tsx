import { COURSE_LAYOUT_METADATA } from "@/lib/site/course-metadata";

// learner profiles are served on the course host (systemdesignmastery.dev)
export const metadata = COURSE_LAYOUT_METADATA;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
