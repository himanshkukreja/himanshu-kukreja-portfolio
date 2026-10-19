import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CERT_TITLE, ISSUER, certPath, normalizeCode } from "@/lib/certificates/core";
import { publicCertificate } from "@/lib/certificates/service";
import { CertificateArt } from "@/components/certificates/CertificateArt";
import { PrintButton } from "@/components/certificates/CertClient";
import "@/components/certificates/certificate.css";

export const runtime = "nodejs";
// Rendered once and served from the cache (on-demand ISR); issuing, revoking, restoring or hiding a
// certificate calls revalidatePath("/cert/<code>", "layout"), so its status changes show at once.
export const revalidate = 3600;
export const dynamicParams = true;
/** None at build: each certificate renders on its first visit, then is cached. */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ code: string }> };

export const metadata: Metadata = {
  title: `${CERT_TITLE} · ${ISSUER}`,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

/**
 * /cert/<code>/print: the paper certificate on exactly one A4 landscape page, for "Download PDF"
 * (the browser's own print → Save as PDF, like the cheat sheets). ?print=1 opens the dialog (read on
 * the client, so the cached HTML is the same for every visitor).
 * Revoked or tampered certificates don't print.
 */
export default async function CertificatePrintPage({ params }: Props) {
  const code = normalizeCode((await params).code);
  const c = code ? await publicCertificate(code) : null;
  if (!c) notFound();
  const v = c.view;
  const printable = v.status === "valid" && c.signature !== "bad";
  return (
    <main className="cert-print-root mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      {/* the page box for this route only: one A4 landscape sheet, no margins (removed with the page) */}
      <style>{`@page { size: A4 landscape; margin: 0; }`}</style>
      <div className="cert-noprint flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
            <Link href={certPath(v.code)} className="hover:text-fg">
              Certificate {v.code}
            </Link>
            <span aria-hidden>/</span>
            <span className="text-signal-text">PDF</span>
          </nav>
          <h1 className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[40px]">{printable ? "Your certificate, on one page." : "This certificate can't be printed."}</h1>
          <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
            {printable
              ? "Download PDF opens your browser's print dialog: choose “Save as PDF”, A4 landscape. If the colours or the QR code are missing, turn on “Background graphics”."
              : "It was revoked or didn't pass its integrity check. The verification page shows its status."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {printable && <PrintButton code={v.code} kind={v.kind} />}
          <Link href={certPath(v.code)} className="inline-flex min-h-12 items-center border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
            Verification page
          </Link>
        </div>
      </div>
      {printable && (
        <div className="cert-print-stage border border-line shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <CertificateArt cert={v} theme="paper" id="cert-sheet" />
        </div>
      )}
    </main>
  );
}
