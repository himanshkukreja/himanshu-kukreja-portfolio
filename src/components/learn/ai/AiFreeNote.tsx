/** The one line every AI feature shows (no end date on purpose). */
export const AI_FREE_LINE = "AI features are free for every signed-in learner, for a limited time.";

export default function AiFreeNote({ className = "" }: { className?: string }) {
  return (
    <p className={`m-0 flex items-center gap-2 font-mono text-[12px] text-fg-3 ${className}`}>
      <span aria-hidden className="inline-block h-1.5 w-1.5 bg-signal" />
      {AI_FREE_LINE}
    </p>
  );
}
