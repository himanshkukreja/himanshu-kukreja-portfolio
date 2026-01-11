import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getWelcomeEmail } from "@/lib/email-templates";

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
async function sendWelcomeEmail(email: string, name: string) {
  console.log("[WELCOME EMAIL] 📨 sendWelcomeEmail called for:", email);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const { subject, html } = getWelcomeEmail(email, siteUrl);

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
        from: smtpFrom || "Himanshu <noreply@yourdomain.com>",
        to: email,
        subject,
        html,
      });

      console.log(`[WELCOME EMAIL] ✅ Sent via SMTP to: ${email}`);
      return;
    } catch (error) {
      console.error(`[WELCOME EMAIL] ❌ SMTP error:`, error);
      throw error;
    }
  }

  // Fallback: Console log (for development)
  console.log(`[WELCOME EMAIL] 📧 Would send to: ${email} (${name})`);
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
    const { userId } = await request.json();
    console.log("[WELCOME EMAIL API] User ID:", userId);

    if (!userId) {
      console.log("[WELCOME EMAIL API] ❌ No user ID provided");
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    // Get user from auth.users to check account creation time
    console.log("[WELCOME EMAIL API] 📧 Fetching user details...");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !user) {
      console.error("[WELCOME EMAIL API] ❌ Error fetching user:", userError);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get user profile for display name
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

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
      await sendWelcomeEmail(user.email!, profile?.full_name || user.email!);
      console.log("[WELCOME EMAIL API] ✅ Welcome email sent successfully");
    } catch (emailError) {
      console.error(`[WELCOME EMAIL API] ❌ Failed to send email:`, emailError);
      // Don't throw - the user is authenticated successfully, email is a bonus
    }

    return NextResponse.json({
      message: "Welcome email sent successfully",
      email: user.email,
      success: true,
      isNewAccount: true,
    });
  } catch (error: any) {
    console.error("[WELCOME EMAIL API] ❌ Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
