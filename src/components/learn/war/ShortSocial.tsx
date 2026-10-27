"use client";

/**
 * Upvotes and discussion on shorts. Upvotes reuse lecture_votes keyed by the short's own id (counts from
 * /api/learn/lectures/stats); discussions reuse lesson_comments under course "shorts" (counts from
 * /api/learn/shorts/comments). Saving reuses bookmarks (course "shorts"), listed in the notebook.
 * Voting, commenting and saving need an account: signed out, they open sign-in.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import { supabaseClient } from "@/lib/supabase-client";
import { lectureStats } from "@/components/learn/lecture/LectureVote";
import LessonComments from "@/components/LessonComments";
import { track } from "@/lib/track";
import type { PlayableShort } from "@/lib/learn/shorts/types";

/** one fetch per page load of this learner's own votes */
let mineOnce: { user: string; p: Promise<Set<string>> } | null = null;
function myVotes(user: string): Promise<Set<string>> {
  if (mineOnce?.user !== user)
    mineOnce = {
      user,
      p: userFetch("/api/learn/lectures/vote")
        .then((r) => (r.ok ? (r.json() as Promise<{ voted: string[] }>) : { voted: [] }))
        .then((d) => new Set(d.voted))
        .catch(() => new Set<string>()),
    };
  return mineOnce.p;
}

export function useShortVote(id: string) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [votes, setVotes] = useState(0);
  const [mine, setMine] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    void lectureStats().then((s) => !off && setVotes(s[id]?.u ?? 0));
    return () => {
      off = true;
    };
  }, [id]);
  useEffect(() => {
    if (!user) return;
    let off = false;
    void myVotes(user.id).then((s) => !off && setMine(s.has(id)));
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
    setVotes((n) => Math.max(0, n + (up ? 1 : -1)));
    try {
      const r = await userFetch("/api/learn/lectures/vote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lecture: id, up }) });
      if (!r.ok) throw new Error();
      const d = (await r.json()) as { up: boolean; votes: number };
      setMine(d.up);
      setVotes(d.votes);
      void myVotes(user.id).then((s) => (d.up ? s.add(id) : s.delete(id)));
      track("lecture_vote", { quest: id, up, short: id });
    } catch {
      setMine(!up);
      setVotes((n) => Math.max(0, n + (up ? -1 : 1)));
    } finally {
      setBusy(false);
    }
  };
  return { votes, mine, toggle };
}

/** one fetch per page load of the shorts this learner saved */
let savedOnce: { user: string; p: Promise<Set<string>> } | null = null;
function mySaved(user: string): Promise<Set<string>> {
  if (savedOnce?.user !== user)
    savedOnce = {
      user,
      p: Promise.resolve(supabaseClient.from("bookmarks").select("lesson_slug").eq("user_id", user).eq("course_id", "shorts").limit(2000))
        .then(({ data }) => new Set((data || []).map((r) => r.lesson_slug as string)))
        .catch(() => new Set<string>()),
    };
  return savedOnce.p;
}

/** save a short to the learner's library (the notebook's "saved shorts") */
export function useShortSave(short: PlayableShort) {
  const { user } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!user) return;
    let off = false;
    void mySaved(user.id).then((s) => !off && setSaved(s.has(short.id)));
    return () => {
      off = true;
    };
  }, [user, short.id]);

  const toggle = async () => {
    if (!user) return openAuthModal();
    const next = !saved;
    setSaved(next);
    const { error } = next
      ? await supabaseClient.from("bookmarks").insert({
          user_id: user.id,
          course_id: "shorts",
          week: "shorts",
          lesson_slug: short.id,
          custom_title: short.title,
          bookmark_text: short.label,
          bookmark_offset: 0,
          tags: ["short"],
        })
      : await supabaseClient.from("bookmarks").delete().eq("user_id", user.id).eq("course_id", "shorts").eq("lesson_slug", short.id);
    // already saved (from another tab) counts as saved
    if (error && !(next && error.code === "23505")) return setSaved(!next);
    void mySaved(user.id).then((s) => (next ? s.add(short.id) : s.delete(short.id)));
    track("short_save", { short: short.id, saved: next });
  };
  return { saved, toggle };
}

/** comment counts for every short, shared by the feed */
export function useCommentCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const load = (fresh = false) =>
    fetch(`/api/learn/shorts/comments${fresh ? "?fresh=1" : ""}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : {}))
      .then(setCounts)
      .catch(() => {});
  useEffect(() => {
    void load();
  }, []);
  return { counts, refresh: () => void load(true) };
}

/**
 * The discussion, beside the short rather than over it (no backdrop, nothing dims, the short keeps playing):
 * the bottom two thirds on phones and tablets, a column on the right on laptops.
 */
export function CommentsSheet({ short, onClose }: { short: PlayableShort; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    track("short_comments_open", { short: short.id });
  }, [short.id]);

  return (
    <section
      role="dialog"
      aria-label={`Discussion: ${short.title}`}
      className="fixed inset-x-0 bottom-0 z-[70] flex h-[calc(100dvh-32dvh-env(safe-area-inset-top,0px)-20px)] animate-hk-in flex-col border-t border-line-strong bg-bg pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_40px_rgba(0,0,0,0.5)] lg:inset-x-auto lg:bottom-0 lg:right-0 lg:top-[var(--hk-header-h,61px)] lg:z-40 lg:h-auto lg:w-[420px] lg:border-l lg:border-t-0 lg:shadow-none"
    >
      <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong lg:hidden" aria-hidden />
      <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-1 lg:pt-3">
        <div className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] uppercase tracking-label text-signal-text">discussion</span>
          <span className="line-clamp-2 font-display text-[17px] font-extrabold leading-tight text-fg">{short.title}</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close discussion" className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong text-fg-2 hover:text-fg">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <LessonComments courseId="shorts" week="shorts" lessonSlug={short.id} compact />
      </div>
    </section>
  );
}
