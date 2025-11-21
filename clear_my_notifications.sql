-- ================================================
-- CLEAR ALL MY NOTIFICATIONS (Quick Fix)
-- ================================================
-- This will delete ALL your notifications
-- Run this in Supabase SQL Editor when logged in

-- Delete all notifications for the current logged-in user
DELETE FROM notifications WHERE user_id = auth.uid();

-- Verify they're gone
SELECT COUNT(*) as remaining_notifications
FROM notifications
WHERE user_id = auth.uid();

-- Expected result: 0 rows
