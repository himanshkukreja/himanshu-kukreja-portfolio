# 🗑️ How to Delete Users in Supabase

## Method 1: Via Supabase Dashboard (Easiest)

### Option A: Authentication Section
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/jnvxizdhpecnydnvhell
2. Click **Authentication** in the left sidebar
3. Click **Users** tab
4. Find your test user
5. Click the **three dots (...)** on the right
6. Click **Delete user**
7. Confirm deletion

### Option B: Via SQL Editor (Faster for multiple users)
1. Go to **SQL Editor** in Supabase
2. Run this query to see all users:
   ```sql
   SELECT id, email, created_at
   FROM auth.users
   ORDER BY created_at DESC;
   ```
3. Delete specific user:
   ```sql
   -- Replace with actual user ID
   DELETE FROM auth.users
   WHERE id = 'b4fd1782-c5c8-4260-9292-7f9c08eb3907';
   ```
4. Or delete ALL test users:
   ```sql
   -- CAREFUL: This deletes ALL users!
   DELETE FROM auth.users;
   ```

---

## Method 2: Via Table Editor (public.user_profiles)

**Note:** You can see `public.user_profiles` in Table Editor, but deleting from there won't delete the auth user.

To delete both:
1. Go to **Table Editor**
2. Select `user_profiles` table
3. Delete the user row
4. Then go to **Authentication → Users** and delete the auth user

Or better: Use SQL to delete from `auth.users` first (it will cascade to `user_profiles` automatically due to foreign key).

---

## 🧪 Complete Test Flow

### Step 1: Delete All Test Users
```sql
-- Run in SQL Editor
DELETE FROM auth.users;
```

### Step 2: Verify Deletion
```sql
-- Should return 0 rows
SELECT COUNT(*) FROM auth.users;
SELECT COUNT(*) FROM public.user_profiles;
```

### Step 3: Sign Up Fresh
1. Use a **completely new email** you've never used
2. Complete signup (Google or Email OTP)
3. Authenticate successfully

### Step 4: Check Result Immediately
```sql
-- Check the brand new user
SELECT
  id,
  full_name,
  welcome_email_sent,
  created_at
FROM public.user_profiles
ORDER BY created_at DESC
LIMIT 1;
```

**Critical**: Check if `welcome_email_sent` is `false` or `true`!

### Step 5: Check Terminal Logs
Look for:
```
[WELCOME EMAIL API] Profile found: { fullName: '...', welcomeEmailSent: ??? }
```

---

## 🎯 Expected Result

**If everything is fixed correctly:**

✅ `welcome_email_sent` should be `false`
✅ Terminal logs should show email being sent
✅ Welcome email should arrive in your inbox

**If still showing `true`:**

Then we have a mystery and need to investigate further! But I'm confident it will work now since:
- Column default is `false` ✅
- Trigger explicitly sets `FALSE` ✅
- No other triggers or RLS policies modifying it ✅

---

## 💡 Quick Commands

**See all users:**
```sql
SELECT id, email, created_at FROM auth.users;
```

**Delete specific user:**
```sql
DELETE FROM auth.users WHERE email = 'test@example.com';
```

**Delete all users (nuclear option):**
```sql
DELETE FROM auth.users;
```

**Check user_profiles:**
```sql
SELECT id, full_name, welcome_email_sent FROM public.user_profiles;
```

---

Please try this and let me know the result! 🚀
