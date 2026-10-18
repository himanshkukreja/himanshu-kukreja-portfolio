/**
 * Reading trail files (resources/reading-trail/*.yml): parsing and validation. Pure, so the
 * validator script can load it with jiti. Invalid entries are dropped and reported, so one typo
 * never hides the rest of a lesson's trail.
 */
import matter from "gray-matter";
import { TRAIL_TYPES, type TrailEntry, type TrailType } from "./types";

export const TRAIL_DIR = "resources/reading-trail";
export const TRAIL_FILE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.ya?ml$/;

export const LIMITS = {
  entriesMin: 2,
  entriesMax: 3,
  title: 220,
  publisher: 80,
  company: 40,
  concept: 70,
  /** each of the three summary lines */
  line: 260,
  lineMin: 30,
  minutes: [1, 180] as const,
  year: [1950, 2100] as const,
};

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LESSON_RE = /^([a-z0-9-]+)\/([A-Za-z0-9-]+)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type ParsedLesson = { lesson: string; week: string; slug: string; entries: TrailEntry[] };
export type ParsedFile = { lessons: ParsedLesson[]; errors: string[] };

const str = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : typeof v === "number" ? String(v) : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
/** gray-matter's YAML turns an unquoted 2026-10-18 into a Date */
const dateStr = (v: unknown) => (v instanceof Date && !isNaN(+v) ? v.toISOString().slice(0, 10) : str(v));

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Parse one file. `file` is only used in messages. */
export function parseTrailFile(text: string, file = "reading-trail.yml"): ParsedFile {
  const errors: string[] = [];
  let data: Record<string, unknown> = {};
  try {
    data = matter(`---\n${text.replace(/^﻿/, "")}\n---\n`).data as Record<string, unknown>;
  } catch (e) {
    return { lessons: [], errors: [`${file}: YAML: ${(e as Error).message}`] };
  }
  const raw = Array.isArray(data.lessons) ? (data.lessons as Record<string, unknown>[]) : [];
  if (!raw.length) errors.push(`${file}: no lessons`);
  const seenLessons = new Set<string>();
  const lessons: ParsedLesson[] = [];

  raw.forEach((l, li) => {
    const lesson = str(l?.lesson);
    const m = lesson.match(LESSON_RE);
    const where = `${file} lesson ${lesson || `#${li + 1}`}`;
    if (!m) {
      errors.push(`${where}: "lesson" must be <week folder>/<slug>`);
      return;
    }
    if (seenLessons.has(lesson)) errors.push(`${where}: listed twice in this file`);
    seenLessons.add(lesson);
    const ids = new Set<string>();
    const urls = new Set<string>();
    const entries: TrailEntry[] = [];
    const rawEntries = Array.isArray(l.entries) ? (l.entries as Record<string, unknown>[]) : [];
    rawEntries.forEach((e, ei) => {
      const id = str(e?.id);
      const at = `${where} entry ${id || `#${ei + 1}`}`;
      const bad: string[] = [];
      const title = str(e?.title);
      const publisher = str(e?.publisher);
      const company = str(e?.company);
      const url = str(e?.url);
      const type = str(e?.type) as TrailType;
      const concept = str(e?.concept);
      const minutes = Number(e?.minutes);
      const yearRaw = e?.year;
      const year = yearRaw === undefined || yearRaw === null || yearRaw === "" ? null : Number(yearRaw);
      const s = (e?.summary || {}) as Record<string, unknown>;
      const summary = { what: str(s.what), idea: str(s.idea), connects: str(s.connects) };
      const checked = dateStr(e?.checked) || null;

      if (!ID_RE.test(id)) bad.push("id must be lowercase-kebab");
      else if (ids.has(id)) bad.push("duplicate id in this lesson");
      if (!title) bad.push("title missing");
      else if (title.length > LIMITS.title) bad.push(`title over ${LIMITS.title} chars`);
      if (!company) bad.push("company missing");
      else if (company.length > LIMITS.company) bad.push(`company over ${LIMITS.company} chars`);
      if (!publisher) bad.push("publisher missing");
      else if (publisher.length > LIMITS.publisher) bad.push(`publisher over ${LIMITS.publisher} chars`);
      let parsed: URL | null = null;
      try {
        parsed = new URL(url);
      } catch {
        parsed = null;
      }
      if (!parsed) bad.push("url is not a valid URL");
      else if (parsed.protocol !== "https:") bad.push("url must be https");
      else if (urls.has(url)) bad.push("same url twice in this lesson");
      if (!(TRAIL_TYPES as readonly string[]).includes(type)) bad.push(`type must be one of: ${TRAIL_TYPES.join(", ")}`);
      if (!Number.isInteger(minutes) || minutes < LIMITS.minutes[0] || minutes > LIMITS.minutes[1]) bad.push(`minutes must be an integer ${LIMITS.minutes.join("-")}`);
      if (year !== null && (!Number.isInteger(year) || year < LIMITS.year[0] || year > LIMITS.year[1])) bad.push("year must be a 4-digit year");
      if (!concept) bad.push("concept missing");
      else if (concept.length > LIMITS.concept) bad.push(`concept over ${LIMITS.concept} chars`);
      for (const k of ["what", "idea", "connects"] as const) {
        const v = summary[k];
        if (!v) bad.push(`summary.${k} missing`);
        else if (v.length > LIMITS.line) bad.push(`summary.${k} over ${LIMITS.line} chars (${v.length})`);
        else if (v.length < LIMITS.lineMin) bad.push(`summary.${k} under ${LIMITS.lineMin} chars`);
      }
      if (checked && !DATE_RE.test(checked)) bad.push("checked must be YYYY-MM-DD");

      if (bad.length) {
        errors.push(`${at}: ${bad.join("; ")}`);
        return;
      }
      ids.add(id);
      urls.add(url);
      entries.push({
        id,
        title,
        company,
        publisher,
        authors: list(e?.authors),
        year,
        url,
        host: hostOf(url),
        type,
        minutes,
        concept,
        summary,
        note: str(e?.note) || null,
        checked,
      });
    });
    if (entries.length < LIMITS.entriesMin || entries.length > LIMITS.entriesMax) errors.push(`${where}: ${entries.length} valid entries (expected ${LIMITS.entriesMin}-${LIMITS.entriesMax})`);
    if (entries.length) lessons.push({ lesson, week: m[1], slug: m[2], entries: entries.slice(0, LIMITS.entriesMax) });
  });
  return { lessons, errors };
}

/** Merge several files: a lesson listed in two files keeps the first and reports the second. */
export function mergeTrailFiles(files: { name: string; parsed: ParsedFile }[]): { lessons: Map<string, ParsedLesson>; errors: string[] } {
  const lessons = new Map<string, ParsedLesson>();
  const errors: string[] = [];
  for (const f of files) {
    errors.push(...f.parsed.errors);
    for (const l of f.parsed.lessons) {
      if (lessons.has(l.lesson)) {
        errors.push(`${f.name}: ${l.lesson} is already listed in another file`);
        continue;
      }
      lessons.set(l.lesson, l);
    }
  }
  return { lessons, errors };
}
