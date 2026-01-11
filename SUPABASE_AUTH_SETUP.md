# Supabase Authentication Setup Guide

This guide walks you through setting up authentication for your learning platform with **Email OTP** and **Google OAuth**.

---

## 📋 Prerequisites

- Supabase project already created
- Environment variables configured (`.env`)
- Google Cloud Console account (for OAuth)

---

## 🗄️ Step 1: Run Database Migrations

First, apply the database schema for user profiles and learning progress.

### Option A: Using Supabase CLI (Recommended)

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### Option B: Using Supabase Dashboard

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Copy and paste the entire contents of `/supabase/migrations/20250109_auth_and_learning.sql`
6. Click **Run** (or press `Ctrl+Enter`)

**Verify the migration:**
```sql
-- Run this query to verify tables were created
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'user_profiles',
  'learning_progress',
  'bookmarks',
  'content_notes',
  'learning_streaks'
);
```

You should see all 5 tables listed.

---

## 🔐 Step 2: Configure Email OTP Authentication

Supabase supports magic link authentication via email OTP out of the box.

### 2.1 Enable Email Provider

1. Go to **Authentication** → **Providers** in Supabase Dashboard
2. Find **Email** and ensure it's **enabled**
3. Configure the following settings:

**Email Settings:**
```
✅ Enable Email provider
✅ Confirm email (optional - recommended for production)
✅ Secure email change (optional - recommended for production)
```

### 2.2 Customize Email Templates (Optional but Recommended)

1. Go to **Authentication** → **Email Templates**
2. Customize the **Magic Link** template:

**Subject:** `Your verification code for Himanshu's Learning Platform`

**Body (HTML):**
```html
<h2>Welcome to System Design Mastery!</h2>
<p>Your verification code is:</p>
<h1 style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #3b82f6;">{{ .Token }}</h1>
<p>This code expires in 60 minutes.</p>
<p>If you didn't request this code, you can safely ignore this email.</p>
```

### 2.3 Configure Site URL and Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Set the following:

```
Site URL: http://localhost:3000 (for local development)
          https://himanshukukreja.in (for production)

Redirect URLs:
  - http://localhost:3000/auth/callback
  - https://himanshukukreja.in/auth/callback
```

---

## 🌐 Step 3: Configure Google OAuth

### 3.1 Create OAuth Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Application type**: Web application
6. Configure:

**Name:** `Learning Platform - Supabase Auth`

**Authorized JavaScript origins:**
```
http://localhost:3000
https://himanshukukreja.in
```

**Authorized redirect URIs:**
```
https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback
```

> ⚠️ **Important:** Replace `jnvxizdhpecnydnvhell` with your actual Supabase project reference ID.
> You can find it in your Supabase project URL: `https://YOUR-PROJECT-REF.supabase.co`

7. Click **Create**
8. **Copy the Client ID and Client Secret** (you'll need these next)

### 3.2 Enable Google Provider in Supabase

1. Go to **Authentication** → **Providers** in Supabase Dashboard
2. Find **Google** and click **Enable**
3. Paste your Google OAuth credentials:

```
Client ID: <paste from Google Cloud Console>
Client Secret: <paste from Google Cloud Console>
```

4. (Optional) Configure additional scopes if needed:
```
Default scopes: openid email profile
```

5. Click **Save**

---

## 🔑 Step 4: Verify Environment Variables

Ensure your `.env` file has the correct Supabase keys:

```bash
# Public (safe to expose in browser)
NEXT_PUBLIC_SUPABASE_URL=https://jnvxizdhpecnydnvhell.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server-only (NEVER expose to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

> ✅ These should already be configured from your existing Supabase setup.

---

## 🧪 Step 5: Test Authentication Flow

### Test Email OTP Flow

1. Start your development server:
```bash
npm run dev
```

2. Open http://localhost:3000
3. Click **Sign Up** in the navbar
4. Enter your email and click **Continue with Email**
5. Check your email inbox for the 6-digit verification code
6. Enter the code in the modal
7. You should be signed in and redirected to `/learn`

### Test Google OAuth Flow

1. Click **Sign In** in the navbar
2. Click **Continue with Google**
3. Select your Google account
4. Approve the permissions
5. You should be redirected back to `/learn` and signed in

### Verify in Supabase Dashboard

1. Go to **Authentication** → **Users**
2. You should see your newly created user account(s)
3. Go to **Table Editor** → **user_profiles**
4. Verify that a profile was automatically created for your user (thanks to the database trigger!)

---

## 🚀 Step 6: Deploy to Production

### 6.1 Update Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Ensure these variables are set for **Production, Preview, Development**:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

### 6.2 Update Supabase Configuration for Production

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Update the Site URL:
```
Site URL: https://himanshukukreja.in
```

3. Add production redirect URLs:
```
Redirect URLs:
  - https://himanshukukreja.in/auth/callback
  - http://localhost:3000/auth/callback (keep for local development)
```

### 6.3 Update Google OAuth Redirect URIs

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Go to your OAuth credentials
3. Ensure **Authorized redirect URIs** includes:
```
https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback
```

4. Ensure **Authorized JavaScript origins** includes:
```
https://himanshukukreja.in
```

---

## 🔒 Security Best Practices

### Row Level Security (RLS)

The migration automatically enables RLS on all tables. Verify it's working:

```sql
-- Test as an authenticated user
SELECT * FROM user_profiles WHERE id = auth.uid();
-- Should return only your profile

-- Try to access another user's profile
SELECT * FROM user_profiles WHERE id != auth.uid();
-- Should return nothing (RLS blocks it)
```

### Rate Limiting

Supabase has built-in rate limiting, but you can add additional protection:

1. Go to **Authentication** → **Rate Limits**
2. Configure:
```
Max requests per hour: 100 (per IP address)
```

---

## 📊 Step 7: Test Advanced Features

Now that auth is set up, you can test the advanced learning features!

### Test Progress Tracking

1. Sign in to your account
2. Navigate to any lesson in `/learn`
3. The system will automatically track:
   - Time spent on the lesson
   - Last accessed timestamp
   - Progress through the course

### Test Bookmarks

You'll implement bookmark UI next, but you can test the API:

```typescript
import { addBookmark, getUserBookmarks } from "@/lib/supabase-client";

// Add a bookmark
await addBookmark(
  userId,
  "system-design-mastery",
  "week-01-data-at-scale",
  "day-01-partitioning-deep-dive",
  "Great explanation of partitioning strategies!"
);

// Get all bookmarks
const { data: bookmarks } = await getUserBookmarks(userId);
console.log(bookmarks);
```

### Test Notes

Similarly, test the notes API:

```typescript
import { addNote, getLessonNotes } from "@/lib/supabase-client";

// Add a note
await addNote(
  userId,
  "system-design-mastery",
  "week-01-data-at-scale",
  "day-01-partitioning-deep-dive",
  "Remember: Consistent hashing helps with rebalancing!",
  {
    noteType: "important",
    color: "yellow",
  }
);

// Get all notes for a lesson
const { data: notes } = await getLessonNotes(
  userId,
  "system-design-mastery",
  "week-01-data-at-scale",
  "day-01-partitioning-deep-dive"
);
console.log(notes);
```

---

## 🐛 Troubleshooting

### Issue: "Email not sent"

**Solution:**
- Check **Authentication** → **Email Templates** → **SMTP Settings**
- For development, Supabase uses their own SMTP (no configuration needed)
- For production, consider configuring your own SMTP:
  - Go to **Project Settings** → **Auth**
  - Enable "Custom SMTP"
  - Use your AWS SES credentials (you already have these in `.env`)

### Issue: "Google OAuth not working"

**Solution:**
- Verify redirect URI matches exactly: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`
- Check that your domain is added to **Authorized JavaScript origins**
- Wait 5 minutes after making changes in Google Cloud Console (changes can take time to propagate)

### Issue: "User profile not created automatically"

**Solution:**
- Verify the trigger was created:
```sql
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'users'
AND trigger_name = 'on_auth_user_created';
```
- If missing, re-run the migration SQL

### Issue: "RLS prevents me from accessing data"

**Solution:**
- Make sure you're authenticated:
```typescript
const { user } = await getCurrentUser();
console.log("User ID:", user?.id);
```
- Verify policies are set correctly in **Database** → **Policies**

---

## 📚 Next Steps

Now that authentication is set up, you can build the advanced features:

### 1. Progress Tracking UI
- [ ] Show completion checkboxes on lessons
- [ ] Display progress bar on course overview
- [ ] Show "Resume where you left off" banner

### 2. Bookmarks UI
- [ ] Add bookmark button to lesson pages
- [ ] Create `/learn/bookmarks` page to view all bookmarks
- [ ] Quick search through bookmarked lessons

### 3. Notes UI
- [ ] Add note-taking widget to lesson pages
- [ ] Highlight text and add notes
- [ ] Create `/learn/notes` page to view all notes
- [ ] Filter notes by type/color

### 4. User Dashboard
- [ ] Create `/learn/dashboard` page
- [ ] Show learning statistics (streak, time spent, lessons completed)
- [ ] Display course progress charts
- [ ] Show recent activity timeline

---

## 🎉 Congratulations!

You now have a fully functional authentication system with:
- ✅ Email OTP (magic link) authentication
- ✅ Google OAuth social login
- ✅ User profiles with automatic creation
- ✅ Progress tracking database tables
- ✅ Bookmarks and notes infrastructure
- ✅ Row Level Security for data protection
- ✅ Automatic streak tracking

Your learning platform is ready to track user progress, bookmarks, and notes! 🚀

---

## 📞 Support

If you encounter any issues:
1. Check the [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
2. Review the [Supabase Discord Community](https://discord.supabase.com/)
3. Check this project's GitHub issues
4. Review the migration file for database schema details

**Last Updated:** January 9, 2025
