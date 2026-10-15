import type { EmailDoc } from "@/lib/campaigns/render";
import type { AudienceSpec, Campaign, TemplateInfo } from "@/lib/campaigns/types";

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
  audience: { kind: t.id === "welcome" ? "all" : "learners" },
  trackOpens: true,
  trackClicks: true,
});
