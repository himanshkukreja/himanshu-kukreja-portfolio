"use client";

/**
 * /learn/notebook/page/<id>: one notebook page, full screen (over the site header and the You tabs), so the page
 * gets the whole iPad. Signed-out visitors get a sign-in prompt instead.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { getPage } from "@/lib/learn/ink/client";
import { useInkUser } from "@/lib/learn/ink/usePageAutosave";
import PageEditor from "./PageEditor";

export default function FullPageEditor({ pageId }: { pageId: string }) {
  const router = useRouter();
  const { userId, loading } = useInkUser();
  const { openAuthModal } = useAuthModal();
  const [id, setId] = useState(pageId);
  const [notebookId, setNotebookId] = useState<string | null>(null);

  // the browser's back/forward between pages opened here
  useEffect(() => {
    const onPop = () => {
      const m = window.location.pathname.match(/\/learn\/notebook\/page\/([0-9a-f-]{36})/i);
      if (m) setId(m[1].toLowerCase());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let off = false;
    getPage(id)
      .then((p) => !off && p && setNotebookId(p.notebookId))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [id, userId]);

  // the whole viewport: no page scroll behind the editor
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add("hk-ink-full");
    return () => html.classList.remove("hk-ink-full");
  }, []);

  // switch pages without a navigation (the shell is the same); the URL follows
  const open = useCallback((next: string) => {
    window.history.pushState(null, "", `/learn/notebook/page/${next}`);
    setId(next);
  }, []);

  const back = `/learn/notebook?tab=pages${notebookId ? `&nb=${notebookId}` : ""}`;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-bg pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      {loading ? (
        <div className="grid flex-1 place-items-center font-mono text-[12px] text-fg-3">opening your notebook…</div>
      ) : !userId ? (
        <div className="mx-auto flex max-w-[520px] flex-1 flex-col items-start justify-center gap-4 px-6">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">❯ notebook page</span>
          <h1 className="m-0 font-display text-[34px] font-extrabold leading-tight tracking-[-0.03em] text-fg">Sign in to open your notebook pages.</h1>
          <p className="m-0 text-[16px] leading-relaxed text-fg-2">Pages are yours alone: handwritten notes beside the lessons, kept in your account and synced across your devices.</p>
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={openAuthModal} className="min-h-12 bg-signal px-5 text-[15px] font-semibold text-on-signal">
              Sign in free
            </button>
            <button type="button" onClick={() => router.push("/learn/notebook")} className="min-h-12 border border-line-strong px-5 text-[15px] text-fg">
              Back to the notebook
            </button>
          </div>
          <Link href="/learn" className="text-sm text-fg-3 underline">
            Reading never needs an account
          </Link>
        </div>
      ) : (
        <PageEditor key={id} pageId={id} variant="full" onOpenPage={open} backHref={back} />
      )}
    </div>
  );
}
