-- Just reset this ONE user to test welcome email
-- Copy and paste this into Supabase SQL Editor and click RUN

UPDATE public.user_profiles
SET welcome_email_sent = FALSE
WHERE id = 'cc52a437-6ccb-4125-ade4-68c2e9c170f3';

-- Check it worked
SELECT id, full_name, welcome_email_sent
FROM public.user_profiles
WHERE id = 'cc52a437-6ccb-4125-ade4-68c2e9c170f3';

-- You should see: welcome_email_sent = false
-- Then sign out and sign in again!
