import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getAllStories } from "@/lib/stories";
import { buildWelcomeEmailHtml } from "@/lib/emailTemplate";
import { sendNewsletterEmail } from "@/lib/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const schema = z.object({ email: z.string().email() });

async function fetchGeo(ip: string | null) {
  try {
    if (!ip) return null;
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,timezone`);
    const j = await r.json();
    if (j?.status === "success") {
      return { country: j.country as string | undefined, region: j.regionName as string | undefined, city: j.city as string | undefined, timezone: j.timezone as string | undefined };
    }
    return null;
  } catch {
    return null;
  }
}

function getIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  return (xf || "").split(",")[0].trim() || null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();

  const ip = getIp(req);
  const geo = await fetchGeo(ip);

  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert({ email, unsubscribed: false, ip: ip || undefined, city: geo?.city, region: geo?.region, country: geo?.country, timezone: geo?.timezone }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ error: "Could not subscribe" }, { status: 500 });
  }

  queueMicrotask(async () => {
    try {
      const all = await getAllStories();
      const latest = all.slice(0, 5);
      const html = buildWelcomeEmailHtml(latest, { recipientEmail: email });
      await sendNewsletterEmail(email, "🎉 Welcome to Engineering Stories!", html);
      await supabase.from("newsletter_logs").insert({ 
        email, 
        status: "sent", 
        type: "welcome", 
        detail: "Welcome email sent upon subscription",
        story_slugs: latest.map((s) => s.slug) 
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("newsletter_logs").insert({ 
        email, 
        status: "error", 
        type: "welcome", 
        detail: `Welcome email failed: ${msg}` 
      });
    }
  });

  return NextResponse.json({ ok: true, message: "You're subscribed!" });
}
