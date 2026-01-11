# Supabase Email Template Configuration

## Problem
By default, Supabase sends a magic link instead of an OTP code, and the email template is very basic.

## Solution
Configure custom email templates in Supabase Dashboard to send OTP codes with a beautiful branded template.

---

## Step 1: Access Email Templates in Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Find the **Magic Link** template (this is used for OTP emails)

---

## Step 2: Custom OTP Email Template

Replace the default Magic Link template with this custom template:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0a; color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #0a0a0a;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; border-collapse: collapse; background: linear-gradient(to bottom, #1a1a1a, #0a0a0a); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);">

          <!-- Top Gradient Line -->
          <tr>
            <td style="height: 4px; background: linear-gradient(to right, #3b82f6, #8b5cf6, #3b82f6);"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; background: linear-gradient(to right, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                Welcome to Your Learning Journey
              </h1>
              <p style="margin: 8px 0 0; color: rgba(255, 255, 255, 0.6); font-size: 14px;">
                Verify your email to get started
              </p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 24px; color: rgba(255, 255, 255, 0.8); font-size: 16px; line-height: 1.6;">
                Hi there! 👋
              </p>
              <p style="margin: 0 0 32px; color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.6;">
                Use the verification code below to complete your sign-in. This code will expire in <strong style="color: #60a5fa;">10 minutes</strong>.
              </p>

              <!-- OTP Code Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 0 0 32px;">
                <tr>
                  <td style="background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 12px; padding: 24px; text-align: center;">
                    <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; font-weight: 600;">
                      Your Verification Code
                    </div>
                    <div style="font-size: 42px; font-weight: 700; letter-spacing: 8px; color: #ffffff; font-family: 'Courier New', monospace;">
                      {{ .Token }}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Benefits Section -->
              <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 16px; color: rgba(255, 255, 255, 0.8); font-size: 14px; font-weight: 600;">
                  ✨ What you'll get:
                </p>
                <ul style="margin: 0; padding: 0 0 0 20px; color: rgba(255, 255, 255, 0.7); font-size: 14px; line-height: 1.8;">
                  <li>Track your learning progress and earn streaks</li>
                  <li>Bookmark lessons and take personal notes</li>
                  <li>Access to exclusive learning resources</li>
                  <li>100% free, no credit card required</li>
                </ul>
              </div>

              <p style="margin: 0 0 8px; color: rgba(255, 255, 255, 0.5); font-size: 13px; line-height: 1.6;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background: rgba(0, 0, 0, 0.3); border-top: 1px solid rgba(255, 255, 255, 0.1); text-align: center;">
              <p style="margin: 0 0 8px; color: rgba(255, 255, 255, 0.4); font-size: 12px;">
                This email was sent to <strong>{{ .Email }}</strong>
              </p>
              <p style="margin: 0; color: rgba(255, 255, 255, 0.3); font-size: 11px;">
                © 2025 Himanshu Kukreja. All rights reserved.
              </p>
            </td>
          </tr>

          <!-- Bottom Gradient -->
          <tr>
            <td style="height: 2px; background: linear-gradient(to right, transparent, rgba(96, 165, 250, 0.5), transparent);"></td>
          </tr>
        </table>

        <!-- Security Notice -->
        <table role="presentation" style="max-width: 600px; width: 100%; margin-top: 20px;">
          <tr>
            <td style="text-align: center; padding: 0 20px;">
              <p style="margin: 0; color: rgba(255, 255, 255, 0.3); font-size: 11px; line-height: 1.5;">
                🔒 This is an automated message. Never share your verification code with anyone.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

---

## Step 3: Configure Template Settings

In the Email Templates section, make sure to:

1. **Template Type**: Magic Link (used for OTP)
2. **Subject Line**: `Your verification code is {{ .Token }}`
3. **Content**: Paste the HTML template above
4. Click **Save**

---

## Step 4: Enable OTP in Auth Settings

1. Go to **Authentication** → **Providers** → **Email**
2. Make sure **Enable Email Provider** is ON
3. Under **Email Auth Settings**:
   - ✅ Enable **Confirm email**
   - ✅ Enable **Secure email change**
   - Set **OTP Expiry** to 600 seconds (10 minutes)
4. Click **Save**

---

## Important Notes

### Template Variables Available:
- `{{ .Token }}` - The 6-digit OTP code
- `{{ .Email }}` - The user's email address
- `{{ .SiteURL }}` - Your site URL (from Supabase settings)
- `{{ .ConfirmationURL }}` - Magic link URL (we're not using this)

### Testing:
1. After saving the template, test it by triggering a sign-in from your app
2. Check your email inbox for the new branded template with the OTP code
3. The code should be displayed as a large, easy-to-read number

### Fallback:
If you want to keep the magic link as a fallback option, you can add this to the email:

```html
<p style="text-align: center; margin-top: 24px;">
  <a href="{{ .ConfirmationURL }}" style="color: #60a5fa; text-decoration: none; font-size: 13px;">
    Or click here to verify instantly →
  </a>
</p>
```

---

## Additional Templates to Update

You may also want to update these templates for a consistent experience:

### 1. **Confirm Signup** Template
Used when users sign up for the first time.

### 2. **Invite User** Template
Used when inviting users to your platform.

### 3. **Reset Password** Template
Used for password reset requests.

All templates should follow the same dark theme design with the gradient accent and clean layout.

---

## Troubleshooting

### Issue: Still receiving magic links instead of OTP
**Solution**: Make sure you're using `signInWithOtp()` in your code (which you already are), not `signInWithMagicLink()`.

### Issue: Email not being received
**Solution**:
- Check Supabase email rate limits
- Check spam folder
- Verify email provider settings in Supabase
- Check Supabase logs under **Logs** → **Auth Logs**

### Issue: OTP not working
**Solution**:
- Verify the OTP hasn't expired (10 minutes default)
- Check that `verifyOtp()` is using `type: "email"` (which it is in your code)
- Check browser console for errors

---

## Preview

The email will look like this:
- **Dark theme** with gradient accents (blue → purple)
- **Large OTP code** in a highlighted box
- **Benefits section** showing value proposition
- **Professional footer** with branding
- **Security notice** at the bottom
- **Fully responsive** for mobile devices

The template matches your portfolio's dark theme with blue/purple gradients! 🎨
