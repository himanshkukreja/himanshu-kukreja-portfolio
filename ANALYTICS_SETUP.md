# Analytics Setup Guide

This guide will help you set up the custom analytics system for your portfolio site.

## Features

✅ **Page View Tracking**: Track every page visit with unique visitors and sessions
✅ **Geographic Data**: Country, region, and city-level analytics (powered by Vercel Edge)
✅ **Referrer Tracking**: See where your traffic is coming from
✅ **Device Analytics**: Desktop, mobile, and tablet breakdowns
✅ **Browser & OS Stats**: Detailed browser and operating system metrics
✅ **UTM Parameters**: Track campaign sources (utm_source, utm_medium, utm_campaign)
✅ **Real-time Dashboard**: Beautiful visual analytics dashboard in admin panel

## Setup Steps

### 1. Set up Supabase Database

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor**
3. Create a new query and paste the contents of `supabase-analytics-schema.sql`
4. Run the SQL script to create:
   - `analytics_events` table
   - Indexes for performance
   - Views for aggregated data
   - Row Level Security (RLS) policies

### 2. Add Environment Variables

Make sure you have these environment variables in your `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Important**:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is needed for client-side tracking
- `SUPABASE_SERVICE_ROLE_KEY` is needed for reading analytics in admin dashboard

### 3. Add Analytics Tracker to Root Layout

Add the `AnalyticsTracker` component to your root layout (`src/app/layout.tsx`):

```tsx
import AnalyticsTracker from "@/components/AnalyticsTracker";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}
```

This will automatically track page views on every route change.

### 4. Access the Analytics Dashboard

Navigate to: **http://localhost:3000/admin/analytics**

You'll see:
- Total visits, unique visitors, sessions
- Visits over time chart
- Top pages and referrers
- Device, browser, and OS breakdowns
- **Geographic data with countries and cities**
- Time range filters (7d, 30d, 90d, all time)

## How It Works

### Client-Side Tracking

1. **Visitor ID**: Generated once and stored in localStorage (persists across sessions)
2. **Session ID**: Generated per browser session (stored in sessionStorage)
3. **Page Views**: Tracked automatically on route changes
4. **Geo Data**: Captured server-side via Vercel Edge using request headers

### Data Collected

For each page view, we collect:
- Event type (page_view, click, form_submit, custom)
- Page path and title
- Visitor ID and Session ID
- Referrer and referrer domain
- UTM parameters (if present)
- User agent, browser, OS
- Device type (desktop/mobile/tablet)
- Screen resolution
- **Country, region, and city** (via Vercel Edge geo-location)
- IP address (for analytics only)
- Time spent on page (duration)

### Privacy & Security

- **Development Mode**: Analytics are NOT tracked in development (console logs only)
- **RLS Policies**: Supabase Row Level Security ensures:
  - Anyone can INSERT events (for tracking)
  - Only service role can SELECT/read data (for admin dashboard)
- **No PII**: We don't collect names, emails, or other personally identifiable information
- **IP Storage**: IPs are stored for analytics but can be anonymized if needed

## Usage Examples

### Track Custom Events

You can track custom events beyond page views:

```tsx
import { trackEvent } from "@/lib/analytics";

// Track a button click
trackEvent({
  event_type: "click",
  page_path: "/",
  page_title: "Home",
  metadata: {
    button_name: "Subscribe",
    section: "Hero",
  },
});

// Track a form submission
trackEvent({
  event_type: "form_submit",
  page_path: "/contact",
  page_title: "Contact",
  metadata: {
    form_type: "contact",
  },
});
```

### Geographic Tracking (Automatic)

When deployed to Vercel, geographic data is automatically captured from the Edge runtime:

```typescript
// This happens automatically in /api/analytics/track
const country = request.geo?.country; // e.g., "US"
const city = request.geo?.city;       // e.g., "New York"
const region = request.geo?.region;   // e.g., "NY"
```

**Note**: Geographic data requires Vercel deployment. In local development, these fields will be `undefined`.

## Dashboard Features

### Time Range Filters
- Last 7 days
- Last 30 days
- Last 90 days
- All time

### Metrics Displayed
1. **Overview Cards**: Total visits, unique visitors, sessions, avg duration
2. **Timeline Chart**: Daily visits and unique visitors
3. **Top Pages**: Most visited pages with unique visitor counts
4. **Top Referrers**: Traffic sources
5. **Device Breakdown**: Desktop, mobile, tablet percentages
6. **Browser Stats**: Chrome, Firefox, Safari, etc.
7. **OS Stats**: Windows, macOS, Linux, iOS, Android
8. **Geographic Data**:
   - Top Countries (with cities listed)
   - Top Cities worldwide

## Production Deployment

### Vercel Deployment

1. Push your code to GitHub
2. Deploy to Vercel
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Analytics will start tracking automatically!

### Testing Geo-location

Geographic data only works in production (Vercel Edge). To test:

1. Deploy to Vercel
2. Visit your site from different locations (or use a VPN)
3. Check the analytics dashboard to see country/city data

## Database Schema

Key tables and views:

- **analytics_events**: Raw events table
- **analytics_unique_visitors_daily**: View with daily unique visitor counts
- **analytics_top_pages**: View with page visit aggregations
- **analytics_referrer_sources**: View with referrer aggregations

## Troubleshooting

### No data showing up?

1. Check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set correctly
2. Verify the Supabase table was created successfully
3. Check browser console for errors
4. Make sure you're NOT in development mode (analytics disabled in dev)

### Geo data showing as "Unknown"?

- Geographic data only works on Vercel Edge runtime
- Test in production, not localhost
- Vercel provides `request.geo` automatically

### Analytics not tracking?

1. Check that `AnalyticsTracker` is added to your root layout
2. Verify the tracker is being rendered (check React DevTools)
3. Check network tab for `/api/analytics/track` POST requests
4. Look for console errors

## Performance

- **Edge Runtime**: Geo-location uses Vercel Edge for minimal latency
- **Async Tracking**: Events are tracked asynchronously (non-blocking)
- **Indexed Queries**: Database queries use indexes for fast analytics
- **Cached Results**: API responses can be cached if needed

## Next Steps

- [ ] Set up custom event tracking for specific user actions
- [ ] Add conversion tracking for key metrics
- [ ] Create email reports (weekly analytics summary)
- [ ] Add real-time visitor count
- [ ] Export data to CSV for deeper analysis

---

**Questions?** Check the code comments in:
- `src/lib/analytics.ts` - Client-side tracking
- `src/app/api/analytics/track/route.ts` - Server-side geo capture
- `src/app/api/admin/analytics/route.ts` - Analytics data processing
- `src/components/AnalyticsDashboard.tsx` - Dashboard UI
