-- STEP 3 — Run this in the Supabase SQL Editor.
-- Replaces the trigger function with one that has the URL + service-role key
-- baked in directly, so we don't need ALTER DATABASE permission.

CREATE OR REPLACE FUNCTION notify_push_on_notification_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM extensions.http_post(
    url := 'https://mvkbmozwplhsduiiakql.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a2Jtb3p3cGxoc2R1aWlha3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDcyMzE2NiwiZXhwIjoyMDcwMjk5MTY2fQ.tZrqZjGl_wspvHCOAXBT4-4m_EC8v3w7bdXWud4D5W4'
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
  RAISE WARNING 'send-push trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
