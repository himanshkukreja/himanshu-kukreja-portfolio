"use client";

/**
 * A lecture's view count and upvote button. Counts come from /api/learn/lectures/stats (distinct viewers
 * who pressed play, and upvotes; cached ~5 min); a learner's own votes from /api/learn/lectures/vote.
 * Upvoting needs an account: signed out, the button opens sign-in.
 */
import { useEffect, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { track } from "@/lib/track";

type Stats = Record<string, { v: number; u: number }>;
let statsOnce: Promise<Stats> | null = null;
/** one fetch per page load, shared by the player and the playlist */
export function lectureStats(): Promise<Stats> {
  if (!statsOnce)
    statsOnce = fetch("/api/learn/lectures/stats")
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : {}))
      .catch(() => ({}));
  return statsOnce;
}

export const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));

export default function LectureVote({ id }: { id: string }) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [stats, setStats] = useState<{ v: number; u: number } | null>(null);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    void lectureStats().then((s) => !off && setStats(s[id] ?? { v: 0, u: 0 }));
    return () => {
      off = true;
    };
  }, [id]);
  useEffect(() => {
    if (!user) return;
    let off = false;
    userFetch("/api/learn/lectures/vote")
      .then((r) => (r.ok ? (r.json() as Promise<{ voted: string[] }>) : { voted: [] }))
      .then((d) => !off && setMine(d.voted.includes(id)))
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [user, id]);

  const toggle = async () => {
    if (!user) return openAuthModal();
    if (busy) return;
    const up = !mine;
    setBusy(true);
    setMine(up);
    setStats((s) => (s ? { ...s, u: Math.max(0, s.u + (up ? 1 : -1)) } : s));
    try {
      const r = await userFetch("/api/learn/lectures/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lecture: id, up }) });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { up: boolean; votes: number };
      setMine(d.up);
      setStats((s) => ({ v: s?.v ?? 0, u: d.votes }));
      track("lecture_vote", { quest: id, up });
    } catch {
      setMine(!up);
      setStats((s) => (s ? { ...s, u: Math.max(0, s.u + (up ? -1 : 1)) } : s));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-pressed={mine}
        title={user ? (mine ? "Remove your upvote" : "Upvote this lecture") : "Sign in to upvote"}
        className={`inline-flex min-h-11 items-center gap-2 border px-3.5 font-mono text-[13px] ${mine ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg hover:border-signal"}`}
      >
        <ThumbsUp className="h-4 w-4" aria-hidden fill={mine ? "currentColor" : "none"} />
        {stats ? compact(stats.u) : "–"}
        <span className="sr-only"> upvotes</span>
      </button>
      {stats && stats.v > 0 && (
        <span className="font-mono text-[12px] text-fg-3">
          {compact(stats.v)} {stats.v === 1 ? "viewer" : "viewers"}
        </span>
      )}
    </span>
  );
}
