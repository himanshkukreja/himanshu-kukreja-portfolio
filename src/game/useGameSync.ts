"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase-client";
import { isNetworkError, isOffline } from "@/lib/offline/connectivity";
import { LEARN_XP } from "@/lib/learn/types";
import { QUEST_BY_ID } from "./catalog";
import { CERT_XP } from "@/lib/certificates/core";

type Snapshot = { xp: number; done: Record<string, number>; flags: Record<string, unknown> };

/** Account whose state this browser's hk.game.v1 copy holds (set on every merge). */
const OWNER_KEY = "hk.game.owner";
/** game_flags key the reset APIs stamp (epoch ms) so stale copies elsewhere can't undo a reset. */
export const RESET_AT_FLAG = "sync:resetAt";

const resetAtOf = (s: Pick<Snapshot, "flags">) => Number(s.flags?.[RESET_AT_FLAG]) || 0;

/** XP a done key is worth (learn keys + catalog quests); repeatable grants aren't keyed, so 0. */
function xpOfKey(key: string): number {
  const q = QUEST_BY_ID[key];
  if (q) return q.xp;
  const p = key.slice(0, key.indexOf(":"));
  if (p === "lesson") return LEARN_XP.lesson;
  if (p === "stage") return LEARN_XP.stage;
  if (p === "trial") return LEARN_XP.trial;
  if (p === "boss") return LEARN_XP.boss;
  if (p === "world") return LEARN_XP.world;
  if (p === "sidequest") return LEARN_XP.sideQuest - LEARN_XP.lesson;
  if (p === "mock") return LEARN_XP.mock;
  if (p === "offer") return LEARN_XP.mockOffer;
  if (p === "cert") return key === "cert:course" ? CERT_XP.course : CERT_XP.world;
  return 0;
}

/**
 * Merge this browser's copy into the account's copy.
 * - Quests are unioned, except local ones stamped before the account's last reset (a stale copy
 *   on another device used to merge reset lessons straight back in).
 * - XP: the higher of the two, unless the local copy predates a reset — then the account's XP
 *   plus only what the surviving local-only quests are worth.
 */
export function mergeGame(remote: Snapshot, local: Snapshot): Snapshot {
  const resetAt = Math.max(resetAtOf(remote), resetAtOf(local));
  const localStale = resetAtOf(remote) > resetAtOf(local);
  const done: Record<string, number> = { ...remote.done };
  let extra = 0;
  Object.entries(local.done).forEach(([k, at]) => {
    if (k in done || !at || at <= resetAt) return;
    done[k] = at;
    extra += xpOfKey(k);
  });
  const xp = localStale ? remote.xp + extra : Math.max(remote.xp, local.xp);
  const flags: Record<string, unknown> = { ...remote.flags, ...(localStale ? {} : local.flags) };
  if (resetAt) flags[RESET_AT_FLAG] = resetAt;
  return { xp, done, flags };
}

const EMPTY: Snapshot = { xp: 0, done: {}, flags: {} };

function readOwner(): string | null {
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}
function writeOwner(userId: string) {
  try {
    window.localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // storage unavailable: nothing to protect either
  }
}

/** `offline`: the request never reached the server (no connection) — retry on reconnect, don't give up. */
async function pull(userId: string): Promise<{ snap: Snapshot | null; error: boolean; offline: boolean }> {
  try {
    const { data, error } = await supabaseClient.from("user_profiles").select("xp, game_done, game_flags").eq("id", userId).maybeSingle();
    if (error) return { snap: null, error: true, offline: isOffline() || isNetworkError(error) };
    return {
      snap: {
        xp: Number(data?.xp) || 0,
        done: (data?.game_done as Record<string, number>) || {},
        flags: (data?.game_flags as Record<string, unknown>) || {},
      },
      error: false,
      offline: false,
    };
  } catch {
    // supabase-js throws only when the request itself failed
    return { snap: null, error: true, offline: true };
  }
}

/** Bumps when the connection comes back, so a sync that failed offline runs again. */
function useReconnectTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("online", bump);
    window.addEventListener("hk:reconnected", bump);
    return () => {
      window.removeEventListener("online", bump);
      window.removeEventListener("hk:reconnected", bump);
    };
  }, []);
  return tick;
}

/**
 * Keeps a signed-in visitor's game state in user_profiles (xp, game_done, game_flags) so it follows
 * them across devices. Guests stay on localStorage only. On sign-in the local and remote states merge
 * (see mergeGame). If the Level Up migration isn't applied yet, the first PostgREST error disables
 * sync for the session and the game keeps working locally.
 *
 * Integrity rules (each was a real way to inflate or resurrect progress):
 * - this browser's copy is only merged into the account it belongs to: after signing out of A and
 *   into B, A's XP and quests used to be merged into B;
 * - pushes re-read the account first and write the merge, instead of overwriting it with this
 *   tab's snapshot (two devices kept erasing each other's quests);
 * - quests older than the account's last reset are not merged back (see RESET_AT_FLAG).
 * - offline (plane wifi, no signal) the game keeps running on the local copy; a failed pull or push
 *   for network reasons is retried when the connection comes back (the merge makes it safe), it
 *   no longer switches sync off for the session.
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
  const reconnect = useReconnectTick();

  // Pull + merge once per signed-in user.
  useEffect(() => {
    if (!hydrated || !userId || disabled.current || mergedFor.current === userId) return;
    let cancelled = false;
    (async () => {
      const { snap: remote, error, offline } = await pull(userId);
      if (cancelled) return;
      if (error || !remote) {
        if (!offline) disabled.current = true;
        return;
      }
      mergedFor.current = userId;
      const owner = readOwner();
      // another account's progress lives in this browser: start from the account, don't absorb it
      const local = owner && owner !== userId ? EMPTY : state;
      writeOwner(userId);
      replace(mergeGame(remote, local));
    })();
    return () => {
      cancelled = true;
    };
    // state is read once at merge time on purpose; later changes are pushed by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userId, replace, reconnect]);

  // Push changes (debounced) after the merge: read the account, merge, write the merge.
  useEffect(() => {
    if (!userId || disabled.current || mergedFor.current !== userId) return;
    const body = JSON.stringify(state);
    if (body === lastPushed.current) return;
    const t = window.setTimeout(async () => {
      const { snap: remote, error: readError, offline } = await pull(userId);
      if (readError || !remote) {
        if (!offline) disabled.current = true;
        return;
      }
      const next = mergeGame(remote, state);
      const { error } = await supabaseClient
        .from("user_profiles")
        .update({ xp: next.xp, game_done: next.done, game_flags: next.flags })
        .eq("id", userId);
      if (error) {
        if (!(isOffline() || isNetworkError(error))) disabled.current = true;
        return;
      }
      const nextBody = JSON.stringify(next);
      lastPushed.current = nextBody;
      // adopt quests another device added (or a reset elsewhere) so this tab stops re-pushing stale state
      if (nextBody !== body) replace(next);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [userId, state, replace, reconnect]);
}
