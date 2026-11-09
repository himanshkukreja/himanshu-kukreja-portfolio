"use client";

/**
 * Mounts the signed-in onboarding on DSA pages (the course layout renders this on every page; it does nothing off /dsa).
 *
 * Shows once per account, on the first signed-in visit to any /dsa page, when the account has no onboarding record
 * (completed or skipped) and no DSA progress yet. Never for guests (they keep the hub's three-tap welcome). The record
 * is the account flag `pref:dsa-onboarding`; before opening, the account's own copy is read straight from the
 * profile, so a returning learner on a new device is not shown it again while the game sync is still catching up.
 * "Redo the welcome tour" (the More menu, the hub) opens it again at any time.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useGame } from "@/game/GameProvider";
import { supabaseClient } from "@/lib/supabase-client";
import { useCoursePathname } from "@/components/site/SiteMode";
import { DSA_FULL, isDsaPath } from "@/lib/dsa/flags";
import { readRecord } from "@/lib/dsa/onboarding/recommend";
import { attentionHeld } from "@/lib/learn/guide/attention";
import { ONBOARDING_OPEN_EVENT } from "./useOnboarding";

const Flow = dynamic(() => import("./OnboardingFlow"), { ssr: false });

type Remote = { has: boolean; progress: boolean } | "error";
const checked = new Map<string, Remote>();

async function readRemote(userId: string): Promise<Remote> {
  const hit = checked.get(userId);
  if (hit) return hit;
  try {
    const { data, error } = await supabaseClient.from("user_profiles").select("game_flags, game_done").eq("id", userId).maybeSingle();
    if (error) return "error";
    const r: Remote = {
      has: !!readRecord((data?.game_flags as Record<string, unknown>) || {}),
      progress: Object.keys((data?.game_done as Record<string, number>) || {}).some((k) => k.startsWith("dsa:")),
    };
    checked.set(userId, r);
    return r;
  } catch {
    return "error";
  }
}

export default function OnboardingHost() {
  const path = useCoursePathname();
  const { user, loading } = useAuth();
  const { flags, done, hydrated } = useGame();
  const [open, setOpen] = useState<null | { rerun: boolean }>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const onDsa = DSA_FULL && isDsaPath(path);
  const userId = user?.id ?? null;
  const local = readRecord(flags);
  const localProgress = Object.keys(done).some((k) => k.startsWith("dsa:"));

  // "Redo the welcome tour"
  useEffect(() => {
    if (!onDsa || !userId) return;
    const on = () => setOpen({ rerun: true });
    window.addEventListener(ONBOARDING_OPEN_EVENT, on);
    return () => window.removeEventListener(ONBOARDING_OPEN_EVENT, on);
  }, [onDsa, userId]);

  // the first visit: wait for the account to be known, then for the account's own record
  useEffect(() => {
    if (!onDsa || loading || !hydrated || !userId || open || local || localProgress || dismissed === userId) return;
    let alive = true;
    let t = 0;
    (async () => {
      const remote = await readRemote(userId);
      if (!alive || remote === "error" || remote.has || remote.progress) return;
      // another first-visit popup (the welcome video) has the floor: ask again in a moment
      const tryOpen = () => {
        if (!alive) return;
        if (attentionHeld()) {
          t = window.setTimeout(tryOpen, 1200);
          return;
        }
        setOpen({ rerun: false });
      };
      t = window.setTimeout(tryOpen, 700);
    })();
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [onDsa, loading, hydrated, userId, open, local, localProgress, dismissed]);

  if (!onDsa || !userId || !open) return null;
  return (
    <Flow
      rerun={open.rerun}
      onClose={() => {
        setDismissed(userId);
        setOpen(null);
      }}
    />
  );
}

