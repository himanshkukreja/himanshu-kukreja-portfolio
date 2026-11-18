"use client";

import { useSyncExternalStore } from "react";
import { MIN_ACTIVE_SECONDS } from "@/lib/analytics/recordingFilter";

const KEY = "hk-admin-show-idle-recordings";

const EVT = "hk-show-idle-change";

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** "Show idle recordings" toggle, default off, remembered in this browser (all reads/writes guarded). */
export function useShowIdle(): [boolean, (v: boolean) => void] {
  const on = useSyncExternalStore(subscribe, read, () => false);
  const set = (v: boolean) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* not remembered */
    }
    window.dispatchEvent(new Event(EVT));
  };
  return [on, set];
}

export function ShowIdleToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 font-mono text-[11px] text-fg-3" title={`Hidden by default: recordings with under ${MIN_ACTIVE_SECONDS} s of activity. The player skips idle time.`}>
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[var(--signal,currentColor)]" />
      Show idle recordings
    </label>
  );
}
