"use client";

/**
 * Brings the renderer's `::anim[name]` figures to life (src/lib/course/detect/directives.ts →
 * <figure data-sd="anim" data-anim="name" data-anim-opts="{…}">). Mounted by <CourseEnhancer/>.
 *
 * Each figure is mounted when it comes within ~one screen of the viewport: the player and the
 * explainer's own chunk load on demand (src/lib/offline/lazy.ts, so offline saves include them),
 * then the explainer renders into the figure's stage inside a shadow root. The lesson HTML can be
 * re-injected at any time (highlights): figures that left the DOM are unmounted and new ones
 * mounted. Until an explainer is ready (or if it fails) the figure shows its readable summary.
 */
import "./anim-host.css";
import { useEffect, useRef } from "react";
import { loadAnimPlayer, loadExplainer } from "@/lib/offline/lazy";

const SEL = 'figure[data-sd="anim"]';

function readOpts(fig: HTMLElement): Record<string, string> {
  try {
    const v = JSON.parse(fig.dataset.animOpts || "{}");
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export default function AnimHydrator() {
  const markerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = (markerRef.current?.closest(".course-content") as HTMLElement | null) || document.body;
    const mounted = new Map<HTMLElement, () => void>();
    let alive = true;

    const mount = async (fig: HTMLElement) => {
      if (fig.dataset.animState) return;
      const name = fig.dataset.anim || "";
      const stage = fig.querySelector<HTMLElement>(".sd-anim-stage");
      if (!stage) return;
      fig.dataset.animState = "loading";
      try {
        const [player, mod] = await Promise.all([loadAnimPlayer(), loadExplainer(name)]);
        if (!alive || !fig.isConnected) return;
        const title = fig.querySelector(".sd-anim-title")?.textContent || name;
        mounted.set(fig, player.mountExplainer(stage, mod.default, { title, opts: readOpts(fig), observe: fig }));
        fig.dataset.animState = "ready";
      } catch (err) {
        fig.dataset.animState = "error";
        if (process.env.NODE_ENV !== "production") console.warn(`Explainer "${name}" failed to load`, err);
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          void mount(e.target as HTMLElement);
        }
      },
      { rootMargin: "100% 0px" },
    );

    const scan = () => {
      for (const [fig, unmount] of mounted) {
        if (fig.isConnected) continue;
        unmount();
        mounted.delete(fig);
      }
      root.querySelectorAll<HTMLElement>(SEL).forEach((fig) => {
        if (!fig.dataset.animState) io.observe(fig);
      });
    };
    scan();

    let raf = 0;
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => r.addedNodes.length || r.removedNodes.length)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      mo.disconnect();
      io.disconnect();
      mounted.forEach((unmount) => unmount());
      mounted.clear();
    };
  }, []);

  return <span ref={markerRef} hidden data-sd-chrome="" />;
}
