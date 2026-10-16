-- The January 2025 trigger on user_profiles set welcome_email_sent = TRUE on every new profile
-- without sending anything (its email call was a TODO). Since /api/send-welcome-email now uses
-- that flag as its once-only guard, the trigger silently blocked every welcome email.
-- The API route alone owns the flag: it sends, then sets it.
drop trigger if exists on_user_profile_created on public.user_profiles;
drop function if exists public.send_welcome_email();
