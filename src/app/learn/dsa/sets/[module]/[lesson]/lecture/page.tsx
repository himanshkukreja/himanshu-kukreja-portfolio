import { LeanLectureRoute, leanLectureMetadata, type LeanParams } from "@/components/dsa/lean/LeanRoutes";

// The animated lecture of a lean lesson (/dsa/sets/<module>/<lesson>/lecture); ?record=1 is the MP4 exporter's view
// (scripts/lecture/export.mjs). Media sits at lectures/dsa--<module>--<lesson>/.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export const generateMetadata = (p: LeanParams) => leanLectureMetadata("sets", p);
export default function Page(p: LeanParams) {
  return LeanLectureRoute("sets", p);
}
