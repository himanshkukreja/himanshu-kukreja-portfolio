"use client";

/**
 * Offline code labs. A saved lab needs, besides its page: the editor chunk (warmed here so it is in
 * the document's resource list, which saveArticle copies into hk-static) and the Python runtime
 * (Pyodide + the worker, ~13.5 MB, stored once in hk-runtime and shared by every lab). The service
 * worker answers /pyodide/** and /labs-runtime/** from hk-runtime first (public/sw.js).
 */
import { RUNTIME_URLS } from "@/lib/learn/labs/runtime";
import { loadCodeEditor } from "./lazy";
import { OfflineSaveError } from "./store";
import { OFFLINE_CACHES as C, type Catalog, type SavedMeta } from "./types";

const isQuota = (e: unknown) => /quota/i.test(`${(e as { name?: string })?.name || ""} ${(e as Error)?.message || ""}`);

/** Cache the editor chunk and the Python runtime; returns the runtime URLs (recorded on the saved lab). */
export async function cacheLabRuntime(): Promise<string[]> {
  await loadCodeEditor().catch(() => undefined);
  const cache = await caches.open(C.runtime);
  for (const u of RUNTIME_URLS) {
    const key = new URL(u, window.location.origin).href;
    if (await cache.match(key)) continue;
    let res: Response;
    try {
      res = await fetch(u, { credentials: "same-origin" });
    } catch {
      throw new OfflineSaveError("offline", "No connection. Saving needs the internet; what's saved so far stays.");
    }
    if (!res.ok) throw new OfflineSaveError("http", `Couldn't fetch the Python runtime for code labs (${res.status}).`);
    try {
      await cache.put(key, res);
    } catch (e) {
      if (isQuota(e)) throw new OfflineSaveError("quota", "This device is out of space for the code labs' Python runtime (~13.5 MB). Free up storage, then try again.");
      throw e;
    }
  }
  return RUNTIME_URLS;
}

/**
 * Extra bytes a save will store for the Python runtime: its size when the items include a lab and
 * no lab is saved on this device yet, else 0. Shown in the save buttons' size estimates.
 */
export function labRuntimeExtra(catalog: Catalog | null | undefined, saved: Map<string, SavedMeta>, items: { kind: string }[]): number {
  if (!catalog?.runtimeBytes || !items.some((i) => i.kind === "lab")) return 0;
  for (const m of saved.values()) if (m.kind === "lab") return 0;
  return catalog.runtimeBytes;
}
