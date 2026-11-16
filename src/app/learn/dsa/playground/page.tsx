import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { PLAYGROUND_FILES_ON } from "@/lib/dsa/playground/files-flag";
import Playground from "@/components/dsa/playground/Playground";

// /dsa/playground (the Playground tab): whole programs in Python, Java, C++ and JavaScript with a stdin box. Static: the
// drafts load in the browser. Named files and share links appear only with DSA_PLAYGROUND_FILES=on (after the
// dsa_playground_files migration is applied). Staging only, like the rest of DSA.

export const metadata: Metadata = {
  title: "Playground · DSA Mastery",
  description: "Write and run whole programs in Python, Java, C++ and JavaScript, with your own input.",
  alternates: { canonical: "/dsa/playground" },
  robots: { index: false, follow: false },
};

export default function DsaPlaygroundPage() {
  if (!DSA_FULL) notFound();
  return (
    <div className="dsa-theme">
      <main className="flex min-h-[calc(100dvh-var(--hk-header-h,61px))] flex-col pb-16 lg:h-[calc(100dvh-var(--hk-header-h,61px))] lg:overflow-hidden lg:pb-0">
        <h1 className="sr-only">Code playground</h1>
        <Playground filesEnabled={PLAYGROUND_FILES_ON} />
      </main>
    </div>
  );
}
