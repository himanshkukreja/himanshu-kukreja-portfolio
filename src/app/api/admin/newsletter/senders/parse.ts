import { bad } from "@/lib/campaigns/api";
import { isEmail } from "@/lib/campaigns/senders";
import type { TransportId } from "@/lib/campaigns/types";

/** Validates a sender body. Blocking: invalid addresses. Warnings (unverified domain) don't block. */
export function parseSender(body: unknown) {
  const b = (body || {}) as Record<string, unknown>;
  const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const fromEmail = s(b.fromEmail).toLowerCase();
  const replyTo = s(b.replyTo).toLowerCase() || null;
  const transport: TransportId = b.transport === "smtp2" ? "smtp2" : "smtp";
  if (!isEmail(fromEmail)) throw bad("From address isn't valid.");
  if (replyTo && !isEmail(replyTo)) throw bad("Reply-to isn't valid.");
  const fromName = s(b.fromName, 80).replace(/[<>"\r\n]/g, "");
  return { label: s(b.label, 60) || fromName || fromEmail, fromName, fromEmail, replyTo, transport, isDefault: b.isDefault === true };
}
