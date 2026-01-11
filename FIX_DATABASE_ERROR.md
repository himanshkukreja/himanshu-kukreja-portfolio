# 🔥 Fix: "Database error saving new user"

## The Problem

You're getting this error:
```
error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user
```

**Root Cause:** The database tables for user profiles haven't been created yet!

---

## ✅ **Solution: Run the Database Migration**

### **Step 1: Go to Supabase SQL Editor**

1. Open: https://supabase.com/dashboard/project/jnvxizdhpecnydnvhell/sql
2. Click **"New Query"** or press `Ctrl+Enter`

---

### **Step 2: Copy the Migration SQL**

Open this file on your computer:
```
/Users/himanshukukreja/portfolio-site/supabase/migrations/20250109_auth_and_learning.sql
```

**OR** copy from below (entire SQL):

<details>
<summary>Click to expand the SQL migration (copy all of this)</summary>

```sql
-- =====================================================
-- Authentication & Learning Platform Schema
-- =====================================================

-- 1. USER PROFILES
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  learning_goal TEXT,
  experience_level TEXT DEFAULT 'intermediate',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  profile_visibility TEXT DEFAULT 'private',
  total_lessons_completed INTEGER DEFAULT 0,
  total_time_spent INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0
);

-- 2. LEARNING PROGRESS
CREATE TABLE IF NOT EXISTS learning_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  status TEXT DEFAULT 'not_started',
  progress_percentage INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, course_id, week, lesson_slug)
);

-- 3. BOOKMARKS
CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  note TEXT,
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, course_id, week, lesson_slug)
);

-- 4. CONTENT NOTES
CREATE TABLE IF NOT EXISTS content_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL,
  week TEXT NOT NULL,
  lesson_slug TEXT NOT NULL,
  note_text TEXT NOT NULL,
  note_type TEXT DEFAULT 'general',
  highlight_text TEXT,
  highlight_offset INTEGER,
  color TEXT DEFAULT 'yellow',
  is_private BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. LEARNING STREAKS
CREATE TABLE IF NOT EXISTS learning_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  lessons_completed INTEGER DEFAULT 0,
  time_spent INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, activity_date)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_learning_progress_user_id ON learning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_content_notes_user_id ON content_notes(user_id);

-- ROW LEVEL SECURITY
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_streaks ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can view their own profile" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view their own progress" ON learning_progress FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own progress" ON learning_progress FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own progress" ON learning_progress FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own bookmarks" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bookmarks" ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bookmarks" ON bookmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bookmarks" ON bookmarks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own notes" ON content_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notes" ON content_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notes" ON content_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notes" ON content_notes FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own streaks" ON learning_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own streaks" ON learning_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- AUTO-CREATE USER PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_profile();
```

</details>

---

### **Step 3: Run the SQL**

1. Paste the entire SQL into the Supabase SQL Editor
2. Click **"Run"** (or press `Ctrl+Enter`)
3. You should see: ✅ **"Success. No rows returned"**

---

### **Step 4: Verify Tables Were Created**

Run this query to check:

```sql
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

You should see all 5 tables listed!

---

### **Step 5: Test Google OAuth Again**

1. Go back to http://localhost:3000
2. Click the user icon
3. Click **"Continue with Google"**
4. Sign in with Google
5. You should be redirected back and **signed in successfully!** ✅

---

## 🎯 **What the Migration Does**

The migration creates:

1. **`user_profiles`** - Stores your profile, learning stats, streaks
2. **`learning_progress`** - Tracks which lessons you've completed
3. **`bookmarks`** - Your bookmarked lessons
4. **`content_notes`** - Notes you take on lessons
5. **`learning_streaks`** - Daily learning activity

Plus:
- ✅ Row Level Security (users can only see their own data)
- ✅ Auto-creates profile when you sign up (via trigger)
- ✅ All necessary indexes for performance

---

## 🐛 **Still Getting Errors?**

### **Error: "permission denied for schema public"**

**Solution:** Run this first:
```sql
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
```

---

### **Error: "relation 'auth.users' does not exist"**

This shouldn't happen - `auth.users` is created by Supabase automatically. If you see this:
1. Make sure you're running the SQL in the correct project
2. Check that you're using Supabase (not a plain PostgreSQL database)

---

### **Error: "duplicate key value violates unique constraint"**

This means the tables already exist. You can:
1. Skip this migration (tables are already there)
2. Or drop and recreate:
   ```sql
   DROP TABLE IF EXISTS learning_streaks CASCADE;
   DROP TABLE IF EXISTS content_notes CASCADE;
   DROP TABLE IF EXISTS bookmarks CASCADE;
   DROP TABLE IF EXISTS learning_progress CASCADE;
   DROP TABLE IF EXISTS user_profiles CASCADE;

   -- Then run the full migration again
   ```

---

## ✅ **Quick Checklist**

- [ ] Opened Supabase SQL Editor
- [ ] Copied the migration SQL
- [ ] Ran the SQL (saw "Success")
- [ ] Verified 5 tables were created
- [ ] Tested Google OAuth again
- [ ] Successfully signed in! 🎉

---

## 🚀 **After Migration Works**

Once the migration runs successfully, you'll be able to:
- ✅ Sign in with Google OAuth
- ✅ Sign in with Email OTP
- ✅ See your profile in the navbar dropdown
- ✅ Track lesson progress
- ✅ Bookmark lessons
- ✅ Take notes on content
- ✅ Build learning streaks

---

**Need Help?**
- Full setup guide: `/SUPABASE_AUTH_SETUP.md`
- Implementation docs: `/AUTH_IMPLEMENTATION.md`

---

**Last Updated:** January 9, 2025
