"use client";

/**
 * /admin/case-files/frame: the public StoryReader rendering a working copy, inside the editor's
 * preview iframe (desktop / phone widths are real viewport widths, so every breakpoint matches the
 * site). Embedded: it renders whatever the parent editor posts (same origin only). Standalone
 * (?id=…, "preview ↗" in a new tab): it asks the admin API for the saved working copy itself.
 * Game state is an in-memory sandbox: reading, the debrief and the activity never touch the
 * admin's real XP, flags or reading record.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import StoryReader, { type Checkpoint } from "@/components/stories/StoryReader";
import { GameContext, type GameContextValue } from "@/game/GameProvider";
import { parseDebrief, type CaseFile, type Debrief } from "@/components/stories/case-types";
import type { CaseActivityData } from "@/components/stories/activities/data";
import { adminJson } from "@/lib/admin/fetch";
import { PREVIEW_HEADER, type CaseFileDetail, type RenderResult } from "@/lib/case-files/types";

export type FramePayload = {
  meta: CaseFile;
  html: string;
  checkpoints: Checkpoint[];
  debrief: Debrief | null;
  activity: CaseActivityData | null;
  totalCases: number;
};

export type FrameMessage = { type: "cf:render"; payload: FramePayload } | { type: "cf:theme"; theme: "light" | "dark" } | { type: "cf:scroll"; id: string };
export type FrameReply = { type: "cf:ready" } | { type: "cf:diagrams"; total: number; failed: number };

/** In-memory game state with the real provider's API (no persistence, no sync, no toasts). */
function GameSandbox({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ xp: number; done: Record<string, number>; flags: Record<string, unknown> }>({ xp: 0, done: {}, flags: {} });
  const ref = useRef(state);
  const commit = useCallback((next: typeof state) => {
    ref.current = next;
    setState(next);
  }, []);
  const value = useMemo<GameContextValue>(
    () => ({
      hydrated: true,
      xp: state.xp,
      done: state.done,
      flags: state.flags,
      award: (id) => {
        if (ref.current.done[id]) return 0;
        commit({ ...ref.current, done: { ...ref.current.done, [id]: Date.now() } });
        return 0;
      },
      grant: (xp) => commit({ ...ref.current, xp: ref.current.xp + xp }),
      awardOnce: (key, xp) => {
        if (ref.current.done[key]) return 0;
        commit({ ...ref.current, xp: ref.current.xp + xp, done: { ...ref.current.done, [key]: Date.now() } });
        return xp;
      },
      setFlag: (key, v) => commit({ ...ref.current, flags: { ...ref.current.flags, [key]: v } }),
      reset: () => commit({ xp: 0, done: {}, flags: {} }),
      toasts: [],
      terminalOpen: false,
      setTerminalOpen: () => {},
    }),
    [state, commit]
  );
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.style.colorScheme = theme;
}

export default function PreviewFrame() {
  const params = useSearchParams();
  const standaloneId = params.get("id");
  const [data, setData] = useState<FramePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFrame = useSyncExternalStore(
    () => () => {},
    () => window.parent !== window,
    () => false
  );
  const embedded = inFrame && !standaloneId;

  // embedded: listen to the editor
  useEffect(() => {
    if (standaloneId) return;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      const m = e.data as FrameMessage;
      if (m?.type === "cf:render") setData(m.payload);
      else if (m?.type === "cf:theme") applyTheme(m.theme);
      else if (m?.type === "cf:scroll") document.getElementById(m.id)?.scrollIntoView({ block: "start" });
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "cf:ready" } satisfies FrameReply, window.location.origin);
    return () => window.removeEventListener("message", onMsg);
  }, [standaloneId]);

  // standalone: load the saved working copy
  useEffect(() => {
    if (!standaloneId) return;
    let off = false;
    const dev = process.env.NODE_ENV === "development" && (params.get("preview") === "1" || window.sessionStorage.getItem("hk.adminPreview") === "1");
    const init: RequestInit = dev ? { headers: { [PREVIEW_HEADER]: "1" } } : {};
    (async () => {
      try {
        const detail = await adminJson<CaseFileDetail>(`/api/admin/case-files/${encodeURIComponent(standaloneId)}`, init);
        const { live: _l, ...fields } = detail.row;
        void _l;
        const r = await adminJson<RenderResult & { meta: CaseFile; totalCases: number }>("/api/admin/case-files/render", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(dev ? { [PREVIEW_HEADER]: "1" } : {}) },
          body: JSON.stringify({ id: standaloneId, fields }),
        });
        if (!off) setData({ meta: r.meta, html: r.html, checkpoints: r.checkpoints, debrief: parseDebrief(fields.debrief), activity: fields.activity, totalCases: r.totalCases });
      } catch (e) {
        if (!off) setError((e as Error).message || "Couldn't load the preview");
      }
    })();
    return () => {
      off = true;
    };
  }, [standaloneId, params]);

  // report diagrams that failed to render (Mermaid in the browser), so the editor can flag them
  useEffect(() => {
    if (!data || !embedded) return;
    const t = window.setTimeout(() => {
      const figs = Array.from(document.querySelectorAll<HTMLElement>("figure.sd-mermaid"));
      window.parent.postMessage({ type: "cf:diagrams", total: figs.length, failed: figs.filter((f) => f.dataset.mermaidState === "error").length } satisfies FrameReply, window.location.origin);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [data, embedded]);

  if (error)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-16">
        <p className="font-mono text-sm text-bad-text">✗ {error}</p>
        <p className="mt-2 text-sm text-fg-3">Sign in as the admin in this browser, then reload.</p>
      </main>
    );
  if (!data)
    return (
      <main className="mx-auto max-w-[760px] px-4 py-16">
        <p className="font-mono text-sm text-fg-3">$ render --preview …</p>
      </main>
    );

  return (
    <main className="min-h-screen">
      {!embedded && (
        <div className="border-b border-dashed border-signal bg-signal/10 px-4 py-2 text-center font-mono text-xs text-fg">
          <span className="font-semibold text-signal-text">PREVIEW</span> · working copy, not public · XP and reading progress are not recorded
        </div>
      )}
      <GameSandbox>
        <StoryReader
          key={data.meta.slug}
          meta={data.meta}
          checkpoints={data.checkpoints}
          htmlContent={data.html}
          debrief={data.debrief}
          prev={null}
          next={null}
          totalCases={data.totalCases}
          activity={data.activity}
          preview
          views={<span>preview · reads are not counted</span>}
          comments={
            <section className="border border-dashed border-line-strong p-5 text-sm text-fg-3">
              <span className="label-mono text-fg-3">Discussion</span>
              <p className="m-0 mt-2">Comments appear here once the case file is published.</p>
            </section>
          }
        />
      </GameSandbox>
    </main>
  );
}
