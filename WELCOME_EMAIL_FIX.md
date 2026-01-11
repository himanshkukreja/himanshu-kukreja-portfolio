# Welcome Email Fix - Proper Timing

## Problem

When using OTP/Magic Link authentication:
- ❌ User got **ONLY welcome email**, not the OTP email
- ❌ OR user got welcome email **BEFORE** verifying OTP
- ❌ Timing was wrong - welcome email sent too early

## Root Cause

Supabase's "Confirm Signup" email template fires when `auth.users` row is created, which happens **before** email verification. For OTP flow:

```
User enters email
     ↓
auth.users created (unverified) ← Supabase sends "Confirm Signup" (welcome email)
     ↓
OTP email sent ← This is what user should get FIRST
     ↓
User verifies OTP
     ↓
User is authenticated
```

The welcome email was competing with or replacing the OTP email!

---

## Solution

### Two-Email Flow (Correct):

1. **OTP/Magic Link Email** (always sent - uses Magic Link template)
2. **Welcome Email** (sent only after first successful authentication)

### Implementation:

**Application-Level Detection** (most reliable):
- ✅ AuthContext detects `SIGNED_IN` event
- ✅ Calls API route to send welcome email
- ✅ API checks if welcome email already sent (via `welcome_email_sent` flag)
- ✅ Only sends if first time + marks flag as sent

---

## Files Changed

### 1. API Route for Welcome Email
**File**: `src/app/api/send-welcome-email/route.ts`

**What it does:**
```typescript
POST /api/send-welcome-email
{
  "userId": "uuid-here"
}

→ Checks welcome_email_sent flag
→ If false: Send email + mark as true
→ If true: Skip (already sent)
```

**Current state:** Logs to console (TODO: integrate actual email service)

### 2. AuthContext - Detects First Login
**File**: `src/contexts/AuthContext.tsx`

**Added:**
```typescript
supabaseClient.auth.onAuthStateChange(async (event, session) => {
  if (event === "SIGNED_IN") {
    // Call API to send welcome email (only if first time)
    await fetch("/api/send-welcome-email", {
      method: "POST",
      body: JSON.stringify({ userId: session.user.id }),
    });
  }
});
```

**Why this works:**
- `SIGNED_IN` event fires **AFTER** successful OTP verification
- Fires **AFTER** successful OAuth callback
- Perfect timing for welcome email

### 3. Database Schema
**File**: `supabase/migrations/20250109_welcome_email_on_first_login.sql`

**Added column:**
```sql
ALTER TABLE public.user_profiles
ADD COLUMN welcome_email_sent BOOLEAN DEFAULT FALSE;
```

**Purpose:** Track if welcome email was sent to prevent duplicates

---

## Email Flow Now

### Email OTP Flow ✅

```
User enters email
     ↓
[1] OTP Email sent (Magic Link template)
     ↓
User receives "Your verification code is 123456"
     ↓
User enters code → Verifies
     ↓
SIGNED_IN event fires
     ↓
AuthContext calls /api/send-welcome-email
     ↓
[2] Welcome Email sent (if first time)
     ↓
User receives "Welcome to System Design Mastery! 🚀"
```

### Google OAuth Flow ✅

```
User clicks "Continue with Google"
     ↓
Google OAuth consent
     ↓
Callback → User authenticated
     ↓
SIGNED_IN event fires
     ↓
AuthContext calls /api/send-welcome-email
     ↓
[1] Welcome Email sent (if first time)
     ↓
User receives "Welcome to System Design Mastery! 🚀"
```

---

## Email Templates in Supabase

### Magic Link Template (OTP Email)
**Used for:** Email OTP authentication
**When sent:** When user requests OTP
**File:** `SUPABASE_EMAIL_TEMPLATE_FULL.html`
**Subject:** `Your verification code is {{ .Token }}`

**Variables:**
- `{{ .Token }}` - 6-digit OTP code
- `{{ .Email }}` - User's email
- `{{ .ConfirmationURL }}` - Magic link fallback

### Confirm Signup Template (DISABLE THIS)
**Problem:** Sends too early (before verification)
**Solution:** Leave it empty or use a generic message

**Recommended approach:**
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Find "Confirm Signup" template
3. Either:
   - Option A: Leave it blank (disable)
   - Option B: Use a simple "Please verify your email" message
   - Option C: Use same template as Magic Link

**Why:** We're handling welcome email in application code now

### Welcome Email (Application-Level)
**Used for:** First successful authentication
**When sent:** After `SIGNED_IN` event
**File:** `SUPABASE_WELCOME_EMAIL_TEMPLATE.html`
**Subject:** `Welcome to System Design Mastery! 🚀`

**Sent via:** `/api/send-welcome-email` route

---

## Implementation TODO

### Current State
✅ Database schema updated (welcome_email_sent column)
✅ API route created
✅ AuthContext integrated
✅ Email templates ready

### Next Steps

**1. Integrate Email Service**

Choose one:

**Option A: Resend (Recommended - Simple & Free tier)**
```bash
npm install resend
```

```typescript
// In /api/send-welcome-email/route.ts
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

// Load template
const templatePath = path.join(process.cwd(), 'SUPABASE_WELCOME_EMAIL_TEMPLATE.html');
const htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

// Replace variables
const html = htmlTemplate
  .replace(/{{ \.Email }}/g, user.email)
  .replace(/{{ \.SiteURL }}/g, process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

await resend.emails.send({
  from: 'Himanshu <noreply@yourdomain.com>',
  to: user.email,
  subject: 'Welcome to System Design Mastery! 🚀',
  html,
});
```

**Option B: SendGrid**
```bash
npm install @sendgrid/mail
```

**Option C: Supabase Edge Function + Resend**
- More complex but keeps email logic separate
- Good for scalability

**2. Environment Variables**

Add to `.env.local`:
```bash
RESEND_API_KEY=re_your_key_here
# OR
SENDGRID_API_KEY=SG.your_key_here
```

**3. Database Migration**

Run in Supabase SQL Editor:
```sql
-- File: supabase/migrations/20250109_welcome_email_on_first_login.sql
-- (Copy entire migration)
```

**4. Test End-to-End**

```
Test Plan:
1. Sign up with new email → Should get OTP email
2. Enter OTP → Should authenticate
3. Check console → "Welcome email sent successfully"
4. Check email → Should receive welcome email
5. Sign out and sign in again → No second welcome email
6. Try with Google OAuth → Welcome email on first login only
```

---

## Debugging

### Check if welcome email flag is working

```sql
-- In Supabase SQL Editor
SELECT
  id,
  full_name,
  email,
  welcome_email_sent,
  created_at
FROM user_profiles
JOIN auth.users ON user_profiles.id = auth.users.id
ORDER BY created_at DESC;
```

### Check API route logs

```bash
# In your terminal (where npm run dev is running)
# Look for:
[WELCOME EMAIL] Should send to: user@example.com
[AuthContext] Welcome email sent successfully
# OR
[AuthContext] Welcome email already sent (returning user)
```

### Check Supabase Auth Events

```sql
-- In Supabase SQL Editor
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  updated_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;
```

---

## Benefits of This Approach

✅ **Reliable Timing**
- Welcome email ALWAYS sent after successful auth
- Never interferes with OTP email

✅ **Works for All Auth Methods**
- Email OTP ✓
- Magic Link ✓
- Google OAuth ✓
- Any future OAuth providers ✓

✅ **No Duplicates**
- `welcome_email_sent` flag prevents multiple sends
- Checked before sending every time

✅ **Application Control**
- Full control over email content and timing
- Easy to add A/B testing, personalization, etc.
- Can add analytics tracking

✅ **Non-Blocking**
- If email sending fails, user still gets authenticated
- Error handling doesn't break auth flow

---

## Common Issues & Solutions

### Issue: Welcome email never sent
**Check:**
1. Is `/api/send-welcome-email` route accessible?
2. Check browser console for errors
3. Check server logs for API errors
4. Verify `SIGNED_IN` event is firing

**Fix:**
```bash
# Test API route directly
curl -X POST http://localhost:3000/api/send-welcome-email \
  -H "Content-Type: application/json" \
  -d '{"userId":"your-uuid-here"}'
```

### Issue: Welcome email sent multiple times
**Check:**
```sql
SELECT welcome_email_sent FROM user_profiles WHERE id = 'user-id';
```

**Fix:** Ensure API route checks flag before sending

### Issue: OTP email not received
**Check:**
1. Supabase Email Settings enabled?
2. Magic Link template configured?
3. Check spam folder
4. Verify email in Supabase Auth Logs

**Not related to:** Welcome email integration (separate systems)

---

## Summary

The welcome email is now properly timed:
1. **OTP email** sent immediately when requested (Supabase handles this)
2. **Welcome email** sent only after first successful authentication (application handles this)

This matches how modern apps like Notion, Slack, and Linear handle onboarding emails - they wait until the user has actually completed authentication before sending a welcome message.

Next step: Integrate an actual email service (Resend recommended) to actually send the welcome emails instead of just logging them. 📧✨
