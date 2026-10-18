/**
 * The reader's on-demand chunks, imported from ONE place. The lesson components load them through
 * these functions and offline saving calls the same functions to fetch them ahead of time: one
 * import() per module means one chunk file, so what saving caches is exactly what the page asks
 * for later with no network (two import() calls of the same module can end up in two chunks).
 */
import { registerDiagramIcons } from "@/lib/diagrams/mermaid-icons";

export const loadCourseEnhancer = () => import("@/components/learn/content/CourseEnhancer");
export const loadBossMode = () => import("@/components/learn/boss/BossMode");
/** The diagram icon packs (tech:/sd:), one chunk; Mermaid asks for it only when a diagram uses an icon. */
export const loadDiagramIcons = () => import("@/lib/diagrams/icons");
export const loadMermaid = () => import("mermaid").then((m) => registerDiagramIcons(m.default, loadDiagramIcons));
/** The animated-explainer player (src/components/learn/anim/player.tsx). */
export const loadAnimPlayer = () => import("@/components/learn/anim/player");
/**
 * One explainer by name: src/components/learn/anim/explainers/<name>.tsx. A single template import,
 * so webpack gives every explainer file its own chunk and a new file needs no line here.
 */
export const loadExplainer = (name: string) => {
  if (!/^[a-z0-9-]+$/.test(name)) return Promise.reject(new Error(`bad explainer name "${name}"`));
  return import(`../../components/learn/anim/explainers/${name}.tsx`) as Promise<{ default: import("@/components/learn/anim/kit").ExplainerDef }>;
};
/** The code-lab editor (CodeMirror 6 + Python), loaded by the lab page and warmed when a lab is saved. */
export const loadCodeEditor = () => import("@/components/learn/labs/CodeEditor");
