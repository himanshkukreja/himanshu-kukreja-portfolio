import Link from "next/link";
import { PenTool } from "lucide-react";

/** On a problem or capstone: "draw it before you read the answer" → the design canvas for this brief. */
export default function CanvasEntry({ promptKey }: { promptKey: string }) {
  return (
    <Link
      href={`/learn/canvas/${encodeURIComponent(promptKey)}`}
      className="group mb-6 flex items-center gap-3 border border-line-strong bg-surface px-4 py-3 hover:border-signal"
    >
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center border border-line-strong text-signal-text group-hover:border-signal">
        <PenTool className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[15px] font-semibold text-fg">Draw it first, on the design canvas</span>
        <span className="text-[13px] leading-snug text-fg-3">Sketch your architecture before reading the answer, then get an AI review of the gaps.</span>
      </span>
      <span className="ml-auto shrink-0 font-mono text-[12px] text-signal-text">open →</span>
    </Link>
  );
}
