/**
 * Recorded "Listen" narration (Kokoro af_heart, made once and locally by scripts/listen): where it
 * lives and what its manifest says. Each article has `<base>/<key>/listen.json` + `narration.mp3`.
 */
import type { LessonKind } from "@/lib/course/types";

export type ListenChunk = {
  /** index into extractBlocks(article) */
  b: number;
  /** the block's text, as extracted (before the narrator's respellings) */
  t: string;
  /** start / end of its speech in the audio, seconds */
  s: number;
  e: number;
};

export type ListenManifest = {
  v: 1;
  key: string;
  /** listenSource(blocks): sha1 of the readable text, 12 hex. The player ignores a manifest that doesn't match. */
  source: string;
  voice: string;
  speed: number;
  /** relative to the manifest (versioned by source) */
  audio: string;
  /** seconds */
  duration: number;
  bytes: number;
  blocks: number;
  chunks: ListenChunk[];
  made: string;
};

/**
 * The article's narration folder. Course lessons, interview problems and LLD by folder, side quests by
 * slug; case files, war stories and mock interviews have room for theirs (case/, war/, mock/).
 */
export function listenKey(kind: LessonKind | "case" | "war" | "mock", folder: string, slug: string): string {
  if (kind === "bonus") return `quest/${slug}`;
  if (kind === "case" || kind === "war" || kind === "mock") return `${kind}/${slug}`;
  return `lesson/${folder}/${slug}`;
}

/**
 * Where narration lives: NEXT_PUBLIC_LISTEN_MEDIA, else public/listen-media in development (R2 only
 * answers the site's own origins), else the media domain.
 */
export function listenMediaBase(): string {
  const env = process.env.NEXT_PUBLIC_LISTEN_MEDIA;
  if (env) return env.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "/listen-media";
  return "https://media.himanshukukreja.in/listen";
}
