-- =====================================================
-- RESET WELCOME EMAIL FLAG FOR TESTING
-- =====================================================
-- Run this to reset your user's welcome_email_sent flag
-- so you can test the welcome email flow
-- =====================================================

-- Reset YOUR user (replace with your user ID if different)
UPDATE public.user_profiles
SET welcome_email_sent = FALSE
WHERE id = 'a4ab28f1-006d-4989-b038-ef8e6e7ae5bd';

-- Or reset by email (safer - replace with your email)
-- UPDATE public.user_profiles up
-- SET welcome_email_sent = FALSE
-- FROM auth.users au
-- WHERE au.id = up.id
-- AND au.email = 'your-email@example.com';

-- Verify it was updated
SELECT
  up.id,
  up.full_name,
  up.welcome_email_sent,
  up.created_at,
  au.email
FROM public.user_profiles up
JOIN auth.users au ON au.id = up.id
WHERE up.id = 'a4ab28f1-006d-4989-b038-ef8e6e7ae5bd';

-- Expected result: welcome_email_sent = FALSE
