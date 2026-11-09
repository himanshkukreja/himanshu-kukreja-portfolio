import Link from "next/link";

export default function DsaCertNotFound() {
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[720px] flex-col gap-4 px-4 py-20 sm:px-6">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">Certificate check</span>
        <h1 className="m-0 font-display text-[36px] font-extrabold leading-none tracking-[-0.03em] text-fg">No public certificate with that ID.</h1>
        <p className="m-0 text-[16px] leading-relaxed text-fg-2">Check the code (DSA-XXXX-XXXX). Its owner may also have made it private.</p>
        <Link href="/dsa" className="font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4">
          DSA Mastery →
        </Link>
      </main>
    </div>
  );
}
