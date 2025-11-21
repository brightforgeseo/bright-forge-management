/**
 * Echo AI Vector Memory System
 * Enables semantic search through business knowledge using embeddings
 */

import OpenAI from 'openai';
import { supabase } from '../lib/supabaseClient';

// Import config
let openaiApiKey: string | undefined;
try {
  const { config } = require('../config');
  openaiApiKey = config?.openaiApiKey;
} catch (e) {
  console.error('Config not found');
}

const getOpenAIClient = () => {
  if (!openaiApiKey || openaiApiKey === 'your-openai-api-key-here') {
    throw new Error('OpenAI API key not configured');
  }
  return new OpenAI({ apiKey: openaiApiKey, dangerouslyAllowBrowser: true });
};

/**
 * Generate embedding for text using OpenAI
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });

  return response.data[0].embedding;
};

/**
 * Add knowledge to Echo's memory with embedding
 */
export const addKnowledge = async (
  content: string,
  category: string,
  source: string,
  metadata?: any
) => {
  try {
    console.log('[Echo Vector] Generating embedding for knowledge...');
    const embedding = await generateEmbedding(content);

    const { data, error } = await supabase
      .from('echo_knowledge')
      .insert({
        content,
        embedding,
        category,
        source,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('[Echo Vector] Failed to add knowledge:', error);
      return null;
    }

    console.log('[Echo Vector] ✅ Knowledge added:', category, source);
    return data;
  } catch (err) {
    console.error('[Echo Vector] Error adding knowledge:', err);
    return null;
  }
};

/**
 * Search knowledge base using semantic similarity
 */
export const searchKnowledge = async (
  query: string,
  limit: number = 5
): Promise<any[]> => {
  try {
    console.log('[Echo Vector] Searching for:', query);

    // Generate embedding for the search query
    const queryEmbedding = await generateEmbedding(query);

    // Use Supabase RPC function for vector similarity search
    const { data, error } = await supabase.rpc('match_knowledge', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7, // Similarity threshold (0-1)
      match_count: limit
    });

    if (error) {
      console.error('[Echo Vector] Search failed:', error);
      return [];
    }

    console.log('[Echo Vector] Found', data?.length || 0, 'relevant results');
    return data || [];
  } catch (err) {
    console.error('[Echo Vector] Search error:', err);
    return [];
  }
};

/**
 * Build context from vector search results
 */
export const buildKnowledgeContext = async (query: string): Promise<string> => {
  const results = await searchKnowledge(query, 3);

  if (results.length === 0) {
    return '';
  }

  const context = results
    .map((r, i) => `[Knowledge ${i + 1}] ${r.content}`)
    .join('\n\n');

  return `\n\nRelevant Knowledge:\n${context}\n`;
};

/**
 * Bulk add knowledge from array
 */
export const bulkAddKnowledge = async (
  items: Array<{
    content: string;
    category: string;
    source: string;
    metadata?: any;
  }>
) => {
  console.log(`[Echo Vector] Adding ${items.length} items to knowledge base...`);

  const results = [];
  for (const item of items) {
    const result = await addKnowledge(
      item.content,
      item.category,
      item.source,
      item.metadata
    );
    results.push(result);

    // Add small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const successful = results.filter(r => r !== null).length;
  console.log(`[Echo Vector] ✅ Added ${successful}/${items.length} items`);

  return results;
};
