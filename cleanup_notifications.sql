-- ================================================
-- CLEANUP DUPLICATE NOTIFICATIONS
-- ================================================
-- This will remove duplicate "Task Due Today" notifications
-- and keep only the most recent one for each task

-- Step 1: See what we have (for review)
SELECT
    id,
    title,
    message,
    type,
    CASE
        WHEN link_data IS NOT NULL THEN
            CASE
                WHEN link_data::text LIKE '{%' THEN (link_data::jsonb)->>'taskId'
                ELSE NULL
            END
        ELSE NULL
    END as task_id,
    created_at,
    is_read
FROM notifications
WHERE title ILIKE '%due%'
ORDER BY created_at DESC
LIMIT 50;

-- Step 2: Delete old duplicate "Task Due Today" notifications
-- Keep only the most recent notification for each task
-- This version works by comparing the full message text
DELETE FROM notifications
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY
                    user_id,
                    message  -- Group by the exact message text
                ORDER BY created_at DESC
            ) as rn
        FROM notifications
        WHERE title = 'Task Due Today'
          AND type = 'alert'
    ) t
    WHERE rn > 1  -- Keep the first (most recent), delete the rest
);

-- Step 3: Verify cleanup worked
SELECT
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE is_read = false) as unread_count,
    COUNT(*) FILTER (WHERE title = 'Task Due Today') as due_today_count
FROM notifications
WHERE user_id = auth.uid();

-- ================================================
-- OPTIONAL CLEANUP STEPS
-- ================================================

-- Option A: Delete old notifications (7+ days)
-- DELETE FROM notifications
-- WHERE user_id = auth.uid()
--   AND created_at < NOW() - INTERVAL '7 days';

-- Option B: Clear ALL your notifications (nuclear option)
-- DELETE FROM notifications WHERE user_id = auth.uid();
