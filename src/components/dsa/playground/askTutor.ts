"use client";

/**
 * "Ask the tutor about this code": opens DSA's tutor panel (ChatPanel course="dsa", via the shared tutor:open event)
 * with the code and its last output attached as the passage, and a question ready to send or edit. Normal credits:
 * it is the same tutor chat as everywhere else on the course.
 */
import { TUTOR_OPEN_EVENT } from "@/components/learn/chat/openChat";
import { track } from "@/lib/track";
import { DSA_LANG_LABEL, type DsaLang } from "@/lib/dsa/types";
import { resultLine, type ProgramResult } from "@/lib/dsa/playground/program";

/** The passage the chat attaches is capped at 1,500 characters (pageContext.ts): code first, then the output. */
export function tutorPassage(lang: DsaLang, code: string, stdin: string, result: ProgramResult | null, cap = 1500): string {
  const facts = result ? `\n\nLast run: ${resultLine(result)}` : "";
  const out = result ? (result.stdout || "").slice(0, 260) + (result.stderr ? `\n[stderr]\n${result.stderr.slice(0, 320)}` : "") : "";
  const tail = `${stdin.trim() ? `\n\nInput:\n${stdin.slice(0, 120)}` : ""}${facts}${out ? `\nOutput:\n${out}` : ""}`;
  const head = `${DSA_LANG_LABEL[lang]} program:\n`;
  const room = Math.max(200, cap - head.length - tail.length);
  const body = code.length > room ? `${code.slice(0, room - 20)}\n… (code cut short)` : code;
  return `${head}${body}${tail}`.slice(0, cap);
}

export function askTutorAbout(o: { lang: DsaLang; code: string; stdin: string; result: ProgramResult | null; where: "playground" | "snippet"; heading?: string }) {
  const failed = !!o.result && o.result.verdict !== "OK";
  const prompt = failed ? `Why does my ${DSA_LANG_LABEL[o.lang]} code fail, and how do I fix it?` : `Walk me through what this ${DSA_LANG_LABEL[o.lang]} code does and why it prints what it prints.`;
  window.dispatchEvent(
    new CustomEvent(TUTOR_OPEN_EVENT, {
      detail: { prompt, send: false, context: { kind: "selection", text: tutorPassage(o.lang, o.code, o.stdin, o.result), href: window.location.pathname, heading: o.heading } },
    }),
  );
  track("dsa_program_ask_tutor", { lang: o.lang, from: o.where, failed });
}
