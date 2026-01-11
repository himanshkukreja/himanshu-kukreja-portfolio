-- =====================================================
-- QUICK TEST: Reset current user to test email NOW
-- =====================================================

-- Reset the most recent user to FALSE
UPDATE public.user_profiles
SET welcome_email_sent = FALSE
WHERE id = 'b4fd1782-c5c8-4260-9292-7f9c08eb3907';

-- Verify it was updated
SELECT id, full_name, welcome_email_sent, created_at
FROM public.user_profiles
WHERE id = 'b4fd1782-c5c8-4260-9292-7f9c08eb3907';

-- Expected: welcome_email_sent should now be FALSE

-- =====================================================
-- After running this:
-- 1. Sign out from your app
-- 2. Sign in again
-- 3. Welcome email should be sent!
-- 4. Check terminal logs
-- =====================================================
