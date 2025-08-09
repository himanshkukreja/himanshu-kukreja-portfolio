"use client";
import { useEffect, useRef, useCallback } from "react";

// Augment window to hold our flag without using 'any'
declare global {
  interface Window { __SMART_SCROLL_ENABLED?: boolean }
}

// Single toggle to enable/disable SmartScroll globally
export const SMART_SCROLL_ENABLED = false;

// Global getters/setters so even stale listeners respect the latest toggle
function getGlobalSmartScrollEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.__SMART_SCROLL_ENABLED;
}
function setGlobalSmartScrollEnabled(v: boolean) {
  if (typeof window === 'undefined') return;
  window.__SMART_SCROLL_ENABLED = v;
}

// Configurable options
export type SmartScrollConfig = {
  enabled: boolean;
  durationMs: number;
  easing: (t: number) => number;
  earlySnapThreshold: number;
  minViewportForSnapPx: number;
  offsetPx: number;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const defaultConfig: SmartScrollConfig = {
  enabled: SMART_SCROLL_ENABLED,
  durationMs: 220,
  easing: easeInOutCubic,
  earlySnapThreshold: 0.8,
  minViewportForSnapPx: 380,
  offsetPx: 96,
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

// Removed rAF animation; keeping function definition unused to avoid larger refactors
/* function smoothScrollTo(
  y: number,
  duration: number,
  easing: (t: number) => number,
  onDone?: () => void
) {
  const startY = window.scrollY || window.pageYOffset;
  const delta = y - startY;
  if (Math.abs(delta) < 1) {
    if (onDone) onDone();
    return null;
  }
  const start = performance.now();
  let animationId: number;
  const frame = () => {
    const t = clamp((performance.now() - start) / duration, 0, 1);
    const eased = easing(t);
    window.scrollTo(0, startY + delta * eased);
    if (t < 1) {
      animationId = requestAnimationFrame(frame);
    } else {
      if (onDone) onDone();
    }
  };
  animationId = requestAnimationFrame(frame);
  return () => {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
  };
} */

function isAlwaysInteractiveTarget(target: HTMLElement): boolean {
  return !!target.closest(
    'textarea, input, select, [contenteditable="true"], [role="textbox"]'
  );
}

// Memoized section lookup with caching
let sectionsCache: HTMLElement[] = [];
let sectionsCacheTime = 0;
const CACHE_DURATION = 1000; // 1 second cache

function getSnapSections(): HTMLElement[] {
  const now = performance.now();
  if (now - sectionsCacheTime > CACHE_DURATION) {
    sectionsCache = Array.from(document.querySelectorAll<HTMLElement>('section[data-snap-section]'));
    sectionsCacheTime = now;
  }
  return sectionsCache;
}

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node && node !== document.body) {
    if (node.getAttribute?.('data-scrollable') === 'true') return node;
    const style = getComputedStyle(node);
    const overflowY = style.overflowY;
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function canScrollInDirection(el: HTMLElement, direction: 1 | -1): boolean {
  const top = Math.round(el.scrollTop);
  if (direction === 1) {
    return top + el.clientHeight < el.scrollHeight - 1;
  } else {
    return top > 0;
  }
}

function shouldAllowNativeScroll(target: EventTarget | null, direction: 1 | -1): boolean {
  const el = (target as HTMLElement) || document.body;
  if (isAlwaysInteractiveTarget(el)) return true;
  const scrollable = findScrollableAncestor(el);
  if (!scrollable) return false;
  return canScrollInDirection(scrollable, direction);
}

function getIndexByAnchor(sections: HTMLElement[], offsetPx: number): number {
  const anchor = (window.scrollY || window.pageYOffset) + offsetPx + 1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const top = s.offsetTop;
    const bottom = top + s.offsetHeight;
    if (anchor >= top && anchor < bottom) return i;
  }
  return -1;
}

function getCurrentSectionIndexDirectional(
  sections: HTMLElement[],
  offsetPx: number
): number {
  if (sections.length === 0) return -1;

  // Simplified: use anchor-based detection primarily
  const anchor = (window.scrollY || window.pageYOffset) + offsetPx + 1;
  let topIdx = -1;
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const top = s.offsetTop;
    const bottom = top + s.offsetHeight;
    if (anchor >= top && anchor < bottom) {
      topIdx = i;
      break;
    }
  }

  if (topIdx !== -1) return topIdx;

  // Fallback: closest section
  const viewportTop = window.scrollY || window.pageYOffset;
  let closestIdx = 0;
  let minDistance = Infinity;
  for (let i = 0; i < sections.length; i++) {
    const distance = Math.abs(sections[i].offsetTop - viewportTop);
    if (distance < minDistance) {
      minDistance = distance;
      closestIdx = i;
    }
  }
  return closestIdx;
}

export default function SmartScroll({ config }: { config?: Partial<SmartScrollConfig> }) {
  const cfg = { ...defaultConfig, ...(config || {}) } as SmartScrollConfig;
  // Ensure global kill-switch always wins over incoming config
  if (!SMART_SCROLL_ENABLED) cfg.enabled = false;

  const touchStartY = useRef<number | null>(null);
  const touchStartTargetRef = useRef<EventTarget | null>(null);
  const isSnappingRef = useRef(false);
  const activeIndexRef = useRef<number>(-1);
  const lastSnapTimeRef = useRef(0);
  const snapCooldownMs = 250; // shorter cooldown, responsive but avoids repeat
  // Removed cancelAnimationRef as we no longer animate
  // Throttled scroll handler
  const lastScrollTime = useRef(0);
  const SCROLL_THROTTLE = 16; // ~60fps
  const enabledRef = useRef<boolean>(cfg.enabled);

  // Keep global flag and ref synchronized
  useEffect(() => {
    enabledRef.current = cfg.enabled;
    setGlobalSmartScrollEnabled(cfg.enabled);
  }, [cfg.enabled]);

  const maybeSnap = useCallback((direction: 1 | -1, evt: Event) => {
    // Respect global/instance disable without affecting native scroll
    if (!enabledRef.current || !getGlobalSmartScrollEnabled()) return;

    // If snapping flagged, block and return
    if (isSnappingRef.current) {
      evt.preventDefault();
      return;
    }

    const now = performance.now();
    if (now - lastSnapTimeRef.current < snapCooldownMs) {
      return; // allow natural scroll
    }

    if (window.innerHeight < cfg.minViewportForSnapPx) return;

    const sections = getSnapSections();
    if (sections.length === 0) return;

    if (activeIndexRef.current === -1) {
      const initIdx = getCurrentSectionIndexDirectional(sections, cfg.offsetPx);
      if (initIdx !== -1) activeIndexRef.current = initIdx;
    }

    const baseIdx = activeIndexRef.current !== -1
      ? activeIndexRef.current
      : getCurrentSectionIndexDirectional(sections, cfg.offsetPx);
    if (baseIdx === -1) return;

    const targetIdx = clamp(baseIdx + direction, 0, sections.length - 1);
    if (targetIdx === baseIdx) return;

    const target = sections[targetIdx];
    const targetY = Math.max(0, target.offsetTop - cfg.offsetPx);
    const currentY = window.scrollY || window.pageYOffset;
    const distance = Math.abs(targetY - currentY);

    if (distance < 50) return; // avoid micro-snaps

    evt.preventDefault();
    lastSnapTimeRef.current = now;

    // Instant jump without animation to avoid jitter
    isSnappingRef.current = true;
    window.scrollTo({ top: targetY, behavior: 'auto' });
    isSnappingRef.current = false;

    // Update active index immediately
    activeIndexRef.current = targetIdx;
  }, [cfg.offsetPx, cfg.minViewportForSnapPx, snapCooldownMs]);

  const onWheel = useCallback((e: WheelEvent) => {
    // Respect global/instance disable
    if (!getGlobalSmartScrollEnabled()) return;

    if (Math.abs(e.deltaY) < 5) return; // ignore tiny deltas
    const direction: 1 | -1 = e.deltaY > 0 ? 1 : -1;
    if (shouldAllowNativeScroll(e.target, direction)) return;
    maybeSnap(direction, e);
  }, [maybeSnap]);

  const onTouchStart = useCallback((e: TouchEvent) => {
    // Respect global/instance disable
    if (!getGlobalSmartScrollEnabled()) return;

    touchStartY.current = e.touches[0]?.clientY ?? null;
    touchStartTargetRef.current = e.target;
  }, []);

  const onTouchMove = useCallback((e: TouchEvent) => {
    // Respect global/instance disable
    if (!getGlobalSmartScrollEnabled()) return;

    if (touchStartY.current == null) return;
    const dy = touchStartY.current - (e.touches[0]?.clientY ?? touchStartY.current);
    if (Math.abs(dy) < 30) return; // higher threshold for touch
    const direction: 1 | -1 = dy > 0 ? 1 : -1;
    if (shouldAllowNativeScroll(touchStartTargetRef.current, direction)) return;
    maybeSnap(direction, e);
    touchStartY.current = null;
    touchStartTargetRef.current = null;
  }, [maybeSnap]);

  const onScroll = useCallback(() => {
    // If disabled, do nothing
    if (!getGlobalSmartScrollEnabled()) return;
    if (isSnappingRef.current) return;
    const now = performance.now();
    if (now - lastScrollTime.current < SCROLL_THROTTLE) return;
    lastScrollTime.current = now;
    const sections = getSnapSections();
    if (!sections.length) return;
    const idx = getIndexByAnchor(sections, cfg.offsetPx);
    if (idx !== -1) activeIndexRef.current = idx;
  }, [cfg.offsetPx]);

  useEffect(() => {
    // Ensure global reflects current state even if we don't attach listeners
    setGlobalSmartScrollEnabled(cfg.enabled);

    if (!cfg.enabled) return;

    // Initialize active index
    const initSections = getSnapSections();
    if (initSections.length) {
      const idx = getIndexByAnchor(initSections, cfg.offsetPx);
      if (idx !== -1) activeIndexRef.current = idx;
    }

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('scroll', onScroll);
    };
  }, [cfg.enabled, cfg.offsetPx, onWheel, onTouchStart, onTouchMove, onScroll]);

  return null;
}