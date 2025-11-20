-- ========================================
-- SIMPLE FIX: Just run this!
-- Fixes missing profiles and enables realtime
-- ========================================

-- Part 1: Create missing profiles
INSERT INTO profiles (id, full_name)
SELECT
    u.id,
    COALESCE(
        u.raw_user_meta_data->>'full_name',
        split_part(u.email, '@', 1)
    )
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = u.id
);

-- Part 2: Show results
SELECT
    'Profiles created' as status,
    (SELECT COUNT(*) FROM profiles) as total_profiles,
    (SELECT COUNT(*) FROM auth.users) as total_users;

-- Part 3: Enable realtime (ignore errors if already enabled)
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE channels;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Part 4: Verify
SELECT 'Setup complete!' as message;
