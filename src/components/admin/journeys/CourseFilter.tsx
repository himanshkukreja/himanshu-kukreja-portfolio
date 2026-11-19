"use client";

import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/admin/ui";
import { COURSE_OPTIONS, SESSION_COURSE_LABEL, parseCourse, type Course, type SessionCourse } from "@/lib/analytics/courseFilter";
import { cx, useSetParams } from "./bits";

/**
 * Course filter (All / DSA / SDM only / SDM → DSA) and "include staging" toggle for the admin session views.
 * Each lives in the URL (?course=dsa, ?staging=1: shareable links) and is remembered per device in localStorage
 * (every access guarded); the URL wins when it has the param. Staging traffic is left out unless asked for.
 */
const COURSE_KEY = "hk-admin-course";
const STAGING_KEY = "hk-admin-include-staging";
const EVT = "hk-admin-course-change";

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}
function write(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* not remembered */
  }
  window.dispatchEvent(new Event(EVT));
}

export function useCourseFilter() {
  const params = useSearchParams();
  const setParams = useSetParams();
  const storedCourse = useSyncExternalStore(subscribe, () => read(COURSE_KEY), () => "");
  const storedStaging = useSyncExternalStore(subscribe, () => read(STAGING_KEY), () => "");
  const urlCourse = params.get("course");
  const urlStaging = params.get("staging");
  const course: Course = parseCourse(urlCourse ?? storedCourse);
  const includeStaging = (urlStaging ?? storedStaging) === "1";
  return {
    course,
    includeStaging,
    /** query string pieces for the API */
    apiParams: { course, staging: includeStaging ? "1" : "" } as { course: Course; staging: string },
    setCourse: (c: Course) => {
      write(COURSE_KEY, c);
      setParams({ course: c === "all" ? null : c });
    },
    setIncludeStaging: (v: boolean) => {
      write(STAGING_KEY, v ? "1" : "0");
      setParams({ staging: v ? "1" : null });
    },
  };
}

export function CourseFilterBar({ course, includeStaging, onCourse, onStaging }: { course: Course; includeStaging: boolean; onCourse: (c: Course) => void; onStaging: (v: boolean) => void }) {
  return (
    <>
      <div role="radiogroup" aria-label="Course" className="inline-flex max-w-full overflow-x-auto border border-line-strong [scrollbar-width:none]">
        {COURSE_OPTIONS.map((o, i) => {
          const on = o.id === course;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.hint}
              onClick={() => onCourse(o.id)}
              className={cx("min-h-10 shrink-0 whitespace-nowrap px-2.5 font-mono text-xs", i > 0 && "border-l border-line-strong", on ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg")}
            >
              {o.label}
            </button>
          );
        })}
      </div>
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 font-mono text-[11px] text-fg-3" title="Hidden by default: sessions on staging hosts (test traffic).">
        <input type="checkbox" checked={includeStaging} onChange={(e) => onStaging(e.target.checked)} className="h-4 w-4 accent-[var(--signal,currentColor)]" />
        Include staging
      </label>
    </>
  );
}

/** SDM / DSA / SDM→DSA tag on a session or recording row, plus "staging" when it ran there */
export function CourseTag({ course, staging }: { course: SessionCourse; staging?: boolean }) {
  return (
    <>
      <Badge tone={course === "sdm" ? "muted" : "signal"} title={course === "sdm-dsa" ? "Started on an SDM page, later visited /dsa" : course === "dsa" ? "Started on a /dsa page" : "Never visited /dsa"}>
        {SESSION_COURSE_LABEL[course]}
      </Badge>
      {staging && <Badge tone="muted" title="Ran on a staging host">staging</Badge>}
    </>
  );
}
