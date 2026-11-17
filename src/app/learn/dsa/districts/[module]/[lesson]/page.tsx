import { LeanLessonRoute, leanMetadata, type LeanParams } from "@/components/dsa/lean/LeanRoutes";

// A lean lesson beyond the Academy (/dsa/districts/<module>/<lesson>): the lesson shell with its beats, the ladder of problems,
// exercises, quiz and clips. Rendered once and cached (ISR, refreshed on content sync). src/lib/dsa/kinds.ts says which kinds.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export const generateMetadata = (p: LeanParams) => leanMetadata("districts", p);
export default function Page(p: LeanParams) {
  return LeanLessonRoute("districts", p);
}
