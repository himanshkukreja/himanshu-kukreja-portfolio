-- Analytics Events Table
-- Run this in your Supabase SQL Editor to create the analytics table

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Event Details
  event_type VARCHAR(50) NOT NULL, -- 'page_view', 'click', 'form_submit', etc.
  page_path TEXT NOT NULL,
  page_title TEXT,

  -- Visitor Information
  visitor_id TEXT NOT NULL, -- Client-generated UUID stored in localStorage
  session_id TEXT NOT NULL, -- Session UUID (regenerated on new session)

  -- Referrer & Source
  referrer TEXT,
  referrer_domain TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,

  -- Device & Browser
  user_agent TEXT,
  device_type VARCHAR(20), -- 'desktop', 'mobile', 'tablet'
  browser VARCHAR(50),
  os VARCHAR(50),
  screen_width INTEGER,
  screen_height INTEGER,

  -- Location (if available)
  country VARCHAR(2),
  region TEXT,
  city TEXT,
  ip_address INET,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duration INTEGER, -- Time spent on page in seconds (for page_view events)

  -- Additional metadata
  metadata JSONB -- For custom event data
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_visitor_id ON analytics_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_page_path ON analytics_events(page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_referrer_domain ON analytics_events(referrer_domain);

-- View for unique visitors per day
CREATE OR REPLACE VIEW analytics_unique_visitors_daily AS
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  COUNT(*) as total_visits
FROM analytics_events
WHERE event_type = 'page_view'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- View for top pages
CREATE OR REPLACE VIEW analytics_top_pages AS
SELECT
  page_path,
  page_title,
  COUNT(*) as visits,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  AVG(duration) as avg_duration
FROM analytics_events
WHERE event_type = 'page_view'
GROUP BY page_path, page_title
ORDER BY visits DESC;

-- View for referrer sources
CREATE OR REPLACE VIEW analytics_referrer_sources AS
SELECT
  COALESCE(referrer_domain, 'Direct') as source,
  COUNT(*) as visits,
  COUNT(DISTINCT visitor_id) as unique_visitors
FROM analytics_events
WHERE event_type = 'page_view'
GROUP BY referrer_domain
ORDER BY visits DESC;

-- Enable Row Level Security (RLS)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

-- Policy: Allow insert from anyone (for tracking)
CREATE POLICY "Allow public insert" ON analytics_events
  FOR INSERT
  WITH CHECK (true);

-- Policy: Allow read only with service role key (for admin dashboard)
CREATE POLICY "Allow service role read" ON analytics_events
  FOR SELECT
  USING (true);

-- Grant permissions
GRANT INSERT ON analytics_events TO anon, authenticated;
GRANT SELECT ON analytics_events TO service_role;
GRANT SELECT ON analytics_unique_visitors_daily TO service_role;
GRANT SELECT ON analytics_top_pages TO service_role;
GRANT SELECT ON analytics_referrer_sources TO service_role;
