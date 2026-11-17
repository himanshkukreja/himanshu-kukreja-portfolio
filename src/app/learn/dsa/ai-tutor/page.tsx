import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AiTutorPage from "@/components/learn/promo/AiTutorPage";
import { aiTutorMetadata } from "@/components/learn/promo/meta";
import { DSA_FULL } from "@/lib/dsa/flags";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";

// /dsa/ai-tutor: the same demo in DSA Mastery's look. Like the rest of /dsa it is off until launch (src/lib/dsa/flags.ts).
export const revalidate = 604800;

export const metadata: Metadata = aiTutorMetadata("dsa");

export default function Page() {
  if (!DSA_FULL) notFound();
  return (
    <div className="dsa-theme">
      <JsonLd data={breadcrumbs([{ name: "DSA Mastery", path: "/dsa" }, { name: "AI tutor", path: "/dsa/ai-tutor" }])} />
      <AiTutorPage course="dsa" />
    </div>
  );
}
