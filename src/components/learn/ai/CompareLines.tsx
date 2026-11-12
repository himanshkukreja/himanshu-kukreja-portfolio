/**
 * "Compared with last time" (AI audit O9): the server's lines about what moved since the learner's last attempt at the
 * same thing (an explain-back, a mock scorecard, a lab review), worked out from their outcome log, never by the model.
 * One quiet block under a grade; nothing when it's the first attempt or memory is off.
 */
export default function CompareLines({ lines }: { lines?: string[] | null }) {
  if (!lines?.length) return null;
  return (
    <div className="flex flex-col gap-1 border-l-2 border-signal pl-3 text-[14px] leading-relaxed text-fg-2" data-hk-compare="">
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">compared with last time</span>
      {lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}
