/**
 * Echo AI Memory System
 * Stores and retrieves conversations for context and learning
 */

import { supabase } from '../lib/supabaseClient';

export interface EchoConversation {
  id: string;
  user_id: string;
  channel_id: string;
  user_message: string;
  echo_response: string;
  metadata?: {
    helpful?: boolean;
    topic?: string;
    client_mentioned?: string;
  };
  created_at: string;
}

/**
 * Store an Echo conversation for future reference
 */
export const storeEchoConversation = async (
  userId: string,
  channelId: string,
  userMessage: string,
  echoResponse: string,
  metadata?: any
) => {
  try {
    const { data, error } = await supabase
      .from('echo_conversations')
      .insert({
        user_id: userId,
        channel_id: channelId,
        user_message: userMessage,
        echo_response: echoResponse,
        metadata: metadata || {}
      })
      .select()
      .single();

    if (error) {
      console.error('[Echo Memory] Failed to store conversation:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('[Echo Memory] Error storing conversation:', err);
    return null;
  }
};

/**
 * Get recent conversations for a user (for context)
 */
export const getRecentConversations = async (
  userId: string,
  limit: number = 20
): Promise<EchoConversation[]> => {
  try {
    const { data, error } = await supabase
      .from('echo_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Echo Memory] Failed to retrieve conversations:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Echo Memory] Error retrieving conversations:', err);
    return [];
  }
};

/**
 * Get conversations about a specific topic (simple keyword search)
 */
export const searchConversations = async (
  userId: string,
  searchQuery: string,
  limit: number = 10
): Promise<EchoConversation[]> => {
  try {
    const { data, error } = await supabase
      .from('echo_conversations')
      .select('*')
      .eq('user_id', userId)
      .or(`user_message.ilike.%${searchQuery}%,echo_response.ilike.%${searchQuery}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[Echo Memory] Failed to search conversations:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('[Echo Memory] Error searching conversations:', err);
    return [];
  }
};

/**
 * Build context from recent conversations for Echo
 */
export const buildConversationContext = async (
  userId: string,
  channelId: string
): Promise<string> => {
  try {
    // Get last 10 conversations from this user
    const conversations = await getRecentConversations(userId, 10);

    if (conversations.length === 0) {
      return '';
    }

    // Format as context
    const context = conversations
      .reverse() // Oldest first
      .map(conv => {
        const date = new Date(conv.created_at).toLocaleDateString();
        return `[${date}] User: ${conv.user_message}\nEcho: ${conv.echo_response}`;
      })
      .join('\n\n');

    return `\n\nPrevious conversations with this user:\n${context}\n`;
  } catch (err) {
    console.error('[Echo Memory] Error building context:', err);
    return '';
  }
};

/**
 * Mark a conversation as helpful (for learning)
 */
export const markConversationHelpful = async (
  conversationId: string,
  helpful: boolean
) => {
  try {
    const { error } = await supabase
      .from('echo_conversations')
      .update({
        metadata: { helpful }
      })
      .eq('id', conversationId);

    if (error) {
      console.error('[Echo Memory] Failed to mark conversation:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Echo Memory] Error marking conversation:', err);
    return false;
  }
};
