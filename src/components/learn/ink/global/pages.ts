"use client";

/** Finding and starting the notebook page for a place (global/context.ts): the panel and the pen button's menu. */
import { createPage, getPage, inboxPage, InkError, lessonPage, notebookNamed, recentPages } from "@/lib/learn/ink/client";
import { LAST_PAGE, lastForKey, readLS, type InkContext } from "./context";

/** A remembered page id, if that page is still there. */
export async function stillThere(id: string | null): Promise<string | null> {
  if (!id) return null;
  try {
    return (await getPage(id)) ? id : null;
  } catch (e) {
    if (e instanceof InkError && (e.code === "auth" || e.code === "unavailable")) throw e;
    return null;
  }
}

/** A new page for this place: tagged with its key, in its notebook (or the "Clips" inbox where there is no key). */
export async function newPageFor(ctx: InkContext): Promise<string> {
  if (!ctx.key) return (await inboxPage(null)).id;
  const nb = await notebookNamed(ctx.notebook || "Notes");
  return (await createPage(nb.id, { lessonKey: ctx.key, title: ctx.title.slice(0, 120), paper: "ruled" })).id;
}

/** The page to open here; null on a page with no context and no pages yet (the start screen). */
export async function resolvePage(ctx: InkContext): Promise<string | null> {
  if (ctx.key) {
    const last = await stillThere(readLS(lastForKey(ctx.key)));
    if (last) return last;
    const tagged = await lessonPage(ctx.key);
    if (tagged) return tagged.id;
    return newPageFor(ctx);
  }
  const last = await stillThere(readLS(LAST_PAGE));
  if (last) return last;
  return (await recentPages(1))[0]?.id ?? null;
}
