import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex } from "@/lib/dsa/load";
import ComplexityBudget from "@/components/dsa/complexity/ComplexityBudget";

// /dsa/complexity: the complexity budget (SD Mastery's /numbers for DSA). The tool runs in the browser; the server only
// passes the built lessons it may link to. Staging only until launch.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Complexity budget · DSA Mastery",
  description: "Pick an input size, a time limit and a language and see which complexity fits: the 10^8 rule, the reverse (n = 2·10^5 → aim for O(n log n)), constraint signals and a short drill.",
  alternates: { canonical: "/dsa/complexity" },
  robots: { index: false, follow: false },
};

export default async function DsaComplexityPage() {
  if (!DSA_FULL) notFound();
  const concepts = await getConceptIndex().catch(() => []);
  const built = Object.fromEntries(concepts.filter((c) => c.status === "built").map((c) => [c.id, c.title]));
  return <ComplexityBudget built={built} />;
}
