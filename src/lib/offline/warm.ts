"use client";

import { loadAnimPlayer, loadBossMode, loadCourseEnhancer, loadDiagramIcons, loadExplainer, loadMermaid } from "./lazy";

/**
 * Fetches the reader's on-demand chunks before a page is saved, so they are in the browser's
 * resource list (and cached) even if the reader never opened a lesson with diagrams or a boss
 * fight online: the content chrome, boss mode, Mermaid, one renderer per diagram type the course
 * uses (each Mermaid diagram type lives in its own chunk) and the diagram icon packs (the icon
 * sample makes Mermaid call the pack loaders, i.e. fetch the icon chunk).
 */
const SAMPLES = [
  'flowchart LR\n  A["Client"] --> B{{"Gateway"}}\n  B --> C[("DB")]\n  subgraph S["Zone"]\n    C\n  end',
  'flowchart TD\n  U@{ icon: "sd:user", form: "square", label: "User" } --> K@{ icon: "tech:kafka", form: "square", label: "Kafka" }',
  "sequenceDiagram\n  autonumber\n  participant A as Client\n  participant B as API\n  A->>B: request\n  B-->>A: 200",
  "stateDiagram-v2\n  [*] --> Closed\n  Closed --> Open: failures\n  Open --> [*]",
];

let warming: Promise<void> | null = null;

async function warmMermaid() {
  const mermaid = await loadMermaid();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;visibility:hidden;pointer-events:none";
  document.body.appendChild(host);
  try {
    for (let i = 0; i < SAMPLES.length; i++) {
      try {
        await mermaid.render(`hk-offline-warm-${i}`, SAMPLES[i], host);
      } catch {
        // a sample that fails still loaded its renderer chunk
      }
    }
  } finally {
    host.remove();
  }
}

const warmedAnims = new Map<string, Promise<unknown>>();

/** The `::anim` explainers a rendered document embeds (figure data-anim="<name>"). */
export function animNames(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(/\bdata-anim="([a-z0-9-]+)"/g), (m) => m[1]))];
}

/** Animated explainers are one chunk each: fetch the player and only the ones being saved. */
function warmAnims(names: string[]): Promise<unknown> {
  if (!names.length) return Promise.resolve();
  const jobs: Promise<unknown>[] = [loadAnimPlayer()];
  for (const n of names) {
    if (!warmedAnims.has(n)) warmedAnims.set(n, loadExplainer(n).catch(() => warmedAnims.delete(n)));
    jobs.push(warmedAnims.get(n)!);
  }
  return Promise.allSettled(jobs);
}

/** `docs`: the HTML of the documents being saved (their `::anim` explainers get fetched too). */
export function warmReader(docs: string[] = []): Promise<void> {
  warming ??= Promise.allSettled([loadCourseEnhancer(), loadBossMode(), loadDiagramIcons(), warmMermaid()]).then(() => undefined);
  const anims = animNames(docs.join("\n"));
  return anims.length ? Promise.all([warming, warmAnims(anims)]).then(() => undefined) : warming;
}
