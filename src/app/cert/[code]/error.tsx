"use client";

/** The verification service didn't answer (a database error): never cached, says nothing about the certificate. */
export default function CertificateError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-[680px] flex-col justify-center gap-4 px-4 py-16 sm:px-6">
      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">~/cert · unavailable</span>
      <h1 className="m-0 font-display text-[clamp(32px,6vw,52px)] font-extrabold leading-[0.98] tracking-[-0.04em] text-fg">
        Couldn&apos;t check this certificate right now<span className="text-signal-text">.</span>
      </h1>
      <p className="m-0 text-[16px] leading-relaxed text-fg-2">The verification service didn&apos;t answer. This says nothing about the certificate itself: try again in a minute.</p>
      <button type="button" onClick={reset} className="inline-flex min-h-12 items-center self-start border border-line-strong px-5 font-mono text-[14px] text-fg hover:bg-surface-2">
        Try again
      </button>
    </main>
  );
}
