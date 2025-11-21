-- ================================================
-- CLEANUP DUPLICATE NOTIFICATIONS
-- ================================================
-- This will remove duplicate "Task Due Today" notifications
-- and keep only the most recent one for each task

-- Step 1: See what we have (for review)
SELECT
    title,
    message,
    type,
    link_data->>'taskId' as task_id,
    link_data->>'boardId' as board_id,
    created_at,
    is_read
FROM notifications
WHERE title ILIKE '%due%'
ORDER BY created_at DESC;

-- Step 2: Delete old duplicate "Task Due Today" notifications
-- Keep only the most recent notification for each task
DELETE FROM notifications
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY
                    user_id,
                    link_data->>'taskId',
                    link_data->>'boardId'
                ORDER BY created_at DESC
            ) as rn
        FROM notifications
        WHERE title = 'Task Due Today'
          AND type = 'alert'
    ) t
    WHERE rn > 1  -- Keep the first (most recent), delete the rest
);

-- Step 3: Optional - Delete ALL old due date notifications older than 7 days
-- Uncomment if you want to run this:
-- DELETE FROM notifications
-- WHERE title = 'Task Due Today'
--   AND created_at < NOW() - INTERVAL '7 days';

-- Step 4: Optional - Clear ALL notifications for your account (nuclear option)
-- Replace 'your-user-id-here' with your actual user_id
-- Uncomment to use:
-- DELETE FROM notifications WHERE user_id = 'your-user-id-here';

-- Step 5: Verify cleanup worked
SELECT
    COUNT(*) as total_notifications,
    COUNT(*) FILTER (WHERE is_read = false) as unread_count,
    COUNT(*) FILTER (WHERE title = 'Task Due Today') as due_today_count
FROM notifications
WHERE user_id = auth.uid();
