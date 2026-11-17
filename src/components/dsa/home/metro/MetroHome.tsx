"use client";

/**
 * The map view of the DSA home (redesign, 17 Nov 2026, boards 16 and 19): the route card with its one Next stop button, the
 * always-visible legend, the metro map and the station card on computers; the "next stops" strip on phones. Owns the route,
 * the goal, which station is shown, and the first-visit tour. The page around it (Today, tutor, readiness) lives in CourseHome.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildMetro, interchangeText, routeInfo, type Station } from "@/lib/dsa/metro/model";
import { LINE_NAME, type LineId } from "@/lib/dsa/metro/layout";
import { moduleOfLesson, type Outline } from "@/lib/dsa/outline";
import type { NextStep } from "@/lib/dsa/continue";
import MetroMap from "./MetroMap";
import MetroPhone from "./MetroPhone";
import MetroTour from "./MetroTour";
import { HomeBar, Legend, RouteCard, StationCard } from "./Panels";
import { useGoal, useHomeView, useMedia, useTourSeen } from "./useMetroPrefs";

type Props = {
  outline: Outline;
  progress: { ready: boolean; concepts: ReadonlySet<string>; solved: ReadonlySet<string> };
  problems: { id: string; concept: string }[];
  next: NextStep | null;
  kicker: string;
  /** computers: cards beside the station card; everywhere: the rest of the page under the map */
  aside?: React.ReactNode;
  below?: React.ReactNode;
};

export default function MetroHome({ outline, progress, problems, next, kicker, aside, below }: Props) {
  const [, setView] = useHomeView();
  const wide = useMedia("(min-width: 768px)");
  const [goal, setGoal] = useGoal();
  const [seen, setSeen] = useTourSeen();
  const [tour, setTour] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const metro = useMemo(() => buildMetro(outline, progress, problems), [outline, progress, problems]);
  const lineTitle = useCallback((l: LineId) => metro.lines.find((x) => x.id === l)?.title || LINE_NAME[l], [metro]);

  // where the learner is: the station of the lesson Continue points at; with none (loading, caught up) the first topic written
  const hereId = useMemo(() => {
    const m = next && (next.state === "start" || next.state === "continue") ? moduleOfLesson(outline, next.lessonId) : null;
    if (m && metro.byId.has(m.mod.regionId)) return m.mod.regionId;
    return (metro.stations.find((s) => !s.planned && s.state !== "done") ?? metro.stations.find((s) => !s.planned) ?? metro.stations[0])?.id ?? "";
  }, [next, outline, metro]);
  const info = useMemo(() => routeInfo(metro, hereId, goal, progress, outline), [metro, hereId, goal, progress, outline]);
  const isNew = progress.concepts.size === 0 && progress.solved.size === 0;
  const hereStation = metro.byId.get(hereId);
  const cardId = active ?? hereId;
  const cardStation: Station | undefined = metro.byId.get(cardId);

  // the tour opens by itself once, when the map is on screen and progress has loaded
  useEffect(() => {
    if (seen !== false || !progress.ready || !metro.stations.length) return;
    const t = window.setTimeout(() => setTour(true), 900);
    return () => window.clearTimeout(t);
  }, [seen, progress.ready, metro.stations.length, wide]);
  const closeTour = useCallback(() => {
    setTour(false);
    setSeen(true);
  }, [setSeen]);

  const ready = progress.ready;
  const onPin = (id: string) => {
    setActive(id);
    setFocus(id);
  };
  const onShow = (id: string | null) => {
    setShown(id);
    if (id) setActive(id);
  };

  if (!metro.stations.length) return null;

  return (
    <>
      <MetroTour open={tour} onClose={closeTour} />
      <HomeBar kicker={kicker} view="map" onView={setView} onHow={ready ? () => setTour(true) : undefined} />
      {wide ? (
        <>
          <div className="grid items-start gap-5 min-[1440px]:grid-cols-[380px_minmax(0,1fr)] min-[1440px]:gap-6">
            <div className="grid gap-4 md:grid-cols-2 min-[1440px]:grid-cols-1">
              <RouteCard metro={metro} info={info} hereStation={hereStation} next={next} ready={ready} isNew={isNew} goal={goal} onGoal={setGoal} />
              <Legend metro={metro} className="md:self-start" />
            </div>
            <div className="min-w-0 pt-6">
              <MetroMap
                metro={metro}
                hereId={hereId}
                routeIds={info.ids}
                shownId={shown}
                pinnedId={cardId}
                focusId={focus ?? cardId}
                onShow={onShow}
                onPin={onPin}
                onFocusId={setFocus}
                lineTitle={lineTitle}
              />
            </div>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <StationCard station={cardStation} lineTitle={lineTitle} isHere={cardId === hereId} inRoute={info.ids.includes(cardId)} />
            {aside}
          </div>
        </>
      ) : (
        <>
          <MetroPhone metro={metro} info={info} hereId={hereId} next={next} ready={ready} goal={goal} isNew={isNew} onGoal={setGoal} lineTitle={lineTitle} />
        </>
      )}
      {below}
      {/* a one-line plain-language hint for the interchange nearest the learner (also read out when the card changes) */}
      <span className="sr-only" role="status">
        {cardStation && cardStation.lines.length > 1 ? interchangeText(cardStation, lineTitle) : ""}
      </span>
    </>
  );
}
