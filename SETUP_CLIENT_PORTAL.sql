-- ============================================
-- CLIENT PORTAL DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Partner Accounts Table
-- Stores partner login credentials and email connection info
CREATE TABLE IF NOT EXISTS partner_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  email_provider TEXT CHECK (email_provider IN ('gmail', 'outlook', NULL)),
  email_access_token TEXT,
  email_refresh_token TEXT,
  email_token_expires_at TIMESTAMPTZ,
  email_address TEXT, -- Connected email address for sending
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 2. Partner Client Access Table
-- Links partners to which clients they can see
CREATE TABLE IF NOT EXISTS partner_client_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES partner_accounts(id) ON DELETE CASCADE,
  client_board_id TEXT NOT NULL, -- References board_data.id in client_boards (JSONB)
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(partner_id, client_board_id)
);

-- 3. Partner Tasks Table
-- Partner-specific task assignments with visible notes
CREATE TABLE IF NOT EXISTS partner_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES partner_accounts(id) ON DELETE CASCADE,
  client_board_id TEXT NOT NULL, -- References board in client_boards
  task_id TEXT NOT NULL, -- References task.id in board_data JSONB
  group_id TEXT NOT NULL, -- References group.id in board_data JSONB
  visible_notes TEXT, -- Notes visible to partner (from internal team)
  partner_status TEXT DEFAULT 'assigned' CHECK (partner_status IN (
    'assigned', 'in_progress', 'needs_content', 'send_email', 'email_sent', 'completed'
  )),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  UNIQUE(partner_id, task_id)
);

-- 4. Partner Messages Table
-- Direct messages between partners and Ben (1:1 only)
CREATE TABLE IF NOT EXISTS partner_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES partner_accounts(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('partner', 'team')),
  sender_id UUID, -- Either partner_accounts.id or profiles.id
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  attachment_url TEXT,
  attachment_type TEXT CHECK (attachment_type IN ('image', 'file', NULL)),
  attachment_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Partner Emails Table
-- Email drafts and sent emails
CREATE TABLE IF NOT EXISTS partner_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_id UUID REFERENCES partner_accounts(id) ON DELETE CASCADE,
  task_id UUID REFERENCES partner_tasks(id) ON DELETE SET NULL,
  client_email TEXT NOT NULL,
  client_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'sent', 'failed')),
  ai_generated BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_partner_client_access_partner ON partner_client_access(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_tasks_partner ON partner_tasks(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_tasks_client ON partner_tasks(client_board_id);
CREATE INDEX IF NOT EXISTS idx_partner_messages_partner ON partner_messages(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_messages_created ON partner_messages(partner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_emails_partner ON partner_emails(partner_id);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE partner_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_emails ENABLE ROW LEVEL SECURITY;

-- Partner Accounts Policies
CREATE POLICY "Partners can view own account" ON partner_accounts
  FOR SELECT USING (
    id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Owner')
  );

CREATE POLICY "Admins can manage partner accounts" ON partner_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Owner', 'Admin'))
  );

-- Partner Client Access Policies
CREATE POLICY "Partners can view own client access" ON partner_client_access
  FOR SELECT USING (partner_id = auth.uid());

CREATE POLICY "Admins can manage client access" ON partner_client_access
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Owner', 'Admin'))
  );

-- Partner Tasks Policies
CREATE POLICY "Partners can view own tasks" ON partner_tasks
  FOR SELECT USING (partner_id = auth.uid());

CREATE POLICY "Partners can update own task status" ON partner_tasks
  FOR UPDATE USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Admins can manage all partner tasks" ON partner_tasks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Owner', 'Admin'))
  );

-- Partner Messages Policies
CREATE POLICY "Partners can view own messages" ON partner_messages
  FOR SELECT USING (partner_id = auth.uid());

CREATE POLICY "Partners can send messages" ON partner_messages
  FOR INSERT WITH CHECK (
    partner_id = auth.uid() AND sender_type = 'partner'
  );

CREATE POLICY "Partners can mark messages as read" ON partner_messages
  FOR UPDATE USING (partner_id = auth.uid())
  WITH CHECK (partner_id = auth.uid());

CREATE POLICY "Admins can manage all messages" ON partner_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Owner', 'Admin'))
  );

-- Partner Emails Policies
CREATE POLICY "Partners can view own emails" ON partner_emails
  FOR SELECT USING (partner_id = auth.uid());

CREATE POLICY "Partners can manage own emails" ON partner_emails
  FOR ALL USING (partner_id = auth.uid());

CREATE POLICY "Admins can view all emails" ON partner_emails
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Owner', 'Admin'))
  );

-- ============================================
-- REALTIME
-- ============================================

-- Enable realtime for partner messages
ALTER TABLE partner_messages REPLICA IDENTITY FULL;

-- Add to realtime publication (run only if publication exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE partner_messages;
  END IF;
END $$;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_partner_accounts_updated_at
  BEFORE UPDATE ON partner_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_partner_emails_updated_at
  BEFORE UPDATE ON partner_emails
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT ALL ON partner_accounts TO authenticated;
GRANT ALL ON partner_client_access TO authenticated;
GRANT ALL ON partner_tasks TO authenticated;
GRANT ALL ON partner_messages TO authenticated;
GRANT ALL ON partner_emails TO authenticated;
