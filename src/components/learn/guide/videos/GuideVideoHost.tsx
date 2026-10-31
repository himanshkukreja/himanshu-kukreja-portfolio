"use client";

/**
 * The one feature-video player of the learn pages. Anything can open it with
 * openGuideVideo(id, from, at) (a window event), and a link to any learn page with #watch-<id>
 * opens it too. The modal's code loads on the first open; until then this is a few event listeners.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { GUIDE_VIDEOS_ON, OPEN_EVENT, guideVideo, type OpenDetail } from "@/lib/learn/guide/videos";

const GuideVideoModal = dynamic(() => import("./GuideVideoModal"), { ssr: false });

const HASH = /^#watch-([a-z0-9-]+)$/;

export default function GuideVideoHost() {
  const [open, setOpen] = useState<OpenDetail | null>(null);

  useEffect(() => {
    if (!GUIDE_VIDEOS_ON) return;
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      if (d && guideVideo(d.id)) setOpen(d);
    };
    const fromHash = () => {
      const m = HASH.exec(window.location.hash);
      if (m && guideVideo(m[1])) setOpen({ id: m[1], from: "link" });
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener("hashchange", fromHash);
    const first = window.setTimeout(fromHash, 0);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  if (!open) return null;
  const close = () => {
    setOpen(null);
    // drop a #watch-… hash so closing and reloading doesn't reopen it
    if (HASH.test(window.location.hash)) history.replaceState(history.state, "", window.location.pathname + window.location.search);
  };
  return <GuideVideoModal id={open.id} at={open.at} from={open.from} onClose={close} onGo={(id) => setOpen({ id, from: open.from })} />;
}
