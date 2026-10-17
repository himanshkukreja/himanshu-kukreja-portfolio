"use client";

/** The page the service worker shows for a page that isn't saved, when there's no network. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOffline } from "./OfflineProvider";

export default function OfflineFallback() {
  const { saved, ready, offline } = useOffline();
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    // the page the reader asked for (the service worker redirects here with ?from=)
    const from = new URLSearchParams(window.location.search).get("from");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPath(from && from.startsWith("/") && !from.startsWith("//") ? from : null);
  }, []);
  const recent = [...saved.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);

  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-8 px-4 pb-24 pt-12 sm:px-6 sm:pt-20">
      <div className="flex flex-col gap-4">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">{offline ? "No connection" : "Offline page"}</span>
        <h1 className="m-0 font-display text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
          You&apos;re offline<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 text-[17px] leading-relaxed text-fg-2">
          {path ? (
            <>
              <code className="break-all font-mono text-[15px] text-fg">{path}</code> isn&apos;t saved on this device, so it needs the internet.
            </>
          ) : (
            "This page needs the internet."
          )}{" "}
          Lessons you saved still open.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/learn/offline" className="inline-flex min-h-[52px] items-center bg-signal px-5 text-[15px] font-semibold text-on-signal">
          Open the offline library
        </Link>
        <button type="button" onClick={() => window.location.assign(path ?? window.location.href)} className="min-h-[52px] border border-line-strong px-5 text-[15px] font-medium text-fg hover:bg-surface-2">
          Try again
        </button>
      </div>
      {ready && recent.length > 0 && (
        <section aria-labelledby="fb-saved" className="flex flex-col gap-2">
          <h2 id="fb-saved" className="m-0 font-mono text-[11px] uppercase tracking-label text-fg-3">
            Saved on this device
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {recent.map((m) => (
              <li key={m.url} className="border-b border-line">
                <Link href={m.url} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px] text-fg hover:underline">
                  <span className="min-w-0 truncate">{m.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-3">{m.tag}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
