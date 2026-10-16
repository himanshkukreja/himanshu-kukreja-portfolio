import type { EmailDoc } from "@/lib/campaigns/render";
import type { AudienceSpec, Campaign, StoryOption, TemplateInfo } from "@/lib/campaigns/types";

/** Editable campaign content (what the composer edits and the API stores). */
export type Draft = {
  name: string;
  subject: string;
  subjectFallback: string | null;
  preheader: string | null;
  template: string;
  doc: EmailDoc;
  senderId: string | null;
  audience: AudienceSpec;
  trackOpens: boolean;
  trackClicks: boolean;
};

export const draftFromCampaign = (c: Campaign): Draft => ({
  name: c.name,
  subject: c.subject,
  subjectFallback: c.subjectFallback,
  preheader: c.preheader,
  template: c.template,
  doc: c.doc,
  senderId: c.senderId,
  audience: c.audience,
  trackOpens: c.trackOpens,
  trackClicks: c.trackClicks,
});

export const draftFromTemplate = (t: TemplateInfo, senderId: string | null): Draft => ({
  name: `${t.name} · ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
  subject: t.subject,
  subjectFallback: t.subjectFallback,
  preheader: t.preheader,
  template: t.id,
  doc: t.doc,
  senderId,
  audience: { kind: t.id === "welcome" ? "all" : t.id === "story" ? "subscribers_learners" : "learners" },
  trackOpens: true,
  trackClicks: true,
});

/** Swap a draft's content for a story's generated email (subject, preheader, document). */
export const applyStory = (d: Draft, s: StoryOption): Draft => ({
  ...d,
  name: d.name.startsWith("Case file update") || d.name.startsWith("CASE-") || !d.name ? `${s.caseId} · ${s.title.split(/[:—–]\s/)[0]}` : d.name,
  subject: s.content.subject,
  subjectFallback: s.content.subjectFallback,
  preheader: s.content.preheader,
  doc: s.content.doc,
});
