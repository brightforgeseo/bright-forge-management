-- Get all user IDs for mapping Monday.com names to Supabase UUIDs
SELECT
    p.id as user_id,
    p.full_name,
    u.email
FROM profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.full_name;
