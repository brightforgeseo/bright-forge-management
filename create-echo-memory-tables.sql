-- Create Echo AI Memory System Tables
-- Run this in your Supabase SQL Editor

-- =====================================================
-- ECHO CONVERSATIONS TABLE
-- Stores all Echo AI conversations for memory and learning
-- =====================================================

CREATE TABLE IF NOT EXISTS echo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  echo_response TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_echo_conv_user_date ON echo_conversations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_echo_conv_channel_date ON echo_conversations(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_echo_conv_created ON echo_conversations(created_at DESC);

-- Enable RLS
ALTER TABLE echo_conversations ENABLE ROW LEVEL SECURITY;

-- Users can view their own conversations
CREATE POLICY "Users can view their own Echo conversations"
  ON echo_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own conversations
CREATE POLICY "Users can insert their own Echo conversations"
  ON echo_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- ECHO KNOWLEDGE BASE (Optional - for Phase 3)
-- Stores business knowledge with vector embeddings
-- =====================================================

-- Uncomment when ready for Phase 3 (Vector Search)
/*
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS echo_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI ada-002 embeddings
  metadata JSONB DEFAULT '{}',
  category TEXT, -- 'client', 'project', 'guideline', 'conversation'
  source TEXT, -- Where this knowledge came from
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_echo_knowledge_embedding
  ON echo_knowledge USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Regular indexes
CREATE INDEX IF NOT EXISTS idx_echo_knowledge_category ON echo_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_echo_knowledge_created ON echo_knowledge(created_at DESC);

-- RLS
ALTER TABLE echo_knowledge ENABLE ROW LEVEL SECURITY;

-- Everyone can read knowledge base
CREATE POLICY "All users can read Echo knowledge"
  ON echo_knowledge FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only owners can insert knowledge
CREATE POLICY "Owners can insert Echo knowledge"
  ON echo_knowledge FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM profiles WHERE role = 'Owner'
    )
  );
*/

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT
  'Echo Memory Tables Created!' AS status,
  (SELECT COUNT(*) FROM echo_conversations) AS conversation_count;
