-- ============================================================================
-- PUSH_NOTIFICATIONS_SETUP.sql
-- One-time setup for web push notifications.
-- Idempotent — safe to re-run.
--
-- Prereqs:
--   1) Generate VAPID keys (see PUSH_NOTIFICATIONS_README.md)
--   2) Deploy the send-push edge function
--   3) Set the Postgres GUC variables below to point to the function
-- ============================================================================

-- 1) Subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON push_subscriptions (user_id);

-- 2) RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own push subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can insert their own push subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can update their own push subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Users can delete their own push subscriptions" ON push_subscriptions;

CREATE POLICY "Users can view their own push subscriptions"
  ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own push subscriptions"
  ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own push subscriptions"
  ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own push subscriptions"
  ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 3) pg_net extension — required for the trigger to call the edge function
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 4) Configure these once (project URL + service role key + edge function path).
--    Run these in the SQL editor, replacing the values for your project.
--
--    ALTER DATABASE postgres SET app.settings.send_push_url
--      = 'https://<YOUR-PROJECT>.supabase.co/functions/v1/send-push';
--    ALTER DATABASE postgres SET app.settings.service_role_key
--      = '<YOUR-SUPABASE-SERVICE-ROLE-KEY>';

-- 5) Trigger function — fires after every notifications INSERT, calls send-push.
CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  send_url TEXT;
  service_key TEXT;
BEGIN
  -- Read GUC config; bail silently if not configured (so the app still works)
  BEGIN
    send_url := current_setting('app.settings.send_push_url', true);
    service_key := current_setting('app.settings.service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF send_url IS NULL OR send_url = '' OR service_key IS NULL OR service_key = '' THEN
    RETURN NEW;
  END IF;

  PERFORM extensions.http_post(
    url := send_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'userId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'tag', COALESCE(NEW.id::text, ''),
      'linkView', NEW.link_view,
      'linkData', NEW.link_data,
      'notificationId', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a push failure block the notification insert
  RAISE WARNING 'send-push trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_send_push ON notifications;
CREATE TRIGGER notifications_send_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notify_push_on_notification_insert();

-- DONE. After deploying the edge function and setting the GUCs, every
-- INSERT into notifications will fire a web push to all the user's devices.
