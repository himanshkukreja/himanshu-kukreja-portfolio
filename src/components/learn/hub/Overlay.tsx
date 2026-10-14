"use client";

import { useEffect, useRef } from "react";

/** Modal shell for learn moments (world cleared, level up, export). Esc + backdrop close, focus trap-lite. */
export default function Overlay({
  labelledBy,
  onClose,
  children,
  className = "",
  align = "center",
}: {
  labelledBy: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  align?: "center" | "top";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus], button, a[href], input, textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input, textarea, select")).filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const a = f[0];
        const z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[80] flex justify-center overflow-y-auto bg-black/80 px-3 py-6 sm:px-6 ${align === "top" ? "items-start pt-[10vh]" : "items-center"}`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={`my-auto w-full animate-hk-in shadow-[0_24px_80px_rgba(0,0,0,0.7)] ${className}`}>
        {children}
      </div>
    </div>
  );
}
