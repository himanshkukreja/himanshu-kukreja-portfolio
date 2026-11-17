import type { Metadata } from "next";
import AiTutorPage from "@/components/learn/promo/AiTutorPage";
import { aiTutorMetadata } from "@/components/learn/promo/meta";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";

// /ai-tutor on the course host (internal route /learn/ai-tutor): the AI tutor demo, its chapters and a free sign-in. Static.
export const revalidate = 604800;

export const metadata: Metadata = aiTutorMetadata("sdm");

export default function Page() {
  return (
    <>
      <JsonLd data={breadcrumbs([{ name: "System Design Mastery", path: "/" }, { name: "AI tutor", path: "/ai-tutor" }])} />
      <AiTutorPage course="sdm" />
    </>
  );
}
