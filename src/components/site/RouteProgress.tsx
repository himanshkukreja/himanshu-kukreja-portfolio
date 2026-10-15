"use client";

/**
 * The signal-orange route progress bar pinned to the top of the viewport. Starts the moment a
 * navigation starts (see progressStore.ts), trickles while the server renders, completes when the
 * new route commits. Mounted once in the root layout.
 */
import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { loaderStyles as s } from "@/components/ui/loader";
import { ROUTE_START_EVENT, doneRouteProgress, isSameDocument, startRouteProgress, useRouteProgress } from "./progressStore";

/** Finishes the bar whenever the committed URL changes. */
function Finisher() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();
  useEffect(() => {
    doneRouteProgress();
  }, [pathname, search]);
  return null;
}

/** Plain same-origin <a> clicks that Next doesn't handle become full page loads: show the bar for those too. */
function onDocumentClick(e: MouseEvent) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
  const href = a.getAttribute("href") || "";
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return;
  }
  if (url.origin !== window.location.origin || isSameDocument(url.href)) return;
  if (/\.(pdf|png|jpe?g|svg|zip|xml|txt|json)$/i.test(url.pathname)) return;
  startRouteProgress();
}

export default function RouteProgress() {
  const { phase, value } = useRouteProgress();

  useEffect(() => {
    const onStart = () => startRouteProgress();
    window.addEventListener(ROUTE_START_EVENT, onStart);
    // bubble phase: Next's <Link> has already called preventDefault on the clicks it handles
    document.addEventListener("click", onDocumentClick);
    return () => {
      window.removeEventListener(ROUTE_START_EVENT, onStart);
      document.removeEventListener("click", onDocumentClick);
    };
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <Finisher />
      </Suspense>
      <div
        className={s.progress}
        data-route-progress={phase === "loading" ? "on" : phase}
        role="progressbar"
        aria-label="Loading page"
        aria-hidden={phase === "idle"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        style={{ opacity: phase === "idle" ? 0 : 1, transition: phase === "idle" ? "none" : "opacity 200ms ease-out" }}
      >
        <div className={s.progressFill} style={{ transform: `scaleX(${value})`, opacity: phase === "done" ? 0 : 1 }} />
        {phase === "loading" && <span className={s.progressHead} style={{ left: `calc(${value * 100}% - 6px)`, right: "auto" }} />}
      </div>
    </>
  );
}
