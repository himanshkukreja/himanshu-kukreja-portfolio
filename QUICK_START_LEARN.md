# Quick Start: Setting Up the /learn Section

Follow these steps to get the System Design learning section working on your portfolio site.

## Prerequisites
- Your portfolio site running locally
- Access to your private `system-design-mastery` GitHub repository

## Step 1: Create GitHub Token (5 minutes)

1. Open https://github.com/settings/tokens?type=beta in your browser
2. Click **"Generate new token"**
3. Fill in:
   - **Token name**: `Portfolio Learn Section`
   - **Expiration**: `1 year`
   - **Repository access**: Select **"Only select repositories"**
     - Choose: `system-design-mastery`
   - **Permissions**:
     - Repository permissions → **Contents** → Select **Read-only**
4. Click **"Generate token"**
5. **IMPORTANT**: Copy the token immediately (starts with `github_pat_...`)

## Step 2: Add Token Locally (1 minute)

1. Open your portfolio `.env` file (create if it doesn't exist):
   ```bash
   cd /Users/himanshukukreja/portfolio-site
   nano .env
   ```

2. Add this line at the end:
   ```bash
   GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_YOUR_ACTUAL_TOKEN_HERE
   ```
   (Replace with your actual token from Step 1)

3. Save and close (Ctrl+X, then Y, then Enter)

## Step 3: Test Locally (2 minutes)

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Open in browser:
   - http://localhost:3000/learn
   - http://localhost:3000/learn/week-00/foundations-part-1

3. You should see your learning content!

## Step 4: Deploy to Vercel (3 minutes)

1. Go to https://vercel.com/dashboard
2. Click your portfolio project
3. Go to **Settings** → **Environment Variables**
4. Click **Add New**:
   - **Key**: `GITHUB_PERSONAL_ACCESS_TOKEN`
   - **Value**: Your token from Step 1
   - **Environments**: Check all (Production, Preview, Development)
5. Click **Save**
6. Go to **Deployments** tab
7. Click **"Redeploy"** on the latest deployment

Done! Your `/learn` section is now live.

## Verify Everything Works

### Local Testing
Visit these URLs and verify they load:
- ✅ http://localhost:3000/learn (course overview)
- ✅ http://localhost:3000/learn/week-00/foundations-part-1
- ✅ http://localhost:3000/learn/week-01/day-01-partitioning-deep-dive

### Production Testing
After deploying, visit:
- ✅ https://himanshukukreja.in/learn
- ✅ Click "Learn" in the navbar
- ✅ Navigate through weeks and lessons

## Common Issues

### "GITHUB_PERSONAL_ACCESS_TOKEN is not configured"
❌ **Problem**: Token not in .env
✅ **Solution**: Add token to `.env` and restart dev server

### "GitHub API error (404)"
❌ **Problem**: Token can't access the repo
✅ **Solution**:
   - Go to https://github.com/settings/tokens
   - Click your token → Configure
   - Make sure `system-design-mastery` is selected

### Nothing shows on /learn page
❌ **Problem**: Repo structure doesn't match expected format
✅ **Solution**: Ensure your repo has `resources/week-XX/` structure

### Token expired
❌ **Problem**: Token has an expiration date
✅ **Solution**: Generate new token and update in `.env` and Vercel

## What's Next?

Now that your `/learn` section is working:

1. **Add more content** to `system-design-mastery` repo
2. **Update markdown files** - changes appear within 1 hour
3. **Share the link** - your learning resources are now publicly accessible
4. **Monitor usage** - Check Vercel analytics to see engagement

## Need Help?

See the full documentation in [LEARN_SETUP.md](./LEARN_SETUP.md)

---

**Total Setup Time**: ~10 minutes
**Difficulty**: Easy
