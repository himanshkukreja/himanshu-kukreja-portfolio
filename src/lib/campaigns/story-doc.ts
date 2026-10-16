/**
 * The "Case file update" email for one story (pure, client-safe: the composer preview, the dev
 * fixtures and the server all build it here). LIGHT theme via the standard blocks layout.
 */
import { SITE } from "./links";
import { newBlockId, type BlocksDoc } from "./render";

export type StoryActivity = { kind: string; title: string; blurb: string; minutes: number };
export type StoryInput = { slug: string; caseId: string; title: string; typeLabel: string; mins: number; cover: string | null; excerpt: string | null; bullets: string[]; activity: StoryActivity | null; xp: number };

export function storyDoc(s: StoryInput): BlocksDoc {
  const utm = `utm_source=email&utm_medium=email&utm_campaign=case-${s.slug}`.slice(0, 160);
  const url = `${SITE}/stories/${s.slug}?${utm}`;
  const blocks: BlocksDoc["blocks"] = [
    { id: newBlockId(), type: "hero", eyebrow: `${s.caseId} · ${s.typeLabel} · ${s.mins} min read`, title: s.title },
  ];
  if (s.cover) blocks.push({ id: newBlockId(), type: "image", src: s.cover, alt: s.title, href: url });
  blocks.push({ id: newBlockId(), type: "text", md: `Hi {{first_name|there}},\n\nA new case file just landed on the desk.${s.excerpt ? ` ${s.excerpt}` : ""}` });
  if (s.bullets.length) blocks.push({ id: newBlockId(), type: "text", md: `## What you'll learn\n\n${s.bullets.map((b) => `- ${b}`).join("\n")}` });
  blocks.push({ id: newBlockId(), type: "button", label: "Read the case file →", url });
  blocks.push({
    id: newBlockId(),
    type: "callout",
    eyebrow: `end-of-case challenge · +${s.xp} XP`,
    title: s.activity ? `${s.activity.title}: solve the case to earn XP.` : "Solve the case to earn XP.",
    label: s.activity ? `${s.activity.minutes ? `${s.activity.minutes}-minute ` : ""}${s.activity.kind} at the end of the file →` : "Take the challenge →",
    url: `${url}#act-${s.slug}-h`,
  });
  blocks.push({ id: newBlockId(), type: "text", md: `Every case file so far: [himanshukukreja.in/stories](${SITE}/stories?${utm}).\n\nReply if you've lived through one like this. I read every reply.\n\nHimanshu` });
  return {
    layout: "blocks",
    topLabel: "case files",
    footer: "You're getting this because you subscribed or have an account at himanshukukreja.in with {{email}}.",
    blocks,
    story: { slug: s.slug, caseId: s.caseId, title: s.title },
  };
}

/** Subject (+ no-name fallback), preheader and document for a story. Every field stays editable. */
export function storyContent(s: StoryInput) {
  const short = s.title.split(/[:—–]\s/)[0].trim();
  return {
    subject: `{{first_name}}, new case file: ${short}`,
    subjectFallback: `New case file: ${short}`,
    preheader: `${s.caseId} · ${s.typeLabel} · ${s.mins} min read. ${s.excerpt ? s.excerpt.slice(0, 110) : "Solve the case at the end to earn XP."}`.slice(0, 180),
    doc: storyDoc(s),
  };
}
