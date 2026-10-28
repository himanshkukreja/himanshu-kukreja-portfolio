"use client";

/** /learn/canvas: your designs (signed in), "my own idea", and every problem and capstone to design. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userJson } from "@/components/learn/progress/userFetch";

type Prompt = { key: string; kind: "problem" | "capstone"; title: string; group: string; href: string };
type Mine = { id: string; prompt_key: string; title: string | null; reviewed_at: string | null; reviews: number; updated_at: string };

export const canvasHref = (key: string) => `/learn/canvas/${encodeURIComponent(key)}`;
const newFreeKey = () => {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return `free:${Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("")}`;
};
const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

export default function CanvasHome({ prompts }: { prompts: Prompt[] }) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const router = useRouter();
  const [mine, setMine] = useState<Mine[] | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let off = false;
    userJson<{ designs: Mine[] }>("/api/learn/canvas")
      .then((r) => !off && setMine(r.designs))
      .catch(() => !off && setMine([]));
    return () => {
      off = true;
    };
  }, [user?.id]);
  const byKey = useMemo(() => new Map(prompts.map((p) => [p.key, p])), [prompts]);
  const groups = useMemo(() => [...new Set(prompts.map((p) => p.group))], [prompts]);
  const started = new Set((mine || []).map((m) => m.prompt_key));
  const open = (key: string) => (user ? router.push(canvasHref(key)) : openAuthModal());

  return (
    <div className="flex flex-col gap-10">
      {user && mine && mine.length > 0 && (
        <section aria-labelledby="mine-h" className="flex flex-col gap-3">
          <h2 id="mine-h" className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">
            your designs
          </h2>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((m) => {
              const p = byKey.get(m.prompt_key);
              return (
                <li key={m.id}>
                  <Link href={canvasHref(m.prompt_key)} className="flex min-h-[72px] flex-col justify-center gap-1 border border-line-strong bg-surface px-4 py-3 hover:border-signal">
                    <span className="line-clamp-2 text-[15px] font-semibold text-fg">{p?.title || m.title || "My own design"}</span>
                    <span className="font-mono text-[11px] text-fg-3">
                      edited {ago(m.updated_at)}
                      {m.reviews ? ` · reviewed ${m.reviews}×` : ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="own-h" className="flex flex-col items-start gap-3 border border-signal bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col gap-1">
          <span id="own-h" className="font-display text-[22px] font-bold tracking-[-0.02em] text-fg">
            Your own idea
          </span>
          <span className="text-[14px] text-fg-2">A blank board and a one-line brief: design the system you&apos;re building at work, or the one you were asked last week.</span>
        </span>
        <button type="button" onClick={() => open(newFreeKey())} className="inline-flex min-h-11 shrink-0 items-center bg-signal px-4 font-mono text-[13px] font-semibold text-on-signal hover:brightness-110">
          start a blank board →
        </button>
      </section>

      {groups.map((g) => (
        <section key={g} aria-label={g} className="flex flex-col gap-3">
          <h2 className="m-0 font-mono text-[12px] uppercase tracking-label text-fg-3">{g}</h2>
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {prompts
              .filter((p) => p.group === g)
              .map((p) => (
                <li key={p.key}>
                  <button type="button" onClick={() => open(p.key)} className="flex min-h-[60px] w-full items-center justify-between gap-3 border border-line bg-surface px-4 py-3 text-left hover:border-signal">
                    <span className="line-clamp-2 text-[15px] text-fg">{p.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-signal-text">{started.has(p.key) ? "continue" : "design"} →</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {!user && <p className="m-0 text-[14px] text-fg-3">Sign in (free) to draw: designs save to your account, and reviews use the AI tutor.</p>}
    </div>
  );
}
