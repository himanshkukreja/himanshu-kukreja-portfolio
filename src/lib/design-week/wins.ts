import "server-only";
/** Design of the week wins for the public profile (/u/<handle>). Light: no renderer, no course map. */
import { winsFor } from "./core";
import { getStore } from "./store";

/** For the public profile: { "dow:win:<slug>": at, dow: first win } merged into game_done. */
export async function designWeekDone(userId: string): Promise<Record<string, number>> {
  try {
    const store = getStore();
    const mine = (await store.listSubmissionsByUser(userId)).filter((s) => s.status === "submitted");
    if (!mine.length) return {};
    const wins = winsFor(userId, await store.listChallenges(), mine);
    if (!wins.length) return {};
    const out: Record<string, number> = { dow: Math.min(...wins.map((w) => w.at)) };
    wins.forEach((w) => (out[`dow:win:${w.slug}`] = w.at));
    return out;
  } catch {
    return {};
  }
}
