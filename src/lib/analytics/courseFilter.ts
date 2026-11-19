/**
 * "Course" filter for the admin analytics views (Journeys → Recordings, Live). No imports, so it runs on the server,
 * in the browser and under node --test.
 *
 * A session is classed from its pageviews:
 *   dsa      first pageview is on /dsa (it may wander off later)
 *   sdm-dsa  first pageview was NOT on /dsa, a later one was (crossover: started in SDM, moved to DSA)
 *   sdm      never touched /dsa
 * The "DSA" filter shows every session that touched /dsa (dsa + sdm-dsa); "SDM → DSA" shows the crossovers alone.
 */

export type Course = "all" | "dsa" | "sdm" | "sdm-dsa";
export type SessionCourse = "sdm" | "dsa" | "sdm-dsa";

export const COURSE_OPTIONS: { id: Course; label: string; hint: string }[] = [
  { id: "all", label: "All", hint: "Every session" },
  { id: "dsa", label: "DSA", hint: "Any session that visited a /dsa page, including ones that began in SDM" },
  { id: "sdm", label: "SDM only", hint: "Sessions that never touched /dsa" },
  { id: "sdm-dsa", label: "SDM → DSA", hint: "Sessions that started on an SDM page and later visited /dsa" },
];

export const SESSION_COURSE_LABEL: Record<SessionCourse, string> = { sdm: "SDM", dsa: "DSA", "sdm-dsa": "SDM→DSA" };

export const parseCourse = (v: string | null | undefined): Course => (v === "dsa" || v === "sdm" || v === "sdm-dsa" ? v : "all");

/** /dsa or /dsa/…, never /dsaxyz */
export const isDsaPath = (path: string | null | undefined): boolean => /^\/dsa(?:[/?#]|$)/.test(path || "");

/** staging / preview hosts: test traffic */
export const isStagingHost = (host: string | null | undefined): boolean => /staging/i.test(host || "");

/** From a session's pageview paths in time order. A session with no pageviews counts as SDM. */
export function classifyPaths(paths: (string | null | undefined)[]): SessionCourse {
  const pv = paths.filter((p): p is string => typeof p === "string" && p !== "");
  if (!pv.some(isDsaPath)) return "sdm";
  return isDsaPath(pv[0]) ? "dsa" : "sdm-dsa";
}

/** From the aggregates HogQL returns: the entry (first pageview) path and how many pageviews were on /dsa. */
export function classifySummary(entryPath: string | null | undefined, dsaPageviews: number): SessionCourse {
  if (!(dsaPageviews > 0)) return "sdm";
  return isDsaPath(entryPath) ? "dsa" : "sdm-dsa";
}

export function matchesCourse(filter: Course, c: SessionCourse): boolean {
  switch (filter) {
    case "dsa":
      return c === "dsa" || c === "sdm-dsa";
    case "sdm":
      return c === "sdm";
    case "sdm-dsa":
      return c === "sdm-dsa";
    default:
      return true;
  }
}

/* HogQL fragments (property names as used in `events`) */
export const DSA_PATH_SQL = "match(coalesce(properties.$pathname, ''), '^/dsa(/|[?#]|$)')";
export const STAGING_HOST_SQL = "coalesce(properties.$host, '') LIKE '%staging%'";
