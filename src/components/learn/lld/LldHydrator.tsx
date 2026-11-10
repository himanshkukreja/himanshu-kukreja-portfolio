"use client";

/**
 * Fills the case-study article's mount points (`<div data-lld-mount="…">`, written by
 * src/lib/learn/lld/load.ts fillMounts) with React: the entity list (step 2), the class explorer and
 * its "try it first" gate (step 3), the gate, language switch and lab card (step 5). The lesson HTML
 * can be re-injected at any time (highlights), so the mounts are re-found on every DOM change and
 * portals follow them; the article's own text is never touched.
 */
import "./lld.css";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { LLD_LANGS, type LldLang } from "@/lib/learn/lld/steps";
import { entityKind } from "@/lib/learn/lld/classes";
import type { LldMeta } from "@/lib/learn/lld/types";
import { useLldPrefs, type Reveal } from "./LldPrefs";

type Mount = { id: string; el: HTMLElement };

export default function LldHydrator({ lld, contentRef }: { lld: LldMeta; contentRef: RefObject<HTMLDivElement | null> }) {
  const [mounts, setMounts] = useState<Mount[]>([]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const scan = () => {
      const found = Array.from(root.querySelectorAll<HTMLElement>("[data-lld-mount]")).map((el) => ({ id: el.dataset.lldMount || "", el }));
      setMounts((prev) => (prev.length === found.length && prev.every((m, i) => m.el === found[i].el) ? prev : found));
    };
    scan();
    let raf = 0;
    const mo = new MutationObserver((records) => {
      if (!records.some((r) => r.addedNodes.length || r.removedNodes.length)) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });
    mo.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [contentRef]);

  // the class explorer's selection is shared with the entity list (a click on a noun opens its code)
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      {mounts.map((m, i) => {
        const node = piece(m.id, lld, selected, setSelected);
        return node ? createPortal(node, m.el, `${m.id}-${i}`) : null;
      })}
    </>
  );
}

function piece(id: string, lld: LldMeta, selected: string | null, select: (n: string) => void) {
  switch (id) {
    case "entities":
      return <Entities lld={lld} select={select} />;
    case "explorer":
      return <Explorer lld={lld} selected={selected} select={select} />;
    case "gate-diagram":
      return <Gate what="diagram" />;
    case "gate-code":
      return <Gate what="code" />;
    case "tabs":
      return <LangSwitch lld={lld} />;
    case "lab":
      return <LabCard lld={lld} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ try it first */

const GATE: Record<Reveal, { ask: string; show: string; hide: string }> = {
  diagram: {
    ask: "Try it first is on. Sketch the entities and a class diagram yourself, then reveal the lesson&apos;s.",
    show: "Reveal the class diagram",
    hide: "Hide the class diagram again",
  },
  code: {
    ask: "Try it first is on. Write the code yourself, or at least the interfaces, then reveal the lesson&apos;s.",
    show: "Reveal the code",
    hide: "Hide the code again",
  },
};

function Gate({ what }: { what: Reveal }) {
  const { tryFirst, revealed, toggleReveal } = useLldPrefs();
  if (!tryFirst) return null;
  const shown = revealed[what];
  return (
    <div className="lld-gate" role="group" aria-label={what === "diagram" ? "Class diagram gate" : "Code gate"}>
      <p>{shown ? (what === "diagram" ? "The class diagram is showing." : "The code is showing.") : GATE[what].ask}</p>
      <button type="button" className="lld-btn" data-quiet={shown ? "" : undefined} aria-expanded={shown} onClick={() => toggleReveal(what)}>
        {shown ? GATE[what].hide : GATE[what].show}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ step 2: entities */

function Entities({ lld, select }: { lld: LldMeta; select: (n: string) => void }) {
  const groups = useMemo(() => {
    const g = { class: [] as string[], interface: [] as string[], enum: [] as string[] };
    for (const c of lld.classes) g[entityKind({ ...c, stereotype: c.stereotype })].push(c.name);
    return g;
  }, [lld.classes]);
  if (!lld.classes.length) return null;
  const scrollToExplorer = (name: string) => {
    select(name);
    document.getElementById("lld-explorer")?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const col = (title: string, hint: string, names: string[]) =>
    names.length > 0 && (
      <div>
        <p className="lld-label">{title}</p>
        <ul className="lld-chips">
          {names.map((n) => (
            <li key={n}>
              <button type="button" className="lld-chip" onClick={() => scrollToExplorer(n)} aria-label={`${n}: open in the class diagram step`}>
                {n}
              </button>
            </li>
          ))}
        </ul>
        <p className="lld-note">{hint}</p>
      </div>
    );
  return (
    <div className="lld-box" data-sd-chrome>
      <p className="lld-label">The nouns this design names</p>
      <div className="lld-groups">
        {col("Things with state", "Nouns from the problem: each became a class.", groups.class)}
        {col("Behaviour that varies", "Verbs that will change: each became an interface.", groups.interface)}
        {col("Fixed sets of values", "Enums: the vocabulary the rest of the code shares.", groups.enum)}
      </div>
      <p className="lld-note">Pick one to see its members and code in the next step.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ step 3: class explorer */

function Explorer({ lld, selected, select }: { lld: LldMeta; selected: string | null; select: (n: string) => void }) {
  const detailId = useId();
  const current = lld.classes.find((c) => c.name === selected) ?? lld.classes[0];
  const detailRef = useRef<HTMLDivElement>(null);
  const known = useCallback((n: string) => lld.classes.some((c) => c.name === n), [lld.classes]);
  if (!current) return null;
  return (
    <div className="lld-box" id="lld-explorer" data-sd-chrome style={{ scrollMarginTop: "calc(var(--reader-scroll-margin, 96px))" }}>
      <p className="lld-label">Click a class to see its code</p>
      <div className="lld-explorer">
        <ul className="lld-list" aria-label="Classes in this design">
          {lld.classes.map((c) => (
            <li key={c.name}>
              <button type="button" className="lld-chip" aria-pressed={c.name === current.name} aria-controls={detailId} onClick={() => select(c.name)}>
                {c.name}
                {c.stereotype && <small>{c.stereotype}</small>}
              </button>
            </li>
          ))}
        </ul>
        <div className="lld-detail" id={detailId} ref={detailRef} role="region" aria-live="polite" aria-label={`Details for ${current.name}`}>
          <h4>
            {current.name}
            {current.stereotype && <small className="lld-note" style={{ marginLeft: 8 }}>{`<<${current.stereotype}>>`}</small>}
          </h4>
          {current.members.length > 0 && (
            <ul className="lld-members" aria-label="Members">
              {current.members.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          {current.links.length > 0 && (
            <ul className="lld-links" aria-label="Connections">
              {current.links.map((l) => (
                <li key={`${l.how}-${l.to}`}>
                  {l.how}{" "}
                  {known(l.to) ? (
                    <button type="button" onClick={() => select(l.to)}>
                      {l.to}
                    </button>
                  ) : (
                    l.to
                  )}
                </li>
              ))}
            </ul>
          )}
          {current.codeHtml ? (
            <figure className="sd-code" data-sd-chrome>
              <div className="sd-code-head">
                <span className="sd-code-lang">python</span>
                <span className="sd-code-meta">{current.name}</span>
              </div>
              <pre className="sd-code-pre shiki" tabIndex={0} dangerouslySetInnerHTML={{ __html: current.codeHtml }} />
            </figure>
          ) : (
            <p className="lld-note">This class is only in the diagram: the lesson&apos;s code does not define it as a class of its own. The code step has the rest.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ step 5: language switch + lab */

function LangSwitch({ lld }: { lld: LldMeta }) {
  const { lang, setLang, tryFirst, revealed } = useLldPrefs();
  if (tryFirst && !revealed.code) return null;
  const has = (l: LldLang) => lld.langs.includes(l);
  const missing = LLD_LANGS.filter((l) => !has(l.id)).map((l) => l.label);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const ids = LLD_LANGS.map((l) => l.id).filter(has);
    const i = ids.indexOf(lang);
    const next = ids[(i + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
    if (next && next !== lang) {
      e.preventDefault();
      setLang(next);
      const btn = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`button[data-lang="${next}"]`);
      btn?.focus();
    }
  };
  return (
    <div className="lld-box" data-sd-chrome>
      <p className="lld-label" id="lld-lang-label">
        Code language
      </p>
      <div className="lld-seg" role="group" aria-labelledby="lld-lang-label" onKeyDown={onKey}>
        {LLD_LANGS.map((l) => (
          <button key={l.id} type="button" data-lang={l.id} aria-pressed={has(l.id) && lang === l.id} disabled={!has(l.id)} onClick={() => setLang(l.id)}>
            {l.label}
            {!has(l.id) && <small>soon</small>}
          </button>
        ))}
      </div>
      {missing.length > 0 && <p className="lld-note">{missing.join(", ")} {missing.length === 1 ? "version is" : "versions are"} not written for this problem yet. The lesson&apos;s code is {has("python") ? "Python" : "below"}.</p>}
    </div>
  );
}

function LabCard({ lld }: { lld: LldMeta }) {
  const { tryFirst, revealed } = useLldPrefs();
  if (!lld.labs.length || (tryFirst && !revealed.code)) return null;
  return (
    <div className="lld-box" data-sd-chrome>
      <p className="lld-label">Run it</p>
      <ul className="lld-chips" style={{ display: "grid", gap: 8 }}>
        {lld.labs.map((l) => (
          <li key={l.id} className="lld-lab">
            <span>
              <Link href={l.href}>{l.title}</Link>
              <span className="lld-note"> · {l.minutes} min · {l.languages.join(", ")}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="lld-note">A code lab on the same idea: write it in the browser and run the tests.</p>
    </div>
  );
}
