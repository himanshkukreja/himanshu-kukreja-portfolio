import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getShared, PLAYGROUND_FILES_ON } from "@/lib/dsa/playground/files-server";
import SharedProgram from "@/components/dsa/playground/SharedProgram";

// /dsa/playground/s/<slug>: a Playground file someone shared, read-only (no owner details), with "Open in Playground"
// to copy it into your own drafts. Only with DSA_PLAYGROUND_FILES=on (after the dsa_playground_files migration).

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Shared program · DSA Mastery", robots: { index: false, follow: false } };

export default async function SharedProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!DSA_FULL || !PLAYGROUND_FILES_ON) notFound();
  const { slug } = await params;
  const f = await getShared(slug);
  if (!f) notFound();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex w-full max-w-[960px] flex-col gap-4 px-4 py-8 lg:px-6">
        <SharedProgram file={f} />
      </main>
    </div>
  );
}
