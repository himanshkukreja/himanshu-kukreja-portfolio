"use client";

import { loadBossMode, loadCourseEnhancer, loadMermaid } from "./lazy";

/**
 * Fetches the reader's on-demand chunks before a page is saved, so they are in the browser's
 * resource list (and cached) even if the reader never opened a lesson with diagrams or a boss
 * fight online: the content chrome, boss mode, Mermaid and one renderer per diagram type the
 * course uses (each Mermaid diagram type lives in its own chunk).
 */
const SAMPLES = [
  'flowchart LR\n  A["Client"] --> B{{"Gateway"}}\n  B --> C[("DB")]\n  subgraph S["Zone"]\n    C\n  end',
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

export function warmReader(): Promise<void> {
  warming ??= Promise.allSettled([loadCourseEnhancer(), loadBossMode(), warmMermaid()]).then(() => undefined);
  return warming;
}
