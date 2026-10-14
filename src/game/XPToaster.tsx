"use client";

import { useGame } from "./GameProvider";

export default function XPToaster() {
  const { toasts } = useGame();
  if (toasts.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 z-[60] flex flex-col items-end gap-2"
      style={{ top: "calc(var(--hk-header-h, 64px) + var(--learn-nav-h, 0px) + 12px)" }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex animate-hk-in items-center gap-3 px-4 py-3 ${
            t.levelUp ? "bg-signal text-on-signal" : "border border-signal bg-bg text-fg"
          }`}
        >
          <span className="font-mono text-base font-semibold">+{t.xp} XP</span>
          <span className="text-sm">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
