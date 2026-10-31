/**
 * One first-visit popup at a time. Something that wants the learner's full attention (the welcome
 * video card, the video player) holds it; one-time nudges (NotebookCoach) wait while it's held.
 * Reflected on <html data-hk-hold="n"> so any component can check it without shared React state.
 */
export function holdAttention(): () => void {
  const el = document.documentElement;
  el.dataset.hkHold = String(Number(el.dataset.hkHold || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = Number(el.dataset.hkHold || 0) - 1;
    if (n > 0) el.dataset.hkHold = String(n);
    else delete el.dataset.hkHold;
  };
}

export const attentionHeld = () => typeof document !== "undefined" && !!document.documentElement.dataset.hkHold;
