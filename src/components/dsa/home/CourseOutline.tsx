"use client";

/**
 * The course outline on the DSA home: the four parts as headers with a done count, each module a row that opens to its
 * lessons. The module of the learner's current lesson is open by default; `#m3` opens that module and scrolls to it;
 * `?view=lectures` swaps each lesson's meta for its lecture length and watched state (the old /dsa/lectures page).
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import type { Outline } from "@/lib/dsa/outline";
import type { DsaProgress } from "../progress/useDsaProgress";
import ModuleRow from "./ModuleRow";
import type { LectureRef } from "./useLectureSeconds";

export default function CourseOutline({
  outline,
  progress,
  currentCode,
  nowLesson,
  lectures,
  mediaBase,
  lecturesView,
}: {
  outline: Outline;
  progress: DsaProgress;
  currentCode: string | null;
  nowLesson: string | null;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  lecturesView: boolean;
}) {
  const { flags } = useGame();
  // modules the learner opened or closed by hand; the current one is open until they say otherwise
  const [manual, setManual] = useState<Record<string, boolean>>({});
  // the URL's #m3: the module it names opens (unless the learner closed it) and scrolls into view
  const hash = useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    () => window.location.hash.replace(/^#/, ""),
    () => "",
  );
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(`dsa-mod-${hash}`);
    if (!el) return;
    const t = window.setTimeout(() => el.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }), 60);
    return () => window.clearTimeout(t);
  }, [hash]);

  const parts = useMemo(
    () =>
      outline.parts.map((p) => {
        const mods = p.modules.map((m) => ({ m, done: m.lessons.filter((l) => l.built && progress.concepts.has(l.conceptId)).length }));
        return { p, mods, done: mods.reduce((s, x) => s + x.done, 0), ready: mods.reduce((s, x) => s + x.m.readyLessons, 0), planned: mods.reduce((s, x) => s + (x.m.lessons.length - x.m.readyLessons), 0) };
      }),
    [outline, progress.concepts],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface sm:rounded-[18px]">
      {parts.map(({ p, mods, done, ready, planned }, i) => {
        const all = ready > 0 && done === ready;
        const here = mods.some(({ m }) => m.regionCode === currentCode);
        return (
          <section key={p.id} aria-labelledby={`dsa-part-${p.id}`} className={i ? "border-t border-line" : ""}>
            <div className={`flex flex-wrap items-center gap-x-3.5 gap-y-1 px-4 sm:px-6 ${mods.length ? "pb-2 pt-3.5 sm:pt-4" : "py-3.5 sm:py-4"}`}>
              <span className={`hidden w-[70px] font-mono text-[12px] sm:inline ${here ? "text-signal-text" : "text-fg-3"}`}>{p.label}</span>
              <h3 id={`dsa-part-${p.id}`} className="m-0 min-w-0 flex-1 text-[15px] font-semibold text-fg">
                <span className="sm:hidden">{p.label.replace(/^PART/i, "Part")} · </span>
                {p.title}
              </h3>
              <span className={`text-[12px] sm:text-[13px] ${all ? "font-medium text-ok-text" : "text-fg-3"}`}>
                {ready === 0 ? `Soon · ${planned} planned` : all ? `Done · ${ready} ${ready === 1 ? "lesson" : "lessons"}` : `${done} of ${ready} lessons${planned ? ` · ${planned} planned` : ""}`}
              </span>
            </div>
            {mods.map(({ m, done: d }) => {
              const current = currentCode === m.regionCode;
              const open = manual[m.regionCode] ?? (current || hash === m.regionCode);
              return (
                <ModuleRow
                  key={m.regionId}
                  anchor={`dsa-mod-${m.regionCode}`}
                  v={{ module: m, done: d, current, open }}
                  nowLesson={nowLesson}
                  concepts={progress.concepts}
                  checkpoints={progress.checkpoints}
                  onToggle={() => setManual((s) => ({ ...s, [m.regionCode]: !open }))}
                  lectures={lectures}
                  mediaBase={mediaBase}
                  lecturesView={lecturesView}
                  flags={flags}
                />
              );
            })}
            {p.final ? (
              <div className="mx-4 flex min-h-12 items-center gap-3.5 border-t border-line py-3 text-fg-3 sm:mx-6">
                <span className="hidden w-[70px] sm:block" aria-hidden />
                <span className="min-w-0 flex-1 text-[14px]">Final review: {p.final.title}</span>
                <span className="text-[13px]">{p.final.built ? "Open" : "Soon"}</span>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
