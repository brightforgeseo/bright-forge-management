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
import { sendChatMessage, fetchChannels, editChatMessage, sendReplyMessage } from './databaseService';
import { getChatResponse } from './geminiService';
import { ChatChannel, User } from '../types';

const FOLLOWUP_WINDOW_MS = 5 * 60 * 1000;       // 5 min after Echo speaks, treat next msgs as possibly addressed to him

const lastEchoMessageAt = new Map<string, number>();   // channel.id -> ts

/**
 * Local follow-up classifier: "Is this human talking to Echo, or to other humans?"
 * Keep this deterministic. The portal must not spend paid LLM/API credits just
 * to decide whether to reply to a team-chat message.
 */
async function isAddressedToEcho(opts: {
  currentMessage: string;
  recentHistory: string;
}): Promise<boolean> {
  const t = (opts.currentMessage || '').trim();
  if (!t) return false;
  if (isWakeMention(t)) return true;

  // Conservative follow-up patterns after Echo just spoke. Ambiguous chatter
  // stays silent rather than burning model credits or interrupting humans.
  return /^(yes|yeah|yep|no|nah|ok|okay|do it|go ahead|please do|can you|could you|what about|why|how|when|where|which|show me|check|fix|update|create|add|remove|delete|move|mark|assign)\b/i.test(t);
}

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

// Strict wake detection — must be an EXPLICIT address. Avoids false triggers
// on incidental uses of the word "echo" (e.g. "the echo is loud").
//
// Triggers on:
//   - @echo / @ai (preferred — unambiguous)
//   - "hey/yo/oi/hi/hello echo" (greeting form)
//   - Message STARTS with "echo" as a word (catches "Echo,", "Echo!", and
//     casual "echo what time is it", "echo u weirdo what time is it")
const isWakeMention = (text: string): boolean => {
  if (!text) return false;
  const t = text.trim();
  if (/(?:^|\s)@(?:echo|ai)\b/i.test(t)) return true;
  if (/(?:^|\s)(?:hey|yo|oi|hi|hello)\s+echo\b/i.test(t)) return true;
  if (/^echo\b/i.test(t)) return true;
  return false;
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

      // Skip Echo's own messages — but track when he last spoke per channel
      // so the soft classifier knows we're inside a follow-up window.
      if (raw.is_ai === true || raw.sender === 'Echo AI' || raw.sender_id === echoBotId) {
        if (raw.channel_id) lastEchoMessageAt.set(raw.channel_id, Date.now());
        return;
      }

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

      // Two paths to wake Echo:
      //   1) Strict address (@echo / "hey echo" / "Echo,") — fast path, no LLM call
      //   2) Soft path: Echo recently spoke in this channel + current message
      //      looks like a follow-up. We run a cheap classifier to confirm.
      let shouldRespond = isWakeMention(text);
      const echoSpokeAt = lastEchoMessageAt.get(channel.id) || 0;
      const inFollowupWindow = (Date.now() - echoSpokeAt) < FOLLOWUP_WINDOW_MS;

      if (!shouldRespond && inFollowupWindow) {
        // Pull a short history window for the classifier to reason about
        const { data: hist } = await supabase
          .from('chat_messages')
          .select('sender, text, created_at, is_ai')
          .eq('channel_id', channel.id)
          .order('created_at', { ascending: false })
          .limit(6);
        const histStr = (hist || []).reverse()
          .filter((m: any) => m.id !== raw.id)
          .map((m: any) => `${m.is_ai ? 'Echo' : m.sender}: ${m.text}`)
          .join('\n');

        shouldRespond = await isAddressedToEcho({
          currentMessage: text,
          recentHistory: histStr || '(none)'
        });
        if (shouldRespond) console.log('[EchoListener] classifier: addressed to Echo');
      }

      if (!shouldRespond) return;

      // Wake-trigger detected. If we were muted, this turns us back on.
      if (mutedChannels.has(channel.id)) {
        mutedChannels.delete(channel.id);
        // Reset cooldown so the wake reply isn't blocked
        lastReplyAt.delete(channel.id);
      }

      // Cooldown per channel — but skip the cooldown when we're in an active
      // back-and-forth conversation (Echo just spoke). The cooldown is meant
      // to stop spam, not interrupt a real dialogue.
      const now = Date.now();
      const last = lastReplyAt.get(channel.id) || 0;
      const inActiveConversation = (now - echoSpokeAt) < FOLLOWUP_WINDOW_MS;
      if (!inActiveConversation && now - last < PER_CHANNEL_COOLDOWN_MS) {
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
        const placeholder = await sendReplyMessage({
          id: '',
          channelId: channel.id,
          sender: 'Echo AI',
          senderId: user.id,
          text: '⏳ Echo is thinking... (reading boards, tasks, comments)',
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        }, raw.id);
        placeholderId = placeholder?.id || null;
      } catch (e) {
        console.error('[EchoListener] placeholder send failed:', e);
      }

      let reply = '';
      try {
        // Route portal-channel Echo mentions through the local Sassin bridge path.
        // Board/chat questions must not dogpile the full Hermes stack just because Ben said "Echo" in General.
        reply = await getChatResponse(formattedHistory, text, { id: user.id, name: user.name });
      } catch (e: any) {
        console.error('[EchoListener] agent failed:', e);
        reply = `Hit an error: ${e?.message || 'unknown'}. Try again in a sec.`;
      }

      // Mark Echo as having spoken so the next message in this channel
      // gets the soft classifier path, not just strict regex.
      lastEchoMessageAt.set(channel.id, Date.now());

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
          await sendReplyMessage({
            id: '',
            channelId: channel.id,
            sender: 'Echo AI',
            senderId: user.id,
            text: trimmed,
            timestamp: new Date().toISOString(),
            isAi: true,
            avatar: 'bot'
          }, raw.id);
        }
      } else {
        await sendReplyMessage({
          id: '',
          channelId: channel.id,
          sender: 'Echo AI',
          senderId: user.id,
          text: trimmed,
          timestamp: new Date().toISOString(),
          isAi: true,
          avatar: 'bot'
        }, raw.id);
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
    // processingIds intentionally NOT cleared — prevents re-mounts from replaying the same message
    lastEchoMessageAt.clear();
    mutedChannels.clear();
    console.log('[EchoListener] stopped');
  };
};
