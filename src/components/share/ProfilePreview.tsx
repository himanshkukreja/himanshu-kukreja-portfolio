"use client";

/** The owner's preview of their public page (GET /api/learn/share/preview), rendered by the public page's own component. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { userFetch } from "@/components/learn/progress/userFetch";
import type { CourseMap } from "@/lib/learn/types";
import type { PublicProfile as Profile } from "@/lib/share/model";
import PublicProfile from "./PublicProfile";

export default function ProfilePreview({ map }: { map: CourseMap }) {
  const { user, loading } = useAuth();
  const [state, setState] = useState<{ p: Profile | null; error: string | null } | null>(null);
  useEffect(() => {
    if (loading || !user) return;
    let off = false;
    void userFetch("/api/learn/share/preview")
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { profile?: Profile; error?: string };
        if (!off) setState(r.ok && j.profile ? { p: j.profile, error: null } : { p: null, error: j.error || "Couldn't build the preview." });
      })
      .catch(() => !off && setState({ p: null, error: "Couldn't build the preview." }));
    return () => {
      off = true;
    };
  }, [user, loading]);

  if (!loading && !user)
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-16 sm:px-6">
        <h1 className="m-0 font-display text-[32px] font-extrabold tracking-[-0.03em] text-fg">Sign in to preview your page.</h1>
        <Link href="/dashboard#share" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
          Sharing settings →
        </Link>
      </main>
    );
  if (!state) return <main aria-busy="true" className="mx-auto h-[60vh] max-w-[1180px] animate-pulse px-4 pt-12" />;
  if (!state.p)
    return (
      <main className="mx-auto flex max-w-[720px] flex-col gap-3 px-4 py-16 sm:px-6">
        <p className="m-0 text-[16px] text-fg-2">{state.error}</p>
        <Link href="/dashboard#share" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
          Sharing settings →
        </Link>
      </main>
    );
  return <PublicProfile p={state.p} map={map} preview />;
}
