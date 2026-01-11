# 🚀 Authentication Quick Start

Get your authentication system up and running in 10 minutes!

---

## ⚡ Quick Setup (3 Steps)

### 1️⃣ Run Database Migration (2 min)

Go to [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql):

```bash
# Copy and paste the contents of this file:
supabase/migrations/20250109_auth_and_learning.sql
```

Click **Run** to create all tables, triggers, and policies.

---

### 2️⃣ Configure Auth Providers (5 min)

#### Email OTP (Already Enabled ✅)

Go to **Authentication → Providers** and verify **Email** is enabled.

#### Google OAuth

1. **Get Google Credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Create OAuth Client ID
   - Authorized redirect URI: `https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback`

2. **Add to Supabase:**
   - Go to **Authentication → Providers → Google**
   - Paste Client ID and Client Secret
   - Save

3. **Set Redirect URLs:**
   - Go to **Authentication → URL Configuration**
   - Add: `http://localhost:3000/auth/callback`
   - Add: `https://himanshukukreja.in/auth/callback`

---

### 3️⃣ Test It! (3 min)

```bash
npm run dev
```

1. Open http://localhost:3000
2. Click **Sign Up** in navbar
3. Enter your email
4. Check email for 6-digit code
5. Enter code → You're in! 🎉

---

## 📁 What Was Created

### Files You Can Use Right Away

```typescript
// Auth Hook
import { useAuth } from "@/contexts/AuthContext";
const { user, profile, loading, signOut } = useAuth();

// Auth Functions
import {
  signInWithEmail,
  signInWithGoogle,
  getUserProfile,
  markLessonComplete,
  addBookmark,
  addNote
} from "@/lib/supabase-client";
```

### UI Components

- `<AuthModal />` - Login/signup modal (already in Navbar)
- `<UserMenu />` - User dropdown menu (already in Navbar)
- `<AuthButton />` - Shows sign in/up or user menu (already in Navbar)

---

## 🎯 Next: Build Features

### Progress Tracking

```typescript
import { markLessonComplete } from "@/lib/supabase-client";

await markLessonComplete(
  user.id,
  "system-design-mastery",
  "week-01-data-at-scale",
  "day-01-partitioning",
  900 // time in seconds
);
```

### Bookmarks

```typescript
import { addBookmark, getUserBookmarks } from "@/lib/supabase-client";

// Add bookmark
await addBookmark(user.id, courseId, week, lessonSlug);

// Get all bookmarks
const { data } = await getUserBookmarks(user.id);
```

### Notes

```typescript
import { addNote, getLessonNotes } from "@/lib/supabase-client";

// Add note
await addNote(user.id, courseId, week, lessonSlug, "My note", {
  noteType: "important",
  color: "yellow"
});

// Get notes
const { data } = await getLessonNotes(user.id, courseId, week, lessonSlug);
```

---

## 🐛 Troubleshooting

### "Email not sent"
→ Check **Authentication → Email Templates** in Supabase

### "Google OAuth fails"
→ Verify redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

### "Can't access data"
→ Make sure RLS policies were created (check SQL migration ran successfully)

---

## 📚 Full Documentation

- Detailed setup: `/SUPABASE_AUTH_SETUP.md`
- Implementation guide: `/AUTH_IMPLEMENTATION.md`
- Database schema: `/supabase/migrations/20250109_auth_and_learning.sql`

---

## ✅ Checklist

- [ ] Database migration completed
- [ ] Email OTP tested
- [ ] Google OAuth configured
- [ ] User menu appears when signed in
- [ ] User profile created in database
- [ ] Ready to build learning features!

---

**Need help?** Check `/SUPABASE_AUTH_SETUP.md` for detailed instructions.

**Ready to build?** Check `/AUTH_IMPLEMENTATION.md` for code examples.
