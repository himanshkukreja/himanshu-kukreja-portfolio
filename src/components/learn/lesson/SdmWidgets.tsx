"use client";

/**
 * Code tabs and clips inside a System Design Mastery lesson (`:::tabs`, `::clip[id]`): the same DSA widgets, mounted into
 * the lesson's server-rendered figures. Loaded only for a lesson whose HTML has such a figure, so the DSA styles and
 * the clip player stay off every other page. Without JavaScript the figures show every language's code in a column.
 */
import "@/components/dsa/dsa.css";
import DsaHydrator from "@/components/dsa/concept/DsaHydrator";
import type { ConceptPage } from "@/lib/dsa/types";

export default function SdmWidgets({ contentRef, clips }: { contentRef: React.RefObject<HTMLElement | null>; clips?: ConceptPage["clips"] }) {
  return <DsaHydrator rootRef={contentRef} clips={clips} />;
}
