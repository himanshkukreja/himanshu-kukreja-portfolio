# Google OAuth Setup & Branding

## Why You See "jnvxizdhpecnydnvhell.supabase.co"

This is **normal and expected**! Here's what happens during Google OAuth:

```
1. User clicks "Continue with Google"
   ↓
2. Redirects to Google's OAuth consent screen
   ↓
3. User approves permissions
   ↓
4. Google redirects to: jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback
   ↓
5. Supabase processes the auth
   ↓
6. Redirects back to: himanshukukreja.in/auth/callback
   ↓
7. Your app completes the sign-in
```

The redirect to `*.supabase.co` happens in **milliseconds** - users barely notice it.

---

## ✅ **How to Set Up Google OAuth (Complete Guide)**

### **Step 1: Create Google OAuth Credentials**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Go to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Configure OAuth consent screen if prompted:
   - **App name**: `System Design Mastery` (or your preferred name)
   - **User support email**: Your email
   - **Developer contact**: Your email
   - **Authorized domains**: Add `himanshukukreja.in` and `supabase.co`

6. Create OAuth Client ID:
   - **Application type**: Web application
   - **Name**: `Learning Platform - Production`

7. **Authorized JavaScript origins**:
   ```
   http://localhost:3000
   https://himanshukukreja.in
   ```

8. **Authorized redirect URIs** (⚠️ IMPORTANT):
   ```
   https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback
   https://himanshukukreja.in/auth/callback
   ```

9. Click **Create**
10. **Copy the Client ID and Client Secret**

---

### **Step 2: Configure Supabase**

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `jnvxizdhpecnydnvhell`
3. Go to **Authentication** → **Providers**
4. Find **Google** and click to expand
5. Toggle **Enable Sign in with Google** to ON
6. Paste your credentials:
   - **Client ID**: `<from Google Cloud Console>`
   - **Client Secret**: `<from Google Cloud Console>`
7. Click **Save**

---

### **Step 3: Configure Redirect URLs in Supabase**

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL**:
   ```
   Production: https://himanshukukreja.in
   Development: http://localhost:3000
   ```

3. Add **Redirect URLs**:
   ```
   https://himanshukukreja.in/auth/callback
   http://localhost:3000/auth/callback
   ```

4. Click **Save**

---

## 🎨 **Improve User Experience (Optional Branding)**

### **Option 1: Custom Domain for Supabase (Enterprise Only)**

Supabase allows custom domains on Enterprise plans. You could use:
- `auth.himanshukukreja.in` instead of `*.supabase.co`

**Not recommended** unless you're on Enterprise plan.

---

### **Option 2: Improve OAuth Consent Screen**

Make the Google OAuth consent screen look professional:

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent)
2. Edit your OAuth consent screen:

**App Information:**
```
App name: System Design Mastery
App logo: [Upload your logo - 120x120px]
Support email: your-email@gmail.com
```

**App Domain:**
```
Application home page: https://himanshukukreja.in
Application privacy policy: https://himanshukukreja.in/privacy
Application terms of service: https://himanshukukreja.in/terms
```

**Authorized domains:**
```
himanshukukreja.in
supabase.co
```

**Scopes:**
```
.../auth/userinfo.email
.../auth/userinfo.profile
openid
```

3. Save and continue

Now when users click "Continue with Google", they'll see:
- ✅ Your app name: "System Design Mastery"
- ✅ Your logo
- ✅ Professional-looking consent screen

---

## 🧪 **Testing the Flow**

### **Local Testing (localhost:3000)**

1. Make sure your `.env` has Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://jnvxizdhpecnydnvhell.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
   ```

2. Start dev server:
   ```bash
   npm run dev
   ```

3. Visit http://localhost:3000
4. Click the user icon → "Continue with Google"
5. You'll see:
   - Google OAuth consent screen
   - Brief redirect to `*.supabase.co` (milliseconds)
   - Redirect back to your app at `/auth/callback`
   - Signed in! ✅

---

### **Production Testing**

1. Deploy to Vercel/production
2. Add environment variables in Vercel:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```

3. Update Google OAuth redirect URIs to include production URL
4. Test on https://himanshukukreja.in

---

## 🐛 **Troubleshooting**

### **Error: "redirect_uri_mismatch"**

**Problem:** Google says the redirect URI doesn't match.

**Solution:**
1. Go to Google Cloud Console → Credentials
2. Edit your OAuth Client ID
3. Make sure you have **EXACTLY**:
   ```
   https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback
   ```
   (Note: No trailing slash!)

---

### **Error: "Database error saving new user"**

**Problem:** Supabase can't create the user profile.

**Solution:**
1. Run the database migration:
   - Go to Supabase SQL Editor
   - Run `/supabase/migrations/20250109_auth_and_learning.sql`
2. Verify tables were created:
   ```sql
   SELECT * FROM user_profiles LIMIT 1;
   ```

---

### **User sees Supabase URL for too long**

**Problem:** The redirect seems slow.

**Reasons:**
1. Network latency
2. Supabase processing the OAuth callback
3. Creating user profile in database

**Solutions:**
- Optimize database triggers (already optimized in our migration)
- Use a loading state in your app
- This is usually imperceptible (< 500ms)

---

## 📊 **What Happens Behind the Scenes**

```typescript
// When user clicks "Continue with Google"
await supabaseClient.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
  },
});

// Supabase redirects to Google:
// https://accounts.google.com/o/oauth2/auth?client_id=...

// After user approves, Google redirects to:
// https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback?code=ABC123

// Supabase processes the code and redirects to:
// https://himanshukukreja.in/auth/callback?access_token=...&refresh_token=...

// Your /auth/callback route handles it:
await supabase.auth.exchangeCodeForSession(code);

// User is now signed in! ✅
```

---

## ✅ **Quick Setup Checklist**

- [ ] Created Google OAuth Client ID
- [ ] Added redirect URI: `https://jnvxizdhpecnydnvhell.supabase.co/auth/v1/callback`
- [ ] Enabled Google provider in Supabase
- [ ] Added Client ID and Secret to Supabase
- [ ] Configured redirect URLs in Supabase
- [ ] Customized OAuth consent screen (app name, logo)
- [ ] Tested on localhost:3000
- [ ] Tested on production (if deployed)

---

## 🎯 **Expected User Experience**

**What users see:**
1. Click "Continue with Google" → Google consent screen appears
2. Approve permissions → Brief loading (< 1 second)
3. Redirected back to your app → Signed in! 🎉

**What users DON'T typically notice:**
- The intermediate `*.supabase.co` redirect (happens in milliseconds)
- Any technical OAuth details

---

## 🚀 **Next Steps**

1. Follow **Step 1** to create Google OAuth credentials
2. Follow **Step 2** to add them to Supabase
3. Test the flow on localhost
4. Customize the OAuth consent screen with your branding
5. Deploy and test on production

---

**Need help?** Check:
- [Supabase Google OAuth Docs](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth Setup Guide](https://developers.google.com/identity/protocols/oauth2)

---

**Last Updated:** January 9, 2025
