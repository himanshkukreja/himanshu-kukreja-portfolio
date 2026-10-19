import Link from "next/link";

/** Same page for unknown, private and malformed certificate IDs (no way to probe who holds one). */
export default function CertificateNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-[680px] flex-col justify-center gap-5 px-4 py-16 sm:px-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">404 · ~/cert</span>
      <h1 className="font-display text-[clamp(36px,7vw,60px)] font-extrabold leading-[0.95] tracking-[-0.045em] text-fg">
        No certificate with this ID<span className="text-signal-text">.</span>
      </h1>
      <p className="m-0 text-[16px] leading-relaxed text-fg-2">
        Check the ID for typos: it looks like <span className="font-mono text-fg">SDM-7F3K-92QX</span> or <span className="font-mono text-fg">W02-4QX8</span> and uses the digits 2–9 and the letters A–Z without I or O. The holder
        may also have hidden its page.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/learn" className="inline-flex min-h-[52px] items-center justify-between gap-3 bg-signal px-5 font-semibold text-on-signal hover:brightness-110">
          Start the course <span aria-hidden className="font-mono">→</span>
        </Link>
        <Link href="/learn/guide#certificates" className="inline-flex min-h-[52px] items-center border border-line-strong px-5 text-fg hover:bg-surface-2">
          How certificates are earned
        </Link>
      </div>
    </main>
  );
}
