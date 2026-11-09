import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getWorld } from "@/lib/dsa/load";
import { DSA_CERT_NAME, DSA_CERT_WORLD } from "@/lib/dsa/cert/rules";
import DsaCertificate from "@/components/dsa/cert/DsaCertificate";

// /dsa/certificate: DSA Mastery · Foundations, its requirements over the Academy spec (ISR, refreshed on every content
// sync) and the learner's progress (in the browser; the claim re-checks on the server). Staging only.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: `Certificate · ${DSA_CERT_NAME}`,
  description: "Finish the Foundations world of DSA Mastery and earn a verifiable certificate.",
  robots: { index: false, follow: false },
};

export default async function DsaCertificatePage() {
  if (!DSA_FULL) notFound();
  const spec = await getWorld(DSA_CERT_WORLD).catch(() => null);
  if (!spec) notFound();
  return <DsaCertificate spec={spec} />;
}
