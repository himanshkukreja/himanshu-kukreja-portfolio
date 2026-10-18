/**
 * Step-through player for rendered Mermaid diagrams (annotation format: src/lib/diagrams/steps.ts).
 *
 * <MermaidHydrator/> routes the `steps*` toolbar actions here and calls refreshSteps() after every
 * (re-)render, so a theme switch keeps the current step. Playing only adds classes and a data
 * attribute to the SVG Mermaid drew (CSS in mermaid-steps.css does the glow / dim); stopping
 * removes them, so a diagram that isn't playing renders exactly as before.
 *
 * Flowcharts: Mermaid 11 gives every edge path data-id="L_<from>_<to>_<n>", its label
 * .label[data-id] and every node g.node id="<svg id>-flowchart-<id>-<n>".
 * Sequence diagrams: every message line/path carries data-et="message" data-from/data-to, with its
 * text(s) right before it and the autonumber marker right after it.
 */
import "./mermaid-steps.css";
import { parseSteps, type StepTarget } from "@/lib/diagrams/steps";

type Resolved = { on: Element[]; caption: string };
type State = {
  steps: Resolved[];
  all: Element[];
  i: number;
  playing: boolean;
  timer: number;
  onKey: (e: KeyboardEvent) => void;
};

const states = new WeakMap<HTMLElement, State>();

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function esc(s: string) {
  return s.replace(/[\\"]/g, "\\$&");
}

/* ------------------------------------------------------------------ resolve steps against the SVG */

function flowchartParts(svg: SVGSVGElement) {
  const sid = svg.id;
  const edges = Array.from(svg.querySelectorAll<SVGElement>("path[data-et='edge'], path.flowchart-link"));
  const labels = Array.from(svg.querySelectorAll<SVGElement>(".edgeLabel"));
  const nodes = Array.from(svg.querySelectorAll<SVGElement>("g.node"));
  const nodeId = (g: Element) => {
    const m = g.id.startsWith(`${sid}-`) ? g.id.slice(sid.length + 1).match(/^flowchart-(.+)-\d+$/) : null;
    return m ? m[1] : g.getAttribute("data-id") || "";
  };
  const edgeFor = (from: string, to: string) =>
    edges.filter((p) => {
      const id = p.getAttribute("data-id") || p.id.replace(`${sid}-`, "");
      return id.startsWith(`L_${from}_${to}_`) && /^\d+$/.test(id.slice(`L_${from}_${to}_`.length));
    });
  const labelFor = (edge: Element) => {
    const id = edge.getAttribute("data-id") || edge.id.replace(`${sid}-`, "");
    return labels.filter((l) => l.querySelector(`[data-id="${esc(id)}"]`));
  };
  const nodeFor = (id: string) => nodes.filter((g) => nodeId(g) === id);
  const clusterFor = (id: string) => Array.from(svg.querySelectorAll<SVGElement>(`g.cluster[id="${esc(`${sid}-${id}`)}"]`));
  return { all: [...edges, ...labels, ...nodes], edgeFor, labelFor, nodeFor, clusterFor };
}

function resolveFlow(svg: SVGSVGElement, steps: { targets: StepTarget[]; caption: string }[]) {
  const f = flowchartParts(svg);
  const out: Resolved[] = steps.map((s) => {
    const on: Element[] = [];
    for (const t of s.targets) {
      if (t.kind === "edge") {
        const es = f.edgeFor(t.from, t.to);
        es.forEach((e) => on.push(e, ...f.labelFor(e)));
        on.push(...f.nodeFor(t.from), ...f.nodeFor(t.to));
      } else if (t.kind === "node") {
        const n = f.nodeFor(t.id);
        on.push(...(n.length ? n : f.clusterFor(t.id)));
      }
    }
    return { on, caption: s.caption };
  });
  return { steps: out, all: f.all };
}

function sequenceParts(svg: SVGSVGElement) {
  const msgs = Array.from(svg.querySelectorAll<SVGElement>("[data-et='message']"));
  const name = (id: string) => svg.querySelector(`g[data-et='participant'][data-id="${esc(id)}"] text`)?.textContent?.trim() || id;
  const parts = msgs.map((m) => {
    const els: Element[] = [m];
    const texts: string[] = [];
    let p = m.previousElementSibling;
    while (p && p.matches("text.messageText")) {
      els.push(p);
      texts.unshift(p.textContent || "");
      p = p.previousElementSibling;
    }
    let n = m.nextElementSibling;
    for (let k = 0; n && k < 2 && !n.hasAttribute("data-et") && (n.matches("text.sequenceNumber") || (n.tagName === "line" && n.hasAttribute("marker-start"))); k++) {
      els.push(n);
      n = n.nextElementSibling;
    }
    const from = m.getAttribute("data-from") || "";
    const to = m.getAttribute("data-to") || "";
    const actors = [from, to].flatMap((a) => [
      ...Array.from(svg.querySelectorAll(`g[data-et='participant'][data-id="${esc(a)}"], line[data-et='life-line'][data-id="${esc(a)}"]`)),
      ...Array.from(svg.querySelectorAll(`rect.actor-bottom[name="${esc(a)}"]`)).map((r) => r.parentElement || r),
    ]);
    const y = (m as unknown as SVGGraphicsElement).getBBox?.().y ?? 0;
    return { els, actors, y, caption: `${name(from)} → ${from === to ? "itself" : name(to)}: ${texts.join(" ").trim()}` };
  });
  const notes = Array.from(svg.querySelectorAll<SVGGElement>("g[data-et='note']")).map((g) => ({ g, y: g.getBBox?.().y ?? 0 }));
  const actors = Array.from(svg.querySelectorAll("g[data-et='participant'], line[data-et='life-line'], rect.actor-bottom")).map((e) => (e.tagName === "rect" ? e.parentElement || e : e));
  const activations = Array.from(svg.querySelectorAll("rect[class^='activation']"));
  return { parts, notes, all: [...parts.flatMap((p) => p.els), ...notes.map((n) => n.g), ...actors, ...activations] };
}

function resolveSeq(svg: SVGSVGElement, steps: { targets: StepTarget[]; caption: string }[] | null) {
  const s = sequenceParts(svg);
  const groups: { idx: number[]; caption: string }[] = steps
    ? steps.map((st) => ({
        idx: st.targets.flatMap((t) => (t.kind === "msg" ? Array.from({ length: t.to - t.from + 1 }, (_, k) => t.from - 1 + k) : [])).filter((k) => k < s.parts.length),
        caption: st.caption,
      }))
    : s.parts.map((p, k) => ({ idx: [k], caption: p.caption }));
  const out: Resolved[] = groups.map((g, gi) => {
    const on: Element[] = [];
    g.idx.forEach((k) => on.push(...s.parts[k].els, ...s.parts[k].actors));
    // notes drawn between the previous step's messages and this step's light up with it
    const top = Math.min(...g.idx.map((k) => s.parts[k].y));
    const prevIdx = gi > 0 ? groups[gi - 1].idx : [];
    const prevY = prevIdx.length ? Math.max(...prevIdx.map((k) => s.parts[k].y)) : -Infinity;
    s.notes.forEach((n) => {
      if (n.y > prevY && n.y < top) on.push(n.g);
    });
    return { on, caption: g.caption };
  });
  return { steps: out.filter((r) => r.on.length), all: s.all };
}

function resolve(fig: HTMLElement): { steps: Resolved[]; all: Element[] } | null {
  const svg = fig.querySelector<SVGSVGElement>(".sd-mermaid-canvas svg");
  const src = fig.querySelector(".sd-mermaid-src")?.textContent || "";
  if (!svg) return null;
  const spec = parseSteps(src);
  if (!spec || spec.mode === "off") return null;
  const kind = fig.dataset.kind || "";
  if (kind === "sequenceDiagram") return resolveSeq(svg, spec.mode === "manual" ? spec.steps : null);
  if (spec.mode === "manual") return resolveFlow(svg, spec.steps);
  return null;
}

/* ------------------------------------------------------------------ the bar */

const BTN = "sd-mermaid-btn sd-st-btn";

function buildBar(fig: HTMLElement, total: number) {
  const host = fig.querySelector<HTMLElement>("[data-steps-bar]");
  if (!host) return null;
  let bar = host.querySelector<HTMLElement>(".sd-st-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "sd-st-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Diagram steps");
    bar.innerHTML =
      `<div class="sd-st-controls">` +
      `<button type="button" class="${BTN}" data-mermaid-action="steps-prev" aria-label="Previous step">◀</button>` +
      `<button type="button" class="${BTN} sd-st-play" data-mermaid-action="steps-play" aria-label="Pause">❚❚</button>` +
      `<button type="button" class="${BTN}" data-mermaid-action="steps-next" aria-label="Next step">▶</button>` +
      `<button type="button" class="${BTN}" data-mermaid-action="steps-restart" aria-label="Restart">↺</button>` +
      `<span class="sd-st-count" aria-hidden="true"></span>` +
      `<span class="sd-st-dots" aria-hidden="true"></span>` +
      `<button type="button" class="${BTN} sd-st-done" data-mermaid-action="steps-done">Done</button>` +
      `</div>` +
      `<p class="sd-st-caption" aria-live="polite"></p>`;
    host.appendChild(bar);
  }
  const dots = bar.querySelector<HTMLElement>(".sd-st-dots");
  if (dots && dots.childElementCount !== total) {
    dots.innerHTML = "";
    for (let k = 0; k < total; k++) {
      const d = document.createElement("button");
      d.type = "button";
      d.className = "sd-st-dot";
      d.tabIndex = -1;
      d.dataset.mermaidAction = "steps-go";
      d.dataset.step = String(k);
      d.setAttribute("aria-label", `Step ${k + 1}`);
      dots.appendChild(d);
    }
  }
  return bar;
}

function stepMs(caption: string) {
  return Math.min(5200, Math.max(2200, 1500 + caption.length * 38));
}

function paint(fig: HTMLElement, st: State) {
  const svg = fig.querySelector<SVGSVGElement>(".sd-mermaid-canvas svg");
  if (!svg) return;
  svg.setAttribute("data-sd-steps", "on");
  const on = new Set(st.steps[st.i]?.on || []);
  const past = new Set(st.steps.slice(0, st.i).flatMap((s) => s.on));
  for (const el of st.all) {
    el.classList.toggle("sd-st-on", on.has(el));
    el.classList.toggle("sd-st-past", !on.has(el) && past.has(el));
    el.classList.toggle("sd-st-dim", !on.has(el) && !past.has(el));
  }
  // targets outside the dimmable set (subgraphs)
  on.forEach((el) => el.classList.add("sd-st-on"));
  const bar = buildBar(fig, st.steps.length);
  if (!bar) return;
  const total = st.steps.length;
  const cap = bar.querySelector(".sd-st-caption");
  if (cap) cap.textContent = st.steps[st.i]?.caption || "";
  const count = bar.querySelector(".sd-st-count");
  if (count) count.textContent = `${String(st.i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  bar.querySelectorAll<HTMLElement>(".sd-st-dot").forEach((d, k) => {
    d.toggleAttribute("data-on", k === st.i);
    d.toggleAttribute("data-past", k < st.i);
  });
  const play = bar.querySelector<HTMLButtonElement>(".sd-st-play");
  if (play) {
    const end = st.i >= total - 1;
    play.hidden = reducedMotion();
    play.textContent = st.playing ? "❚❚" : end ? "↻ Replay" : "▶ Play";
    play.setAttribute("aria-label", st.playing ? "Pause" : end ? "Replay from the start" : "Play");
  }
  const prev = bar.querySelector<HTMLButtonElement>('[data-mermaid-action="steps-prev"]');
  const next = bar.querySelector<HTMLButtonElement>('[data-mermaid-action="steps-next"]');
  if (prev) prev.disabled = st.i <= 0;
  if (next) next.disabled = st.i >= total - 1;
}

function clearTimer(st: State) {
  if (st.timer) window.clearTimeout(st.timer);
  st.timer = 0;
}

function schedule(fig: HTMLElement, st: State) {
  clearTimer(st);
  if (!st.playing) return;
  st.timer = window.setTimeout(() => {
    if (!fig.isConnected || states.get(fig) !== st) return;
    if (st.i >= st.steps.length - 1) {
      st.playing = false;
      paint(fig, st);
      return;
    }
    st.i++;
    paint(fig, st);
    schedule(fig, st);
  }, stepMs(st.steps[st.i]?.caption || ""));
}

function go(fig: HTMLElement, st: State, i: number, keepPlaying = false) {
  st.i = Math.max(0, Math.min(st.steps.length - 1, i));
  if (!keepPlaying) st.playing = false;
  paint(fig, st);
  schedule(fig, st);
}

function stop(fig: HTMLElement) {
  const st = states.get(fig);
  if (st) {
    clearTimer(st);
    fig.removeEventListener("keydown", st.onKey);
    states.delete(fig);
  }
  const svg = fig.querySelector<SVGSVGElement>(".sd-mermaid-canvas svg");
  svg?.removeAttribute("data-sd-steps");
  svg?.querySelectorAll(".sd-st-on, .sd-st-past, .sd-st-dim").forEach((el) => el.classList.remove("sd-st-on", "sd-st-past", "sd-st-dim"));
  fig.removeAttribute("data-steps-on");
  fig.querySelector(".sd-st-bar")?.remove();
  const btn = fig.querySelector<HTMLElement>('[data-mermaid-action="steps"]');
  if (btn) {
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = "▶ Steps";
  }
}

function start(fig: HTMLElement) {
  const r = resolve(fig);
  if (!r || !r.steps.length) return;
  const onKey = (e: KeyboardEvent) => {
    const st = states.get(fig);
    if (!st || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    let handled = true;
    if (e.key === "ArrowRight") go(fig, st, st.i + 1);
    else if (e.key === "ArrowLeft") go(fig, st, st.i - 1);
    else if (e.key === "Home") go(fig, st, 0);
    else if (e.key === "End") go(fig, st, st.steps.length - 1);
    else if ((e.key === " " || e.key === "k") && !reducedMotion() && !(t && t.tagName === "BUTTON" && e.key === " ")) togglePlay(fig, st);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const st: State = { ...r, i: 0, playing: !reducedMotion(), timer: 0, onKey };
  states.set(fig, st);
  fig.setAttribute("data-steps-on", "");
  fig.addEventListener("keydown", onKey);
  const btn = fig.querySelector<HTMLElement>('[data-mermaid-action="steps"]');
  if (btn) {
    btn.setAttribute("aria-pressed", "true");
    btn.textContent = "■ Steps";
  }
  paint(fig, st);
  schedule(fig, st);
  fig.querySelector<HTMLElement>(reducedMotion() ? '[data-mermaid-action="steps-next"]' : ".sd-st-play")?.focus({ preventScroll: true });
}

function togglePlay(fig: HTMLElement, st: State) {
  if (st.playing) {
    st.playing = false;
    clearTimer(st);
    paint(fig, st);
    return;
  }
  if (st.i >= st.steps.length - 1) st.i = 0;
  st.playing = true;
  paint(fig, st);
  schedule(fig, st);
}

/** Toolbar / bar actions routed from MermaidHydrator ("steps", "steps-next", …). */
export function stepsAction(fig: HTMLElement, action: string, btn?: HTMLElement) {
  if (action === "steps") {
    if (states.has(fig)) stop(fig);
    else start(fig);
    return;
  }
  const st = states.get(fig);
  if (!st) return;
  if (action === "steps-done") {
    stop(fig);
    fig.querySelector<HTMLElement>('[data-mermaid-action="steps"]')?.focus({ preventScroll: true });
  } else if (action === "steps-next") go(fig, st, st.i + 1);
  else if (action === "steps-prev") go(fig, st, st.i - 1);
  else if (action === "steps-restart") go(fig, st, 0, st.playing);
  else if (action === "steps-play") togglePlay(fig, st);
  else if (action === "steps-go" && btn?.dataset.step) go(fig, st, Number(btn.dataset.step));
}

/** After Mermaid (re-)drew the SVG (theme switch): re-resolve and keep the current step. */
export function refreshSteps(fig: HTMLElement) {
  const st = states.get(fig);
  if (!st) return;
  const r = resolve(fig);
  if (!r || !r.steps.length) {
    stop(fig);
    return;
  }
  st.steps = r.steps;
  st.all = r.all;
  st.i = Math.min(st.i, r.steps.length - 1);
  paint(fig, st);
}
