"use client";

/**
 * Mock interview (/learn/mock/[slug]): lobby → interview room → debrief.
 * The run lives in this browser (lib/learn/mock/store.ts); XP, the badge and the verdict go
 * through the game engine (synced to the account when signed in). See the content repo's
 * resources/mock-interviews/README.md for the format and scoring rules.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/game/GameProvider";
import MermaidHydrator from "@/components/diagrams/MermaidHydrator";
import { track } from "@/lib/track";
import { LEARN_XP } from "@/lib/learn/types";
import type { MockInterview, MockLevel } from "@/lib/learn/mock/types";
import { mockDoneKey, mockFlagKey, mockOfferKey } from "@/lib/learn/mock/types";
import { freshRun, nextFlag, readFlag, readRun, writeRun, type MockRun } from "@/lib/learn/mock/store";
import { dueOnClock, enterPhase, firedCurveballs, hintId, pendingOnSubmit, roundFacts } from "@/lib/learn/mock/engine";
import { MIN_WORDS, scoreLoop, VERDICT_LABEL, words, type SignalScore } from "@/lib/learn/mock/score";
import Lobby from "./Lobby";
import Room from "./Room";
import Debrief from "./Debrief";
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";

type LectureCard = { href: string; minutes: number; checkpoints: number; chapters: number } | null;

export default function MockInterviewRoom({ mock, lecture = null }: { mock: MockInterview; lecture?: LectureCard }) {
  const { awardOnce, setFlag, flags, done, hydrated } = useGame();
  const rootRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<MockRun | null>(null);
  const [running, setRunning] = useState(false);
  const [away, setAway] = useState(false);
  const [skipWarn, setSkipWarn] = useState(false);

  // ------------------------------------------------------------------ load / save

  useEffect(() => {
    const saved = readRun(mock.id);
    let next: MockRun;
    if (!saved) next = freshRun(mock.version, mock.level);
    else if (saved.version !== mock.version && !saved.live) next = freshRun(mock.version, saved.level, saved);
    else next = saved.version !== mock.version ? { ...saved, version: mock.version, scores: {} } : saved;
    const t = window.setTimeout(() => {
      setRun(next);
      // came back to a round in progress: the clock waits for them
      setAway(next.screen === "room" && next.live);
    }, 0);
    return () => window.clearTimeout(t);
  }, [mock.id, mock.version, mock.level]);

  const saveTimer = useRef<number | null>(null);
  const latest = useRef<MockRun | null>(null);
  useEffect(() => {
    if (!run) return;
    latest.current = run;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => writeRun(mock.id, run), 400);
  }, [run, mock.id]);
  useEffect(() => {
    const flush = () => latest.current && writeRun(mock.id, latest.current);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [mock.id]);

  const scrollTop = useCallback(() => {
    window.setTimeout(() => {
      const el = rootRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
    }, 30);
  }, []);

  // ------------------------------------------------------------------ clock + prompts on the clock

  const inRoom = run?.screen === "room";
  const phaseId = run ? mock.phases[run.phase]?.id : undefined;
  const clockOn = running && inRoom && !!phaseId;
  useEffect(() => {
    if (!clockOn || !phaseId) return;
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const d = Math.max(0, (now - last) / 1000);
      last = now;
      setRun((r) => {
        if (!r) return r;
        const next = { ...r, used: { ...r.used, [phaseId]: (r.used[phaseId] || 0) + d } };
        const due = dueOnClock(mock, next);
        return due ? { ...next, fired: { ...next.fired, ...due } } : next;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [clockOn, phaseId, mock]);

  // ------------------------------------------------------------------ actions

  const start = useCallback(
    (level: MockLevel) => {
      setRun((r) => {
        const base = freshRun(mock.version, level, { attempt: (r?.attempt || 0) + 1, history: r?.history || [] });
        return enterPhase(mock, { ...base, screen: "room", live: true, startedAt: Date.now() }, 0);
      });
      setRunning(true);
      setAway(false);
      setSkipWarn(false);
      track("play", { game: mock.id, result: "started", level });
      scrollTop();
    },
    [mock, scrollTop]
  );

  const resume = useCallback(() => {
    const ended = !!run?.endedAt;
    setRun((r) => (r ? { ...r, screen: ended ? "debrief" : "room" } : r));
    setRunning(!ended);
    setAway(false);
    scrollTop();
  }, [run?.endedAt, scrollTop]);

  const togglePause = useCallback(() => {
    setAway(false);
    if (running) setRun((r) => (r ? { ...r, pauses: r.pauses + 1 } : r));
    setRunning(!running);
  }, [running]);

  const toLobby = useCallback(() => {
    setRunning(false);
    setRun((r) => (r ? { ...r, screen: "lobby" } : r));
    scrollTop();
  }, [scrollTop]);

  const endCall = useCallback(() => {
    setRunning(false);
    setSkipWarn(false);
    setRun((r) => (r ? { ...r, screen: "debrief", endedAt: r.endedAt || Date.now() } : r));
    scrollTop();
  }, [scrollTop]);

  const goPhase = useCallback(
    (k: number) => {
      setSkipWarn(false);
      setRun((r) => (r && k >= 0 && k <= r.maxPhase ? enterPhase(mock, r, k) : r));
    },
    [mock]
  );

  const done_ = useCallback(() => {
    if (!run) return;
    const k = run.phase;
    const p = mock.phases[k];
    if (!p) return;
    const pending = pendingOnSubmit(mock, run, k);
    if (!run.submitted[p.id] && pending.length) {
      const at = mock.phases.reduce((a, q) => a + (run.used[q.id] || 0), 0);
      const fired = { ...run.fired };
      pending.forEach((m) => (fired[m.id] = at));
      setRun({ ...run, fired, submitted: { ...run.submitted, [p.id]: true } });
      setSkipWarn(false);
      return;
    }
    const open = firedCurveballs(p, run).filter((c) => words(run.answers[c.id] || "") < 5);
    if (open.length && !skipWarn) {
      setSkipWarn(true);
      return;
    }
    setSkipWarn(false);
    const marked = { ...run, submitted: { ...run.submitted, [p.id]: true } };
    if (k + 1 >= mock.phases.length) {
      setRun(marked);
      endCall();
      return;
    }
    setRun(enterPhase(mock, marked, k + 1));
    scrollTop();
  }, [run, mock, skipWarn, endCall, scrollTop]);

  const hint = useCallback(() => {
    setRun((r) => {
      if (!r) return r;
      const p = mock.phases[r.phase];
      const n = r.hints[p.id] || 0;
      if (!p || n >= p.hints.length) return r;
      const at = mock.phases.reduce((a, q) => a + (r.used[q.id] || 0), 0);
      return { ...r, hints: { ...r.hints, [p.id]: n + 1 }, fired: { ...r.fired, [hintId(p, n)]: at } };
    });
  }, [mock]);

  const setNote = useCallback((pid: string, v: string) => setRun((r) => (r ? { ...r, notes: { ...r.notes, [pid]: v } } : r)), []);
  const setAnswer = useCallback((cid: string, v: string) => setRun((r) => (r ? { ...r, answers: { ...r.answers, [cid]: v } } : r)), []);
  const setBoard = useCallback((v: string) => setRun((r) => (r ? { ...r, board: v } : r)), []);
  const setSketch = useCallback((v: string) => setRun((r) => (r ? { ...r, sketch: v } : r)), []);
  const setScore = useCallback((sid: string, v: SignalScore | null) => {
    setRun((r) => {
      if (!r || r.claimed) return r;
      const scores = { ...r.scores };
      if (v === null) delete scores[sid];
      else scores[sid] = v;
      return { ...r, scores };
    });
  }, []);
  const setRevealed = useCallback((pid: string | "all", on: boolean) => {
    setRun((r) => {
      if (!r) return r;
      const revealed = { ...r.revealed };
      (pid === "all" ? mock.phases.map((p) => p.id) : [pid]).forEach((id) => (revealed[id] = on));
      return { ...r, revealed };
    });
  }, [mock.phases]);

  const facts = useMemo(() => (run ? roundFacts(mock, run) : null), [mock, run]);
  const score = useMemo(() => (run && facts ? scoreLoop(mock, run.level, run.scores, facts) : null), [mock, run, facts]);
  const totalWords = facts ? Object.values(facts.words).reduce((a, b) => a + b, 0) + Object.values(facts.curveballs).reduce((a, b) => a + b, 0) + words(run?.board || "") : 0;

  const claim = useCallback(() => {
    if (!run || !score || !score.complete || run.claimed || totalWords < MIN_WORDS) return;
    const result = { at: Date.now(), level: run.level, verdict: score.verdict, pct: Math.round(score.expected.pct * 100) };
    awardOnce(mockDoneKey(mock.id), LEARN_XP.mock, `Mock interview · ${mock.company.name} · ${VERDICT_LABEL[score.verdict]}`);
    if (score.offer) awardOnce(mockOfferKey(mock.id), LEARN_XP.mockOffer, `Offer · ${mock.company.name} · ${mock.badge}`);
    setFlag(mockFlagKey(mock.id), nextFlag(readFlag(flags[mockFlagKey(mock.id)]), result));
    setRun({ ...run, claimed: true, live: false, history: [result, ...run.history].slice(0, 12) });
    track("play", { game: mock.id, result: "cleared", score: result.pct, verdict: score.verdict, level: run.level });
  }, [run, score, totalWords, awardOnce, setFlag, flags, mock]);

  const retry = useCallback(() => {
    setRunning(false);
    setRun((r) => (r ? { ...freshRun(mock.version, r.level, r), screen: "lobby" } : r));
    scrollTop();
  }, [mock.version, scrollTop]);

  // ------------------------------------------------------------------ render

  if (!run) return <div ref={rootRef} className="min-h-[60vh]" aria-busy="true" />;
  const best = hydrated ? readFlag(flags[mockFlagKey(mock.id)]) : null;
  const completed = hydrated && !!done[mockDoneKey(mock.id)];

  return (
    <div ref={rootRef} data-mock-root data-mock-screen={run.screen} className="scroll-mt-24">
      <MermaidHydrator rootSelector="[data-mock-root]" />
      {run.screen === "lobby" && <Lobby mock={mock} run={run} best={completed ? best : null} offer={hydrated && !!done[mockOfferKey(mock.id)]} onStart={start} onResume={resume} lecture={lecture} />}
      {run.screen === "room" && (
        <Room
          mock={mock}
          run={run}
          running={clockOn}
          away={away}
          skipWarn={skipWarn}
          onToggle={togglePause}
          onDone={done_}
          onGo={goPhase}
          onHint={hint}
          onEnd={endCall}
          onLobby={toLobby}
          onRestart={() => {
            track("play", { game: mock.id, result: "restarted", level: run.level });
            start(run.level);
          }}
          setNote={setNote}
          setAnswer={setAnswer}
          setBoard={setBoard}
          setSketch={setSketch}
        />
      )}
      {run.screen === "debrief" && score && facts && (
        <Debrief
          mock={mock}
          run={run}
          score={score}
          facts={facts}
          totalWords={totalWords}
          minWords={MIN_WORDS}
          alreadyDone={completed}
          setScore={setScore}
          setRevealed={setRevealed}
          onClaim={claim}
          onRetry={retry}
          onBackToRoom={run.claimed || Object.values(run.revealed).some(Boolean) ? undefined : () => setRun({ ...run, screen: "room" })}
        />
      )}
    </div>
  );
}
