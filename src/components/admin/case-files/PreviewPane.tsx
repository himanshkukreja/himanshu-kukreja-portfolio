"use client";

/**
 * Live preview: an iframe of /admin/case-files/frame fed by postMessage with the server-rendered
 * HTML (same renderer as the public page). Desktop = a 1280px viewport scaled to fit the pane,
 * phone = a real 390px viewport (iPhone 13), so breakpoints behave exactly like on the site.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FrameMessage, FramePayload, FrameReply } from "./PreviewFrame";
import { cx } from "./client";

type Device = "desktop" | "phone";
const WIDTH: Record<Device, number> = { desktop: 1280, phone: 390 };

export default function PreviewPane({
  payload,
  loading,
  error,
  standaloneHref,
  onDiagrams,
  className,
}: {
  payload: FramePayload | null;
  loading: boolean;
  error: string | null;
  standaloneHref: string;
  onDiagrams?: (d: { total: number; failed: number }) => void;
  className?: string;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [ready, setReady] = useState(false);
  const [box, setBox] = useState({ w: 600, h: 800 });
  const frame = useRef<HTMLIFrameElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const diag = useRef(onDiagrams);
  useEffect(() => {
    diag.current = onDiagrams;
  }, [onDiagrams]);

  // start in the admin's own theme
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the page theme after mount
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const m = e.data as FrameReply;
      if (m?.type === "cf:ready") setReady(true);
      else if (m?.type === "cf:diagrams") diag.current?.({ total: m.total, failed: m.failed });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const post = (m: FrameMessage) => frame.current?.contentWindow?.postMessage(m, window.location.origin);
  useEffect(() => {
    if (ready && payload) post({ type: "cf:render", payload });
  }, [ready, payload]);
  useEffect(() => {
    if (ready) post({ type: "cf:theme", theme });
  }, [ready, theme]);

  const w = WIDTH[device];
  const scale = Math.min(1, box.w / w);
  const frameH = Math.max(400, box.h / scale);

  return (
    <div className={cx("flex min-h-0 flex-col border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-2 py-1.5">
        <div className="flex items-center gap-2">
          <Seg
            label="Device"
            value={device}
            onChange={setDevice}
            options={[
              { id: "desktop", label: "desktop" },
              { id: "phone", label: "phone" },
            ]}
          />
          <Seg
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { id: "light", label: "light" },
              { id: "dark", label: "dark" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-fg-3">
          <span aria-live="polite">{error ? <span className="text-bad-text">render failed</span> : loading ? "rendering…" : `${w}px${scale < 1 ? ` · ${Math.round(scale * 100)}%` : ""}`}</span>
          <a href={standaloneHref} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center border border-line-strong px-2 text-fg-2 hover:bg-surface-2 hover:text-fg">
            open ↗
          </a>
        </div>
      </div>
      <div ref={host} className={cx("relative min-h-[70vh] flex-1 overflow-hidden", device === "phone" ? "bg-[repeating-linear-gradient(45deg,transparent,transparent_8px,var(--c-line)_8px,var(--c-line)_9px)]" : "bg-bg")}>
        <iframe
          ref={frame}
          title="Case file preview"
          src="/admin/case-files/frame"
          className="absolute left-1/2 top-0 origin-top border-0 bg-bg"
          style={{ width: w, height: frameH, transform: `translateX(-50%) scale(${scale})` }}
        />
        {error && <div className="absolute inset-x-3 top-3 border border-bad/50 bg-surface px-3 py-2 text-[13px] text-bad-text">✗ {error}</div>}
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line-strong">
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx("min-h-9 px-2.5 font-mono text-[11px]", i > 0 && "border-l border-line-strong", value === o.id ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
