/**
 * Echo Listener — gives Echo a live presence in team chat.
 *
 * Subscribes to chat_messages realtime and triggers the agent ONLY when the
 * message explicitly addresses Echo (@echo, @ai, "hey echo"). Posts a reply
 * back into the same channel.
 *
 * Owner-gated: only one user's session runs the listener (otherwise every
 * teammate's browser would race to respond → duplicate messages). Default is
 * the user with role === 'Owner'. Other roles get a no-op.
 */

import { supabase } from '../lib/supabaseClient';
import { sendChatMessage, fetchChannels } from './databaseService';
import { runEchoAgent } from './echoAgent';
import { ChatChannel, ChatMessage, User } from '../types';

const ECHO_TRIGGER_REGEX = /(^|[\s,.])(@echo|@ai|hey\s+echo|echo[,?!]|echo\s)/i;
const PER_CHANNEL_COOLDOWN_MS = 30_000;        // don't reply to the same channel more than once per 30s
const RECENT_HISTORY_WINDOW = 8;               // last N messages we feed Echo for context
const MAX_QUEUE = 20;                          // guard against runaway

const lastReplyAt = new Map<string, number>();
let activeChannel: any = null;
let processingIds = new Set<string>();

const shouldEchoRespond = (text: string): boolean => {
  if (!text) return false;
  return ECHO_TRIGGER_REGEX.test(text);
};

const isOwner = (user: User): boolean => {
  const role = (user.role || '').toLowerCase();
  return role === 'owner' || role === 'founder' || role === 'admin';
};

export interface StartListenerArgs {
  user: User;
  channels: ChatChannel[];                      // current cached channels (for ID -> name resolution)
  echoBotId: string;                            // bot user ID — never trigger on our own messages
  isEchoAIChannel: (ch: ChatChannel) => boolean;
}

/** Start the Echo listener. Returns an `unsubscribe` function. No-op for non-owners. */
export const startEchoListener = ({ user, channels, echoBotId, isEchoAIChannel }: StartListenerArgs): (() => void) => {
  if (!user || user.id === 'guest' || !isOwner(user)) {
    console.log('[EchoListener] not started — only the owner session runs Echo. Current role:', user?.role);
    return () => {};
  }
  if (activeChannel) {
    console.log('[EchoListener] already running, skipping');
    return () => {};
  }

  const channelsRef = { current: channels };
  // Refresh channels list periodically so the listener can route into channels created after start
  const refreshInterval = setInterval(async () => {
    try { channelsRef.current = await fetchChannels(); } catch {}
  }, 60_000);

  const handleNewMessage = async (raw: any) => {
    try {
      if (!raw || !raw.id) return;
      if (processingIds.has(raw.id) || processingIds.size > MAX_QUEUE) return;

      // Skip Echo's own messages or any AI-flagged message
      if (raw.is_ai === true) return;
      if (raw.sender_id === echoBotId) return;
      if (raw.sender === 'Echo AI') return;

      // Skip the dedicated Echo DM channel — handled by TeamChat's own AI flow
      const channel = channelsRef.current.find(c => c.id === raw.channel_id);
      if (!channel) return;
      if (isEchoAIChannel(channel)) return;

      // Skip DMs unless they specifically tag Echo
      const isDM = channel.type === 'dm';

      const text: string = raw.text || '';
      if (!shouldEchoRespond(text)) return;

      // Cooldown per channel
      const now = Date.now();
      const last = lastReplyAt.get(channel.id) || 0;
      if (now - last < PER_CHANNEL_COOLDOWN_MS) {
        console.log('[EchoListener] cooldown active for channel', channel.name);
        return;
      }
      lastReplyAt.set(channel.id, now);
      processingIds.add(raw.id);

      // Build a small history window from the channel
      const { data: history } = await supabase
        .from('chat_messages')
        .select('sender, text, created_at')
        .eq('channel_id', channel.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_HISTORY_WINDOW);
      const formattedHistory = (history || []).reverse()
        .map((m: any) => `${m.sender}: ${m.text}`).join('\n');

      // Hand off to the agent — full tool access included
      const reply = await runEchoAgent(formattedHistory, text, { id: user.id, name: user.name });

      if (!reply || !reply.trim()) return;
      const trimmed = reply.length > 1500 ? reply.slice(0, 1500) + '…' : reply;

      const aiMsg: ChatMessage = {
        id: '',
        channelId: channel.id,
        sender: 'Echo AI',
        senderId: user.id,        // FK constraint — must be a real auth user
        text: trimmed,
        timestamp: new Date().toISOString(),
        isAi: true,
        avatar: 'bot'
      };
      await sendChatMessage(aiMsg);
      console.log('[EchoListener] replied in', channel.name, isDM ? '(dm)' : '(channel)');
    } catch (e) {
      console.error('[EchoListener] handleNewMessage error:', e);
    } finally {
      // Drop from processingIds after a beat so memory doesn't leak
      setTimeout(() => processingIds.delete(raw?.id), 60_000);
    }
  };

  activeChannel = supabase
    .channel('echo-listener')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages'
    }, (payload) => { handleNewMessage(payload.new); })
    .subscribe((status) => {
      console.log('[EchoListener] realtime status:', status);
    });

  return () => {
    try { if (activeChannel) supabase.removeChannel(activeChannel); } catch {}
    activeChannel = null;
    clearInterval(refreshInterval);
    lastReplyAt.clear();
    processingIds.clear();
    console.log('[EchoListener] stopped');
  };
};
