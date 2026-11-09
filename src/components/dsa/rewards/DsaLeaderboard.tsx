"use client";

/**
 * DSA Mastery's leaderboard (GET /api/dsa/leaderboard): this week's Bits (from Monday, India time) or all time. DSA
 * only: SD Mastery's Arena board and XP are separate. Signed in, your own row is marked (and added under the top 100
 * when you are further down).
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { BELTS } from "@/lib/dsa/rewards";
import type { DsaBoardResponse } from "@/lib/dsa/leaderboard";
import { BeltSwatch } from "./BeltSwatch";

const BELT = Object.fromEntries(BELTS.map((b) => [b.id, b]));

export default function DsaLeaderboard() {
  const { user, loading: authLoading } = useAuth();
  const [period, setPeriod] = useState<"week" | "all">("week");
  const [state, setState] = useState<{ data: DsaBoardResponse | null; error: boolean; key: string } | null>(null);
  const key = `${period}:${user?.id ?? ""}`;

  useEffect(() => {
    if (authLoading) return;
    let off = false;
    const url = `/api/dsa/leaderboard?period=${period}`;
    (user ? userFetch(url) : fetch(url))
      .then((r) => (r.ok ? (r.json() as Promise<DsaBoardResponse>) : null))
      .catch(() => null)
      .then((data) => {
        if (!off) setState({ data, error: !data, key });
      });
    return () => {
      off = true;
    };
  }, [period, user, authLoading, key]);

  const loading = !state || state.key !== key;
  const data = loading ? null : state.data;
  const tab = (p: "week" | "all", label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={period === p}
      onClick={() => setPeriod(p)}
      className={`min-h-10 px-3 font-mono text-[12.5px] ${period === p ? "bg-signal text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
    >
      {label}
    </button>
  );

  return (
    <section aria-labelledby="board-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="board-h" className="m-0 font-display text-[26px] font-extrabold tracking-[-0.03em] text-fg">
            Leaderboard
          </h2>
          <span className="text-[14px] text-fg-3">{period === "week" ? "Bits earned since Monday, India time. A fresh start every week." : "Total Bits, all time."}</span>
        </div>
        <div role="tablist" aria-label="Leaderboard period" className="inline-flex border border-line-strong">
          {tab("week", "this week")}
          {tab("all", "all time")}
        </div>
      </div>
      {data?.me && (
        <p className="m-0 text-[14px] text-fg-2">
          {data.me.rank ? (
            <>
              You are <strong className="text-fg">#{data.me.rank}</strong> of {data.players} with {data.me.bits.toLocaleString("en-US")} Bits.
            </>
          ) : period === "week" ? (
            "Earn a Bit this week to join the board."
          ) : (
            "Earn your first Bits to join the board."
          )}
        </p>
      )}
      {loading ? (
        <div aria-busy="true" aria-label="Loading the leaderboard" className="h-[160px] animate-pulse bg-surface-2" />
      ) : !data ? (
        <p className="m-0 text-[14px] text-fg-2">The leaderboard couldn&apos;t load. Please try again in a minute.</p>
      ) : !data.rows.length ? (
        <p className="m-0 border border-dashed border-line-strong p-4 text-[14px] text-fg-2">{period === "week" ? "Nobody has earned Bits this week yet. Be the first." : "The board is empty so far."}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
          {data.rows.map((r) => {
            const b = BELT[r.belt] || BELTS[0];
            return (
              <li key={`${r.rank}-${r.name}-${r.me ? "me" : ""}`} className={`flex min-w-0 items-center gap-3 px-3 py-2.5 sm:px-4 ${r.me ? "bg-[var(--c-dsa-hl)]" : "bg-surface"}`}>
                <span className="w-8 shrink-0 text-right font-mono text-[13px] tabular-nums text-fg-3">#{r.rank}</span>
                <BeltSwatch belt={b} size={22} />
                <span className="min-w-0 flex-1 truncate text-[15px] text-fg">
                  {r.name}
                  {r.me && <span className="ml-2 font-mono text-[11px] uppercase tracking-label text-signal-text">you</span>}
                  <span className="sr-only">, {b.name} belt</span>
                </span>
                <span className="shrink-0 font-mono text-[13px] tabular-nums text-fg">{r.bits.toLocaleString("en-US")}</span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="m-0 text-[12px] text-fg-4">Names show as first name and initial for public profiles, otherwise as engineer-xxxx.</p>
    </section>
  );
}
