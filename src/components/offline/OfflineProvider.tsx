"use client";

/**
 * Offline reading, app side: registers the service worker (public/sw.js), knows what is saved in
 * this browser, whether we're really online, whether the app can be installed, keeps saved copies
 * up to date in the background, and renders the offline strip, the save progress toast and the
 * progress sync. Mounted once in the root layout.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Catalog, CatalogItem, SavedMeta } from "@/lib/offline/types";
import { APP_BUILD, askWorker, listSaved, offlineSupported, onLibraryChanged, pathOf, type SaveInput } from "@/lib/offline/store";
import { ping, setPageSource, startConnectivity, useConnectivity, type PageSource } from "@/lib/offline/connectivity";
import { enqueueSave } from "@/lib/offline/jobs";
import OfflineStrip from "./OfflineStrip";
import SaveToast from "./SaveToast";
import OfflineSync from "./OfflineSync";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export type InstallState = {
  /** Chrome/Edge/Android offered an install prompt we can show */
  canPrompt: boolean;
  /** running as the installed app (or added to the home screen) */
  installed: boolean;
  /** iPhone / iPad Safari: no prompt, show the Add to Home Screen steps */
  ios: boolean;
  prompt: () => Promise<boolean>;
};

type OfflineCtx = {
  /** the browser capability check has run (false during SSR and the first client render) */
  checked: boolean;
  supported: boolean;
  /** the saved library has been read */
  ready: boolean;
  saved: Map<string, SavedMeta>;
  /** saved paths whose content changed since they were saved */
  updates: Set<string>;
  offline: boolean;
  source: PageSource;
  catalog: Catalog | null;
  loadCatalog: () => Promise<Catalog | null>;
  install: InstallState;
};

const Ctx = createContext<OfflineCtx | null>(null);

const FALLBACK: OfflineCtx = {
  checked: false,
  supported: false,
  ready: false,
  saved: new Map(),
  updates: new Set(),
  offline: false,
  source: null,
  catalog: null,
  loadCatalog: async () => null,
  install: { canPrompt: false, installed: false, ios: false, prompt: async () => false },
};

export function useOffline(): OfflineCtx {
  return useContext(Ctx) ?? FALLBACK;
}

export function groupTitleOf(catalog: Catalog | null, group: string): string {
  return catalog?.groups.find((g) => g.id === group)?.title ?? (group === "case-files" ? "Case files" : "Saved");
}

/** The catalog entry for a path (lessons, trials, mocks, case files). */
export function findItem(catalog: Catalog | null, url: string): (CatalogItem & { groupTitle: string }) | null {
  if (!catalog) return null;
  const p = pathOf(url);
  for (const g of catalog.groups) for (const i of g.items) if (pathOf(i.url) === p) return { ...i, groupTitle: g.title };
  return null;
}

/** Saving any course page also saves the course map, so the installed app opens on it offline. */
export function withHub(catalog: Catalog | null, saved: Map<string, SavedMeta>, items: SaveInput[]): SaveInput[] {
  const hub = catalog?.groups.find((g) => g.id === "course")?.items.find((i) => i.kind === "hub");
  if (!hub || saved.has(pathOf(hub.url)) || items.some((i) => pathOf(i.url) === pathOf(hub.url))) return items;
  if (!items.some((i) => i.kind !== "story")) return items;
  return [{ ...hub, groupTitle: groupTitleOf(catalog, "course") }, ...items];
}

const AUTO_KEY = "hk.offline.auto";
const CHECKED_KEY = "hk.offline.checkedAt";
const CHECK_EVERY_MS = 30 * 60_000;
/** background refresh per page load, at most (the rest stays marked "update available") */
const AUTO_MAX = 25;

export const autoUpdateOn = () => {
  try {
    return window.localStorage.getItem(AUTO_KEY) !== "0";
  } catch {
    return true;
  }
};
export const setAutoUpdate = (on: boolean) => {
  try {
    window.localStorage.setItem(AUTO_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable
  }
};

function isIos() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

const SW_OFF = process.env.NEXT_PUBLIC_OFFLINE_DISABLED === "1";

export default function OfflineProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const [checked, setChecked] = useState(false);
  const [supported, setSupported] = useState(false);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<Map<string, SavedMeta>>(() => new Map());
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const { offline, source } = useConnectivity();
  const catalogReq = useRef<Promise<Catalog | null> | null>(null);

  // ---- service worker + connectivity -------------------------------------------------------
  useEffect(() => {
    startConnectivity();
    try {
      // the save step lists the chunks this document loaded: keep more than the default 250
      performance.setResourceTimingBufferSize?.(2000);
    } catch {
      // not supported
    }
    const ok = offlineSupported();
    // client-only capability checks, read after mount so server and client markup match
    setSupported(ok && !SW_OFF);
    setChecked(true);
    setIos(isIos());
    setInstalled(isStandalone());
    if (!("serviceWorker" in navigator)) return;
    if (SW_OFF) {
      void navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => void r.unregister()));
      return;
    }
    // dev: no worker (it would cache dev chunks across HMR); production builds only
    if (process.env.NODE_ENV !== "production") return;
    if (window.location.pathname.startsWith("/admin")) return;
    const register = () => {
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_BUILD)}`, { scope: "/", updateViaCache: "none" }).catch(() => {
        // private mode / blocked: the site works as before, saving is unavailable
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    // was this page answered from the offline cache?
    void askWorker<{ source: PageSource; url: string; at: number } | null>({ type: "hk:source", url: window.location.href }, 1500).then((rec) => {
      if (rec && rec.url === window.location.href && rec.at >= performance.timeOrigin - 2000) {
        setPageSource(rec.source);
        if (rec.source !== "network") void ping();
      }
    });
  }, []);

  // a client-side navigation that worked came from the network
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = "";
    setPageSource("network");
  }, [pathname]);

  // ---- install -------------------------------------------------------------------------------
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // no mini-infobar: installing is offered in the course UI, never pushed
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  // ---- browser theme colour follows the site theme toggle (the meta tags only know the OS one) --
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const color = root.classList.contains("dark") ? "#000000" : "#F5F4F0";
      document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
        m.content = color;
      });
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // ---- the saved library ---------------------------------------------------------------------
  const reload = useCallback(async () => {
    const list = await listSaved();
    setSaved(new Map(list.map((m) => [m.url, m])));
    setReady(true);
  }, []);

  useEffect(() => {
    if (!supported) return;
    // Cache Storage read on mount (external state)
    void reload();
    return onLibraryChanged(() => void reload());
  }, [supported, reload]);

  const loadCatalog = useCallback(async () => {
    if (catalog) return catalog;
    catalogReq.current ??= fetch("/api/offline/catalog", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Catalog>) : null))
      .then((c) => {
        if (c) setCatalog(c);
        return c;
      })
      .catch(() => null)
      .finally(() => {
        catalogReq.current = null;
      });
    return catalogReq.current;
  }, [catalog]);

  const updates = useMemo(() => {
    const out = new Set<string>();
    if (!catalog) return out;
    for (const m of saved.values()) {
      const item = findItem(catalog, m.url);
      if (item && item.version !== m.version) out.add(m.url);
    }
    return out;
  }, [catalog, saved]);

  // Background: once in a while, when online with something saved, look for content updates and
  // refresh those copies (and copies kept on old builds, so their app files can be dropped).
  const updateChecked = useRef(false);
  useEffect(() => {
    if (!supported || !ready || offline || !saved.size || updateChecked.current) return;
    updateChecked.current = true;
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(CHECKED_KEY)) || 0;
    } catch {
      // storage unavailable
    }
    if (Date.now() - last < CHECK_EVERY_MS && !pathname.startsWith("/learn/offline")) return;
    const t = window.setTimeout(async () => {
      const cat = await loadCatalog();
      if (!cat) return;
      try {
        window.localStorage.setItem(CHECKED_KEY, String(Date.now()));
      } catch {
        // storage unavailable
      }
      if (!autoUpdateOn()) return;
      // copies kept on more than 3 builds: re-save the oldest ones under this build
      const byBuild = new Map<string, number>();
      for (const m of saved.values()) byBuild.set(m.build, Math.max(byBuild.get(m.build) ?? 0, m.updatedAt));
      const keep = new Set([APP_BUILD, ...[...byBuild.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([b]) => b)]);
      const stale = (m: SavedMeta) => byBuild.size > 3 && !keep.has(m.build);
      const todo: SaveInput[] = [];
      for (const m of saved.values()) {
        const item = findItem(cat, m.url);
        if (item && (item.version !== m.version || stale(m))) todo.push(item);
      }
      if (todo.length) enqueueSave("Updating saved lessons", todo.slice(0, AUTO_MAX));
    }, 4000);
    return () => window.clearTimeout(t);
  }, [supported, ready, offline, saved, pathname, loadCatalog]);

  const value = useMemo<OfflineCtx>(
    () => ({
      checked,
      supported,
      ready,
      saved,
      updates,
      offline,
      source,
      catalog,
      loadCatalog,
      install: { canPrompt: !!deferred, installed, ios, prompt },
    }),
    [checked, supported, ready, saved, updates, offline, source, catalog, loadCatalog, deferred, installed, ios, prompt]
  );

  return (
    <Ctx.Provider value={value}>
      <OfflineStrip />
      {children}
      <SaveToast />
      <OfflineSync />
    </Ctx.Provider>
  );
}
