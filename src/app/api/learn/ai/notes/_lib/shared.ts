/**
 * Shared by the notebook page AI routes (convert, check, cards): request parsing and the error answer. A page is
 * private: the routes never read it from the database; the learner's browser sends what the call needs (the page
 * image for convert, the typed notes for check and cards) only when they press the button.
 */
import { NextResponse } from "next/server";
import type { AiResult } from "@/lib/ai/client";
import { NOTES_MD_MAX, readTyped } from "@/lib/ai/notes";

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LESSON_KEY = /^([A-Za-z0-9-]{1,120})\/([A-Za-z0-9-]{1,120})$/;

export const pageIdOf = (v: unknown): string | null => (typeof v === "string" && ID.test(v) ? v : null);

/** "<week>/<slug>" → its parts, or null. */
export function lessonKeyOf(v: unknown): { key: string; week: string; slug: string } | null {
  const m = typeof v === "string" ? v.match(LESSON_KEY) : null;
  return m ? { key: m[0], week: m[1], slug: m[2] } : null;
}

/** The typed notes a learner sends to check or turn into cards (a page's typed version, maybe edited). */
export function notesOf(v: unknown): string {
  // the page's ink stamp (a comment on the last line) is the page's own bookkeeping, never part of the notes
  return typeof v === "string" ? readTyped(v.replace(/\r\n?/g, "\n")).md.slice(0, NOTES_MD_MAX) : "";
}

/** A refused or failed call, as the AI routes answer it (502 for the API's failure, 429 for every limit). */
export function aiError(r: Extract<AiResult, { ok: false }>) {
  return NextResponse.json({ error: r.message, status: r.status, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : r.status === "too_long" ? 413 : 429 });
}
