/**
 * A real screenshot from public/guide (made by `npm run guide:shots`), framed like a browser
 * window, with numbered callouts overlaid from public/guide/shots.json and a matching legend.
 * When a phone capture exists it replaces the desktop one below the `sm` breakpoint (each variant
 * keeps its own markers and legend; hidden images are never fetched because they're lazy).
 */
import Image from "next/image";
import type { ReactNode } from "react";
import manifest from "../../../../public/guide/shots.json";

type Variant = {
  src: string;
  w: number;
  h: number;
  alt: string;
  url: string;
  callouts: { n: number; x: number; y: number }[];
  legend: { n: number; label: string }[];
};
type Entry = Partial<Record<"desktop" | "phone", Variant>>;

const SHOTS = manifest as Record<string, Entry>;

export function Marker({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center bg-signal font-mono text-[12px] font-bold leading-none text-on-signal ${className}`}>
      {n}
    </span>
  );
}

function Frame({ v, kind, sizes, priority, example }: { v: Variant; kind: "desktop" | "phone"; sizes: string; priority?: boolean; example?: boolean }) {
  return (
    <div className={`border border-line-strong bg-surface ${kind === "phone" ? "mx-auto w-full max-w-[360px]" : ""}`}>
      <div className="flex h-8 items-center gap-2 border-b border-line px-3 font-mono text-[11px] text-fg-3">
        <span aria-hidden className="flex gap-1">
          <span className="h-1.5 w-1.5 bg-line-strong" />
          <span className="h-1.5 w-1.5 bg-line-strong" />
          <span className="h-1.5 w-1.5 bg-line-strong" />
        </span>
        <span className="min-w-0 flex-1 truncate">himanshukukreja.in{v.url}</span>
        {example && <span className="shrink-0 border border-line-strong px-1.5 text-[10px] uppercase tracking-label">example data</span>}
      </div>
      <div className="relative">
        <Image
          src={v.src}
          width={v.w}
          height={v.h}
          alt={v.alt}
          sizes={sizes}
          priority={priority}
          className="block h-auto w-full dark:brightness-[0.9]"
        />
        {v.callouts.map((c) => (
          <span key={c.n} className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 shadow-[0_0_0_2px_var(--c-bg)]" style={{ left: `${c.x}%`, top: `${c.y}%` }}>
            <Marker n={c.n} className={kind === "phone" ? "h-5 w-5 text-[11px]" : "sm:h-7 sm:w-7 sm:text-[13px]"} />
          </span>
        ))}
      </div>
    </div>
  );
}

function Legend({ v }: { v: Variant }) {
  if (!v.legend.length) return null;
  return (
    <ol className={`m-0 grid list-none gap-x-6 gap-y-2 p-0 ${v.legend.length > 3 ? "sm:grid-cols-2" : ""}`}>
      {v.legend.map((l) => (
        <li key={l.n} className="flex items-start gap-2.5 text-[14px] leading-snug text-fg-2">
          <Marker n={l.n} className="mt-[-1px] h-5 w-5 text-[11px]" />
          <span>{l.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** Just the framed image (desktop capture), no markers: for the "at a glance" cards. */
export function Thumb({ id, sizes = "(min-width: 1024px) 400px, 100vw" }: { id: string; sizes?: string }) {
  const v = SHOTS[id]?.desktop || SHOTS[id]?.phone;
  if (!v) return null;
  return (
    <div className="overflow-hidden border border-line bg-surface">
      <Image src={v.src} width={v.w} height={v.h} alt={v.alt} sizes={sizes} className="block aspect-[16/10] h-auto w-full object-cover object-left-top dark:brightness-[0.9]" />
    </div>
  );
}

/**
 * @param id    key in shots.json
 * @param only  force one variant everywhere
 */
export default function Shot({ id, caption, only, priority, example, wide, size }: { id: string; caption?: ReactNode; only?: "desktop" | "phone"; priority?: boolean; example?: boolean; wide?: boolean; size?: "narrow" | "medium" }) {
  const e = SHOTS[id];
  if (!e) return null;
  const desktop = only === "phone" ? undefined : e.desktop;
  const phone = only === "desktop" ? undefined : e.phone;
  const both = !!desktop && !!phone;
  const desktopSizes = wide ? "(min-width: 1280px) 1040px, (min-width: 640px) 92vw, 100vw" : "(min-width: 1280px) 820px, (min-width: 640px) 90vw, 100vw";
  return (
    <figure className={`m-0 flex w-full flex-col gap-3 ${size === "narrow" ? "max-w-[520px]" : size === "medium" ? "max-w-[760px]" : ""}`}>
      {desktop && (
        <div className={`flex flex-col gap-3 ${both ? "max-sm:hidden" : ""}`}>
          <Frame v={desktop} kind="desktop" sizes={desktopSizes} priority={priority} example={example} />
          <Legend v={desktop} />
        </div>
      )}
      {phone && (
        <div className={`flex flex-col gap-3 ${both ? "sm:hidden" : ""}`}>
          <Frame v={phone} kind="phone" sizes="360px" priority={priority} example={example} />
          <Legend v={phone} />
        </div>
      )}
      {caption && <figcaption className="font-mono text-[12px] leading-relaxed text-fg-3">{caption}</figcaption>}
    </figure>
  );
}
