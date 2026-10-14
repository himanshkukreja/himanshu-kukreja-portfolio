"use client";

import { useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabase-client";

type Snapshot = { xp: number; done: Record<string, number>; flags: Record<string, unknown> };

/**
 * Keeps a signed-in visitor's game state in user_profiles (xp, game_done, game_flags) so it follows
 * them across devices. Guests stay on localStorage only. On sign-in the local and remote states merge
 * (higher XP wins, quests are unioned). If the Level Up migration isn't applied yet, the first
 * PostgREST error disables sync for the session and the game keeps working locally.
 */
export function useGameSync(
  userId: string | null,
  hydrated: boolean,
  state: Snapshot,
  replace: (next: Snapshot) => void
) {
  const disabled = useRef(false);
  const mergedFor = useRef<string | null>(null);
  const lastPushed = useRef<string>("");

  // Pull + merge once per signed-in user.
  useEffect(() => {
    if (!hydrated || !userId || disabled.current || mergedFor.current === userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabaseClient.from("user_profiles").select("xp, game_done, game_flags").eq("id", userId).maybeSingle();
      if (cancelled) return;
      if (error) {
        disabled.current = true;
        return;
      }
      mergedFor.current = userId;
      const remote: Snapshot = {
        xp: Number(data?.xp) || 0,
        done: (data?.game_done as Record<string, number>) || {},
        flags: (data?.game_flags as Record<string, unknown>) || {},
      };
      const merged: Snapshot = {
        xp: Math.max(remote.xp, state.xp),
        done: { ...remote.done, ...state.done },
        flags: { ...remote.flags, ...state.flags },
      };
      replace(merged);
    })();
    return () => {
      cancelled = true;
    };
    // state is read once at merge time on purpose; later changes are pushed by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userId, replace]);

  // Push changes (debounced) after the merge.
  useEffect(() => {
    if (!userId || disabled.current || mergedFor.current !== userId) return;
    const body = JSON.stringify(state);
    if (body === lastPushed.current) return;
    const t = window.setTimeout(async () => {
      const { error } = await supabaseClient
        .from("user_profiles")
        .update({ xp: state.xp, game_done: state.done, game_flags: state.flags })
        .eq("id", userId);
      if (error) disabled.current = true;
      else lastPushed.current = body;
    }, 1200);
    return () => window.clearTimeout(t);
  }, [userId, state]);
}
