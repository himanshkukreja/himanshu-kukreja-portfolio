import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OnlineOnly from "@/components/offline/OnlineOnly";
import CanvasEditor from "@/components/learn/canvas/CanvasEditor";
import { isPromptKey } from "@/lib/learn/canvas";

export const metadata: Metadata = {
  title: "Design canvas · System Design Mastery",
  robots: { index: false, follow: true },
};

// the same shell for everyone (the design loads on the client with the learner's session): cached per key
export const revalidate = 86400;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ key: string }> };

export default async function CanvasDesignPage({ params }: Props) {
  const key = decodeURIComponent((await params).key);
  if (!isPromptKey(key)) notFound();
  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <OnlineOnly what="The design canvas" note="Designs save to your account, so it needs a connection." className="mx-0">
        <CanvasEditor promptKey={key} />
      </OnlineOnly>
    </main>
  );
}
