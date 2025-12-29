# System Design Learning Section Setup

This document explains how the `/learn` section integrates your private `system-design-mastery` GitHub repository into the portfolio site.

## Architecture Overview

The `/learn` section dynamically fetches markdown content from your private GitHub repository at runtime, allowing you to:
- Keep content in a separate private repo
- Update learning materials without rebuilding the portfolio
- Maintain URL slugs that match the GitHub repo structure
- Use the same markdown rendering as your engineering stories

## How It Works

### Content Source
- **Repository**: `himanshkukreja/system-design-mastery` (private)
- **Branch**: `main`
- **Content Path**: `resources/`
- **Structure**:
  ```
  resources/
  ├── system-design-learning-plan.md
  ├── week-00/
  │   ├── foundations-part-1.md
  │   ├── foundations-part-2.md
  │   └── foundations-part-3.md
  ├── week-01/
  │   ├── week-01-preview.md
  │   ├── day-01-partitioning-deep-dive.md
  │   ├── day-02-replication-tradeoffs.md
  │   └── ...
  └── week-XX/
      └── ...
  ```

### URL Structure
Content is accessible via URLs that mirror the GitHub repo structure:
- Overview: `/learn`
- Course plan: `/learn/overview/overview`
- Week content: `/learn/week-01/day-01-partitioning-deep-dive`
- Capstones: `/learn/week-02/capstone-interview-week-1-2`

### GitHub API Integration
The site uses GitHub's REST API to:
1. List all weeks in the `resources/` directory
2. Fetch markdown files from each week
3. Parse and organize content by week/day/type
4. Render markdown with the same styling as engineering stories

## Setup Instructions

### 1. Create GitHub Personal Access Token

You need a fine-grained personal access token to access the private repository.

**Steps:**
1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Configure the token:
   - **Token name**: `Portfolio Site - System Design Content`
   - **Expiration**: 1 year (or custom)
   - **Repository access**: Select "Only select repositories"
   - Choose: `himanshkukreja/system-design-mastery`
   - **Repository permissions**:
     - Contents: **Read-only** ✓
   - Click "Generate token"
4. **Copy the token immediately** (you won't see it again!)

### 2. Add Token to Environment Variables

#### Local Development
Add to your `.env` file (not `.env.example`):
```bash
GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_YOUR_ACTUAL_TOKEN_HERE
```

#### Vercel Deployment
1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `GITHUB_PERSONAL_ACCESS_TOKEN`
   - **Value**: Your GitHub token
   - **Environment**: Production, Preview, Development (select all)
4. Click **Save**
5. Redeploy your site for changes to take effect

### 3. Test the Integration

Start your development server:
```bash
npm run dev
```

Visit:
- http://localhost:3000/learn - Course overview
- http://localhost:3000/learn/week-00/foundations-part-1 - First lesson

## File Structure

### New Files Created
```
src/
├── app/
│   └── learn/
│       ├── page.tsx                      # Course overview page
│       └── [week]/
│           └── [slug]/
│               └── page.tsx              # Individual lesson page
└── lib/
    ├── github.ts                         # GitHub API service
    └── markdown.ts                       # Shared markdown renderer
```

### Key Components

#### `/src/lib/github.ts`
- `fetchGitHubContent()` - Fetches directory listings from GitHub
- `fetchMarkdownContent()` - Fetches raw markdown files
- `getAllLearningResources()` - Gets all organized learning resources
- `getLearningResource()` - Gets a specific resource by week/slug
- `getWeekResources()` - Gets all resources for a specific week

#### `/src/app/learn/page.tsx`
- Main course overview page
- Lists all weeks and their resources
- Shows course statistics
- Provides navigation to individual lessons

#### `/src/app/learn/[week]/[slug]/page.tsx`
- Dynamic route for individual lessons
- Renders markdown content
- Shows week navigation sidebar
- Provides previous/next navigation

## Caching Strategy

### GitHub API Caching
Fetch requests include `next: { revalidate: 3600 }`:
- Content is cached for 1 hour
- Reduces API calls and improves performance
- GitHub API rate limit: 5,000 requests/hour (authenticated)

### Page Rendering
- `export const dynamic = "force-dynamic"` - Always fetch fresh data
- Content updates appear within 1 hour max
- Can be adjusted in `src/lib/github.ts`

## Customization

### Adjust Caching Duration
In `src/lib/github.ts`, modify the `revalidate` value:
```typescript
next: { revalidate: 3600 } // 1 hour (3600 seconds)
```

Options:
- `600` - 10 minutes (more frequent updates)
- `3600` - 1 hour (current setting)
- `86400` - 24 hours (daily updates)
- `false` - No caching (uses API quota faster)

### Change Repository Settings
Edit constants in `src/lib/github.ts`:
```typescript
const REPO_OWNER = 'himanshkukreja';
const REPO_NAME = 'system-design-mastery';
const BRANCH = 'main';
const BASE_PATH = 'resources';
```

### Customize Styling
The markdown content uses Tailwind's typography plugin with custom styles.
Modify in `/src/app/learn/[week]/[slug]/page.tsx`:
```typescript
className="prose prose-invert prose-lg ..."
```

## Content Updates

### Adding New Content
1. Add markdown files to your `system-design-mastery` repo
2. Commit and push to the `main` branch
3. Content will appear on your site within 1 hour (or after cache revalidation)
4. No portfolio site rebuild required!

### Content File Naming Convention
The system automatically categorizes content based on filename patterns:
- `week-XX-preview.md` → Week Preview
- `day-XX-topic-name.md` → Daily Content
- `capstone-*.md` → Capstone Project
- `foundations-*.md` → Foundation Content

### Frontmatter (Optional)
You can add frontmatter to markdown files for metadata:
```markdown
---
title: Custom Title
week: week-01
day: day-01
type: day-content
---

# Your content here...
```

## Troubleshooting

### Error: "GITHUB_PERSONAL_ACCESS_TOKEN is not configured"
- Ensure the token is added to your `.env` file
- Restart your development server after adding the token
- For Vercel: Check Environment Variables in dashboard

### Error: "GitHub API error (404)"
- Token doesn't have access to the repository
- Repository name or owner is incorrect
- Branch name is wrong (check if it's `main` or `master`)

### Error: "GitHub API error (403)"
- Token has expired - generate a new one
- Rate limit exceeded - wait an hour or increase cache duration
- Token doesn't have correct permissions - regenerate with Contents: Read

### Content Not Updating
- Wait up to 1 hour for cache to expire
- Or reduce `revalidate` time in `src/lib/github.ts`
- Or redeploy on Vercel to clear all caches

## Security Notes

### Token Security
- **Never commit** the `.env` file to Git
- The token is server-side only (not exposed to browser)
- Use fine-grained tokens with minimal permissions
- Rotate tokens periodically (every 6-12 months)
- If token is leaked, revoke immediately and generate new one

### Rate Limits
- GitHub authenticated API: 5,000 requests/hour
- With 1-hour caching: ~26 requests/hour (well within limits)
- Monitor usage at: https://api.github.com/rate_limit

## Alternative Approaches

If you want to make the content public or change the architecture:

### Option 1: Make Repo Public
- Make `system-design-mastery` public
- Remove `GITHUB_PERSONAL_ACCESS_TOKEN` requirement
- Use raw GitHub URLs: `https://raw.githubusercontent.com/...`
- Simpler, but exposes all content publicly

### Option 2: Git Submodule (Build-time)
- Add repo as git submodule
- Content becomes part of portfolio repo at build time
- No runtime GitHub API calls
- Requires rebuild for content updates
- Can still keep content repo private (Vercel has access)

### Option 3: Local Copy (Current + Hybrid)
- Keep content fetched from GitHub (current approach)
- Add fallback to local copy in case GitHub is down
- Best of both worlds but more complex

## Benefits of Current Approach

✅ **Separation of Concerns**: Content lives in dedicated repo
✅ **Privacy**: Repo remains private
✅ **Dynamic Updates**: Content updates without rebuilding
✅ **URL Consistency**: Slugs match GitHub repo structure
✅ **No Duplication**: Single source of truth for content
✅ **Shared Rendering**: Uses same markdown engine as stories
✅ **Version Control**: Git history tracks content changes
✅ **Flexibility**: Can switch to public/submodule approach easily

## Future Enhancements

Potential features to add:
- [ ] Search functionality across all learning resources
- [ ] Progress tracking (save completed lessons)
- [ ] Bookmarking favorite resources
- [ ] Estimated reading time for each lesson
- [ ] PDF export for offline reading
- [ ] Interactive code examples
- [ ] Discussion/comments section
- [ ] Related resources suggestions
- [ ] Table of contents for long articles
- [ ] Dark/light mode code syntax highlighting

## Support

For issues or questions:
- Check this documentation first
- Review GitHub API documentation: https://docs.github.com/en/rest
- Check Next.js caching docs: https://nextjs.org/docs/app/building-your-application/caching

---

**Last Updated**: 2024-12-30
**Version**: 1.0.0
