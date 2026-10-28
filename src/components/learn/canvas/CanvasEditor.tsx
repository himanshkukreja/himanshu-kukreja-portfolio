"use client";

/**
 * /learn/canvas/<key>: the design canvas. The brief (a problem, a capstone, or your own title and
 * one-liner), the whiteboard (the mock interview's Excalidraw board: blocks, tech logos, arrows that
 * stay attached), notes, and the AI review of what's saved. Autosaves to your account a moment after
 * each change, with a copy in this browser in case the connection drops.
 */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch, userJson } from "@/components/learn/progress/userFetch";
import { aiFetch } from "@/components/learn/ai/aiFetch";
import AiText from "@/components/learn/ai/AiText";
import AiFreeNote from "@/components/learn/ai/AiFreeNote";
import { AI_PRIVACY } from "@/components/learn/ai/AskLessonPanel";
import { setAiCredits, useAiStatus } from "@/components/learn/ai/useAiStatus";
import { track } from "@/lib/track";

const BoardCanvas = dynamic(() => import("@/components/learn/mock/BoardCanvas"), {
  ssr: false,
  loading: () => <div className="grid h-[min(560px,68vh)] place-items-center border border-line-strong font-mono text-xs text-fg-3">loading the whiteboard…</div>,
});

type Prompt = { title: string; group: string; href: string; brief: string } | null;
type Design = { scene: string; notes: string; title: string | null; brief: string | null; review: string | null; reviewed_at: string | null; reviews: number; updated_at: string } | null;
type Save = "idle" | "saving" | "saved" | "error";

const backupKey = (key: string) => `hk.canvas.${key}`;
const readBackup = (key: string): { scene: string; notes: string; title?: string; brief?: string; at: number } | null => {
  try {
    const r = localStorage.getItem(backupKey(key));
    return r ? JSON.parse(r) : null;
  } catch {
    return null;
  }
};

export default function CanvasEditor({ promptKey }: { promptKey: string }) {
  const { user, loading: authLoading } = useAuth();
  const { openAuthModal } = useAuthModal();
  const router = useRouter();
  const free = promptKey.startsWith("free:");
  const [loaded, setLoaded] = useState<{ prompt: Prompt; design: Design } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState("");
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [save, setSave] = useState<Save>("idle");
  const [briefOpen, setBriefOpen] = useState(true);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  // what the next save sends: each handler updates it before scheduling the save
  const latest = useRef({ scene: "", notes: "", title: "", brief: "" });

  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    userJson<{ prompt: Prompt; design: Design }>(`/api/learn/canvas/${encodeURIComponent(promptKey)}`)
      .then((r) => {
        if (off) return;
        // the browser copy wins when it's newer than the saved one (the last save didn't make it)
        const local = readBackup(promptKey);
        const savedAt = r.design ? Date.parse(r.design.updated_at) : 0;
        const useLocal = local && local.at > savedAt + 2000;
        const next = {
          scene: (useLocal ? local.scene : r.design?.scene) || "",
          notes: (useLocal ? local.notes : r.design?.notes) || "",
          title: (useLocal ? local.title : r.design?.title) || "",
          brief: (useLocal ? local.brief : r.design?.brief) || "",
        };
        latest.current = next;
        setScene(next.scene);
        setNotes(next.notes);
        setTitle(next.title);
        setBrief(next.brief);
        setLoaded(r);
        if (useLocal) dirty.current = true;
      })
      .catch((e: Error) => !off && setError(e.message || "Couldn't open this design."));
    return () => {
      off = true;
    };
  }, [user?.id, promptKey]);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return true;
    dirty.current = false;
    setSave("saving");
    const d = latest.current;
    try {
      await userJson(`/api/learn/canvas/${encodeURIComponent(promptKey)}`, { method: "PUT", body: JSON.stringify({ scene: d.scene, notes: d.notes, ...(free ? { title: d.title, brief: d.brief } : {}) }) });
      setSave("saved");
      return true;
    } catch {
      dirty.current = true;
      setSave("error");
      return false;
    }
  }, [promptKey, free]);

  const changed = useCallback(() => {
    dirty.current = true;
    try {
      localStorage.setItem(backupKey(promptKey), JSON.stringify({ ...latest.current, at: Date.now() }));
    } catch {
      /* storage full or blocked: the server save still runs */
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1500);
  }, [promptKey, flush]);

  // save on the way out
  useEffect(() => {
    const out = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", out);
    return () => {
      document.removeEventListener("visibilitychange", out);
      void flush();
    };
  }, [flush]);

  const remove = async () => {
    if (!window.confirm("Delete this design and its review? This can't be undone.")) return;
    window.clearTimeout(timer.current);
    dirty.current = false;
    await userFetch(`/api/learn/canvas/${encodeURIComponent(promptKey)}`, { method: "DELETE" }).catch(() => undefined);
    try {
      localStorage.removeItem(backupKey(promptKey));
    } catch {
      /* ignore */
    }
    track("canvas_delete", { kind: promptKey.split(":")[0] });
    router.push("/learn/canvas");
  };

  if (authLoading) return <p className="m-0 font-mono text-[13px] text-fg-3">Loading…</p>;
  if (!user)
    return (
      <div className="flex flex-col items-start gap-3 border border-line-strong bg-surface p-5">
        <h1 className="m-0 font-display text-[28px] font-extrabold tracking-[-0.03em] text-fg">Sign in to draw</h1>
        <p className="m-0 text-[15px] text-fg-2">Designs save to your account as you draw, and reviews use the AI tutor. Signing in is free.</p>
        <button type="button" onClick={openAuthModal} className="inline-flex min-h-11 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal">
          sign in
        </button>
      </div>
    );
  if (error)
    return (
      <div className="flex flex-col items-start gap-3 border border-line-strong bg-surface p-5">
        <p className="m-0 text-[15px] text-fg-2">{error}</p>
        <Link href="/learn/canvas" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
          ← all designs
        </Link>
      </div>
    );
  if (!loaded) return <p className="m-0 font-mono text-[13px] text-fg-3">Opening your design…</p>;

  const p = loaded.prompt;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs text-fg-3">
            <Link href="/learn/canvas" className="hover:text-fg">
              design canvas
            </Link>
            <span aria-hidden>›</span>
            <span className="text-signal-text">{p ? p.group.toLowerCase() : "my own idea"}</span>
          </nav>
          {free ? (
            <input
              value={title}
              onChange={(e) => {
                const v = e.target.value.slice(0, 120);
                setTitle(v);
                latest.current.title = v;
                changed();
              }}
              placeholder="Name your system (e.g. Payments for a food app)"
              aria-label="Design title"
              className="min-h-12 w-full max-w-[640px] border-b border-line-strong bg-transparent font-display text-[28px] font-extrabold tracking-[-0.03em] text-fg outline-none placeholder:text-fg-4 focus:border-signal sm:text-[34px]"
            />
          ) : (
            <h1 className="m-0 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[36px]">{p?.title}</h1>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span role="status" className={`font-mono text-[12px] ${save === "error" ? "text-bad-text" : "text-fg-3"}`}>
            {save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "not saved, retrying on the next change" : loaded.design ? "saved" : "not started"}
          </span>
          {loaded.design && (
            <button type="button" onClick={() => void remove()} aria-label="Delete this design" className="grid h-10 w-10 place-items-center border border-line-strong text-fg-3 hover:text-bad-text">
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <BoardCanvas
            value={scene}
            onChange={(v) => {
              setScene(v);
              latest.current.scene = v;
              changed();
            }}
          />
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">notes: requirements, numbers, trade-offs (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => {
                const v = e.target.value.slice(0, 8000);
                setNotes(v);
                latest.current.notes = v;
                changed();
              }}
              rows={5}
              placeholder="e.g. 10K writes/s at peak; the cache is write-through; the queue absorbs the 6 PM spike…"
              className="w-full border border-line-strong bg-surface p-3 text-[15px] leading-relaxed text-fg outline-none focus:border-signal"
            />
          </label>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          <section className="flex flex-col gap-2 border border-line bg-surface p-4">
            <button type="button" onClick={() => setBriefOpen((o) => !o)} aria-expanded={briefOpen} className="flex items-center justify-between font-mono text-[11px] uppercase tracking-label text-fg-3">
              the brief <ChevronDown className={`h-3.5 w-3.5 transition-transform ${briefOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {briefOpen &&
              (free ? (
                <textarea
                  value={brief}
                  onChange={(e) => {
                    const v = e.target.value.slice(0, 1000);
                    setBrief(v);
                    latest.current.brief = v;
                    changed();
                  }}
                  rows={4}
                  placeholder="One or two lines: what it does, for how many users, what matters most."
                  aria-label="Your brief"
                  className="w-full border border-line-strong bg-bg p-2.5 text-[14px] leading-relaxed text-fg outline-none focus:border-signal"
                />
              ) : (
                <div className="flex max-h-[42vh] flex-col gap-2 overflow-y-auto pr-1">
                  {(p?.brief || "").split(/\n{2,}/).map((para, i) => (
                    <p key={i} className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-fg-2">
                      {para}
                    </p>
                  ))}
                  {p?.href && (
                    <Link href={p.href} className="self-start font-mono text-[12px] text-signal-text underline underline-offset-4">
                      the full write-up (has the answer) →
                    </Link>
                  )}
                </div>
              ))}
          </section>
          <CanvasReview promptKey={promptKey} initial={loaded.design?.review ?? null} before={flush} />
        </aside>
      </div>
    </div>
  );
}

function CanvasReview({ promptKey, initial, before }: { promptKey: string; initial: string | null; before: () => Promise<boolean> }) {
  const status = useAiStatus();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(initial || "");
  const [error, setError] = useState("");
  if (!status?.features["canvas-review"] || !status.signedIn) return null;
  const review = async () => {
    setBusy(true);
    setError("");
    // review what's saved: push the latest change first
    if (!(await before())) {
      setError("Couldn't save the latest change, so the review would miss it. Try again.");
      setBusy(false);
      return;
    }
    track("ai_ask", { feature: "canvas-review", design: promptKey.split(":")[0] });
    try {
      const r = await aiFetch("/api/learn/ai/canvas-review", { method: "POST", body: JSON.stringify({ key: promptKey }) });
      const b = (await r.json().catch(() => ({}))) as { text?: string; error?: string; creditsLeft?: number | null };
      setAiCredits(b.creditsLeft);
      if (r.ok) setText(b.text || "");
      else setError(b.error || "Something went wrong.");
    } catch {
      setError("You seem to be offline.");
    }
    setBusy(false);
  };
  return (
    <section aria-label="AI design review" className="flex flex-col gap-3 border border-signal bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-label text-signal-text">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> ai review{status.preview ? " · admin preview" : ""}
        </span>
        {status.creditsLeft !== null && <span className="font-mono text-[11px] text-fg-4">{status.creditsLeft} credits left today</span>}
      </div>
      <p className="m-0 text-[13px] leading-snug text-fg-2">A staff-engineer read of your drawing and notes against the brief: the verdict, the gaps worst first with the fix for each, and what you&apos;d be asked next. Private to you.</p>
      <button type="button" disabled={busy} onClick={() => void review()} className="min-h-10 self-start bg-signal px-4 font-mono text-xs font-semibold text-on-signal disabled:opacity-50">
        {busy ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> reviewing…
          </span>
        ) : text ? (
          "Review it again"
        ) : (
          "Review my design"
        )}
      </button>
      {error && <p className="m-0 text-[13px] text-fg-2">{error}</p>}
      {text && <AiText text={text} />}
      <AiFreeNote />
      <p className="m-0 text-[11px] leading-snug text-fg-4">{AI_PRIVACY}</p>
    </section>
  );
}
