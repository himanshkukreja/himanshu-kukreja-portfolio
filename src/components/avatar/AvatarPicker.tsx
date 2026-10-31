"use client";

/**
 * Change avatar: a cartoon (People / Mascots), your own photo (square crop + zoom, done on a canvas
 * here so EXIF / GPS never leave the device), your Google photo, or initials.
 * Opened from the account menu and the progress page header. Saves through /api/learn/profile/avatar
 * and patches the AuthContext profile, so every avatar on the page changes at once.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Minus, Plus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import UserAvatar from "./UserAvatar";
import { AVATARS, AVATAR_LIMITS, avatarKind, catalogAvatarPath, parseCatalogAvatar, type AvatarGroup } from "@/lib/avatars/catalog";
import { sniffImage } from "@/lib/avatars/image-check";

type Tab = AvatarGroup | "photo";
type Choice = { kind: "cartoon"; key: string } | { kind: "google" } | { kind: "none" } | { kind: "upload" };
type Photo = { url: string; img: HTMLImageElement; w: number; h: number; name: string };
type Crop = { cx: number; cy: number; zoom: number };

const TABS: { id: Tab; label: string }[] = [
  { id: "people", label: "People" },
  { id: "mascots", label: "Mascots" },
  { id: "photo", label: "Your photo" },
];
const MAX_ZOOM = 4;
const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

export default function AvatarPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!mounted || !open) return null;
  return createPortal(<PickerDialog onClose={onClose} />, document.body);
}

function PickerDialog({ onClose }: { onClose: () => void }) {
  const { user, profile, patchProfile, refreshProfile } = useAuth();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const current = profile?.avatar_url ?? null;
  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "You";
  const metaGoogle = [user?.user_metadata?.avatar_url, user?.user_metadata?.picture].find((v): v is string => typeof v === "string" && v.startsWith("https://")) ?? null;
  const [google, setGoogle] = useState<string | null>(metaGoogle);
  const curCartoon = parseCatalogAvatar(current);
  const [tab, setTab] = useState<Tab>(curCartoon?.group ?? (avatarKind(current) === "upload" ? "photo" : "people"));
  const [choice, setChoice] = useState<Choice | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // The server knows the Google photo even when the session's metadata doesn't carry it.
  useEffect(() => {
    let live = true;
    userFetch("/api/learn/profile/avatar")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => live && j && typeof j.googlePhoto === "string" && setGoogle(j.googlePhoto))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Focus in, focus back out, no page scroll underneath.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') || panelRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      target?.focus();
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      if (before && before !== document.body && before.isConnected) before.focus();
    };
  }, []);

  useEffect(() => () => void (photo && URL.revokeObjectURL(photo.url)), [photo]);

  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !panelRef.current) return;
    const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]')).filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const pendingUrl = useMemo(() => {
    if (!choice) return current;
    if (choice.kind === "cartoon") return catalogAvatarPath(choice.key);
    if (choice.kind === "google") return google;
    if (choice.kind === "none") return null;
    return null;
  }, [choice, current, google]);

  const selectedKey = choice?.kind === "cartoon" ? choice.key : !choice && curCartoon ? `${curCartoon.group}/${curCartoon.avatar.id}` : null;
  const kind = avatarKind(current, google);
  const changed = !!choice && !(choice.kind === "cartoon" && catalogAvatarPath(choice.key) === current) && !(choice.kind === "google" && kind === "google") && !(choice.kind === "none" && kind === "none");

  const describe = (): string => {
    if (choice?.kind === "upload") return "Your photo (not saved yet)";
    const url = pendingUrl;
    const c = parseCatalogAvatar(url);
    if (c) return `${c.group === "people" ? "Person" : "Mascot"} · ${c.avatar.label}`;
    const k = avatarKind(url, google);
    return k === "upload" ? "Your photo" : k === "google" ? "Google photo" : k === "none" ? "Initials" : "Photo";
  };

  async function save() {
    if (!choice || busy) return;
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (choice.kind === "upload") {
        if (!photo || !crop) throw new Error("Choose a photo first.");
        const blob = await renderCrop(photo, crop);
        res = await userFetch("/api/learn/profile/avatar", { method: "POST", body: blob, headers: { "Content-Type": blob.type } });
      } else {
        const body = choice.kind === "cartoon" ? { kind: "cartoon", id: choice.key } : { kind: choice.kind };
        res = await userFetch("/api/learn/profile/avatar", { method: "PUT", body: JSON.stringify(body) });
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || (res.status === 401 ? "Your session ended. Sign in again." : "Couldn't save. Try again."));
      patchProfile({ avatar_url: j.avatarUrl ?? null });
      void refreshProfile();
      setBusy(false);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save. Try again.");
      setBusy(false);
    }
  }

  async function pickFile(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    const head = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const fmt = sniffImage(head);
    if (!fmt || fmt === "gif") return setPhotoError("That file isn't a JPEG, PNG or WebP photo.");
    if (file.size > AVATAR_LIMITS.maxInputBytes) return setPhotoError(`That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      URL.revokeObjectURL(url);
      return setPhotoError(fmt === "heic" ? "This browser can't open HEIC photos. Save it as a JPEG and try again." : "That photo couldn't be opened. Try another one.");
    }
    const w = img.naturalWidth, h = img.naturalHeight;
    if (w < 64 || h < 64) {
      URL.revokeObjectURL(url);
      return setPhotoError("That photo is too small. Use one at least 64 × 64 pixels.");
    }
    setPhoto({ url, img, w, h, name: file.name });
    setCrop({ cx: w / 2, cy: h / 2, zoom: 1 });
    setChoice({ kind: "upload" });
  }

  const pickCartoon = (key: string) => setChoice({ kind: "cartoon", key });

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center sm:items-center sm:p-4" onKeyDown={onKeyDown}>
      <div className="absolute inset-0 bg-black/70" onClick={close} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[94dvh] w-full max-w-[600px] animate-hk-in flex-col border border-line-strong bg-surface sm:max-h-[min(90dvh,820px)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line py-2 pl-4 pr-2 sm:pl-6">
          <h2 id={titleId} className="font-display text-xl font-bold tracking-[-0.02em] text-fg">
            Your avatar<span className="text-signal-text">.</span>
          </h2>
          <button type="button" onClick={close} aria-label="Close" className="grid h-11 w-11 place-items-center text-fg-3 hover:text-fg">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Preview of what will be saved */}
          <div className="flex items-center gap-4 px-4 py-4 sm:px-6">
            {choice?.kind === "upload" && photo && crop ? (
              <CropThumb photo={photo} crop={crop} size={72} />
            ) : (
              <UserAvatar src={pendingUrl} name={name} size={72} className="border border-line-strong" initialsClassName="bg-fg text-bg" />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-medium text-fg">{name}</span>
              <span className="text-[13px] text-fg-3" aria-live="polite">
                {describe()}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                {google && (
                  <button type="button" onClick={() => setChoice({ kind: "google" })} disabled={kind === "google" && !choice} aria-pressed={choice?.kind === "google"} className="min-h-9 font-mono text-[12px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg disabled:text-fg-4 disabled:no-underline aria-pressed:text-signal-text">
                    use my Google photo
                  </button>
                )}
                <button type="button" onClick={() => setChoice({ kind: "none" })} disabled={kind === "none" && !choice} aria-pressed={choice?.kind === "none"} className="min-h-9 font-mono text-[12px] text-fg-2 underline decoration-line-strong underline-offset-4 hover:text-fg disabled:text-fg-4 disabled:no-underline aria-pressed:text-signal-text">
                  remove (show initials)
                </button>
              </div>
            </div>
          </div>

          <Tabs tab={tab} onTab={setTab} />

          <div id="avatar-tabpanel" role="tabpanel" aria-labelledby={`avatar-tab-${tab}`} className="px-4 pb-5 pt-4 sm:px-6">
            {tab === "photo" ? (
              <PhotoPanel photo={photo} crop={crop} setCrop={setCrop} error={photoError} onFile={pickFile} active={choice?.kind === "upload"} onUse={() => setChoice({ kind: "upload" })} />
            ) : (
              <CartoonGrid group={tab} selected={selectedKey} onPick={pickCartoon} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-line px-4 py-3 sm:px-6">
          {error && (
            <p role="alert" className="text-[13px] text-bad-text">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[12px] text-fg-4">Your photo is public on your profile and comments.</p>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={close} disabled={busy} className="min-h-11 border border-line-strong px-4 text-sm font-medium text-fg hover:bg-surface-2 disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={save} disabled={!changed || busy} className="min-h-11 bg-signal px-5 text-sm font-semibold text-on-signal hover:opacity-90 disabled:opacity-40">
                {busy ? "Saving…" : choice?.kind === "upload" ? "Save photo" : choice?.kind === "none" ? "Remove avatar" : "Save avatar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = (i + d + TABS.length) % TABS.length;
    onTab(TABS[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label="Avatar style" className="flex border-y border-line px-2 sm:px-4">
      {TABS.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`avatar-tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls="avatar-tabpanel"
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onTab(t.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={`-mb-px min-h-11 border-b-2 px-3 font-mono text-[13px] sm:px-4 ${tab === t.id ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
        >
          {t.id === "photo" && <ImagePlus className="mr-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

function CartoonGrid({ group, selected, onPick }: { group: AvatarGroup; selected: string | null; onPick: (key: string) => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const list = AVATARS[group];
  const selIdx = list.findIndex((a) => `${group}/${a.id}` === selected);
  const focusIdx = selIdx >= 0 ? selIdx : 0;

  const onKey = (e: ReactKeyboardEvent, i: number) => {
    const cols = gridRef.current ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").length : 4;
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    let n = i;
    if (e.key in step) n = Math.min(list.length - 1, Math.max(0, i + step[e.key]));
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = list.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onPick(`${group}/${list[i].id}`);
      return;
    } else return;
    e.preventDefault();
    onPick(`${group}/${list[n].id}`);
    gridRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[n]?.focus();
  };

  return (
    <div ref={gridRef} role="radiogroup" aria-label={group === "people" ? "People avatars" : "Mascot avatars"} className="grid grid-cols-4 gap-2 sm:grid-cols-8 sm:gap-2.5">
      {list.map((a, i) => {
        const key = `${group}/${a.id}`;
        const on = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={a.label}
            title={a.label}
            tabIndex={i === focusIdx ? 0 : -1}
            onClick={() => onPick(key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative aspect-square min-h-11 min-w-11 overflow-hidden outline-none ring-offset-2 ring-offset-surface focus-visible:ring-2 focus-visible:ring-fg ${on ? "outline outline-[3px] outline-offset-0 outline-signal" : "hover:opacity-90"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG */}
            <img src={`/avatars/${group}/${a.id}.svg`} alt="" width={128} height={128} className="h-full w-full" />
            {on && (
              <span aria-hidden className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center bg-signal text-on-signal">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PhotoPanel(p: { photo: Photo | null; crop: Crop | null; setCrop: (c: Crop) => void; error: string | null; onFile: (f: File | undefined) => void; active: boolean; onUse: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const chooser = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          p.onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} className={`inline-flex min-h-11 items-center gap-2 px-4 text-sm font-medium ${p.photo ? "border border-line-strong text-fg hover:bg-surface-2" : "bg-fg text-bg hover:opacity-90"}`}>
        <ImagePlus className="h-4 w-4" aria-hidden />
        {p.photo ? "Choose another photo" : "Upload photo"}
      </button>
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      {p.photo && p.crop ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
          <Cropper photo={p.photo} crop={p.crop} setCrop={p.setCrop} />
          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-1">
            <div className="flex flex-col gap-2">
              <span className={LABEL}>preview</span>
              <div className="flex items-end gap-3">
                <CropThumb photo={p.photo} crop={p.crop} size={64} />
                <CropThumb photo={p.photo} crop={p.crop} size={36} />
                <CropThumb photo={p.photo} crop={p.crop} size={24} />
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-fg-3">Drag to move, use the slider to zoom. Saved as a 256 px square; location and camera details are removed.</p>
            <div className="flex flex-wrap gap-2">
              {chooser}
              {!p.active && (
                <button type="button" onClick={p.onUse} className="min-h-11 bg-fg px-4 text-sm font-medium text-bg hover:opacity-90">
                  Use this photo
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3 border border-dashed border-line-strong p-5">
          <p className="text-sm text-fg-2">A JPEG, PNG or WebP photo up to 2 MB. You&apos;ll crop it to a square next.</p>
          {chooser}
        </div>
      )}
      {p.error && (
        <p role="alert" className="text-[13px] text-bad-text">
          {p.error}
        </p>
      )}
    </div>
  );
}

/** Scale (screen px per image px) for a square viewport of `size` px. */
const scaleFor = (photo: Photo, zoom: number, size: number) => (size / Math.min(photo.w, photo.h)) * zoom;

function clampCrop(photo: Photo, c: Crop): Crop {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, c.zoom));
  const half = Math.min(photo.w, photo.h) / zoom / 2; // half the visible square, in image px
  return { zoom, cx: Math.min(photo.w - half, Math.max(half, c.cx)), cy: Math.min(photo.h - half, Math.max(half, c.cy)) };
}

function Cropper({ photo, crop, setCrop }: { photo: Photo; crop: Crop; setCrop: (c: Crop) => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(260);
  const drag = useRef<{ x: number; y: number; crop: Crop } | null>(null);
  const cropRef = useRef(crop);
  const zoomId = useId();

  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(el.clientWidth || 260));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const set = (c: Crop) => setCrop(clampCrop(photo, c));
  const scale = scaleFor(photo, crop.zoom, size);

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const s = scaleFor(photo, d.crop.zoom, size);
    set({ ...d.crop, cx: d.crop.cx - (e.clientX - d.x) / s, cy: d.crop.cy - (e.clientY - d.y) / s });
  };
  const onUp = () => {
    drag.current = null;
  };
  const onKey = (e: ReactKeyboardEvent) => {
    const step = 12 / scale;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key in moves) {
      e.preventDefault();
      const [dx, dy] = moves[e.key];
      set({ ...crop, cx: crop.cx + dx, cy: crop.cy + dy });
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      set({ ...crop, zoom: crop.zoom + 0.2 });
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      set({ ...crop, zoom: crop.zoom - 0.2 });
    }
  };

  // Non-passive wheel listener so the page doesn't scroll while zooming the photo.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCrop(clampCrop(photo, { ...cropRef.current, zoom: cropRef.current.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08) }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [photo, setCrop]);
  return (
    <div className="flex w-full max-w-[280px] flex-col gap-3">
      <div
        ref={boxRef}
        tabIndex={0}
        role="group"
        aria-roledescription="crop area"
        aria-label="Crop your photo. Drag or use the arrow keys to move it; plus and minus to zoom."
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className="relative aspect-square w-full cursor-grab touch-none select-none overflow-hidden border border-line-strong bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-signal active:cursor-grabbing"
      >
        <PhotoLayer photo={photo} crop={crop} size={size} />
        {/* thirds guide */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,transparent_33.2%,rgba(255,255,255,.35)_33.3%,transparent_33.5%,transparent_66.5%,rgba(255,255,255,.35)_66.6%,transparent_66.8%),linear-gradient(to_bottom,transparent_33.2%,rgba(255,255,255,.35)_33.3%,transparent_33.5%,transparent_66.5%,rgba(255,255,255,.35)_66.6%,transparent_66.8%)]" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set({ ...crop, zoom: crop.zoom - 0.25 })} aria-label="Zoom out" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg hover:bg-surface-2">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <label htmlFor={zoomId} className="sr-only">
          Zoom
        </label>
        <input id={zoomId} type="range" min={1} max={MAX_ZOOM} step={0.01} value={crop.zoom} onChange={(e) => set({ ...crop, zoom: Number(e.target.value) })} className="h-11 min-w-0 flex-1 accent-[var(--c-signal)]" />
        <button type="button" onClick={() => set({ ...crop, zoom: crop.zoom + 0.25 })} aria-label="Zoom in" className="grid h-11 w-11 shrink-0 place-items-center border border-line-strong text-fg hover:bg-surface-2">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** The photo positioned for a square box of `size` px (used by the cropper and the previews). */
function PhotoLayer({ photo, crop, size }: { photo: Photo; crop: Crop; size: number }) {
  const s = scaleFor(photo, crop.zoom, size);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local object URL
    <img
      src={photo.url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute left-0 top-0 max-w-none origin-top-left"
      style={{ width: photo.w * s, height: photo.h * s, transform: `translate(${size / 2 - crop.cx * s}px, ${size / 2 - crop.cy * s}px)` }}
    />
  );
}

function CropThumb({ photo, crop, size }: { photo: Photo; crop: Crop; size: number }) {
  return (
    <span aria-hidden className="relative block shrink-0 overflow-hidden border border-line-strong bg-surface-2" style={{ width: size, height: size }}>
      <PhotoLayer photo={photo} crop={crop} size={size - 2} />
    </span>
  );
}

/**
 * The crop as a 256×256 WebP (JPEG where the browser can't encode WebP). Drawing into a canvas
 * keeps only pixels: EXIF, GPS and every other metadata block stay behind.
 */
async function renderCrop(photo: Photo, crop: Crop): Promise<Blob> {
  const N = AVATAR_LIMITS.size;
  const side = Math.min(photo.w, photo.h) / crop.zoom;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't crop photos.");
  const draw = (fill?: string) => {
    ctx.clearRect(0, 0, N, N);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(0, 0, N, N);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo.img, crop.cx - side / 2, crop.cy - side / 2, side, side, 0, 0, N, N);
  };
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, q));
  draw();
  const webp = await toBlob("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  draw("#FFFFFF"); // JPEG has no transparency
  const jpeg = await toBlob("image/jpeg", 0.88);
  if (!jpeg) throw new Error("This browser couldn't save the crop.");
  return jpeg;
}
