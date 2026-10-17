"use client";

/**
 * "Install the app": Chrome/Edge/Android get the browser's own install prompt (only when the
 * reader asks — the automatic mini-infobar is suppressed); iPhone/iPad get the Add to Home Screen
 * steps (Safari has no prompt). Hidden when already installed or when the browser can't install.
 */
import { useState } from "react";
import { Share, Smartphone, SquarePlus } from "lucide-react";
import Overlay from "@/components/learn/hub/Overlay";
import { track } from "@/lib/track";
import { useOffline } from "./OfflineProvider";

export function useCanInstall() {
  const { install, supported } = useOffline();
  return supported && !install.installed && (install.canPrompt || install.ios);
}

export function InstallButton({ className = "", label = "Install the app" }: { className?: string; label?: string }) {
  const { install } = useOffline();
  const can = useCanInstall();
  const [sheet, setSheet] = useState(false);
  if (!can) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (install.canPrompt) {
            void install.prompt();
            return;
          }
          // Safari can't say whether the steps were followed: the app's first launch reports the install
          track("pwa_install_prompt", { outcome: "shown", via: "ios_sheet", platform: "ios" });
          setSheet(true);
        }}
        className={`inline-flex min-h-11 items-center justify-center gap-2 border border-line-strong px-3.5 text-sm font-medium text-fg hover:bg-surface-2 ${className}`}
      >
        <Smartphone className="h-4 w-4" aria-hidden />
        <span>{label}</span>
      </button>
      {sheet && <IosInstallSheet onClose={() => setSheet(false)} />}
    </>
  );
}

export function IosInstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <Overlay labelledBy="ios-install-h" onClose={onClose} className="max-w-[460px] border border-line-strong bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">iPhone · iPad</span>
            <h2 id="ios-install-h" className="m-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.025em] text-fg">
              Add to Home Screen
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-lg text-fg-3 hover:text-fg">
            ×
          </button>
        </div>
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center bg-signal font-mono text-xs font-semibold text-on-signal">1</span>
            <span className="text-[15px] leading-snug text-fg-2">
              In Safari, tap <Share className="inline h-4 w-4 align-[-2px] text-fg" aria-label="Share" /> <b className="text-fg">Share</b> (bottom bar, or top right on iPad).
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center bg-signal font-mono text-xs font-semibold text-on-signal">2</span>
            <span className="text-[15px] leading-snug text-fg-2">
              Scroll down and tap <SquarePlus className="inline h-4 w-4 align-[-2px] text-fg" aria-hidden /> <b className="text-fg">Add to Home Screen</b>, then <b className="text-fg">Add</b>.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center bg-signal font-mono text-xs font-semibold text-on-signal">3</span>
            <span className="text-[15px] leading-snug text-fg-2">Open the course from the new icon and save lessons there.</span>
          </li>
        </ol>
        <p className="m-0 border-l-2 border-signal pl-3 text-sm leading-relaxed text-fg-3">
          Why: Safari can clear a website&apos;s saved data after about a week without a visit. Lessons saved in the home-screen app stay until you remove them.
        </p>
      </div>
    </Overlay>
  );
}
