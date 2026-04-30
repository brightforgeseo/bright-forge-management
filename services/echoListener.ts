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
import { sendChatMessage, fetchChannels, editChatMessage } from './databaseService';
import { runEchoAgent } from './echoAgent';
import { ChatChannel, User } from '../types';

const ECHO_TRIGGER_REGEX = /(^|[\s,.])(@echo|@ai|hey\s+echo|echo[,?!]|echo\s)/i;

// "Echo off" commands: explicit mute. Matched BEFORE the wake trigger so saying
// "echo turn off" mutes instead of waking. Any subsequent wake trigger unmutes.
const ECHO_OFF_REGEX = /(?:^|\s)(?:echo[,]?\s+(?:turn\s+)?off|echo[,]?\s+stop|echo[,]?\s+quiet|echo[,]?\s+shut\s*up|echo\s+go\s+away|stop\s+echo|mute\s+echo|shut\s*up\s+echo)\b/i;

const PER_CHANNEL_COOLDOWN_MS = 30_000;        // don't reply to the same channel more than once per 30s
const RECENT_HISTORY_WINDOW = 8;               // last N messages we feed Echo for context
const MAX_QUEUE = 20;                          // guard against runaway

const lastReplyAt = new Map<string, number>();
const mutedChannels = new Set<string>();       // channels where the user told Echo to shut up
let activeChannel: any = null;
let processingIds = new Set<string>();

const isOffCommand = (text: string): boolean => {
  if (!text) return false;
  return ECHO_OFF_REGEX.test(text);
};
const isWakeMention = (text: string): boolean => {
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

      // Detect "echo off" BEFORE wake-trigger so saying "echo turn off" mutes
      // instead of waking. Acknowledge once, then go silent until next mention.
      if (isOffCommand(text)) {
        if (!mutedChannels.has(channel.id)) {
          mutedChannels.add(channel.id);
          processingIds.add(raw.id);
          // Use the sender's name from the message (matches who actually said "echo off"),
          // not the listener-runner's name.
          const muteAck = `Okay ${raw.sender || 'boss'}, I will wait for your next command oh mighty one. 🤖🙇 Mention me with @echo or "hey echo" when you need me.`;
          try {
            await sendChatMessage({
              id: '',
              channelId: channel.id,
              sender: 'Echo AI',
              senderId: user.id,
              text: muteAck,
              timestamp: new Date().toISOString(),
              isAi: true,
              avatar: 'bot'
            });
          } catch (e) {
            console.error('[EchoListener] mute-ack send failed:', e);
          }
        }
        return;
      }

      if (!isWakeMention(text)) return;

      // Wake-trigger detected. If we were muted, this turns us back on.
      if (mutedChannels.has(channel.id)) {
        mutedChannels.delete(channel.id);
        // Reset cooldown so the wake reply isn't blocked
        lastReplyAt.delete(channel.id);
      }

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

      // Post a placeholder so the team SEES Echo is working (no more "complete darkness").
      // We'll edit this same row with the real reply once the agent finishes.
      let placeholderId: string | null = null;
      try {
        const placeholder = await sendChatMessage({
          id: '',
          channelId: channel.id,
          sender: 'Echo AI',
          senderId: user.id,
          text: '⏳ Echo is thinking... (reading boards, tasks, comments)',
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        });
        placeholderId = placeholder?.id || null;
      } catch (e) {
        console.error('[EchoListener] placeholder send failed:', e);
      }

      let reply = '';
      try {
        // Hand off to the agent — full tool access included
        reply = await runEchoAgent(formattedHistory, text, { id: user.id, name: user.name });
      } catch (e: any) {
        console.error('[EchoListener] agent failed:', e);
        reply = `Hit an error: ${e?.message || 'unknown'}. Try again in a sec.`;
      }

      const trimmed = (reply && reply.trim())
        ? (reply.length > 1500 ? reply.slice(0, 1500) + '…' : reply)
        : 'Done — but I had nothing to add.';

      // Edit the placeholder with the final reply (one row, no clutter).
      // Falls back to a fresh insert if the edit fails for some reason.
      if (placeholderId) {
        try {
          await editChatMessage(placeholderId, trimmed);
        } catch (e) {
          console.error('[EchoListener] edit-placeholder failed, sending fresh message:', e);
          await sendChatMessage({
            id: '',
            channelId: channel.id,
            sender: 'Echo AI',
            senderId: user.id,
            text: trimmed,
            timestamp: new Date().toISOString(),
            isAi: true,
            avatar: 'bot'
          });
        }
      } else {
        await sendChatMessage({
          id: '',
          channelId: channel.id,
          sender: 'Echo AI',
          senderId: user.id,
          text: trimmed,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        });
      }
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
