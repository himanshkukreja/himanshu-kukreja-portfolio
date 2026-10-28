import type { Metadata } from "next";
import Link from "next/link";
import { canvasPrompts } from "@/lib/learn/canvas";
import CanvasHome from "@/components/learn/canvas/CanvasHome";

export const runtime = "nodejs";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Design canvas · System Design Mastery",
  description: "Draw your architecture for a classic interview problem, a capstone or your own idea, and get a staff-engineer style AI review of what you drew: the gaps, worst first, and what an interviewer would ask next.",
  alternates: { canonical: "/learn/canvas" },
};

/** /learn/canvas: pick something to design; your designs are listed once you're signed in. */
export default async function CanvasPage() {
  const prompts = (await canvasPrompts().catch(() => [])).map(({ path: _p, ...p }) => (void _p, p));
  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-col gap-3">
        <Link href="/learn/prep" className="self-start font-mono text-xs text-fg-3 hover:text-fg">
          ← prep
        </Link>
        <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">design canvas</span>
        <h1 className="m-0 font-display text-[clamp(34px,6vw,64px)] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
          Draw it. Get it reviewed<span className="text-signal">.</span>
        </h1>
        <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2">
          Sketch the architecture the way you would on an interview whiteboard: boxes, arrows, real technologies. Then ask for a review: a staff-engineer read of your drawing against the brief, with the gaps that would sink it worst first, the fix for each, and what you&apos;d be asked next. Your designs save to your account as you draw.
        </p>
      </header>
      <CanvasHome prompts={prompts} />
    </main>
  );
}
