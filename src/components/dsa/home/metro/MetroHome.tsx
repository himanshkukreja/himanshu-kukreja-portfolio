"use client";

/**
 * The map view of the DSA home (redesign, 17 Nov 2026, boards 16 and 19): the route card with its one Next stop button, the
 * always-visible legend, the metro map and the station card on computers; the "next stops" strip on phones. Owns the route,
 * the goal, which station is shown, and the first-visit tour. The page around it (Today, tutor, readiness) lives in CourseHome.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildMetro, currentStation, interchangeText, routeInfo, stationLessons, type Station } from "@/lib/dsa/metro/model";
import { LINE_NAME, type LineId } from "@/lib/dsa/metro/layout";
import type { Outline } from "@/lib/dsa/outline";
import type { NextStep } from "@/lib/dsa/continue";
import MetroMap from "./MetroMap";
import MetroPhone from "./MetroPhone";
import Balanced from "./Balanced";
import MetroTour from "./MetroTour";
import { HomeBar, Legend, RouteCard, StationCard } from "./Panels";
import { useGoal, useHomeView, useMedia, useTourSeen } from "./useMetroPrefs";

type Props = {
  outline: Outline;
  progress: { ready: boolean; concepts: ReadonlySet<string>; solved: ReadonlySet<string> };
  problems: { id: string; concept: string }[];
  next: NextStep | null;
  kicker: string;
  /** a new learner's welcome questions: shown first, above the map; the tour waits until it is answered */
  intro?: React.ReactNode;
  /** computers: every card under the top band (left-off, Today, quick review, readiness, ...) in ONE flow that balances its columns, most important first */
  cards?: React.ReactNode[];
  /** the welcome tour's re-run, shown in the top bar */
  onRedo?: () => void;
  /** everywhere: the rest of the page under the map */
  below?: React.ReactNode;
};

export default function MetroHome({ outline, progress, problems, next, kicker, intro, cards, onRedo, below }: Props) {
  const [, setView] = useHomeView();
  const wide = useMedia("(min-width: 768px)");
  const huge = useMedia("(min-width: 1440px)");
  const [goal, setGoal] = useGoal();
  const [seen, setSeen] = useTourSeen();
  const [tour, setTour] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const metro = useMemo(() => buildMetro(outline, progress, problems), [outline, progress, problems]);
  const lineTitle = useCallback((l: LineId) => metro.lines.find((x) => x.id === l)?.title || LINE_NAME[l], [metro]);

  // where the learner is: one rule (currentStation), the same stations and states the map, the card and the strip draw
  const hereId = useMemo(() => currentStation(outline, metro, progress), [outline, metro, progress]);
  const info = useMemo(() => routeInfo(metro, hereId, goal, progress, outline), [metro, hereId, goal, progress, outline]);
  const isNew = progress.concepts.size === 0 && progress.solved.size === 0;
  const hereStation = metro.byId.get(hereId);
  const cardId = active ?? hereId;
  const cardStation: Station | undefined = metro.byId.get(cardId);
  // what is inside the station on the card (and on the phone strip): the lessons the List view shows, for this learner
  const lessonsOf = useCallback((st: Station | undefined) => (st ? stationLessons(outline, st, progress) : null), [outline, progress]);
  const cardContent = useMemo(() => lessonsOf(cardStation), [lessonsOf, cardStation]);

  // the tour opens by itself once, when the map is on screen and progress has loaded
  useEffect(() => {
    if (seen !== false || !progress.ready || !metro.stations.length || intro) return;
    const t = window.setTimeout(() => setTour(true), 900);
    return () => window.clearTimeout(t);
  }, [seen, progress.ready, metro.stations.length, wide, intro]);
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
  const mapEl = (
    <MetroMap metro={metro} hereId={hereId} routeIds={info.ids} shownId={shown} pinnedId={cardId} focusId={focus ?? cardId} onShow={onShow} onPin={onPin} onFocusId={setFocus} lineTitle={lineTitle} />
  );

  return (
    <>
      <MetroTour open={tour} onClose={closeTour} />
      <HomeBar kicker={kicker} view="map" onView={setView} onHow={ready ? () => setTour(true) : undefined} onRedo={onRedo} />
      {intro}
      {wide ? (
        huge ? (
          <>
            {/* the top band: both columns end on the same line (the row stretches them; the lesson list scrolls inside its card, the map sits centred in what is left) */}
            <div className="grid items-stretch gap-6 grid-cols-[380px_minmax(0,1fr)]">
              <div className="flex flex-col gap-4">
                <RouteCard metro={metro} info={info} hereStation={hereStation} next={next} ready={ready} isNew={isNew} goal={goal} onGoal={setGoal} />
                <StationCard station={cardStation} lineTitle={lineTitle} isHere={cardId === hereId} inRoute={info.ids.includes(cardId)} content={cardContent} fill />
              </div>
              <div className="flex min-w-0 flex-col gap-4 pt-4">
                <div className="flex flex-1 flex-col justify-center">{mapEl}</div>
                <Legend metro={metro} wide />
              </div>
            </div>
            <Balanced items={cards ?? []} />
          </>
        ) : (
          <>
            <div className="grid items-stretch gap-4 md:grid-cols-2">
              <RouteCard metro={metro} info={info} hereStation={hereStation} next={next} ready={ready} isNew={isNew} goal={goal} onGoal={setGoal} className="h-full" />
              <StationCard station={cardStation} lineTitle={lineTitle} isHere={cardId === hereId} inRoute={info.ids.includes(cardId)} content={cardContent} fill />
            </div>
            {mapEl}
            <Legend metro={metro} wide />
            <Balanced items={cards ?? []} />
          </>
        )
      ) : (
        <MetroPhone metro={metro} info={info} hereId={hereId} next={next} ready={ready} goal={goal} isNew={isNew} onGoal={setGoal} lineTitle={lineTitle} lessonsOf={lessonsOf} />
      )}
      {below}
      {/* a one-line plain-language hint for the interchange nearest the learner (also read out when the card changes) */}
      <span className="sr-only" role="status">
        {cardStation && cardStation.lines.length > 1 ? interchangeText(cardStation, lineTitle) : ""}
      </span>
    </>
  );
}
