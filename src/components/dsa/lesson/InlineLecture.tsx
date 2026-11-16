"use client";

/**
 * Learn > Watch: the lesson's lecture inline, chapters under the player (LecturePlayer's `embedded` mode). The lecture
 * JSON is fetched when Watch opens (/api/dsa/lecture/<lesson>), so Read pages stay as light as before. Below 1024 px,
 * or if the fetch fails, the existing LectureEntry card links to the lecture's own page (theatre view). The sign-in
 * gate's 75-second stop is LecturePlayer's own and is unchanged.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import type { Lecture } from "@/lib/learn/lecture/types";

const LecturePlayer = dynamic(() => import("@/components/learn/lecture/LecturePlayer"), { ssr: false, loading: () => <Plate>Loading the lecture…</Plate> });

type Card = { href: string; minutes: number; checkpoints: number; chapters: number };
type Data = { lecture: Lecture; quest: { title: string; href: string; code: string }; source: string; mediaBase: string | null };

function Plate({ children }: { children: React.ReactNode }) {
  return <div className="grid aspect-video w-full place-items-center border border-line-strong bg-[var(--c-plate)] font-mono text-[13px] text-[var(--c-plate-fg-2)]">{children}</div>;
}

export default function InlineLecture({ lessonId, card }: { lessonId: string; card: Card }) {
  const [wide, setWide] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | "failed" | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    if (!wide) return;
    let live = true;
    fetch(`/api/dsa/lecture/${encodeURIComponent(lessonId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => live && setData(d))
      .catch(() => live && setData("failed"));
    return () => {
      live = false;
    };
  }, [wide, lessonId]);

  if (wide === null) return <Plate>Loading the lecture…</Plate>;
  if (!wide || data === "failed") return <LectureEntry lecture={card} what="The whole lesson" className="" />;
  if (!data) return <Plate>Loading the lecture…</Plate>;
  return (
    <div className="dark:border dark:border-line-strong dark:bg-surface dark:p-2">
      <LecturePlayer embedded lecture={data.lecture} quest={data.quest} source={data.source} mediaBase={data.mediaBase} />
    </div>
  );
}
