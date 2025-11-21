-- ================================================
-- SIMPLE CLEANUP - Remove ALL Duplicate Notifications
-- ================================================
-- This keeps only the most recent notification for each unique message

-- PREVIEW: See what will be deleted
SELECT
    COUNT(*) as total_notifications,
    COUNT(DISTINCT message) as unique_messages,
    COUNT(*) - COUNT(DISTINCT message) as duplicates_to_delete
FROM notifications
WHERE user_id = auth.uid()
  AND title = 'Task Due Today';

-- CLEANUP: Keep only the newest of each duplicate
DELETE FROM notifications
WHERE id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY user_id, message
                ORDER BY created_at DESC
            ) as row_num
        FROM notifications
        WHERE user_id = auth.uid()
          AND title = 'Task Due Today'
    ) ranked
    WHERE row_num > 1
);

-- VERIFY: Check results
SELECT
    COUNT(*) as remaining_notifications
FROM notifications
WHERE user_id = auth.uid()
  AND title = 'Task Due Today';
