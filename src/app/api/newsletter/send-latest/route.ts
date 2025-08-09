import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAllStories } from "@/lib/stories";
import { buildStoriesEmailHtml } from "@/lib/emailTemplate";
import { getTransport } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireAdmin(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || req.nextUrl.searchParams.get("token");
  if (token !== process.env.NEWSLETTER_ADMIN_TOKEN) {
    throw new Error("Unauthorized");
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  const requestedSlugs: string[] | undefined = Array.isArray(payload?.slugs) ? payload.slugs : undefined;
  const requestedEmails: string[] | undefined = Array.isArray(payload?.emails) ? payload.emails : undefined;
  const subject: string = typeof payload?.subject === "string" && payload.subject.trim() ? payload.subject.trim() : "🚀 Your Weekly Dose of Engineering Stories is Here!";
  const headerTitle: string | undefined = typeof payload?.headerTitle === "string" && payload.headerTitle.trim() ? payload.headerTitle.trim() : undefined;

  const all = await getAllStories();
  const stories = (requestedSlugs && requestedSlugs.length > 0)
    ? all.filter((s) => requestedSlugs.includes(s.slug))
    : all.slice(0, 5);

  if (stories.length === 0) {
    return NextResponse.json({ error: "No stories selected" }, { status: 400 });
  }

  // Subscriber selection (exclude unsubscribed)
  let emails: string[] = [];
  if (requestedEmails && requestedEmails.length > 0) {
    const normalized = Array.from(new Set(requestedEmails.map((e) => e.toLowerCase().trim())));
    const { data: subsFiltered, error: subsErr } = await supabase
      .from("newsletter_subscribers")
      .select("email")
      .in("email", normalized)
      .eq("unsubscribed", false);
    if (subsErr) return NextResponse.json({ error: "Failed to filter subscribers" }, { status: 500 });
    emails = (subsFiltered || []).map((s) => s.email);
  } else {
    const { data: subs, error } = await supabase
      .from("newsletter_subscribers")
      .select("email")
      .eq("unsubscribed", false);
    if (error) return NextResponse.json({ error: "Failed to load subscribers" }, { status: 500 });
    emails = (subs || []).map((s) => s.email);
  }
  emails = Array.from(new Set(emails.map((e) => e.toLowerCase().trim())));
  if (emails.length === 0) return NextResponse.json({ error: "No subscribers selected" }, { status: 400 });

  const { data: campaign, error: campErr } = await supabase
    .from("newsletter_campaigns")
    .insert({ subject, story_slugs: stories.map((s) => s.slug), subscriber_emails: emails })
    .select("id")
    .single();
  if (campErr) return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });

  const transporter = getTransport();
  const from = process.env.SMTP_FROM || `Himanshu Kukreja <${process.env.SMTP_USER}>`;

  const results: { email: string; ok: boolean; error?: string }[] = [];

  await Promise.all(
    emails.map(async (to) => {
      try {
        const html = buildStoriesEmailHtml(stories, { recipientEmail: to, subjectTitle: subject, headerTitle });
        await transporter.sendMail({ from, to, subject, html });
        await supabase.from("newsletter_logs").insert({ 
          email: to, 
          status: "sent", 
          type: "bulk", 
          detail: `Custom send via admin dashboard: ${stories.length} stories to ${emails.length} subscribers`,
          campaign_id: campaign.id, 
          story_slugs: stories.map((s) => s.slug) 
        });
        results.push({ email: to, ok: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("newsletter_logs").insert({ 
          email: to, 
          status: "error", 
          type: "bulk", 
          detail: `Custom send failed: ${msg}`,
          campaign_id: campaign.id, 
          story_slugs: stories.map((s) => s.slug) 
        });
        results.push({ email: to, ok: false, error: msg });
      }
    })
  );

  return NextResponse.json({ ok: true, sent: results.filter((r) => r.ok).length, total: results.length, campaignId: campaign.id });
}
