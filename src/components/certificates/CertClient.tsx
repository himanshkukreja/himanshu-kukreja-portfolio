"use client";

/** Small client pieces of the /cert pages: the view beacon, Download PDF and the print trigger. */
import Link from "next/link";
import { useEffect } from "react";
import { Download } from "lucide-react";
import { track } from "@/lib/track";

/** Counts one verification view (admin stat) and emits cert_verify_view. */
export function ViewBeacon({ code, kind, status }: { code: string; kind: string; status: string }) {
  useEffect(() => {
    track("cert_verify_view", { kind, status, code });
    try {
      if (window.localStorage.getItem("hk.notrack") === "1") return;
    } catch {
      /* storage blocked: still count */
    }
    void fetch(`/api/cert/${encodeURIComponent(code)}/view`, { method: "POST", keepalive: true }).catch(() => undefined);
  }, [code, kind, status]);
  return null;
}

/** Link to the print route (it opens the print dialog: "Save as PDF"). */
export function PdfLink({ code, kind, className, children, from }: { code: string; kind: string; className: string; children?: React.ReactNode; from: string }) {
  return (
    <Link href={`/cert/${code}/print?print=1`} onClick={() => track("cert_pdf", { kind, from })} className={className}>
      {children ?? (
        <>
          <Download className="h-4 w-4" aria-hidden /> Download certificate (PDF)
        </>
      )}
    </Link>
  );
}

/** On the print route: the button, and ?print=1 opens the dialog once the fonts are in. */
export function PrintButton({ code, kind }: { code: string; kind: string }) {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("print") !== "1") return;
    let off = false;
    const go = () => {
      if (!off) window.setTimeout(() => !off && window.print(), 350);
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void fonts.ready.then(go);
    else go();
    return () => {
      off = true;
    };
  }, []);
  return (
    <button
      type="button"
      onClick={() => {
        track("cert_pdf", { kind, from: "print", code });
        window.print();
      }}
      className="inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110"
    >
      <Download className="h-4 w-4" aria-hidden /> Download PDF
    </button>
  );
}
