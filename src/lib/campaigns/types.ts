/** Shapes shared by the campaign APIs and the /admin/newsletter screens (client-safe, no I/O). */
import type { EmailDoc } from "./render";
import type { MergeVars } from "./tags";

export type AudienceKind = "all" | "learners" | "subscribers" | "active" | "never_started" | "completed" | "custom";

export type AudienceSpec = {
  kind: AudienceKind;
  /** active: last N days */
  days?: number;
  /** completed: at least N lessons */
  min?: number;
  /** custom: pasted addresses (comma / space / newline separated) */
  emails?: string;
};

export type AudienceCount = {
  eligible: number;
  /** removed because unsubscribed (newsletter_subscribers) */
  unsubscribed: number;
  /** removed because bounced / complained / suppressed */
  suppressed: number;
  /** custom list: entries that weren't valid addresses */
  invalid: number;
  /** duplicates folded together */
  duplicates: number;
  /** already in this campaign (top-ups only count new people) */
  alreadyQueued: number;
  sample: string[];
};

export type TransportId = "smtp" | "smtp2";
export type TransportMode = "live" | "console";

export type TransportInfo = {
  id: TransportId;
  label: string;
  configured: boolean;
  host: string | null;
  provider: string;
  /** domains this transport can send from (env SMTP_VERIFIED_DOMAINS, else SMTP_FROM's domain) */
  verifiedDomains: string[];
  verifiedSource: "env" | "assumed" | "none";
  note: string;
};

export type SenderCheck = { level: "ok" | "warn" | "bad"; message: string };

export type Sender = {
  /** "env:smtp" | "env:smtp2" | uuid (email_senders row) */
  id: string;
  label: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  transport: TransportId;
  isDefault: boolean;
  /** env senders can't be edited or deleted in the UI */
  source: "env" | "db";
  check: SenderCheck;
};

export type CampaignStatus = "draft" | "sending" | "paused" | "sent" | "cancelled";
export type MessageStatus = "queued" | "sending" | "sent" | "failed" | "skipped";

export type CampaignCounts = {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  /** unique recipients with ≥1 open (a click also counts as an open) */
  opened: number;
  opens: number;
  clicked: number;
  clicks: number;
  unsubscribed: number;
  /** "sending" rows claimed more than 5 minutes ago (interrupted mid-send) */
  stuck: number;
};

export type Campaign = {
  id: string;
  name: string;
  subject: string;
  subjectFallback: string | null;
  preheader: string | null;
  template: string;
  doc: EmailDoc;
  senderId: string | null;
  sender: { fromName: string; fromEmail: string; replyTo: string | null; transport: TransportId } | null;
  audience: AudienceSpec;
  trackOpens: boolean;
  trackClicks: boolean;
  status: CampaignStatus;
  lastError: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  queuedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lockUntil: string | null;
};

export type CampaignSummary = Omit<Campaign, "doc"> & { counts: CampaignCounts };

export type MessageRow = {
  id: number;
  email: string;
  name: string | null;
  userId: string | null;
  status: MessageStatus;
  error: string | null;
  sentAt: string | null;
  openCount: number;
  firstOpenAt: string | null;
  lastOpenAt: string | null;
  clickCount: number;
  firstClickAt: string | null;
  lastClickAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
};

export type DisplayStatus = "queued" | "sending" | "sent" | "failed" | "skipped" | "opened" | "clicked";
export const displayStatus = (m: Pick<MessageRow, "status" | "openCount" | "clickCount" | "firstOpenAt">): DisplayStatus =>
  m.status === "sent" ? (m.clickCount > 0 ? "clicked" : m.openCount > 0 || m.firstOpenAt ? "opened" : "sent") : m.status;

export type EventRow = { at: string; type: "open" | "click" | "unsubscribe"; email: string; url: string | null };

export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  subject: string;
  subjectFallback: string | null;
  preheader: string | null;
  doc: EmailDoc;
  topic: string;
};

export type Recipient = { email: string; name: string | null; userId: string | null };
export type RecipientPreview = Recipient & { vars: MergeVars; source: "account" | "subscriber" | "custom" };

/** GET /api/admin/newsletter */
export type NewsletterInfo = {
  setup: {
    tablesReady: boolean;
    missing: string[];
    transportMode: TransportMode;
    trackingBase: string;
    batch: { size: number; gapMs: number; budgetMs: number };
    admin: string;
  };
  transports: TransportInfo[];
  senders: Sender[];
  campaigns: CampaignSummary[];
};

export type TickResult = {
  campaign: CampaignSummary;
  sentNow: number;
  failedNow: { email: string; error: string }[];
  skippedNow: number;
  busy?: boolean;
  done: boolean;
  transport: TransportMode;
  error?: string;
};
