import Link from "next/link";

/** Same page for unknown and unpublished handles. */
export default function SharedProfileNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[640px] flex-col justify-center gap-5 px-4 py-16 sm:px-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">404 · ~/u</span>
      <h1 className="font-display text-[clamp(36px,7vw,60px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg">
        This page isn&apos;t shared<span className="text-signal-text">.</span>
      </h1>
      <p className="m-0 text-[16px] leading-relaxed text-fg-2">The learner may have made it private, changed their handle, or it never existed. Progress pages are opt-in.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/learn" className="inline-flex min-h-[52px] items-center justify-between gap-3 bg-signal px-5 font-semibold text-on-signal hover:brightness-110">
          Start the free course <span aria-hidden className="font-mono">→</span>
        </Link>
        <Link href="/learn/arena/daily" className="inline-flex min-h-[52px] items-center border border-line-strong px-5 text-fg hover:bg-surface-2">
          Today&apos;s daily challenge
        </Link>
      </div>
    </main>
  );
}
