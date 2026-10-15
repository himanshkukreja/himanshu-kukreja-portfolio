/**
 * Persistence for campaigns. Server-only.
 *
 *   supabase (default): email_senders, email_campaigns, email_messages, email_events, email_suppressions
 *     (supabase/migrations/20261016_email_campaigns.sql). Until that migration is applied every read
 *     reports `tablesMissing` and the admin shows an "apply migration" banner instead of failing.
 *   file (dev only, EMAIL_STORE=file + EMAIL_STORE_FILE=/path.json): the same operations on a local
 *     JSON file, for end-to-end tests without touching the production database. Unsubscribes are
 *     still READ from the real newsletter_subscribers table, never written.
 */
import fs from "fs";
import { supabase } from "@/lib/supabase";
import type { AudienceSpec, Campaign, CampaignCounts, CampaignStatus, EventRow, MessageRow, MessageStatus, TransportId } from "./types";
import type { EmailDoc } from "./render";

export const TABLES = ["email_senders", "email_campaigns", "email_messages", "email_events", "email_suppressions"] as const;

export class TablesMissingError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Email campaign tables are missing (${missing.join(", ")}). Apply supabase/migrations/20261016_email_campaigns.sql.`);
    this.missing = missing;
  }
}

export type DbSender = { id: string; label: string; fromName: string; fromEmail: string; replyTo: string | null; transport: TransportId; isDefault: boolean; createdAt: string };

export type DbMessage = MessageRow & { campaignId: string; token: string; vars: Record<string, string> | null; claimedAt: string | null; providerId: string | null };

export type NewCampaign = Omit<Campaign, "id" | "createdAt" | "updatedAt" | "queuedAt" | "startedAt" | "finishedAt" | "lockUntil" | "lastError" | "status" | "sender"> & { status?: CampaignStatus };

export type MessageFilter = "all" | MessageStatus | "opened" | "clicked" | "unopened" | "unsubscribed";

export type Blocked = Map<string, "unsubscribed" | "suppressed">;

export interface CampaignStore {
  kind: "supabase" | "file";
  ready(): Promise<{ ready: boolean; missing: string[] }>;
  listSenders(): Promise<DbSender[]>;
  saveSender(s: Omit<DbSender, "id" | "createdAt"> & { id?: string }): Promise<DbSender>;
  deleteSender(id: string): Promise<void>;
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: string): Promise<Campaign | null>;
  createCampaign(c: NewCampaign): Promise<Campaign>;
  /** `onlyIf` = only update while the campaign has one of these statuses (null = no row matched). */
  updateCampaign(id: string, patch: Partial<Campaign>, onlyIf?: CampaignStatus[]): Promise<Campaign | null>;
  deleteCampaign(id: string): Promise<void>;
  acquireLease(id: string, ms: number): Promise<boolean>;
  releaseLease(id: string): Promise<void>;
  existingEmails(campaignId: string): Promise<Set<string>>;
  insertMessages(campaignId: string, rows: { email: string; name: string | null; userId: string | null; token: string }[]): Promise<number>;
  counts(campaignId: string): Promise<CampaignCounts>;
  peekQueued(campaignId: string, n: number): Promise<DbMessage[]>;
  claim(ids: number[]): Promise<DbMessage[]>;
  updateMessage(id: number, patch: Partial<DbMessage>): Promise<void>;
  skip(ids: number[], reason: string): Promise<void>;
  release(ids: number[]): Promise<void>;
  listMessages(campaignId: string, f: { filter: MessageFilter; q?: string; limit: number; offset: number }): Promise<{ rows: MessageRow[]; total: number }>;
  requeue(campaignId: string, opts: { failed: boolean; stuck: boolean }): Promise<number>;
  track(token: string, type: "open" | "click", url: string | null, ua: string | null): Promise<boolean>;
  markUnsubscribed(token: string): Promise<{ email: string } | null>;
  events(campaignId: string, limit: number): Promise<EventRow[]>;
  blocked(emails: string[]): Promise<Blocked>;
  allBlocked(): Promise<{ unsubscribed: Set<string>; suppressed: Set<string> }>;
  suppress(email: string, reason: "bounce" | "complaint" | "manual", detail: string): Promise<void>;
}

const STUCK_MS = 5 * 60_000;
const lc = (s: string) => s.toLowerCase().trim();
const nowIso = () => new Date().toISOString();

export function emptyCounts(): CampaignCounts {
  return { total: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, opened: 0, opens: 0, clicked: 0, clicks: 0, unsubscribed: 0, stuck: 0 };
}

function tally(rows: Pick<DbMessage, "status" | "openCount" | "clickCount" | "firstOpenAt" | "unsubscribedAt" | "claimedAt">[]): CampaignCounts {
  const c = emptyCounts();
  const now = Date.now();
  for (const r of rows) {
    c.total++;
    c[r.status]++;
    if (r.firstOpenAt || r.openCount > 0) c.opened++;
    c.opens += r.openCount;
    if (r.clickCount > 0) c.clicked++;
    c.clicks += r.clickCount;
    if (r.unsubscribedAt) c.unsubscribed++;
    if (r.status === "sending" && r.claimedAt && now - new Date(r.claimedAt).getTime() > STUCK_MS) c.stuck++;
  }
  return c;
}

function matchesFilter(m: DbMessage, f: MessageFilter): boolean {
  switch (f) {
    case "all":
      return true;
    case "opened":
      return m.status === "sent" && (!!m.firstOpenAt || m.openCount > 0);
    case "clicked":
      return m.clickCount > 0;
    case "unopened":
      return m.status === "sent" && !m.firstOpenAt && m.openCount === 0;
    case "unsubscribed":
      return !!m.unsubscribedAt;
    default:
      return m.status === f;
  }
}

const publicRow = (m: DbMessage): MessageRow => ({
  id: m.id,
  email: m.email,
  name: m.name,
  userId: m.userId,
  status: m.status,
  error: m.error,
  sentAt: m.sentAt,
  openCount: m.openCount,
  firstOpenAt: m.firstOpenAt,
  lastOpenAt: m.lastOpenAt,
  clickCount: m.clickCount,
  firstClickAt: m.firstClickAt,
  lastClickAt: m.lastClickAt,
  unsubscribedAt: m.unsubscribedAt,
  createdAt: m.createdAt,
});

/** Real unsubscribes (read-only): newsletter_subscribers.unsubscribed = true. */
async function unsubscribedFromNewsletter(emails?: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (emails && !emails.length) return out;
  const PAGE = 1000;
  for (let from = 0; from < 1_000_000; from += PAGE) {
    let q = supabase.from("newsletter_subscribers").select("email").eq("unsubscribed", true);
    if (emails) q = q.in("email", emails);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`newsletter_subscribers read failed: ${error.message}`);
    for (const r of data || []) if (r.email) out.add(lc(String(r.email)));
    if (!data || data.length < PAGE || emails) break;
  }
  return out;
}

/* ───────────────────────────── supabase ───────────────────────────── */

type Err = { code?: string; message?: string } | null;
const isMissing = (e: Err) => !!e && (e.code === "42P01" || e.code === "PGRST205" || /does not exist|schema cache/i.test(e.message || ""));

function fail(e: Err, what: string): never {
  if (isMissing(e)) throw new TablesMissingError([...TABLES]);
  throw new Error(`${what}: ${e?.message || "unknown error"}`);
}

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  subject_fallback: string | null;
  preheader: string | null;
  template: string;
  doc: EmailDoc;
  sender_id: string | null;
  sender: Campaign["sender"];
  audience: AudienceSpec;
  track_opens: boolean;
  track_clicks: boolean;
  status: CampaignStatus;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  lock_until: string | null;
};

const toCampaign = (r: CampaignRow): Campaign => ({
  id: r.id,
  name: r.name,
  subject: r.subject,
  subjectFallback: r.subject_fallback,
  preheader: r.preheader,
  template: r.template,
  doc: r.doc,
  senderId: r.sender_id,
  sender: r.sender,
  audience: r.audience || { kind: "learners" },
  trackOpens: r.track_opens,
  trackClicks: r.track_clicks,
  status: r.status,
  lastError: r.last_error,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  queuedAt: r.queued_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  lockUntil: r.lock_until,
});

const CAMPAIGN_COLS: Record<string, keyof CampaignRow> = {
  name: "name",
  subject: "subject",
  subjectFallback: "subject_fallback",
  preheader: "preheader",
  template: "template",
  doc: "doc",
  senderId: "sender_id",
  sender: "sender",
  audience: "audience",
  trackOpens: "track_opens",
  trackClicks: "track_clicks",
  status: "status",
  lastError: "last_error",
  createdBy: "created_by",
  queuedAt: "queued_at",
  startedAt: "started_at",
  finishedAt: "finished_at",
  lockUntil: "lock_until",
};
const toCampaignRow = (p: Partial<Campaign>) => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (CAMPAIGN_COLS[k] && v !== undefined) out[CAMPAIGN_COLS[k]] = v;
  return out;
};

type MessageDbRow = {
  id: number;
  campaign_id: string;
  email: string;
  user_id: string | null;
  name: string | null;
  token: string;
  status: MessageStatus;
  error: string | null;
  provider_id: string | null;
  vars: Record<string, string> | null;
  claimed_at: string | null;
  sent_at: string | null;
  open_count: number;
  first_open_at: string | null;
  last_open_at: string | null;
  click_count: number;
  first_click_at: string | null;
  last_click_at: string | null;
  unsubscribed_at: string | null;
  created_at: string;
};
const toMessage = (r: MessageDbRow): DbMessage => ({
  id: r.id,
  campaignId: r.campaign_id,
  email: r.email,
  userId: r.user_id,
  name: r.name,
  token: r.token,
  status: r.status,
  error: r.error,
  providerId: r.provider_id,
  vars: r.vars,
  claimedAt: r.claimed_at,
  sentAt: r.sent_at,
  openCount: r.open_count,
  firstOpenAt: r.first_open_at,
  lastOpenAt: r.last_open_at,
  clickCount: r.click_count,
  firstClickAt: r.first_click_at,
  lastClickAt: r.last_click_at,
  unsubscribedAt: r.unsubscribed_at,
  createdAt: r.created_at,
});
const MSG_COLS: Record<string, keyof MessageDbRow> = {
  status: "status",
  error: "error",
  providerId: "provider_id",
  vars: "vars",
  claimedAt: "claimed_at",
  sentAt: "sent_at",
  name: "name",
  unsubscribedAt: "unsubscribed_at",
};
const toMessagePatch = (p: Partial<DbMessage>) => {
  const out: Record<string, unknown> = { updated_at: nowIso() };
  for (const [k, v] of Object.entries(p)) if (MSG_COLS[k] && v !== undefined) out[MSG_COLS[k]] = v;
  return out;
};

let readyCache: { at: number; value: { ready: boolean; missing: string[] } } | null = null;

const supabaseStore: CampaignStore = {
  kind: "supabase",

  async ready() {
    if (readyCache && Date.now() - readyCache.at < (readyCache.value.ready ? 5 * 60_000 : 15_000)) return readyCache.value;
    const missing: string[] = [];
    await Promise.all(
      TABLES.map(async (t) => {
        // not a HEAD request: PostgREST's "table not found" body (PGRST205) only comes with GET
        const { error } = await supabase.from(t).select("*").limit(1);
        if (error && isMissing(error)) missing.push(t);
        else if (error) throw new Error(`${t}: ${error.message}`);
      })
    );
    const value = { ready: missing.length === 0, missing };
    readyCache = { at: Date.now(), value };
    return value;
  },

  async listSenders() {
    const { data, error } = await supabase.from("email_senders").select("*").order("created_at");
    if (error) fail(error, "email_senders read failed");
    return (data || []).map((r) => ({ id: r.id, label: r.label, fromName: r.from_name, fromEmail: r.from_email, replyTo: r.reply_to, transport: r.transport, isDefault: r.is_default, createdAt: r.created_at }));
  },

  async saveSender(s) {
    if (s.isDefault) await supabase.from("email_senders").update({ is_default: false }).eq("is_default", true);
    const row = { label: s.label, from_name: s.fromName, from_email: lc(s.fromEmail), reply_to: s.replyTo ? lc(s.replyTo) : null, transport: s.transport, is_default: s.isDefault, updated_at: nowIso() };
    const q = s.id ? supabase.from("email_senders").update(row).eq("id", s.id) : supabase.from("email_senders").insert(row);
    const { data, error } = await q.select("*").single();
    if (error || !data) fail(error, "email_senders write failed");
    return { id: data.id, label: data.label, fromName: data.from_name, fromEmail: data.from_email, replyTo: data.reply_to, transport: data.transport, isDefault: data.is_default, createdAt: data.created_at };
  },

  async deleteSender(id) {
    const { error } = await supabase.from("email_senders").delete().eq("id", id);
    if (error) fail(error, "email_senders delete failed");
  },

  async listCampaigns() {
    const { data, error } = await supabase.from("email_campaigns").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) fail(error, "email_campaigns read failed");
    return (data as CampaignRow[]).map(toCampaign);
  },

  async getCampaign(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await supabase.from("email_campaigns").select("*").eq("id", id).maybeSingle();
    if (error) fail(error, "email_campaigns read failed");
    return data ? toCampaign(data as CampaignRow) : null;
  },

  async createCampaign(c) {
    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({ ...toCampaignRow(c), status: c.status || "draft" })
      .select("*")
      .single();
    if (error || !data) fail(error, "email_campaigns insert failed");
    return toCampaign(data as CampaignRow);
  },

  async updateCampaign(id, patch, onlyIf) {
    let q = supabase.from("email_campaigns").update({ ...toCampaignRow(patch), updated_at: nowIso() }).eq("id", id);
    if (onlyIf?.length) q = q.in("status", onlyIf);
    const { data, error } = await q.select("*").maybeSingle();
    if (error) fail(error, "email_campaigns update failed");
    return data ? toCampaign(data as CampaignRow) : null;
  },

  async deleteCampaign(id) {
    const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
    if (error) fail(error, "email_campaigns delete failed");
  },

  async acquireLease(id, ms) {
    const now = nowIso();
    const { data, error } = await supabase
      .from("email_campaigns")
      .update({ lock_until: new Date(Date.now() + ms).toISOString() })
      .eq("id", id)
      .or(`lock_until.is.null,lock_until.lt.${now}`)
      .select("id");
    if (error) fail(error, "lease failed");
    return !!data?.length;
  },

  async releaseLease(id) {
    await supabase.from("email_campaigns").update({ lock_until: null }).eq("id", id);
  },

  async existingEmails(campaignId) {
    const out = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; from < 1_000_000; from += PAGE) {
      const { data, error } = await supabase.from("email_messages").select("email").eq("campaign_id", campaignId).range(from, from + PAGE - 1);
      if (error) fail(error, "email_messages read failed");
      for (const r of data || []) out.add(lc(r.email));
      if (!data || data.length < PAGE) break;
    }
    return out;
  },

  async insertMessages(campaignId, rows) {
    let n = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ campaign_id: campaignId, email: lc(r.email), name: r.name, user_id: r.userId, token: r.token, status: "queued" }));
      const { data, error } = await supabase.from("email_messages").upsert(chunk, { onConflict: "campaign_id,email", ignoreDuplicates: true }).select("id");
      if (error) fail(error, "email_messages insert failed");
      n += data?.length || 0;
    }
    return n;
  },

  async counts(campaignId) {
    const rows: DbMessage[] = [];
    const PAGE = 1000;
    for (let from = 0; from < 1_000_000; from += PAGE) {
      const { data, error } = await supabase
        .from("email_messages")
        .select("status, open_count, click_count, first_open_at, unsubscribed_at, claimed_at")
        .eq("campaign_id", campaignId)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) fail(error, "email_messages read failed");
      for (const r of (data || []) as MessageDbRow[]) rows.push(toMessage(r));
      if (!data || data.length < PAGE) break;
    }
    return tally(rows);
  },

  async peekQueued(campaignId, n) {
    const { data, error } = await supabase.from("email_messages").select("*").eq("campaign_id", campaignId).eq("status", "queued").order("id").limit(n);
    if (error) fail(error, "email_messages read failed");
    return ((data || []) as MessageDbRow[]).map(toMessage);
  },

  async claim(ids) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from("email_messages").update({ status: "sending", claimed_at: nowIso(), updated_at: nowIso() }).in("id", ids).eq("status", "queued").select("*");
    if (error) fail(error, "email_messages claim failed");
    return ((data || []) as MessageDbRow[]).map(toMessage).sort((a, b) => a.id - b.id);
  },

  async updateMessage(id, patch) {
    const { error } = await supabase.from("email_messages").update(toMessagePatch(patch)).eq("id", id);
    if (error) fail(error, "email_messages update failed");
  },

  async skip(ids, reason) {
    if (!ids.length) return;
    const { error } = await supabase.from("email_messages").update({ status: "skipped", error: reason, updated_at: nowIso() }).in("id", ids).eq("status", "queued");
    if (error) fail(error, "email_messages update failed");
  },

  async release(ids) {
    if (!ids.length) return;
    await supabase.from("email_messages").update({ status: "queued", claimed_at: null, updated_at: nowIso() }).in("id", ids).eq("status", "sending");
  },

  async listMessages(campaignId, f) {
    let q = supabase.from("email_messages").select("*", { count: "exact" }).eq("campaign_id", campaignId);
    switch (f.filter) {
      case "all":
        break;
      case "opened":
        q = q.eq("status", "sent").or("first_open_at.not.is.null,open_count.gt.0");
        break;
      case "clicked":
        q = q.gt("click_count", 0);
        break;
      case "unopened":
        q = q.eq("status", "sent").is("first_open_at", null).eq("open_count", 0);
        break;
      case "unsubscribed":
        q = q.not("unsubscribed_at", "is", null);
        break;
      default:
        q = q.eq("status", f.filter);
    }
    const term = (f.q || "").trim().replace(/[%,()*]/g, "");
    if (term) q = q.or(`email.ilike.%${term}%,name.ilike.%${term}%`);
    const { data, error, count } = await q.order("id").range(f.offset, f.offset + f.limit - 1);
    if (error) fail(error, "email_messages read failed");
    return { rows: ((data || []) as MessageDbRow[]).map((r) => publicRow(toMessage(r))), total: count || 0 };
  },

  async requeue(campaignId, opts) {
    let n = 0;
    if (opts.failed) {
      const { data, error } = await supabase.from("email_messages").update({ status: "queued", error: null, claimed_at: null, updated_at: nowIso() }).eq("campaign_id", campaignId).eq("status", "failed").select("id");
      if (error) fail(error, "requeue failed");
      n += data?.length || 0;
    }
    if (opts.stuck) {
      const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
      const { data, error } = await supabase.from("email_messages").update({ status: "queued", claimed_at: null, updated_at: nowIso() }).eq("campaign_id", campaignId).eq("status", "sending").lt("claimed_at", cutoff).select("id");
      if (error) fail(error, "requeue failed");
      n += data?.length || 0;
    }
    return n;
  },

  async track(token, type, url, ua) {
    const rpc = await supabase.rpc("email_track", { p_token: token, p_type: type, p_url: url, p_ua: ua });
    if (!rpc.error) return rpc.data === true;
    // fallback (function missing): read-modify-write
    const { data, error } = await supabase.from("email_messages").select("id, campaign_id, open_count, click_count, first_open_at, first_click_at").eq("token", token).maybeSingle();
    if (error || !data) return false;
    const now = nowIso();
    const patch =
      type === "open"
        ? { open_count: data.open_count + 1, first_open_at: data.first_open_at || now, last_open_at: now }
        : { click_count: data.click_count + 1, first_click_at: data.first_click_at || now, last_click_at: now, first_open_at: data.first_open_at || now };
    await supabase.from("email_messages").update(patch).eq("id", data.id);
    await supabase.from("email_events").insert({ message_id: data.id, campaign_id: data.campaign_id, type, url, user_agent: ua?.slice(0, 300) || null });
    return true;
  },

  async markUnsubscribed(token) {
    const { data, error } = await supabase.from("email_messages").select("id, campaign_id, email, unsubscribed_at").eq("token", token).maybeSingle();
    if (error || !data) return null;
    if (!data.unsubscribed_at) {
      await supabase.from("email_messages").update({ unsubscribed_at: nowIso() }).eq("id", data.id);
      await supabase.from("email_events").insert({ message_id: data.id, campaign_id: data.campaign_id, type: "unsubscribe" });
    }
    return { email: lc(data.email) };
  },

  async events(campaignId, limit) {
    const { data, error } = await supabase.from("email_events").select("created_at, type, url, email_messages(email)").eq("campaign_id", campaignId).order("created_at", { ascending: false }).limit(limit);
    if (error) fail(error, "email_events read failed");
    return (data || []).map((r) => {
      const m = r.email_messages as unknown as { email: string } | { email: string }[] | null;
      const email = Array.isArray(m) ? m[0]?.email : m?.email;
      return { at: r.created_at as string, type: r.type as EventRow["type"], url: (r.url as string) || null, email: email || "" };
    });
  },

  async blocked(emails) {
    const out: Blocked = new Map();
    const list = [...new Set(emails.map(lc))];
    if (!list.length) return out;
    const unsub = await unsubscribedFromNewsletter(list);
    unsub.forEach((e) => out.set(e, "unsubscribed"));
    const { data, error } = await supabase.from("email_suppressions").select("email").in("email", list);
    if (error && !isMissing(error)) throw new Error(`email_suppressions read failed: ${error.message}`);
    for (const r of data || []) if (!out.has(lc(r.email))) out.set(lc(r.email), "suppressed");
    return out;
  },

  async allBlocked() {
    const unsubscribed = await unsubscribedFromNewsletter();
    const suppressed = new Set<string>();
    const { data, error } = await supabase.from("email_suppressions").select("email").limit(100_000);
    if (error && !isMissing(error)) throw new Error(`email_suppressions read failed: ${error.message}`);
    for (const r of data || []) suppressed.add(lc(r.email));
    return { unsubscribed, suppressed };
  },

  async suppress(email, reason, detail) {
    const { error } = await supabase.from("email_suppressions").upsert({ email: lc(email), reason, detail: detail.slice(0, 500) }, { onConflict: "email" });
    if (error && !isMissing(error)) console.error("[campaigns] suppression write failed", error.message);
  },
};

/* ───────────────────────────── file (dev only) ───────────────────────────── */

type FileDb = {
  seq: number;
  senders: DbSender[];
  campaigns: Campaign[];
  messages: DbMessage[];
  events: (EventRow & { campaignId: string; messageId: number })[];
  suppressions: { email: string; reason: string; detail: string }[];
  unsubscribed: string[];
};

function fileStore(path: string): CampaignStore {
  const load = (): FileDb => {
    try {
      return JSON.parse(fs.readFileSync(path, "utf8")) as FileDb;
    } catch {
      return { seq: 1, senders: [], campaigns: [], messages: [], events: [], suppressions: [], unsubscribed: [] };
    }
  };
  const save = (db: FileDb) => fs.writeFileSync(path, JSON.stringify(db, null, 1));
  const tx = <T>(fn: (db: FileDb) => T): T => {
    const db = load();
    const r = fn(db);
    save(db);
    return r;
  };
  const uuid = () => crypto.randomUUID();

  return {
    kind: "file",
    async ready() {
      return { ready: true, missing: [] };
    },
    async listSenders() {
      return load().senders;
    },
    async saveSender(s) {
      return tx((db) => {
        if (s.isDefault) db.senders.forEach((x) => (x.isDefault = false));
        const existing = s.id ? db.senders.find((x) => x.id === s.id) : undefined;
        if (existing) {
          Object.assign(existing, s);
          return existing;
        }
        const row: DbSender = { ...s, id: uuid(), createdAt: nowIso() };
        db.senders.push(row);
        return row;
      });
    },
    async deleteSender(id) {
      tx((db) => (db.senders = db.senders.filter((s) => s.id !== id)));
    },
    async listCampaigns() {
      return [...load().campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getCampaign(id) {
      return load().campaigns.find((c) => c.id === id) ?? null;
    },
    async createCampaign(c) {
      return tx((db) => {
        const row: Campaign = { ...c, status: c.status || "draft", id: uuid(), sender: null, lastError: null, createdAt: nowIso(), updatedAt: nowIso(), queuedAt: null, startedAt: null, finishedAt: null, lockUntil: null };
        db.campaigns.push(row);
        return row;
      });
    },
    async updateCampaign(id, patch, onlyIf) {
      return tx((db) => {
        const c = db.campaigns.find((x) => x.id === id);
        if (!c || (onlyIf?.length && !onlyIf.includes(c.status))) return null;
        Object.assign(c, patch, { updatedAt: nowIso() });
        return c;
      });
    },
    async deleteCampaign(id) {
      tx((db) => {
        db.campaigns = db.campaigns.filter((c) => c.id !== id);
        db.messages = db.messages.filter((m) => m.campaignId !== id);
      });
    },
    async acquireLease(id, ms) {
      return tx((db) => {
        const c = db.campaigns.find((x) => x.id === id);
        if (!c) return false;
        if (c.lockUntil && new Date(c.lockUntil).getTime() > Date.now()) return false;
        c.lockUntil = new Date(Date.now() + ms).toISOString();
        return true;
      });
    },
    async releaseLease(id) {
      tx((db) => {
        const c = db.campaigns.find((x) => x.id === id);
        if (c) c.lockUntil = null;
      });
    },
    async existingEmails(campaignId) {
      return new Set(load().messages.filter((m) => m.campaignId === campaignId).map((m) => m.email));
    },
    async insertMessages(campaignId, rows) {
      return tx((db) => {
        const have = new Set(db.messages.filter((m) => m.campaignId === campaignId).map((m) => m.email));
        let n = 0;
        for (const r of rows) {
          const email = lc(r.email);
          if (have.has(email)) continue;
          have.add(email);
          n++;
          db.messages.push({
            id: db.seq++,
            campaignId,
            email,
            name: r.name,
            userId: r.userId,
            token: r.token,
            status: "queued",
            error: null,
            providerId: null,
            vars: null,
            claimedAt: null,
            sentAt: null,
            openCount: 0,
            firstOpenAt: null,
            lastOpenAt: null,
            clickCount: 0,
            firstClickAt: null,
            lastClickAt: null,
            unsubscribedAt: null,
            createdAt: nowIso(),
          });
        }
        return n;
      });
    },
    async counts(campaignId) {
      return tally(load().messages.filter((m) => m.campaignId === campaignId));
    },
    async peekQueued(campaignId, n) {
      return load()
        .messages.filter((m) => m.campaignId === campaignId && m.status === "queued")
        .slice(0, n);
    },
    async claim(ids) {
      return tx((db) => {
        const out: DbMessage[] = [];
        for (const m of db.messages)
          if (ids.includes(m.id) && m.status === "queued") {
            m.status = "sending";
            m.claimedAt = nowIso();
            out.push({ ...m });
          }
        return out;
      });
    },
    async updateMessage(id, patch) {
      tx((db) => {
        const m = db.messages.find((x) => x.id === id);
        if (m) Object.assign(m, patch);
      });
    },
    async skip(ids, reason) {
      tx((db) => db.messages.forEach((m) => ids.includes(m.id) && m.status === "queued" && Object.assign(m, { status: "skipped", error: reason })));
    },
    async release(ids) {
      tx((db) => db.messages.forEach((m) => ids.includes(m.id) && m.status === "sending" && Object.assign(m, { status: "queued", claimedAt: null })));
    },
    async listMessages(campaignId, f) {
      const term = (f.q || "").toLowerCase().trim();
      const all = load().messages.filter((m) => m.campaignId === campaignId && matchesFilter(m, f.filter) && (!term || m.email.includes(term) || (m.name || "").toLowerCase().includes(term)));
      return { rows: all.slice(f.offset, f.offset + f.limit).map(publicRow), total: all.length };
    },
    async requeue(campaignId, opts) {
      return tx((db) => {
        let n = 0;
        for (const m of db.messages) {
          if (m.campaignId !== campaignId) continue;
          const stuck = m.status === "sending" && m.claimedAt && Date.now() - new Date(m.claimedAt).getTime() > STUCK_MS;
          if ((opts.failed && m.status === "failed") || (opts.stuck && stuck)) {
            Object.assign(m, { status: "queued", error: null, claimedAt: null });
            n++;
          }
        }
        return n;
      });
    },
    async track(token, type, url, ua) {
      return tx((db) => {
        const m = db.messages.find((x) => x.token === token);
        if (!m) return false;
        const now = nowIso();
        if (type === "open") Object.assign(m, { openCount: m.openCount + 1, firstOpenAt: m.firstOpenAt || now, lastOpenAt: now });
        else Object.assign(m, { clickCount: m.clickCount + 1, firstClickAt: m.firstClickAt || now, lastClickAt: now, firstOpenAt: m.firstOpenAt || now });
        db.events.push({ campaignId: m.campaignId, messageId: m.id, at: now, type, url, email: m.email });
        void ua;
        return true;
      });
    },
    async markUnsubscribed(token) {
      return tx((db) => {
        const m = db.messages.find((x) => x.token === token);
        if (!m) return null;
        if (!m.unsubscribedAt) {
          m.unsubscribedAt = nowIso();
          db.events.push({ campaignId: m.campaignId, messageId: m.id, at: m.unsubscribedAt, type: "unsubscribe", url: null, email: m.email });
        }
        if (!db.unsubscribed.includes(m.email)) db.unsubscribed.push(m.email);
        return { email: m.email };
      });
    },
    async events(campaignId, limit) {
      return load()
        .events.filter((e) => e.campaignId === campaignId)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map(({ at, type, url, email }) => ({ at, type, url, email }));
    },
    async blocked(emails) {
      const db = load();
      const list = [...new Set(emails.map(lc))];
      const out: Blocked = new Map();
      const real = await unsubscribedFromNewsletter(list).catch(() => new Set<string>());
      for (const e of list) {
        if (real.has(e) || db.unsubscribed.includes(e)) out.set(e, "unsubscribed");
        else if (db.suppressions.some((s) => s.email === e)) out.set(e, "suppressed");
      }
      return out;
    },
    async allBlocked() {
      const db = load();
      const unsubscribed = await unsubscribedFromNewsletter().catch(() => new Set<string>());
      db.unsubscribed.forEach((e) => unsubscribed.add(e));
      return { unsubscribed, suppressed: new Set(db.suppressions.map((s) => s.email)) };
    },
    async suppress(email, reason, detail) {
      tx((db) => {
        if (!db.suppressions.some((s) => s.email === lc(email))) db.suppressions.push({ email: lc(email), reason, detail });
      });
    },
  };
}

let fileSingleton: CampaignStore | null = null;

export function getStore(): CampaignStore {
  if (process.env.NODE_ENV !== "production" && process.env.EMAIL_STORE === "file" && process.env.EMAIL_STORE_FILE) {
    fileSingleton ??= fileStore(process.env.EMAIL_STORE_FILE);
    return fileSingleton;
  }
  return supabaseStore;
}

/** Unsubscribe that every sender honours (newsletter_subscribers upsert). The file store never writes it. */
export async function unsubscribeEverywhere(email: string): Promise<void> {
  if (getStore().kind === "file") return;
  const { error } = await supabase.from("newsletter_subscribers").upsert({ email: lc(email), unsubscribed: true, unsubscribed_at: nowIso() }, { onConflict: "email" });
  if (error) throw new Error(error.message);
}
