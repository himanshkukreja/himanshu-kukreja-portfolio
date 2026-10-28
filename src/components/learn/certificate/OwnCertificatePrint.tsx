"use client";

/**
 * /learn/certificate/print/<code>: the learner's own certificate on one A4 page, whether or not its
 * public page is on (the public /cert/<code>/print is only for public certificates). Loaded with the
 * learner's session from /api/learn/certificates, never cached, never indexed.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userJson } from "@/components/learn/progress/userFetch";
import { CertificateArt } from "@/components/certificates/CertificateArt";
import { PrintButton } from "@/components/certificates/CertClient";
import type { CertificateView, CertState } from "@/lib/certificates/core";
import "@/components/certificates/certificate.css";

function own(state: CertState, code: string): CertificateView | null {
  if (state.course.certificate?.code === code) return state.course.certificate;
  return state.worlds.find((w) => w.certificate?.code === code)?.certificate ?? null;
}

export default function OwnCertificatePrint({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const [res, setRes] = useState<{ cert: CertificateView | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    userJson<CertState>("/api/learn/certificates")
      .then((s) => !off && setRes({ cert: own(s, code), error: null }))
      .catch((e: Error) => !off && setRes({ cert: null, error: e.message || "Couldn't load your certificate." }));
    return () => {
      off = true;
    };
  }, [user?.id, code]);

  const msg = (title: string, body: string) => (
    <div className="flex flex-col gap-3 border border-line bg-surface p-5">
      <h1 className="m-0 font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-fg">{title}</h1>
      <p className="m-0 text-[15px] leading-relaxed text-fg-2">{body}</p>
      <Link href="/learn/certificate" className="inline-flex min-h-11 items-center self-start border border-line-strong px-4 font-mono text-[13px] text-fg hover:border-signal">
        ← your certificates
      </Link>
    </div>
  );

  let body: React.ReactNode;
  if (loading || (user && !res)) body = <p className="m-0 font-mono text-[13px] text-fg-3">Loading your certificate…</p>;
  else if (!user) body = msg("Sign in to download it.", "This page shows your own certificate, so it needs you signed in.");
  else if (res?.error) body = msg("Couldn't load it.", res.error);
  else if (!res?.cert) body = msg("Not one of yours.", "This certificate ID isn't on your account.");
  else if (res.cert.status !== "valid") body = msg("This certificate can't be printed.", "It was revoked. The certificates page shows its status.");
  else
    body = (
      <>
        {/* the page box for this route only: one A4 landscape sheet, no margins */}
        <style>{`@page { size: A4 landscape; margin: 0; }`}</style>
        <div className="cert-noprint flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="m-0 font-display text-[30px] font-extrabold leading-none tracking-[-0.04em] text-fg sm:text-[40px]">Your certificate, on one page.</h1>
            <p className="m-0 max-w-[620px] text-[15px] leading-relaxed text-fg-2">
              Download PDF opens your browser&apos;s print dialog: choose “Save as PDF”, A4 landscape. If the colours or the QR code are missing, turn on “Background graphics”.
              {!res.cert.isPublic && " Its public page is off, so the QR code and ID won't verify for anyone else until you switch it on."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrintButton code={res.cert.code} kind={res.cert.kind} />
            <Link href="/learn/certificate" className="inline-flex min-h-12 items-center border border-line-strong px-4 text-[15px] text-fg hover:bg-surface-2">
              Your certificates
            </Link>
          </div>
        </div>
        <div className="cert-print-stage border border-line shadow-[0_1px_0_rgba(0,0,0,0.04)]">
          <CertificateArt cert={res.cert} theme="paper" id="cert-sheet" />
        </div>
      </>
    );

  return <main className="cert-print-root mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-4 pb-16 pt-6 sm:px-6 sm:pt-10">{body}</main>;
}
