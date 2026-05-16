# Echo AI Memory & Learning System

## Overview
Give Echo persistent memory about Bright Forge SEO, clients, projects, and conversations.

## Option 1: Supabase Vector Store (Recommended)

### Setup

1. **Enable pgvector in Supabase**
```sql
-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a table for Echo's knowledge base
CREATE TABLE echo_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI embeddings are 1536 dimensions
  metadata JSONB, -- Store source, date, category, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create an index for fast similarity search
CREATE INDEX ON echo_knowledge USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create a table for conversation memory
CREATE TABLE echo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  channel_id UUID REFERENCES channels(id),
  message TEXT NOT NULL,
  response TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast conversation retrieval
CREATE INDEX idx_echo_conv_user ON echo_conversations(user_id, created_at DESC);
CREATE INDEX idx_echo_conv_channel ON echo_conversations(channel_id, created_at DESC);
```

2. **Install OpenAI SDK** (for embeddings)
```bash
npm install openai
```

3. **Create Memory Service**

See `services/echoMemory.ts` for the implementation.

### How It Works

1. **When user asks a question:**
   - Convert question to embedding
   - Search vector database for relevant context
   - Include context in Gemini prompt
   - Gemini answers with full knowledge

2. **Store conversations:**
   - Every Echo interaction is saved
   - Can retrieve past conversations
   - Build context over time

3. **Add knowledge manually:**
   - Upload client briefs
   - Add project information
   - Store SOPs and guidelines

## Option 2: Gemini's Prompt Caching (Simple & Cost-Effective)

Use Gemini's built-in prompt caching to store business context:

```typescript
// Load all business context once
const businessContext = `
${BRIGHT_FORGE_AGENCY_INFO}
${CLIENT_BRIEFS}
${RECENT_PROJECTS}
${TEAM_GUIDELINES}
`;

// Use system prompt with caching
const response = await client.messages.create({
  model: 'gemini-sonnet-4-20250514',
  system: [
    {
      type: 'text',
      text: businessContext,
      cache_control: { type: 'ephemeral' } // Cache this!
    },
    {
      type: 'text',
      text: 'You are Echo, Bright Forge AI assistant...'
    }
  ],
  messages: [...]
});
```

**Benefits:**
- 90% cost reduction on repeated context
- No additional database needed
- Works immediately

**Limitations:**
- Cache expires after 5 minutes of inactivity
- Can't search/query the knowledge
- Fixed context, not dynamic

## Option 3: Hybrid Approach (Best Balance)

Combine both methods:

1. **Prompt Caching**: Store static business info (agency details, guidelines)
2. **Vector DB**: Store dynamic info (client projects, conversations, documents)
3. **Conversation History**: Last 10-20 messages in channel

```typescript
// 1. Load cached business context
const staticContext = getCachedBusinessContext();

// 2. Search vector DB for relevant knowledge
const relevantKnowledge = await searchEchoKnowledge(userQuestion);

// 3. Get recent conversation history
const recentHistory = messages.slice(-20);

// 4. Combine and send to Gemini
const response = await client.messages.create({
  model: 'gemini-3-5-haiku-20241022',
  system: [
    { type: 'text', text: staticContext, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: relevantKnowledge }
  ],
  messages: formatHistory(recentHistory) + userMessage
});
```

## What to Store

### Essential Knowledge Base:
- ✅ Agency info (already done via `skillsLoader.ts`)
- ✅ Client briefs and project details
- ✅ Team member info and roles
- ✅ Past conversations and decisions
- ✅ Common questions and answers
- ✅ SEO guidelines and best practices
- ✅ Monthly reports and results

### Auto-Learning:
- Every Echo conversation
- User feedback ("that was helpful")
- Document uploads
- Email summaries
- Slack/chat messages about clients

## Implementation Priority

### Phase 1: Prompt Caching (Do Now)
- Already 80% done with `skillsLoader.ts`
- Add `cache_control` to system prompts
- Load client briefs dynamically

### Phase 2: Conversation Memory (Next Week)
- Store every Echo interaction in database
- Retrieve last 50 conversations per user
- Search past conversations

### Phase 3: Vector Store (Month 2)
- Enable pgvector in Supabase
- Create embeddings for all knowledge
- Semantic search for questions

## Cost Comparison

### Prompt Caching:
- First request: $0.015 (5,000 tokens)
- Cached requests: $0.0015 (90% savings)
- 880 messages/month: ~$1.65/month

### Vector Database:
- Embeddings: $0.0001 per 1K tokens
- 10,000 knowledge items: ~$1/month
- Storage: Included in Supabase
- Total: ~$2-3/month

### Combined:
- ~$5/month for full memory system
- Unlimited learning capability
- Perfect recall

## Next Steps

1. Enable prompt caching (10 minutes)
2. Create conversation storage (30 minutes)
3. Build knowledge base UI (2 hours)
4. Enable vector search (4 hours)

Would you like me to implement any of these?
