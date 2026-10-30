"use client";

/**
 * The annotation layer's React shell: creates the engine (engine.ts) over the lesson, feeds it the latest props, and
 * renders the live canvas (the stroke being drawn) into <body>, fixed over the viewport. Loaded only when the lesson
 * has marks or annotate mode is turned on.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { createPortal } from "react-dom";
import { AnnotEngine, type EngineProps } from "./engine";

export type AnnotLayerHandle = { engine: () => AnnotEngine | null };

type Props = EngineProps & {
  wrapRef: React.RefObject<HTMLDivElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
};

const AnnotateLayer = forwardRef<AnnotLayerHandle, Props>(function AnnotateLayer({ wrapRef, contentRef, ...props }, ref) {
  const liveRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<AnnotEngine | null>(null);
  const P = useRef(props);

  useEffect(() => {
    P.current = props;
    engine.current?.update(props);
  });

  useEffect(() => {
    const wrap = wrapRef.current;
    const root = contentRef.current;
    const live = liveRef.current;
    if (!wrap || !root || !live) return;
    const e = new AnnotEngine(wrap, root, live, P.current);
    engine.current = e;
    // dev only: the engine on window for QA scripts (placements, timings)
    if (process.env.NODE_ENV === "development") (window as unknown as { __hkAnnot?: AnnotEngine }).__hkAnnot = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, [wrapRef, contentRef]);

  useImperativeHandle(ref, () => ({ engine: () => engine.current }), []);

  return createPortal(
    <canvas ref={liveRef} aria-hidden data-annot-live className="pointer-events-none fixed left-0 top-0" style={{ zIndex: 70, display: props.on ? undefined : "none" }} />,
    document.body
  );
});

export default AnnotateLayer;
