/**
 * The reader's on-demand chunks, imported from ONE place. The lesson components load them through
 * these functions and offline saving calls the same functions to fetch them ahead of time: one
 * import() per module means one chunk file, so what saving caches is exactly what the page asks
 * for later with no network (two import() calls of the same module can end up in two chunks).
 */
export const loadCourseEnhancer = () => import("@/components/learn/content/CourseEnhancer");
export const loadBossMode = () => import("@/components/learn/boss/BossMode");
export const loadMermaid = () => import("mermaid").then((m) => m.default);
