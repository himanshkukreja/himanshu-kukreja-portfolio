-- Check if the trigger function explicitly sets welcome_email_sent
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'create_user_profile';

-- What to look for in the output:
-- The INSERT statement should include:
--   INSERT INTO public.user_profiles (
--     id,
--     full_name,
--     avatar_url,
--     welcome_email_sent     <-- This column should be listed
--   )
--   VALUES (
--     NEW.id,
--     display_name,
--     user_avatar,
--     FALSE                  <-- This should be FALSE
--   )
--
-- If welcome_email_sent is NOT in the column list,
-- then it's using the table default, which might not be working correctly!
