# 🚨 IMMEDIATE FIX - Stop Duplicate Welcome Emails

## The Problem
You're getting welcome emails on **every** login because the `welcome_email_sent` column doesn't exist in your database yet.

## The Fix (2 minutes)

### Step 1: Run This SQL in Supabase

1. Open **Supabase Dashboard**
2. Go to **SQL Editor**
3. Copy and paste this entire SQL:

```sql
-- Add the tracking column
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE;

-- Mark existing users as already sent (so they don't get it again)
UPDATE public.user_profiles
SET welcome_email_sent = TRUE
WHERE created_at < NOW();

-- Verify it worked
SELECT
  id,
  full_name,
  welcome_email_sent,
  created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 10;
```

4. Click **Run**
5. You should see a table showing users with `welcome_email_sent` = `true`

### Step 2: Test

1. Sign out
2. Sign in again
3. Check browser console - you should see:
   ```
   [AuthContext] Welcome email already sent (returning user)
   ```
4. No welcome email sent! ✅

---

## How It Works Now

```
User signs in
     ↓
AuthContext fires SIGNED_IN event
     ↓
Calls /api/send-welcome-email
     ↓
API checks: welcome_email_sent = true?
     ├─ YES → Skip (log "already sent")
     └─ NO  → Send email + mark as true
```

---

## Current Email Flow

### First Time User (Email OTP)
```
1. User enters email
2. Receives OTP email (Supabase Magic Link template)
3. Enters OTP code
4. Successfully authenticated
5. welcome_email_sent = FALSE → Send welcome email
6. Mark welcome_email_sent = TRUE
```

### Returning User
```
1. User enters email
2. Receives OTP email
3. Enters OTP code
4. Successfully authenticated
5. welcome_email_sent = TRUE → Skip (already sent)
```

### First Time User (Google OAuth)
```
1. User clicks "Continue with Google"
2. Google OAuth consent
3. Successfully authenticated
4. welcome_email_sent = FALSE → Send welcome email
5. Mark welcome_email_sent = TRUE
```

---

## What Each Email Does

### OTP/Magic Link Email
- **When:** Every time user requests to sign in
- **Template:** `SUPABASE_EMAIL_TEMPLATE_FULL.html`
- **Subject:** `Your verification code is {{ .Token }}`
- **Contains:** 6-digit OTP + magic link fallback
- **Managed by:** Supabase (automatic)

### Welcome Email
- **When:** Only first successful authentication
- **Template:** `SUPABASE_WELCOME_EMAIL_TEMPLATE.html`
- **Subject:** `Welcome to System Design Mastery! 🚀`
- **Contains:** Course overview, getting started guide
- **Managed by:** Your app (`/api/send-welcome-email`)

---

## Verify It's Working

### Check Database
```sql
-- In Supabase SQL Editor
SELECT
  up.id,
  up.full_name,
  up.welcome_email_sent,
  au.email,
  up.created_at
FROM public.user_profiles up
JOIN auth.users au ON up.id = au.id
ORDER BY up.created_at DESC;
```

You should see:
- `welcome_email_sent` = `TRUE` for all existing users
- `welcome_email_sent` = `FALSE` → `TRUE` after first login for new users

### Check Browser Console
After signing in, look for:
```
[AuthContext] Auth state changed: SIGNED_IN
[AuthContext] Welcome email already sent (returning user)
```

OR for new users:
```
[AuthContext] Auth state changed: SIGNED_IN
[WELCOME EMAIL] Should send to: user@example.com
[AuthContext] Welcome email sent successfully
```

---

## Next Steps (Optional - To Actually Send Emails)

Right now, the welcome email is just **logged to console**. To actually send it:

### Option 1: Resend (Easiest - Free Tier)

```bash
npm install resend
```

Add to `.env.local`:
```
RESEND_API_KEY=re_your_key_here
```

Update `/api/send-welcome-email/route.ts`:
```typescript
import { Resend } from 'resend';
import fs from 'fs';

const resend = new Resend(process.env.RESEND_API_KEY);

// Load template
const html = fs.readFileSync('./SUPABASE_WELCOME_EMAIL_TEMPLATE.html', 'utf-8')
  .replace(/{{ \.Email }}/g, user.email)
  .replace(/{{ \.SiteURL }}/g, process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

await resend.emails.send({
  from: 'Himanshu <noreply@yourdomain.com>',
  to: user.email,
  subject: 'Welcome to System Design Mastery! 🚀',
  html,
});
```

---

## Summary

✅ **Run the SQL above** → Adds `welcome_email_sent` column
✅ **Existing users marked as sent** → Won't get duplicate emails
✅ **New users get welcome email once** → On first successful auth
✅ **Returning users skip welcome email** → Flag checked before sending

That's it! The duplicate email issue is fixed. 🎉
