import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { welcomeEmail } from "@/lib/email/welcome";

// Server-side Supabase client with service role
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Need service role to update profiles
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/**
 * Send welcome email using configured email service
 * Uses SMTP (AWS SES) configured in .env
 */
async function sendWelcomeEmail(email: string, name: string | null) {
  console.log("[WELCOME EMAIL] 📨 sendWelcomeEmail called for:", email);

  const { subject, html, text, replyTo, headers } = welcomeEmail({ email, name });

  // Check if SMTP is configured
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  console.log("[WELCOME EMAIL] 🔧 SMTP Configuration:", {
    host: smtpHost,
    port: smtpPort,
    user: smtpUser ? "***" + smtpUser.slice(-4) : "not set",
    from: smtpFrom,
    configured: !!(smtpHost && smtpPort && smtpUser && smtpPass)
  });

  if (smtpHost && smtpPort && smtpUser && smtpPass) {
    console.log("[WELCOME EMAIL] ✅ SMTP is configured, attempting to send...");
    // Use SMTP to send email
    try {
      const nodemailer = await import("nodemailer");

      const transporter = nodemailer.default.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort),
        secure: parseInt(smtpPort) === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
      });

      await transporter.sendMail({
        from: smtpFrom || `Himanshu Kukreja <${smtpUser}>`,
        to: email,
        replyTo,
        subject,
        html,
        text,
        headers,
      });

      console.log(`[WELCOME EMAIL] ✅ Sent via SMTP to: ${email}`);
      return;
    } catch (error) {
      console.error(`[WELCOME EMAIL] ❌ SMTP error:`, error);
      throw error;
    }
  }

  // Fallback: Console log (for development)
  console.log(`[WELCOME EMAIL] 📧 Would send to: ${email} (${name || "no name"})`);
  console.log(`[WELCOME EMAIL] Subject: ${subject}`);
  console.log(`[WELCOME EMAIL] ⚠️  No SMTP configured - email not actually sent`);
  console.log(`[WELCOME EMAIL] 💡 Add SMTP settings to .env to send real emails`);
}

/**
 * API Route to send welcome email on first successful authentication
 * Called from AuthContext after user successfully authenticates
 */
export async function POST(request: NextRequest) {
  try {
    console.log("[WELCOME EMAIL API] 🔵 Request received");
    // The caller is whoever owns the session token — never a user id from the body.
    const auth = request.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    // Get user profile for display name
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name, welcome_email_sent")
      .eq("id", userId)
      .single();

    if (profile?.welcome_email_sent) {
      return NextResponse.json({ message: "Existing user - welcome email not sent", alreadySent: true });
    }

    // Check if account was created recently (within last 60 seconds = first signup)
    const accountCreatedAt = new Date(user.created_at);
    const now = new Date();
    const secondsSinceCreation = (now.getTime() - accountCreatedAt.getTime()) / 1000;
    const isNewAccount = secondsSinceCreation < 60;

    console.log("[WELCOME EMAIL API] Account age:", {
      createdAt: accountCreatedAt.toISOString(),
      secondsOld: Math.floor(secondsSinceCreation),
      isNewAccount: isNewAccount
    });

    // Only send welcome email if account is less than 60 seconds old (first signup)
    if (!isNewAccount) {
      console.log("[WELCOME EMAIL API] ⏭️  Existing account (created more than 60s ago), skipping welcome email");
      return NextResponse.json({
        message: "Existing user - welcome email not sent",
        alreadySent: true,
      });
    }

    console.log("[WELCOME EMAIL API] ✨ NEW account detected! Sending welcome email...");

    // Send welcome email
    console.log("[WELCOME EMAIL API] 📬 Attempting to send welcome email...");
    try {
      // Greeting name: the profile first, then the Google account metadata; none → neutral "Hi,".
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const metaName = [meta.full_name, meta.name, meta.given_name].find((v): v is string => typeof v === "string" && v.trim().length > 0);
      await sendWelcomeEmail(user.email!, profile?.full_name || metaName || null);
      console.log("[WELCOME EMAIL API] ✅ Welcome email sent successfully");
      // once per account, even if the client calls again
      await supabaseAdmin.from("user_profiles").update({ welcome_email_sent: true }).eq("id", userId);
    } catch (emailError) {
      console.error(`[WELCOME EMAIL API] ❌ Failed to send email:`, emailError);
      // Don't throw - the user is authenticated successfully, email is a bonus
    }

    return NextResponse.json({
      message: "Welcome email sent successfully",
      success: true,
      isNewAccount: true,
    });
  } catch (error) {
    console.error("[WELCOME EMAIL API] ❌ Error:", error);
    return NextResponse.json(
      { error: (error instanceof Error && error.message) || "Internal server error" },
      { status: 500 }
    );
  }
}
