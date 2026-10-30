"use client";

/**
 * Mounted on lesson pages: waits for "hk:notebook-open" (the reading tools' Notebook button, openNotebookPanel()
 * from the capture tools) and only then loads the panel and the ink engine, so a lesson that never opens the
 * notebook pays nothing for it.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { INK_EVENTS } from "@/lib/learn/ink/types";
import type { NotebookPanelLesson } from "./NotebookPanel";

const NotebookPanel = dynamic(() => import("./NotebookPanel"), { ssr: false });

export default function NotebookPanelHost({ lesson }: { lesson: NotebookPanelLesson }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<{ pageId?: string; n: number }>({ n: 0 });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ pageId?: string }>).detail || {};
      setTarget((t) => ({ pageId: d.pageId, n: t.n + 1 }));
      setOpen(true);
    };
    window.addEventListener(INK_EVENTS.open, onOpen);
    return () => window.removeEventListener(INK_EVENTS.open, onOpen);
  }, []);

  const close = useCallback(() => setOpen(false), []);
  if (!open) return null;
  return <NotebookPanel lesson={lesson} target={target} onClose={close} />;
}
