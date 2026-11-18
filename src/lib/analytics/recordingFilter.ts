/**
 * Which session recordings the admin dashboard shows. PostHog's player skips idle time, so a "5-minute"
 * recording of a visitor who was reading or left a tab open plays for a few seconds. Only recordings with real
 * activity are listed or linked; the rest stay as session rows (events + timeline) without a replay button.
 */

/** a recording is substantial at this many seconds of activity (PostHog active_seconds) or more */
export const MIN_ACTIVE_SECONDS = 5;

export function isSubstantialRecording(activeSeconds: number | null | undefined): boolean {
  return Number.isFinite(activeSeconds) && (activeSeconds as number) >= MIN_ACTIVE_SECONDS;
}

/** PostHog list-API predicate that keeps only substantial recordings (server-side, so pages aren't left empty) */
export function substantialHavingPredicates(): string {
  return JSON.stringify([{ key: "active_seconds", type: "recording", operator: "gte", value: MIN_ACTIVE_SECONDS }]);
}

/** keep substantial recordings unless idle ones were asked for */
export function filterRecordings<T extends { active: number }>(list: T[], includeIdle: boolean): T[] {
  return includeIdle ? list : list.filter((r) => isSubstantialRecording(r.active));
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${sec}s`;
}

/** "Active 2m 10s · 18m total" */
export function activeLabel(active: number, total: number): string {
  return `Active ${fmtDuration(active)} · ${fmtDuration(total)} total`;
}

export const IDLE_NOTE = "The player skips idle time, so it plays for about the active time, not the total.";
