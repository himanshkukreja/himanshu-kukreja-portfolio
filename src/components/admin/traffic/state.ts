"use client";

/**
 * URL state for /admin/traffic: range (?range=, shared with the kit's RangePicker), filters
 * (?f=<json>), "exclude my visits" (?me=include turns it off), trend metric (?m=), funnel steps
 * (?steps=). Everything is shareable / reload-safe.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useRange } from "@/components/admin/ui";
import type { FilterKey, Filters } from "@/lib/admin/traffic/report";

export const FILTER_LABEL: Record<FilterKey, string> = {
  page: "page",
  entry: "entry",
  exit: "exit",
  channel: "channel",
  ref: "referrer",
  utm_source: "utm source",
  utm_medium: "utm medium",
  utm_campaign: "utm campaign",
  country: "country",
  city: "city",
  device: "device",
  browser: "browser",
  os: "os",
  visitor: "visitor",
  signed_in: "signed in",
};

export const DEFAULT_STEPS = "page:*,page:/learn*,event:lesson_open,event:stage_done,event:lesson_complete";

export function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
  } catch {
    return "Asia/Kolkata";
  }
}

function parseF(raw: string | null): Filters {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? (o as Filters) : {};
  } catch {
    return {};
  }
}

export function useTrafficState() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const range = useRange("30d");
  const fRaw = params.get("f");
  const filters = useMemo(() => parseF(fRaw), [fRaw]);
  const excludeMe = params.get("me") !== "include";
  const metric = params.get("m") || "visitors";
  const steps = params.get("steps") || DEFAULT_STEPS;

  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const setFilters = useCallback((f: Filters) => set({ f: Object.keys(f).length ? JSON.stringify(f) : null }), [set]);
  const addFilter = useCallback((k: FilterKey, v: string) => setFilters({ ...filters, [k]: v }), [filters, setFilters]);
  const removeFilter = useCallback(
    (k: string) => {
      const next = { ...filters };
      delete next[k as FilterKey];
      setFilters(next);
    },
    [filters, setFilters]
  );

  /** Query string shared by every traffic API call. */
  const query = useMemo(() => {
    const q = new URLSearchParams({ range, tz: browserTz() });
    if (Object.keys(filters).length) q.set("f", JSON.stringify(filters));
    if (!excludeMe) q.set("me", "include");
    return q.toString();
  }, [range, filters, excludeMe]);

  return { range, filters, excludeMe, metric, steps, query, set, setFilters, addFilter, removeFilter };
}
