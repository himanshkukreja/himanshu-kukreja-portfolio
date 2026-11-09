import { DsaMark } from "../DsaMark";
import { DSA_CERT_NAME } from "@/lib/dsa/cert/rules";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/**
 * The DSA Mastery · Foundations certificate as a card, in DSA's look (the index mark, teal rule, square corners). The
 * requirements page shows it as a preview (no name, no code yet); the verification page shows the issued one.
 */
export default function DsaCertFace({ name, code, issuedAt, preview = false, lines }: { name: string | null; code: string | null; issuedAt: string | null; preview?: boolean; lines?: string[] }) {
  return (
    <figure
      aria-label={preview ? "Certificate preview" : `${DSA_CERT_NAME} certificate`}
      className="relative m-0 flex min-h-[300px] w-full sm:aspect-[1.414/1] flex-col overflow-hidden border-2 border-fg bg-bg text-fg"
    >
      <div aria-hidden className="h-2 bg-signal" />
      <div className="flex flex-1 flex-col gap-3 p-5 sm:gap-4 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 font-display text-[15px] font-extrabold tracking-[-0.02em] sm:text-[18px]">
            <DsaMark className="h-6 w-6 sm:h-7 sm:w-7" />
            <span>
              DSA Mastery<span className="text-signal-text">.</span>
            </span>
          </span>
          <span className="flex flex-col items-end gap-1.5">
            <span className="text-right font-mono text-[10px] uppercase tracking-label text-fg-3 sm:text-[11px]">Certificate of completion</span>
            {preview ? <span className="border-2 border-signal px-1.5 py-px font-mono text-[10.5px] font-semibold uppercase tracking-label text-signal-text sm:text-[12px]">preview</span> : null}
          </span>
        </div>
        <div className="mt-auto flex flex-col gap-1.5 sm:gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-label text-fg-3 sm:text-[12px]">This certifies that</span>
          <span className={`font-display text-[26px] font-extrabold leading-[1.02] tracking-[-0.035em] sm:text-[40px] ${name ? "text-fg" : "text-fg-4"}`}>{name || "Your name"}</span>
          <span className="max-w-[560px] text-[13px] leading-snug text-fg-2 sm:text-[15px]">
            completed <strong className="font-semibold text-fg">Foundations</strong>, the Kestrel Academy world of DSA Mastery: every lesson, practice problem, checkpoint quiz and module review, and the Launch week final.
          </span>
          {lines?.length ? <span className="font-mono text-[11px] text-fg-3 sm:text-[12px]">{lines.join(" · ")}</span> : null}
        </div>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
          <span className="flex flex-col gap-0.5">
            <span className="font-display text-[14px] font-bold sm:text-[16px]">Himanshu Kukreja</span>
            <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">Creator &amp; instructor · System Design Mastery</span>
          </span>
          <span className="flex flex-col items-end gap-0.5 font-mono text-[11px] text-fg-2 sm:text-[12px]">
            <span>{code || "DSA-····-····"}</span>
            <span className="text-fg-3">{issuedAt ? fmt(issuedAt) : "date of issue"}</span>
          </span>
        </div>
      </div>
    </figure>
  );
}
