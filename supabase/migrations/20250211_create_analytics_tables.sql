-- =====================================================
-- Analytics & User Activity Tracking System
-- =====================================================
-- This migration creates tables for tracking:
-- 1. Page views and user events
-- 2. User sessions
-- 3. Admin views for analytics
-- =====================================================

-- =====================================================
-- 1. ANALYTICS EVENTS TABLE
-- =====================================================
-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Event Classification
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'click', 'form_submit', 'custom')),
  
  -- Page Information
  page_path TEXT NOT NULL,
  page_title TEXT,
  referrer TEXT,
  referrer_domain TEXT,
  
  -- User Identification (optional - links to auth if available)
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visitor_id TEXT NOT NULL, -- Unique ID from localStorage
  session_id TEXT NOT NULL, -- Session-based ID
  
  -- UTM Parameters
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  -- Device & Browser Info
  user_agent TEXT,
  device_type TEXT CHECK (device_type IN ('desktop', 'mobile', 'tablet')),
  browser TEXT,
  os TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  
  -- Geographic Data
  ip_address TEXT,
  country TEXT,
  city TEXT,
  
  -- Additional Data
  duration INTEGER, -- Time spent on page in seconds
  metadata JSONB DEFAULT '{}'::JSONB, -- Flexible storage for custom data
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add user_id column if it doesn't exist (for existing tables)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analytics_events' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =====================================================
-- 2. USER SESSIONS TABLE (Aggregated session data)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- User Identification
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  
  -- Session Details
  first_page TEXT,
  last_page TEXT,
  page_count INTEGER DEFAULT 0,
  total_duration INTEGER DEFAULT 0, -- Total seconds in session
  
  -- Device & Location
  device_type TEXT,
  browser TEXT,
  os TEXT,
  country TEXT,
  city TEXT,
  
  -- UTM Parameters (from first page)
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Analytics Events Indexes
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_visitor_id ON analytics_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session_id ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_page_path ON analytics_events(page_path);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_country ON analytics_events(country);
CREATE INDEX IF NOT EXISTS idx_analytics_events_device_type ON analytics_events(device_type);

-- User Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_visitor_id ON user_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_started_at ON user_sessions(started_at DESC);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role (backend) can insert analytics
-- Admin can view all analytics (checked in application layer)
CREATE POLICY "Service role can insert analytics" ON analytics_events
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can insert sessions" ON user_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update sessions" ON user_sessions
  FOR UPDATE USING (true);

-- =====================================================
-- ANALYTICS VIEWS FOR ADMIN DASHBOARD
-- =====================================================

-- View: User Activity Summary
CREATE OR REPLACE VIEW admin_user_activity AS
SELECT
  up.id as user_id,
  up.full_name,
  up.avatar_url,
  up.created_at as signed_up_at,
  up.last_seen_at,
  up.total_lessons_completed,
  up.current_streak,
  COUNT(DISTINCT ae.session_id) FILTER (WHERE ae.user_id = up.id) as total_sessions,
  COUNT(ae.id) FILTER (WHERE ae.user_id = up.id AND ae.event_type = 'page_view') as total_page_views,
  MAX(ae.created_at) FILTER (WHERE ae.user_id = up.id) as last_activity,
  COUNT(DISTINCT ae.page_path) FILTER (WHERE ae.user_id = up.id) as unique_pages_visited,
  COUNT(DISTINCT lc.id) as total_comments
FROM user_profiles up
LEFT JOIN analytics_events ae ON up.id = ae.user_id
LEFT JOIN lesson_comments lc ON up.id = lc.user_id
GROUP BY up.id, up.full_name, up.avatar_url, up.created_at, up.last_seen_at, 
         up.total_lessons_completed, up.current_streak;

-- View: Most Visited Pages
CREATE OR REPLACE VIEW admin_popular_pages AS
SELECT
  page_path,
  page_title,
  COUNT(*) as view_count,
  COUNT(DISTINCT visitor_id) as unique_visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as authenticated_users,
  AVG(duration) FILTER (WHERE duration IS NOT NULL) as avg_duration_seconds,
  MAX(created_at) as last_viewed
FROM analytics_events
WHERE event_type = 'page_view'
GROUP BY page_path, page_title
ORDER BY view_count DESC;

-- View: Daily Active Users
CREATE OR REPLACE VIEW admin_daily_active_users AS
SELECT
  DATE(created_at) as date,
  COUNT(DISTINCT visitor_id) as total_visitors,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) as authenticated_users,
  COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views
FROM analytics_events
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- View: Traffic Sources
CREATE OR REPLACE VIEW admin_traffic_sources AS
SELECT
  COALESCE(utm_source, 'Direct') as source,
  COALESCE(utm_medium, 'None') as medium,
  COALESCE(utm_campaign, 'None') as campaign,
  COUNT(DISTINCT visitor_id) as visitors,
  COUNT(*) as total_events
FROM analytics_events
GROUP BY utm_source, utm_medium, utm_campaign
ORDER BY visitors DESC;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update or create user session
CREATE OR REPLACE FUNCTION upsert_user_session(
  p_user_id UUID,
  p_visitor_id TEXT,
  p_session_id TEXT,
  p_page_path TEXT,
  p_duration INTEGER,
  p_device_type TEXT,
  p_browser TEXT,
  p_os TEXT,
  p_country TEXT,
  p_city TEXT,
  p_utm_source TEXT,
  p_utm_medium TEXT,
  p_utm_campaign TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO user_sessions (
    user_id, visitor_id, session_id, first_page, last_page,
    page_count, total_duration, device_type, browser, os,
    country, city, utm_source, utm_medium, utm_campaign,
    started_at, ended_at, updated_at
  ) VALUES (
    p_user_id, p_visitor_id, p_session_id, p_page_path, p_page_path,
    1, COALESCE(p_duration, 0), p_device_type, p_browser, p_os,
    p_country, p_city, p_utm_source, p_utm_medium, p_utm_campaign,
    NOW(), NOW(), NOW()
  )
  ON CONFLICT (session_id)
  DO UPDATE SET
    last_page = p_page_path,
    page_count = user_sessions.page_count + 1,
    total_duration = user_sessions.total_duration + COALESCE(p_duration, 0),
    ended_at = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE analytics_events IS 'Stores all analytics events including page views and custom events';
COMMENT ON TABLE user_sessions IS 'Aggregated session data for users';
COMMENT ON VIEW admin_user_activity IS 'Summary of user activity for admin dashboard';
COMMENT ON VIEW admin_popular_pages IS 'Most visited pages with engagement metrics';
COMMENT ON VIEW admin_daily_active_users IS 'Daily active user statistics';
COMMENT ON VIEW admin_traffic_sources IS 'Traffic source attribution data';
