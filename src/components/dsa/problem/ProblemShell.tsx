"use client";

/**
 * The problem page's layout (Nov 2026 redesign): the header bar, then two panes. Left: Problem | Hints | Editorial |
 * Solutions | Video, with the tutor and the interview as drawers over it. Right: the editor, its results panel and the
 * Run / Submit / Ask the tutor footer. Phones show one pane at a time (Problem | Code). All state is in useProblemRoom.
 */
import { fnNameFor } from "@/lib/dsa/harness";
import FirstProblemGuide from "./FirstProblemGuide";
import Drawer from "./Drawer";
import EditorPane from "./EditorPane";
import ProblemHeader from "./ProblemHeader";
import ProblemInterview from "./ProblemInterview";
import ProblemTabs from "./ProblemTabs";
import ProblemTutor from "./ProblemTutor";
import type { ProblemPosition, Room } from "./useProblemRoom";

export default function ProblemShell({ room, position }: { room: Room; position: ProblemPosition | null }) {
  const { p, lang, pane, setPane, drawer, setDrawer, editor, initialFor, outcome, hints, openHint, solved, unlocked, tutorReq, setTutorReq } = room;
  const code = () => editor.current?.getValue() ?? initialFor(lang);
  const closeDrawer = () => setDrawer(null);
  const paneTabs = [
    { id: "problem" as const, label: "Problem" },
    { id: "code" as const, label: "Code" },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ProblemHeader room={room} position={position} />
      <div role="tablist" aria-label="Problem or code" className="flex border-b border-line bg-surface px-4 lg:hidden">
        {paneTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={pane === t.id}
            onClick={() => setPane(t.id)}
            className={`inline-flex min-h-11 flex-1 items-center justify-center border-b-2 text-[14px] ${pane === t.id ? "border-signal font-semibold text-fg" : "border-transparent font-medium text-fg-3"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-3 p-3 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:grid-rows-[minmax(0,1fr)] lg:pb-3 xl:grid-cols-[minmax(0,600px)_minmax(0,1fr)]">
        <section aria-label="Problem" className={`relative min-h-[60vh] min-w-0 flex-col border border-line bg-surface lg:min-h-0 ${pane === "problem" ? "flex" : "hidden lg:flex"}`}>
          <ProblemTabs room={room} />
          <Drawer open={drawer === "tutor"} label="Problem tutor" onClose={closeDrawer}>
            <ProblemTutor
              embedded
              p={p}
              lang={lang}
              code={code}
              last={outcome}
              hintsOpen={hints}
              onHint={(n) => openHint(n, "tutor")}
              solved={solved}
              request={tutorReq}
              onRequestHandled={() => setTutorReq(null)}
            />
          </Drawer>
          <Drawer open={drawer === "interview"} label="Interview" onClose={closeDrawer}>
            <ProblemInterview embedded p={p} lang={lang} code={code} accepted={solved || outcome?.o.verdict === "AC"} unlocked={unlocked} justSolved={outcome?.o.verdict === "AC" && outcome.mode === "submit"} />
          </Drawer>
        </section>
        <div className={`min-w-0 lg:h-full lg:min-h-0 ${pane === "code" ? "block" : "hidden lg:block"}`}>
          <EditorPane room={room} />
        </div>
      </div>
      <FirstProblemGuide
        fn={fnNameFor(lang, p.signature.fn)}
        toolbar={() => document.querySelector<HTMLElement>('[data-guide="toolbar"]')}
        examples={() => room.statementRef.current?.querySelector<HTMLElement>('[aria-labelledby="ps-examples"]') || room.tabsRef.current}
        run={() => room.runRow.current}
        avoid={() => room.editorBox.current}
        onStep={(i) => setPane(i === 1 ? "problem" : "code")}
      />
    </div>
  );
}
