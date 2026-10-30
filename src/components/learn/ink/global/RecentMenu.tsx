"use client";

/**
 * The pen button's "recent pages" menu (a long-press on the pen, or its chevron): the last few pages (this place's
 * first), New page here, and All notes. Loaded only when first opened, so the button costs the page almost nothing.
 */
import { useState } from "react";
import { openNotebookPanel, InkError } from "@/lib/learn/ink/client";
import RecentPagesList from "./RecentPages";
import { newPageFor } from "./pages";
import type { InkContext } from "./context";

export default function RecentMenu({ ctx, onDone }: { ctx: InkContext; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <RecentPagesList
        ctxKey={ctx.key}
        max={5}
        enabled
        onPick={(id) => {
          onDone();
          openNotebookPanel({ pageId: id });
        }}
        newLabel={ctx.key ? "New page here" : "New page"}
        onNew={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const id = await newPageFor(ctx);
            onDone();
            openNotebookPanel({ pageId: id });
          } catch (e) {
            setError(e instanceof InkError ? e.message : "Couldn't start a page.");
          } finally {
            setBusy(false);
          }
        }}
        onNavigate={onDone}
      />
      {error && <p className="m-0 border-t border-line px-4 py-2.5 text-[13.5px] text-bad-text">{error}</p>}
    </>
  );
}
