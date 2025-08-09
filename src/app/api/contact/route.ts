import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { sendRawEmail } from "@/lib/mailer";
import { buildContactNotificationHtml, buildContactReplyHtml } from "@/lib/emailTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

function getIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  return (xf || "").split(",")[0].trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ 
        error: "Invalid form data",
        details: parsed.error.issues 
      }, { status: 400 });
    }

    const { name, email, message } = parsed.data;
    const ip = getIp(req);

    // Store in database
    const { data: queryData, error: dbError } = await supabase
      .from("contact_queries")
      .insert({
        name,
        email,
        message,
        ip,
        status: "new"
      })
      .select("id")
      .single();

    if (dbError || !queryData) {
      console.error("Failed to store contact query:", dbError);
      return NextResponse.json({ error: "Failed to submit message" }, { status: 500 });
    }

    const queryId = queryData.id;

    // Send notification to you and auto-reply to user (parallel)
    try {
      await Promise.allSettled([
        // Send notification to your personal email
        sendRawEmail(
          "kukreja.him@gmail.com",
          `🔔 New Contact Query from ${name}`,
          buildContactNotificationHtml(name, email, message, queryId)
        ),
        // Send auto-reply to the user
        sendRawEmail(
          email,
          "Thank you for reaching out - Himanshu Kukreja",
          buildContactReplyHtml(name)
        )
      ]);
    } catch (emailError) {
      console.error("Email sending failed:", emailError);
      // Don't fail the API if emails fail - query is already stored
    }

    return NextResponse.json({ 
      ok: true, 
      message: "Thank you for your message! I'll get back to you soon.",
      queryId 
    });

  } catch (error) {
    console.error("Contact API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
