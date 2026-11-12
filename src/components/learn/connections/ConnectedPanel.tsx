"use client";

/**
 * "Connected to what you've done" (owner-approved 12 Nov 2026): a small panel on System Design lessons and LLD case
 * studies, DSA Mastery lessons and DSA problems, linking the page to what this learner did (or has next) in the other
 * course: "You solved 3 Sliding window problems in DSA Mastery: Rate limiting at scale uses the same idea." Deterministic
 * (lib/learner/connections-model.ts, no AI), from the content's own cross-course links and the learner's progress. Hidden
 * for guests and when nothing is relevant.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import type { Connection } from "@/lib/learner/connections-model";

const memo = new Map<string, Promise<Connection[]>>();

export default function ConnectedPanel({ page, className = "" }: { page: string; className?: string }) {
  const { user } = useAuth();
  const [got, setGot] = useState<{ k: string; items: Connection[] } | null>(null);
  const k = user ? `${user.id}|${page}` : "";
  useEffect(() => {
    if (!k) return;
    let off = false;
    let p = memo.get(k);
    if (!p) {
      p = userFetch(`/api/learn/connections?page=${encodeURIComponent(page)}`)
        .then(async (r) => (r.ok ? (((await r.json()) as { items?: Connection[] }).items ?? []) : []))
        .catch(() => []);
      memo.set(k, p);
      setTimeout(() => memo.delete(k), 60_000);
    }
    p.then((items) => !off && setGot({ k, items }));
    return () => {
      off = true;
    };
  }, [k, page]);
  const items = got && got.k === k ? got.items : [];
  if (!user || !items.length) return null;
  return (
    <aside aria-label="Connected to what you've done" className={`flex flex-col gap-2 border border-line bg-surface px-4 py-3 ${className}`}>
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">connected to what you&apos;ve done</span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((c) => (
          <li key={c.href} className="flex items-baseline gap-2 text-[14px] leading-relaxed text-fg-2">
            <span aria-hidden className={`shrink-0 font-mono text-[12px] ${c.state === "done" ? "text-signal-text" : "text-fg-4"}`}>
              {c.state === "done" ? "✓" : "→"}
            </span>
            <span className="min-w-0">
              {c.text}{" "}
              <Link href={c.href} className="whitespace-nowrap font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-2 hover:text-fg">
                open ›
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
