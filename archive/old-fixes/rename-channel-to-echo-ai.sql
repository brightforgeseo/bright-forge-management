-- Rename ask-ai channel to echo-ai
-- Run this in your Supabase SQL editor

UPDATE channels
SET name = 'echo-ai'
WHERE name = 'ask-ai';

-- Verify the change
SELECT id, name, type, is_private
FROM channels
WHERE name IN ('echo-ai', 'general')
ORDER BY name;
