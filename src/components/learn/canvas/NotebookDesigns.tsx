"use client";

/** Notebook: your design canvas drawings (hidden until you've started one). */
import Link from "next/link";
import { useEffect, useState } from "react";
import { userJson } from "@/components/learn/progress/userFetch";

type Resp = { prompts: { key: string; title: string; group: string }[]; designs: { id: string; prompt_key: string; title: string | null; reviews: number; updated_at: string }[] };

export default function NotebookDesigns({ userId }: { userId: string }) {
  const [r, setR] = useState<Resp | null>(null);
  useEffect(() => {
    let off = false;
    userJson<Resp>("/api/learn/canvas")
      .then((x) => !off && setR(x))
      .catch(() => undefined);
    return () => {
      off = true;
    };
  }, [userId]);
  if (!r?.designs.length) return null;
  const title = new Map(r.prompts.map((p) => [p.key, p.title]));
  return (
    <section aria-labelledby="nb-designs" className="flex flex-col gap-3 border-b border-line pb-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="nb-designs" className="m-0 font-mono text-xs uppercase tracking-label text-signal-text">
          designs · {r.designs.length}
        </h2>
        <Link href="/learn/canvas" className="font-mono text-xs text-fg-3 hover:text-fg">
          design canvas ›
        </Link>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {r.designs.map((d) => (
          <li key={d.id}>
            <Link href={`/learn/canvas/${encodeURIComponent(d.prompt_key)}`} className="flex min-h-[64px] flex-col justify-center gap-1 border border-line bg-surface px-4 py-3 hover:border-signal">
              <span className="line-clamp-2 text-[14px] font-semibold text-fg">{title.get(d.prompt_key) || d.title || "My own design"}</span>
              <span className="font-mono text-[11px] text-fg-3">
                {new Date(d.updated_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                {d.reviews ? ` · reviewed ${d.reviews}×` : " · not reviewed yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
