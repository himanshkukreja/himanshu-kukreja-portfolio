"use client";

/**
 * The cheat sheet's screen chrome: Download PDF (the browser's own print-to-PDF), share (native
 * share sheet, else WhatsApp / LinkedIn / copy link) and FitToPage, which sizes the sheet's type so
 * the whole world prints on one A4 or Letter page.
 */
import { useEffect, useState } from "react";
import { Check, Download, Link2, Share2 } from "lucide-react";
import { track } from "@/lib/track";

const MM = 96 / 25.4;
/** content box both A4 and US Letter fit with 8 mm margins */
const PAGE_H_MM = 262;
const MIN_PT = 5.6;
const MAX_PT = 9;

/** Smallest trim level (and the largest type size, pt) at which a hidden copy fits one page. */
const READABLE_PT = 6.6;
const TRIMS = ["", "cs-trim-1", "cs-trim-2"];

function fitSheet(paper: HTMLElement): { pt: number; trim: string } {
  const clone = paper.cloneNode(true) as HTMLElement;
  clone.classList.remove(...TRIMS.filter(Boolean));
  clone.classList.add("cs-measure");
  clone.removeAttribute("id");
  clone.setAttribute("aria-hidden", "true");
  document.body.appendChild(clone);
  const limit = PAGE_H_MM * MM;
  const fits = (pt: number) => {
    clone.style.setProperty("--cs-fs", `${pt}pt`);
    return clone.scrollHeight <= limit;
  };
  let best = { pt: MIN_PT, trim: "" };
  for (const trim of TRIMS) {
    if (trim) clone.classList.add(trim);
    let lo = MIN_PT;
    let hi = MAX_PT;
    if (fits(hi)) lo = hi;
    else
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
    best = { pt: Math.floor(lo * 20) / 20, trim };
    if (best.pt >= READABLE_PT) break;
  }
  clone.remove();
  return best;
}

export function FitToPage({ target }: { target: string }) {
  useEffect(() => {
    const paper = document.getElementById(target);
    if (!paper) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      const { pt, trim } = fitSheet(paper);
      paper.classList.remove(...TRIMS.filter(Boolean));
      if (trim) paper.classList.add(trim);
      paper.style.setProperty("--cs-fs", `${pt}pt`);
      paper.dataset.fit = `${pt}${trim ? ` ${trim}` : ""}`;
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) void fonts.ready.then(run);
    else run();
    return () => {
      cancelled = true;
    };
  }, [target]);
  return null;
}

export default function CheatSheetTools({ title, url, week }: { title: string; url: string; week: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const text = `${title}: a free one-page system design cheat sheet`;

  const share = async () => {
    track("cheatsheet_share", { week, via: typeof navigator !== "undefined" && "share" in navigator ? "native" : "menu" });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // dismissed or unsupported: fall back to the menu
      }
    }
    setOpen((o) => !o);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            track("cheatsheet_print", { week });
            window.print();
          }}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 sm:flex-none"
        >
          <Download className="h-4 w-4" aria-hidden /> Download PDF
        </button>
        <button
          type="button"
          onClick={() => void share()}
          aria-expanded={open}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 border border-line-strong px-5 text-[15px] font-semibold text-fg hover:border-fg-3 sm:flex-none"
        >
          <Share2 className="h-4 w-4" aria-hidden /> Share
        </button>
      </div>
      {open && (
        <div className="flex animate-hk-in flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center border border-line-strong px-3.5 font-mono text-xs text-fg hover:bg-surface-2"
          >
            WhatsApp
          </a>
          <a
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center border border-line-strong px-3.5 font-mono text-xs text-fg hover:bg-surface-2"
          >
            LinkedIn
          </a>
          <a
            href={`https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center border border-line-strong px-3.5 font-mono text-xs text-fg hover:bg-surface-2"
          >
            X
          </a>
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center gap-1.5 border border-line-strong px-3.5 font-mono text-xs text-fg hover:bg-surface-2">
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "copied" : "copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
