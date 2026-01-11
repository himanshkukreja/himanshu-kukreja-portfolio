# 🐛 Debug Welcome Email Issue

## Current Symptoms
- ✅ API endpoint `/api/send-welcome-email` returns `200 OK`
- ❌ No welcome email received
- ❌ Happens on every login (both Google OAuth and Email OTP)
- ❌ No logs showing email sending attempts

## Most Likely Causes

### Cause 1: Database Migration Not Run ⚠️

The `welcome_email_sent` column doesn't exist in `user_profiles` table, causing the API to fail silently.

**How to Check:**
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/jnvxizdhpecnydnvhell
2. Go to **Table Editor** → `user_profiles`
3. Check if column `welcome_email_sent` exists

**How to Fix:**
1. Go to **SQL Editor** in Supabase
2. Copy and paste the entire contents of `QUICK_FIX_WELCOME_EMAIL.sql`
3. Click **Run**
4. Verify the column exists

---

### Cause 2: All Users Marked as welcome_email_sent = TRUE

The column exists, but all existing users already have `welcome_email_sent = TRUE`, so the API skips sending.

**How to Check:**
1. Go to Supabase **SQL Editor**
2. Run this query:
   ```sql
   SELECT id, full_name, welcome_email_sent, created_at
   FROM public.user_profiles
   ORDER BY created_at DESC
   LIMIT 10;
   ```
3. Check if `welcome_email_sent` is `TRUE` for your test account

**How to Fix (For Testing):**
1. Run this SQL to reset YOUR account only:
   ```sql
   UPDATE public.user_profiles
   SET welcome_email_sent = FALSE
   WHERE id = 'YOUR_USER_ID_HERE';
   ```
2. Sign out and sign in again
3. Check server logs for welcome email logs

---

### Cause 3: SMTP Environment Variables Not Loaded

The SMTP settings in `.env` are not being loaded by Next.js.

**How to Check:**
Look at the server logs after authentication. You should see:
```
[WELCOME EMAIL] 🔧 SMTP Configuration: {
  host: 'email-smtp.ap-south-1.amazonaws.com',
  port: '465',
  user: '***LSO6',
  from: 'Himanshu <no-reply@himanshukukreja.in>',
  configured: true
}
```

If you see `configured: false`, the env vars aren't loading.

**How to Fix:**
1. Restart the dev server: `Ctrl+C` then `npm run dev`
2. Verify `.env` file is in the project root (same level as `package.json`)

---

## 🔍 Step-by-Step Debugging

### Step 1: Enable Full Logging (Already Done ✅)

The code now has comprehensive logging. After authentication, you should see logs like:

```
[WELCOME EMAIL API] 🔵 Request received
[WELCOME EMAIL API] User ID: xxx-xxx-xxx
[WELCOME EMAIL API] 🔍 Checking if welcome email already sent...
[WELCOME EMAIL API] Profile found: { fullName: 'John', welcomeEmailSent: false }
[WELCOME EMAIL API] 📧 Fetching user email...
[WELCOME EMAIL API] User email: john@example.com
[WELCOME EMAIL API] 📬 Attempting to send welcome email...
[WELCOME EMAIL] 📨 sendWelcomeEmail called for: john@example.com
[WELCOME EMAIL] 🔧 SMTP Configuration: { ... }
[WELCOME EMAIL] ✅ SMTP is configured, attempting to send...
[WELCOME EMAIL] ✅ Sent via SMTP to: john@example.com
[WELCOME EMAIL API] ✅ Welcome email sent successfully
[WELCOME EMAIL API] 💾 Marking welcome_email_sent as true...
[WELCOME EMAIL API] ✅ Profile updated successfully
```

### Step 2: Test Authentication Flow

1. **Sign Out** (if signed in)
2. **Open Terminal** where `npm run dev` is running
3. **Clear the terminal output** (Cmd+K on Mac)
4. **Sign in** with Google or Email OTP
5. **Watch the logs closely**

### Step 3: Identify the Issue

**Scenario A: No API logs at all**
```
POST /api/send-welcome-email 200 in 175ms
```
(But no `[WELCOME EMAIL API]` logs)

→ **Problem**: API is being called but failing before logs execute
→ **Fix**: Check if API route file is being read correctly

**Scenario B: API stops at "already sent"**
```
[WELCOME EMAIL API] 🔵 Request received
[WELCOME EMAIL API] User ID: xxx
[WELCOME EMAIL API] ⏭️ Welcome email already sent, skipping
```

→ **Problem**: `welcome_email_sent` is `TRUE` for this user
→ **Fix**: Run SQL to reset: `UPDATE user_profiles SET welcome_email_sent = FALSE WHERE id = 'xxx'`

**Scenario C: API stops at "Profile not found"**
```
[WELCOME EMAIL API] 🔵 Request received
[WELCOME EMAIL API] ❌ Error fetching profile: { ... }
```

→ **Problem**: Database column doesn't exist or query failed
→ **Fix**: Run `QUICK_FIX_WELCOME_EMAIL.sql` migration

**Scenario D: SMTP not configured**
```
[WELCOME EMAIL] 🔧 SMTP Configuration: { configured: false }
[WELCOME EMAIL] ⚠️ No SMTP configured
```

→ **Problem**: Environment variables not loaded
→ **Fix**: Restart dev server, verify `.env` file location

---

## 🚨 Quick Test (Do This Now)

1. **Check if migration is needed:**
   ```sql
   -- Run in Supabase SQL Editor
   SELECT column_name, data_type, column_default
   FROM information_schema.columns
   WHERE table_name = 'user_profiles'
   AND column_name = 'welcome_email_sent';
   ```

   **Expected Result:** 1 row showing the column exists
   **If 0 rows:** Run `QUICK_FIX_WELCOME_EMAIL.sql` immediately

2. **Check your user's status:**
   ```sql
   -- Replace with your actual email
   SELECT
     up.id,
     up.full_name,
     up.welcome_email_sent,
     au.email
   FROM public.user_profiles up
   JOIN auth.users au ON au.id = up.id
   WHERE au.email = 'your-email@example.com';
   ```

   **If welcome_email_sent = TRUE:** Reset it:
   ```sql
   UPDATE public.user_profiles
   SET welcome_email_sent = FALSE
   WHERE id = 'your-user-id-from-above-query';
   ```

3. **Test Again:**
   - Sign out completely
   - Clear browser cache or use incognito
   - Sign in again
   - **Watch the terminal logs carefully**

---

## 📋 Checklist Before Testing

- [ ] Database migration run (`QUICK_FIX_WELCOME_EMAIL.sql`)
- [ ] Column `welcome_email_sent` exists in `user_profiles` table
- [ ] Test user has `welcome_email_sent = FALSE`
- [ ] `.env` file is in project root
- [ ] Dev server restarted after any `.env` changes
- [ ] Terminal cleared before test (Cmd+K)
- [ ] Ready to watch logs during authentication

---

## 🎯 Expected Successful Flow

When everything is working, you should see:

**1. Terminal Logs (in order):**
```
[WELCOME EMAIL API] 🔵 Request received
[WELCOME EMAIL API] User ID: abc-123
[WELCOME EMAIL API] 🔍 Checking if welcome email already sent...
[WELCOME EMAIL API] Profile found: { fullName: 'John', welcomeEmailSent: false }
[WELCOME EMAIL API] 📧 Fetching user email...
[WELCOME EMAIL API] User email: john@example.com
[WELCOME EMAIL API] 📬 Attempting to send welcome email...
[WELCOME EMAIL] 📨 sendWelcomeEmail called for: john@example.com
[WELCOME EMAIL] 🔧 SMTP Configuration: { host: '...', configured: true }
[WELCOME EMAIL] ✅ SMTP is configured, attempting to send...
[WELCOME EMAIL] ✅ Sent via SMTP to: john@example.com
[WELCOME EMAIL API] ✅ Welcome email sent successfully
[WELCOME EMAIL API] 💾 Marking welcome_email_sent as true...
[WELCOME EMAIL API] ✅ Profile updated successfully
POST /api/send-welcome-email 200 in 2000ms
```

**2. Email Received:**
- Dark-themed welcome email
- Subject: "Welcome to Your System Design Journey 🚀"
- Content shows 76 lessons, 10 weeks, etc.

**3. Subsequent Logins:**
```
[WELCOME EMAIL API] ⏭️ Welcome email already sent, skipping
POST /api/send-welcome-email 200 in 50ms
```

---

## 💡 Pro Tips

1. **Always check terminal logs** - They tell you exactly where it's failing
2. **Test with a NEW email** - Create a fresh Google/email account for testing
3. **Check Supabase Table Editor** - Verify data is being created/updated
4. **Check AWS SES Console** - Verify emails are being sent (if SMTP is working)
5. **Use incognito mode** - Prevents auth state caching issues

---

## Still Not Working?

Copy and paste:
1. **All terminal logs** from authentication attempt
2. **SQL query result** from checking `welcome_email_sent` column
3. **SQL query result** from checking your user's status

This will help identify the exact issue! 🔍
