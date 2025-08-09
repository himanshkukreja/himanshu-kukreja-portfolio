import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getAllStories } from "@/lib/stories";
import { buildWelcomeEmailHtml } from "@/lib/emailTemplate";
import { sendWelcomeEmail } from "@/lib/mailer";

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

  // Send welcome email synchronously (but with timeout) for serverless reliability
  let welcomeEmailSent = false;
  console.log(`[WELCOME EMAIL] Starting welcome email for ${email}`);
  
  try {
    const all = await getAllStories();
    const latest = all.slice(0, 5);
    const html = buildWelcomeEmailHtml(latest, { recipientEmail: email });
    
    console.log(`[WELCOME EMAIL] About to send email to ${email}`);
    
    // Use Promise.race to timeout the email send after 25 seconds
    await Promise.race([
      sendWelcomeEmail(email, "🎉 Welcome to Engineering Stories!", html),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email timeout after 25s')), 25000)
      )
    ]);
    
    welcomeEmailSent = true;
    console.log(`[WELCOME EMAIL] Successfully sent to ${email}`);
    
    await supabase.from("newsletter_logs").insert({ 
      email, 
      status: "sent", 
      type: "welcome", 
      detail: "Welcome email sent upon subscription",
      story_slugs: latest.map((s) => s.slug) 
    });
    
    console.log(`[WELCOME EMAIL] Log entry created for ${email}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[WELCOME EMAIL] Failed for ${email}:`, msg);
    
    await supabase.from("newsletter_logs").insert({ 
      email, 
      status: "error", 
      type: "welcome", 
      detail: `Welcome email failed: ${msg}` 
    });
    
    console.log(`[WELCOME EMAIL] Error log entry created for ${email}`);
  }

  return NextResponse.json({ 
    ok: true, 
    message: "You're subscribed!",
    welcomeEmailSent 
  });
}
