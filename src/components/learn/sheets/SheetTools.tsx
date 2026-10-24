"use client";

/**
 * A design sheet's screen chrome: Download PDF and share.
 *
 * Download PDF prints in the light theme whatever the reader uses: it drops the `dark` class, asks the
 * MermaidHydrator to draw every figure (the synthetic `beforeprint`), waits until each one is drawn in
 * light (or ~8 s), prints, then puts the theme back. Ctrl+P still works; the sheet CSS keeps it legible.
 */
import { useState } from "react";
import { Check, Download, Link2, Loader2, Share2 } from "lucide-react";
import { track } from "@/lib/track";

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

async function printLight(root: string) {
  const html = document.documentElement;
  const wasDark = html.classList.contains("dark");
  if (wasDark) html.classList.remove("dark");
  const prevScheme = html.style.colorScheme;
  html.style.colorScheme = "light";
  window.dispatchEvent(new Event("beforeprint"));
  const figs = () => Array.from(document.querySelectorAll<HTMLElement>(`${root} figure.sd-mermaid`));
  const ready = () => figs().every((f) => f.dataset.mermaidTheme === "light" && !!f.querySelector(".sd-mermaid-canvas svg"));
  for (let t = 0; t < 80 && !ready(); t++) await sleep(100);
  await sleep(150);
  const restore = () => {
    window.removeEventListener("afterprint", restore);
    if (wasDark) html.classList.add("dark");
    html.style.colorScheme = prevScheme;
  };
  window.addEventListener("afterprint", restore);
  window.print();
  // some browsers return from print() without firing afterprint
  window.setTimeout(restore, 1500);
}

export default function SheetTools({ title, url, slug, root }: { title: string; url: string; slug: string; root: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const text = `${title}: the whole system design on a few pages, free`;

  const share = async () => {
    track("sheet_share", { slug, via: typeof navigator !== "undefined" && "share" in navigator ? "native" : "menu" });
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
          disabled={busy}
          onClick={async () => {
            track("sheet_print", { slug });
            setBusy(true);
            try {
              await printLight(root);
            } finally {
              setBusy(false);
            }
          }}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110 disabled:opacity-70 sm:flex-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
          {busy ? "Drawing diagrams…" : "Download PDF"}
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
