// Tiny cross-section links on the home page: a receipt in the skill tree can open a world on the career map,
// and a skill on the map can select its node in the tree. Plain DOM events, no shared provider needed.
import type { EraId, SkillId } from "./data";

export const WORLD_EVT = "hk:world";
export const SKILL_EVT = "hk:skill";

function scrollToFirstVisible(ids: string[]) {
  const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) {
      el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      return;
    }
  }
}

export function openWorld(id: EraId) {
  window.dispatchEvent(new CustomEvent<EraId>(WORLD_EVT, { detail: id }));
  // after the map re-renders with the world open
  window.requestAnimationFrame(() => scrollToFirstVisible(["world-panel"]));
}

export function openSkill(id: SkillId) {
  window.dispatchEvent(new CustomEvent<SkillId>(SKILL_EVT, { detail: id }));
  window.requestAnimationFrame(() => scrollToFirstVisible(["skill-panel-m", "skill-panel"]));
}
