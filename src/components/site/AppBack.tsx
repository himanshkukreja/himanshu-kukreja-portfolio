"use client";

/**
 * Back button for the installed app (Android / desktop "Install", iPhone home screen). A browser
 * tab has its own back button and gesture, so this renders nothing there; an installed app window
 * has no browser chrome, and on Android readers had no visible way back.
 *
 * Back means the reader's own history when there is an earlier page in this app window (Navigation
 * API where available, else our own count of in-app navigations), and otherwise "up": a lesson goes
 * to the course map, a case file to the case files, a learn page to /learn, anything else home. It
 * is hidden on the two roots (/ and /learn), where back would leave the app.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { appDisplayMode, isInstalledMode, watchDisplayMode } from "@/lib/pwa/displayMode";

const DEPTH_KEY = "hk.app.depth";
const ROOTS = new Set(["/", "/learn"]);

/** Where "up" goes from a page. */
export function parentOf(pathname: string): string {
  const p = pathname.replace(/\/+$/, "") || "/";
  const lesson = /^\/learn\/([^/]+)\/(?!(?:design-week|revise)\/)[^/]+\/[^/]+$/.exec(p);
  if (lesson && !["design-week", "revise", "arena", "labs", "mock", "cheatsheet"].includes(lesson[1])) return `/learn/${lesson[1]}`;
  if (p.startsWith("/learn/")) {
    const parts = p.split("/").filter(Boolean); // ["learn", ...]
    return parts.length > 2 ? `/${parts.slice(0, -1).join("/")}` : "/learn";
  }
  if (p.startsWith("/stories/")) return "/stories";
  return "/";
}

type NavigationLike = { canGoBack?: boolean };

function canGoBack(): boolean {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  if (nav && typeof nav.canGoBack === "boolean") return nav.canGoBack;
  try {
    return Number(window.sessionStorage.getItem(DEPTH_KEY) || "0") > 0;
  } catch {
    return false;
  }
}

function useInstalled(): boolean {
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const apply = () => setInstalled(isInstalledMode(appDisplayMode()));
    apply();
    return watchDisplayMode(apply);
  }, []);
  return installed;
}

/** Counts in-app navigations (fallback where the Navigation API is missing, e.g. iPhone). */
export function useAppDepth() {
  const pathname = usePathname();
  useEffect(() => {
    const first = !("hkAppSeen" in window);
    (window as unknown as { hkAppSeen?: boolean }).hkAppSeen = true;
    if (first) return; // the page the app opened on
    try {
      const n = Number(window.sessionStorage.getItem(DEPTH_KEY) || "0");
      window.sessionStorage.setItem(DEPTH_KEY, String(n + 1));
    } catch {
      // storage unavailable: back falls back to "up"
    }
  }, [pathname]);
  useEffect(() => {
    const onPop = () => {
      try {
        const n = Number(window.sessionStorage.getItem(DEPTH_KEY) || "0");
        window.sessionStorage.setItem(DEPTH_KEY, String(Math.max(0, n - 2))); // the pathname effect adds one back
      } catch {
        // ignore
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
}

export default function AppBack({ className = "" }: { className?: string }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const installed = useInstalled();
  if (!installed || ROOTS.has(pathname.replace(/\/+$/, "") || "/")) return null;
  const onBack = () => {
    if (canGoBack()) router.back();
    else router.push(parentOf(pathname));
  };
  return (
    <button type="button" onClick={onBack} aria-label="Back" title="Back" className={`grid h-10 w-10 shrink-0 place-items-center border border-line-strong text-fg hover:bg-surface-2 ${className}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" aria-hidden>
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  );
}
