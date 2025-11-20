-- Bright Forge Portal Database Schema
-- Run these commands in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  email TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
    DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Allowed users (invites)
CREATE TABLE IF NOT EXISTS allowed_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'Team Member',
  full_name TEXT,
  temp_password TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Channels table (for team chat and DMs)
CREATE TABLE IF NOT EXISTS channels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'channel', -- 'channel' or 'dm'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- Channels policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Channels are viewable by everyone" ON channels;
    DROP POLICY IF EXISTS "Only authenticated users can create channels" ON channels;
    DROP POLICY IF EXISTS "Only authenticated users can delete channels" ON channels;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Channels are viewable by everyone" ON channels FOR SELECT USING (true);
CREATE POLICY "Only authenticated users can create channels" ON channels FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Only authenticated users can delete channels" ON channels FOR DELETE USING (auth.role() = 'authenticated');

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  is_ai BOOLEAN DEFAULT false,
  avatar TEXT,
  attachment_url TEXT,
  attachment_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat messages policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Messages are viewable by everyone" ON chat_messages;
    DROP POLICY IF EXISTS "Authenticated users can send messages" ON chat_messages;
    DROP POLICY IF EXISTS "Authenticated users can delete messages" ON chat_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Messages are viewable by everyone" ON chat_messages FOR SELECT USING (true);
CREATE POLICY "Authenticated users can send messages" ON chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete messages" ON chat_messages FOR DELETE USING (auth.role() = 'authenticated');

-- Client boards table
CREATE TABLE IF NOT EXISTS client_boards (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  board_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE client_boards ENABLE ROW LEVEL SECURITY;

-- Client boards policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Boards are viewable by everyone" ON client_boards;
    DROP POLICY IF EXISTS "Authenticated users can create boards" ON client_boards;
    DROP POLICY IF EXISTS "Authenticated users can update boards" ON client_boards;
    DROP POLICY IF EXISTS "Authenticated users can delete boards" ON client_boards;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Boards are viewable by everyone" ON client_boards FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create boards" ON client_boards FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update boards" ON client_boards FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can delete boards" ON client_boards FOR DELETE USING (auth.role() = 'authenticated');

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info', -- 'info', 'success', 'alert', 'message'
  link_view TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Notifications policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
    DROP POLICY IF EXISTS "Authenticated users can create notifications" ON notifications;
    DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users can view their own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can create notifications" ON notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update their own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);

-- Create default channels
INSERT INTO channels (name, type) VALUES ('general', 'channel') ON CONFLICT (name) DO NOTHING;
INSERT INTO channels (name, type) VALUES ('ask-ai', 'channel') ON CONFLICT (name) DO NOTHING;

-- Create storage bucket for uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Anyone can upload files" ON storage.objects;
    DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;
    DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Anyone can upload files" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads');
CREATE POLICY "Anyone can view files" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');
CREATE POLICY "Authenticated users can delete files" ON storage.objects FOR DELETE USING (bucket_id = 'uploads' AND auth.role() = 'authenticated');

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
