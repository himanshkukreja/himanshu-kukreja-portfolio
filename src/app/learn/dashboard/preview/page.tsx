import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCourseMap } from "@/lib/learn/course";
import { DSA_FULL } from "@/lib/dsa/flags";
import ProfilePreview from "@/components/share/ProfilePreview";

// /dashboard/preview: the owner's preview of their public page (/u/<handle>) with their saved settings, published or
// not. The page is static; the preview loads for the signed-in learner in the browser. Staging only for now.

export const revalidate = 86400;

export const metadata: Metadata = { title: "Preview of your public page", robots: { index: false, follow: false } };

export default async function ProfilePreviewPage() {
  if (!DSA_FULL) notFound();
  const map = await getCourseMap();
  if (!map) notFound();
  return <ProfilePreview map={map} />;
}
